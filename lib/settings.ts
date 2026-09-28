import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from './db';
import { HttpError, logError } from './errors';
import { unsupportedPdfChars } from './font';
import {
  FIELDS,
  TEXT_KEYS,
  formTexts,
  missingToOpen,
  QUESTION_LIMITS,
  questionsFor,
  type Question,
  unknownPlaceholders,
  type FormConfig,
  type Settings,
  type TextKey,
  type TextSettings,
} from './form-settings';
import { localizeQuestion, type Locale } from './i18n';

export type FieldErrors = Partial<Record<keyof Settings, string>>;

export type LoadedSettings = {
  settings: Settings;
  /** 0 = nothing saved yet (built-in texts and environment defaults are in use). */
  revision: number;
  updatedAt: string | null;
  /** The database could not be read; the portal stays closed. */
  dbError: boolean;
};

// Environment variables act as initial values until the texts are saved in /admin/formular.
const ENV_DEFAULTS: Partial<Record<TextKey, string>> = {
  clubName: 'CLUB_NAME',
  contactEmail: 'CONTACT_EMAIL',
  statutesUrl: 'STATUTES_URL',
  privacyUrl: 'PRIVACY_URL',
  imprintUrl: 'IMPRINT_URL',
  documentVersion: 'DOCUMENT_VERSION',
};

// Texts and documents a visitor confirms on each path. If any of them changes while someone fills
// in the form, the submission is refused until the visitor has seen the new version.
const CONSENT_KEYS = {
  new: [
    'statutesUrl',
    'statutesTitle',
    'privacyUrl',
    'privacyTitle',
    'documentVersion',
    'checkStatutes',
    'checkPrivacy',
    'checkAccuracy',
    'newNotice',
  ],
  existing: [
    'privacyUrl',
    'privacyTitle',
    'documentVersion',
    'checkPrivacy',
    'checkAccuracy',
    'existingNotice',
  ],
} as const satisfies Record<'new' | 'existing', readonly TextKey[]>;

const CONTROL_CHARS = /\p{Cc}/u;
const BIDI_CONTROLS = /[‪-‮⁦-⁩]/;
const emailFormat = z.email();

/** A root-relative path (/documents/satzung.pdf) or an absolute https:// URL. */
export function validLink(value: string) {
  if (/[\s\\]/.test(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//');
  // Browsers resolve "https:/x" or "https:x" relative to the page; require the full form.
  if (!/^https:\/\/[^/]/i.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validEmail(value: string) {
  return value.length <= 254 && emailFormat.safeParse(value).success;
}

/** Normalizes one text setting and returns a German error message if it is not acceptable. */
export function checkField(key: TextKey, raw: unknown): { value: string; error?: string } {
  const def = FIELDS[key];
  if (typeof raw !== 'string') return { value: def.value, error: 'Ungültiger Wert.' };
  const multiline = def.type === 'textarea';
  let value = raw.replace(/\r\n?/g, '\n').replace(/\t/g, ' ');
  value = multiline
    ? value
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n')
        .trim()
    : value.trim();
  if (!multiline && value.includes('\n')) return { value, error: 'Bitte ohne Zeilenumbruch.' };
  if (CONTROL_CHARS.test(value.replace(/\n/g, '')) || BIDI_CONTROLS.test(value))
    return { value, error: 'Enthält unzulässige Steuerzeichen.' };
  if (value.length > def.max)
    return { value, error: `Höchstens ${def.max} Zeichen (derzeit ${value.length}).` };
  if (def.maxLines && value.split('\n').length > def.maxLines)
    return { value, error: `Höchstens ${def.maxLines} Zeilen.` };
  if (!value)
    return def.optional || def.requiredToOpen
      ? { value }
      : { value, error: 'Darf nicht leer sein.' };
  if (def.type === 'url' && !validLink(value))
    return {
      value,
      error: 'Bitte einen Pfad wie /documents/datei.pdf oder einen https://-Link angeben.',
    };
  if (def.type === 'email' && !validEmail(value))
    return { value, error: 'Bitte eine gültige E-Mail-Adresse angeben.' };
  if (def.placeholders) {
    const unknown = unknownPlaceholders(value);
    if (unknown.length)
      return {
        value,
        error: `Unbekannter Platzhalter ${unknown.join(', ')}. Erlaubt sind {vorname}, {nachname} und {verein}.`,
      };
  }
  return { value };
}

const warned = new Set<string>();

/** Built-in texts plus environment-variable defaults. */
export function defaultSettings(env: Record<string, string | undefined> = process.env): Settings {
  const texts = {} as TextSettings;
  for (const key of TEXT_KEYS) {
    const envName = ENV_DEFAULTS[key];
    const candidate = envName ? (env[envName] ?? '') : FIELDS[key].value;
    const { value, error } = checkField(key, candidate);
    if (error && envName && !warned.has(envName)) {
      warned.add(envName);
      console.warn(`[portal] ignoring invalid ${envName}: ${error}`);
    }
    texts[key] = error ? FIELDS[key].value : value;
  }
  return { ...texts, portalOpen: env.PORTAL_OPEN?.trim() === 'true', questions: [] };
}

const QUESTION_ID = /^q_[0-9a-z]{6,24}$/;
const cleanLine = (v: unknown) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : undefined;
const badChars = (v: string) => CONTROL_CHARS.test(v) || BIDI_CONTROLS.test(v);

/** Validates the admin-defined questions; returns them normalised or a German error. */
export function checkQuestions(raw: unknown): { questions: Question[]; error?: string } {
  if (raw === undefined) return { questions: [] };
  if (!Array.isArray(raw)) return { questions: [], error: 'Ungültige Fragen.' };
  const L = QUESTION_LIMITS;
  if (raw.length > L.count) return { questions: [], error: `Höchstens ${L.count} Fragen.` };
  const questions: Question[] = [];
  const ids = new Set<string>();
  for (const [index, item] of raw.entries()) {
    const n = `Frage ${index + 1}`;
    const q = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const id = typeof q.id === 'string' ? q.id : '';
    if (!QUESTION_ID.test(id) || ids.has(id))
      return { questions: [], error: `${n}: ungültige Kennung.` };
    ids.add(id);
    const label = cleanLine(q.label) ?? '';
    const labelEn = cleanLine(q.labelEn ?? '') ?? '';
    if (!label) return { questions: [], error: `${n}: Bitte einen Fragetext eingeben.` };
    if (label.length > L.label)
      return { questions: [], error: `${n}: Fragetext höchstens ${L.label} Zeichen.` };
    const help = cleanLine(q.help ?? '') ?? '';
    const helpEn = cleanLine(q.helpEn ?? '') ?? '';
    if (help.length > L.help || helpEn.length > L.help)
      return { questions: [], error: `${n}: Hinweis höchstens ${L.help} Zeichen.` };
    if (labelEn.length > L.label)
      return { questions: [], error: `${n}: Englischer Fragetext höchstens ${L.label} Zeichen.` };
    if (badChars(label) || badChars(labelEn) || badChars(help) || badChars(helpEn))
      return { questions: [], error: `${n}: enthält unzulässige Steuerzeichen.` };
    const type = q.type;
    if (type !== 'text' && type !== 'textarea' && type !== 'select' && type !== 'checkbox')
      return { questions: [], error: `${n}: unbekannter Fragetyp.` };
    const appliesTo = q.appliesTo ?? 'all';
    if (appliesTo !== 'all' && appliesTo !== 'new' && appliesTo !== 'existing')
      return { questions: [], error: `${n}: ungültige Zielgruppe.` };
    let options: string[] = [];
    let optionsEn: string[] = [];
    if (type === 'select') {
      if (!Array.isArray(q.options))
        return { questions: [], error: `${n}: Bitte Auswahlmöglichkeiten angeben.` };
      options = [...new Set(q.options.map(cleanLine).filter((o): o is string => Boolean(o)))];
      if (Array.isArray(q.optionsEn)) optionsEn = q.optionsEn.map((o) => cleanLine(o) ?? '').slice(0, options.length);
      if (options.length < 2)
        return {
          questions: [],
          error: `${n}: Bitte mindestens zwei Auswahlmöglichkeiten angeben (eine pro Zeile).`,
        };
      if (options.length > L.options)
        return { questions: [], error: `${n}: höchstens ${L.options} Auswahlmöglichkeiten.` };
      if (options.some((o) => o.length > L.option || badChars(o)) || optionsEn.some((o) => o.length > L.option || badChars(o)))
        return {
          questions: [],
          error: `${n}: Auswahlmöglichkeiten höchstens ${L.option} Zeichen.`,
        };
    }
    questions.push({ id, label, labelEn, type, required: q.required === true, options, optionsEn, appliesTo, help, helpEn });
  }
  return { questions };
}

export type Answer = { id: string; question: string; answer: string };

/** Checks a visitor's answers against the current questions for their path. */
export function checkAnswers(
  questions: Question[],
  kind: 'new' | 'existing',
  raw: unknown,
  locale: Locale = 'de',
): { answers: Answer[]; error?: string } {
  const given =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const answers: Answer[] = [];
  for (const q of questionsFor(questions, kind)) {
    const value = given[q.id];
    const shown = localizeQuestion(q, locale).label;
    let answer = '';
    if (q.type === 'checkbox') {
      const checked = value === true || value === 'on';
      if (q.required && !checked)
        return { answers: [], error: locale === 'en' ? `Please confirm: ${shown}` : `Bitte bestätige: ${shown}` };
      answer = checked ? (locale === 'en' ? 'Yes' : 'Ja') : (locale === 'en' ? 'No' : 'Nein');
    } else {
      answer = typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';
      if (q.type !== 'textarea') answer = answer.replace(/\s+/g, ' ');
      const max = q.type === 'textarea' ? QUESTION_LIMITS.longAnswer : QUESTION_LIMITS.answer;
      if (answer.length > max)
        return { answers: [], error: locale === 'en' ? `The answer to “${shown}” is too long.` : `Die Antwort auf „${shown}“ ist zu lang.` };
      if (CONTROL_CHARS.test(answer.replace(/\n/g, '')) || BIDI_CONTROLS.test(answer))
        return { answers: [], error: locale === 'en' ? `The answer to “${shown}” contains invalid characters.` : `Die Antwort auf „${shown}“ enthält unzulässige Zeichen.` };
      if (q.type === 'select' && answer && !q.options.includes(answer))
        return { answers: [], error: locale === 'en' ? `Please choose an answer for “${shown}”.` : `Bitte wähle eine Antwort für „${shown}“.` };
      if (q.required && !answer)
        return { answers: [], error: locale === 'en' ? `Please answer: ${shown}` : `Bitte beantworte: ${shown}` };
    }
    answers.push({ id: q.id, question: q.label, answer });
  }
  return { answers };
}

/** Applies saved values on top of the defaults; invalid or unknown saved values are ignored. */
export function mergeStored(defaults: Settings, stored: unknown): Settings {
  const data =
    stored && typeof stored === 'object' && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  const merged: Settings = { ...defaults };
  for (const key of TEXT_KEYS) {
    if (typeof data[key] !== 'string') continue;
    const { value, error } = checkField(key, data[key]);
    if (!error) merged[key] = value;
  }
  if (typeof data.portalOpen === 'boolean') merged.portalOpen = data.portalOpen;
  const { questions, error } = checkQuestions(data.questions);
  if (!error) merged.questions = questions;
  return merged;
}

/** Validates a complete settings object from the admin editor. */
export async function validateSettings(input: unknown) {
  const data =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const errors: FieldErrors = {};
  const texts = {} as TextSettings;
  for (const key of TEXT_KEYS) {
    const { value, error } = checkField(key, data[key]);
    texts[key] = value;
    if (error) errors[key] = error;
  }
  const portalOpen = data.portalOpen === true;
  if (typeof data.portalOpen !== 'boolean') errors.portalOpen = 'Ungültiger Wert.';
  if (portalOpen)
    for (const key of missingToOpen(texts)) errors[key] ??= 'Zum Öffnen des Portals erforderlich.';
  for (const key of TEXT_KEYS) {
    if (!FIELDS[key].pdf || errors[key]) continue;
    const unsupported = await unsupportedPdfChars(texts[key]);
    if (unsupported.length)
      errors[key] = `Diese Zeichen kann das PDF nicht darstellen: ${unsupported.join(' ')}`;
  }
  const { questions, error: questionError } = checkQuestions(data.questions);
  if (questionError) errors.questions = questionError;
  return { settings: { ...texts, portalOpen, questions } as Settings, errors };
}

/** Reads the saved settings; throws if the database cannot be read. */
export async function fetchSettings(): Promise<LoadedSettings> {
  const defaults = defaultSettings();
  if (!process.env.DATABASE_URL)
    return { settings: defaults, revision: 0, updatedAt: null, dbError: false };
  const [row] = await db()`SELECT data, revision, updated_at FROM portal_settings WHERE id = 1`;
  if (!row) return { settings: defaults, revision: 0, updatedAt: null, dbError: false };
  return {
    settings: mergeStored(defaults, row.data),
    revision: Number(row.revision),
    updatedAt: new Date(row.updated_at).toISOString(),
    dbError: false,
  };
}

/** Like fetchSettings, but never throws: on database errors the portal stays closed. */
export async function readSettings(): Promise<LoadedSettings> {
  try {
    return await fetchSettings();
  } catch (err) {
    logError('reading settings', err);
    return {
      settings: { ...defaultSettings(), portalOpen: false },
      revision: 0,
      updatedAt: null,
      dbError: true,
    };
  }
}

/** Saves with optimistic locking: fails if someone else saved since `expectedRevision`. */
export async function saveSettings(settings: Settings, expectedRevision: number) {
  const sql = db();
  const rows = await sql`
    INSERT INTO portal_settings (id, data, revision, updated_at)
    VALUES (1, ${sql.json(settings)}, 1, now())
    ON CONFLICT (id) DO UPDATE
      SET data = EXCLUDED.data, revision = portal_settings.revision + 1, updated_at = now()
      WHERE portal_settings.revision = ${expectedRevision}
    RETURNING revision, updated_at`;
  if (!rows.length)
    throw new HttpError(
      409,
      'Die Texte wurden inzwischen an anderer Stelle gespeichert. Bitte lade die Seite neu und übernimm deine Änderungen erneut.',
    );
  return {
    revision: Number(rows[0].revision),
    updatedAt: new Date(rows[0].updated_at).toISOString(),
  };
}

export function infraStatus() {
  let appUrl = false;
  try {
    appUrl = Boolean(process.env.APP_URL && new URL(process.env.APP_URL).origin !== 'null');
  } catch {}
  return {
    database: Boolean(process.env.DATABASE_URL),
    adminPassword: /^[^:\s]+:[0-9a-f]{128}$/i.test(process.env.ADMIN_PASSWORD_HASH ?? ''),
    sessionSecret: (process.env.SESSION_SECRET ?? '').length >= 32,
    appUrl,
  };
}

export function acceptingSubmissions(loaded: LoadedSettings) {
  return (
    Object.values(infraStatus()).every(Boolean) &&
    !loaded.dbError &&
    loaded.settings.portalOpen &&
    missingToOpen(loaded.settings).length === 0
  );
}

export function consentVersion(settings: Settings, kind: 'new' | 'existing') {
  // Questions count as well: if they change, the visitor must see the new version first.
  const questions = questionsFor(settings.questions, kind).map((q) => [
    q.id,
    q.label,
    q.type,
    q.required,
    q.options,
    q.labelEn ?? '', q.helpEn ?? '', q.optionsEn ?? [],
  ]);
  return createHash('sha256')
    .update(JSON.stringify([kind, ...CONSENT_KEYS[kind].map((key) => settings[key]), questions]))
    .digest('hex')
    .slice(0, 16);
}

/** The exact acknowledgement texts a visitor confirms, stored with each submission. */
export function acknowledgements(settings: TextSettings, kind: 'new' | 'existing') {
  return kind === 'new'
    ? [settings.checkStatutes, settings.checkPrivacy, settings.checkAccuracy]
    : [settings.checkPrivacy, settings.checkAccuracy];
}

export function formConfig(loaded: LoadedSettings): FormConfig {
  return {
    texts: formTexts(loaded.settings),
    open: acceptingSubmissions(loaded),
    unavailable: loaded.dbError,
    consent: {
      new: consentVersion(loaded.settings, 'new'),
      existing: consentVersion(loaded.settings, 'existing'),
    },
    questions: loaded.settings.questions,
  };
}
