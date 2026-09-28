'use client';
import { Fragment, useEffect, useMemo, useState, type RefObject } from 'react';
import {
  FIELDS,
  GROUPS,
  TEXT_KEYS,
  fillTemplate,
  missingToOpen,
  type Settings,
  type TextKey,
} from '../../lib/form-settings';
import { api, ApiError, dateTime, download } from './api';
import PortalPreview from './PortalPreview';
import QuestionsEditor from './QuestionsEditor';

type Infra = { database: boolean; adminPassword: boolean; sessionSecret: boolean; appUrl: boolean };
type Loaded = {
  settings: Settings;
  defaults: Settings;
  revision: number;
  updatedAt: string | null;
  infra: Infra;
};
type Errors = Partial<Record<keyof Settings, string>>;

const INFRA_LABELS: Record<keyof Infra, string> = {
  database: 'DATABASE_URL',
  adminPassword: 'ADMIN_PASSWORD_HASH',
  sessionSecret: 'SESSION_SECRET (mindestens 32 Zeichen)',
  appUrl: 'APP_URL',
};
const PDF_KEYS = [
  'clubName',
  'pdfTitle',
  'pdfIntro',
  'pdfWelcome',
  'pdfWelcomeText',
  'pdfSignature',
] as const;
const groupOf = (key: TextKey) => GROUPS.find((group) => group.keys.includes(key))?.id ?? '';

export default function SettingsEditor({
  onExpired,
  dirtyRef,
}: {
  onExpired: () => void;
  dirtyRef: RefObject<boolean>;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [preview, setPreview] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(['verein', 'dokumente']));

  async function load() {
    setLoadError('');
    try {
      const data = await api<Loaded>('/api/admin/settings');
      setLoaded(data);
      setDraft(data.settings);
      setErrors({});
      setConflict(false);
      setMessage(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      setLoadError(err instanceof Error ? err.message : 'Laden fehlgeschlagen.');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = useMemo(
    () =>
      !!loaded &&
      !!draft &&
      (draft.portalOpen !== loaded.settings.portalOpen ||
        JSON.stringify(draft.questions) !== JSON.stringify(loaded.settings.questions) ||
        TEXT_KEYS.some((key) => draft[key] !== loaded.settings[key])),
    [loaded, draft],
  );

  useEffect(() => {
    dirtyRef.current = dirty;
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, dirtyRef]);

  if (!loaded || !draft)
    return loadError ? (
      <div className="editor-card">
        <p className="error" role="alert">
          {loadError}
        </p>
        <button type="button" className="button secondary" onClick={() => load()}>
          Erneut versuchen
        </button>
      </div>
    ) : (
      <p role="status">Formular wird geladen …</p>
    );

  const missing = missingToOpen(draft);
  const infraMissing = (Object.keys(loaded.infra) as (keyof Infra)[]).filter(
    (key) => !loaded.infra[key],
  );
  const canOpen = missing.length === 0 && infraMissing.length === 0;

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft((current) => ({ ...current!, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setMessage(null);
  }

  function reveal(key: TextKey) {
    setOpenGroups((current) => new Set(current).add(groupOf(key)));
    requestAnimationFrame(() => {
      const input = document.getElementById('f-' + key);
      input?.scrollIntoView({ block: 'center' });
      input?.focus({ preventScroll: true });
    });
  }

  function showErrors(err: unknown) {
    if (!(err instanceof ApiError)) return;
    if (err.status === 401) onExpired();
    const fields = (err.data.fields ?? {}) as Errors;
    setErrors((current) => ({ ...current, ...fields }));
    const first = TEXT_KEYS.find((key) => fields[key]);
    if (first) reveal(first);
    else if (fields.questions) {
      setOpenGroups((current) => new Set(current).add('schritt1'));
      requestAnimationFrame(() =>
        document.getElementById('f-questions')?.scrollIntoView({ block: 'center' }),
      );
    }
  }

  function failureText(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.status === 401)
      return 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an und versuche es dann noch einmal.';
    return err instanceof Error ? err.message : fallback;
  }

  async function save() {
    if (!draft || !loaded || saving) return;
    const sent = draft;
    setSaving(true);
    setMessage(null);
    setErrors({});
    try {
      const data = await api<{ settings: Settings; revision: number; updatedAt: string }>(
        '/api/admin/settings',
        { method: 'PUT', json: { settings: sent, revision: loaded.revision } },
      );
      setLoaded({
        ...loaded,
        settings: data.settings,
        revision: data.revision,
        updatedAt: data.updatedAt,
      });
      // Show the normalised saved texts, unless the admin kept typing while saving.
      setDraft((current) => (current === sent ? data.settings : current));
      setMessage({
        ok: true,
        text: data.settings.portalOpen
          ? 'Gespeichert. Die Änderungen sind jetzt online.'
          : 'Gespeichert. Das Portal ist geschlossen; Einreichungen sind nicht möglich.',
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setConflict(true);
      showErrors(err);
      setMessage({ ok: false, text: failureText(err, 'Speichern fehlgeschlagen.') });
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (!loaded || !window.confirm('Alle ungespeicherten Änderungen verwerfen?')) return;
    setDraft(loaded.settings);
    setErrors({});
    setMessage(null);
  }

  function reload() {
    if (dirty && !window.confirm('Neu laden? Deine ungespeicherten Änderungen gehen verloren.'))
      return;
    void load();
  }

  async function samplePdf() {
    if (!draft) return;
    setPdfBusy(true);
    setMessage(null);
    try {
      await download('/api/admin/pdf-preview', 'Beispiel-Mitgliedsbestaetigung.pdf', {
        method: 'POST',
        json: Object.fromEntries(PDF_KEYS.map((key) => [key, draft[key]])),
      });
    } catch (err) {
      showErrors(err);
      setMessage({
        ok: false,
        text: failureText(err, 'Das Beispiel-PDF konnte nicht erstellt werden.'),
      });
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="editor">
      <section className="editor-card status-card" aria-labelledby="status-title">
        <div className="status-row">
          <div>
            <h2 id="status-title">Portal-Status</h2>
            <p className="muted">
              {draft.portalOpen
                ? 'Geöffnet: Anträge und Datenaktualisierungen können eingereicht werden.'
                : 'Geschlossen: Das Formular ist sichtbar, kann aber nicht abgeschickt werden.'}
            </p>
          </div>
          <label className={draft.portalOpen ? 'switch on' : 'switch'}>
            <input
              type="checkbox"
              role="switch"
              checked={draft.portalOpen}
              disabled={!draft.portalOpen && !canOpen}
              onChange={(e) => update('portalOpen', e.target.checked)}
            />
            <span className="switch-track" aria-hidden="true">
              <span />
            </span>
            <span>{draft.portalOpen ? 'Geöffnet' : 'Geschlossen'}</span>
          </label>
        </div>
        {missing.length > 0 && (
          <div className="notice">
            Zum Öffnen fehlen noch:{' '}
            {missing.map((key, i) => (
              <Fragment key={key}>
                {i > 0 && ', '}
                <button type="button" className="link-button" onClick={() => reveal(key)}>
                  {FIELDS[key].label}
                </button>
              </Fragment>
            ))}
            .
          </div>
        )}
        {infraMissing.length > 0 && (
          <div className="notice">
            Technische Einrichtung unvollständig – diese Umgebungsvariablen fehlen:{' '}
            {infraMissing.map((key) => INFRA_LABELS[key]).join(', ')}. Sie werden beim Hosting
            gesetzt (siehe README).
          </div>
        )}
        <p className="muted small">
          {loaded.updatedAt
            ? `Zuletzt gespeichert: ${dateTime(loaded.updatedAt)}`
            : 'Noch nicht gespeichert: Es gelten die Standardtexte und die Werte aus den Umgebungsvariablen.'}
        </p>
      </section>

      {GROUPS.map((group) => {
        const count = group.keys.filter((key) => errors[key]).length;
        return (
          <details
            key={group.id}
            className="editor-card"
            open={openGroups.has(group.id)}
            onToggle={(e) => {
              const isOpen = e.currentTarget.open;
              setOpenGroups((current) => {
                if (current.has(group.id) === isOpen) return current;
                const next = new Set(current);
                if (isOpen) next.add(group.id);
                else next.delete(group.id);
                return next;
              });
            }}
          >
            <summary>
              <span>
                <strong>{group.title}</strong>
                <small>{group.description}</small>
              </span>
              {count + (group.id === 'schritt1' && errors.questions ? 1 : 0) > 0 && (
                <span className="pill error-pill">
                  {count + (group.id === 'schritt1' && errors.questions ? 1 : 0)} Fehler
                </span>
              )}
            </summary>
            <div className="editor-fields">
              {group.keys.map((key) => (
                <Field
                  key={key}
                  name={key}
                  value={draft[key]}
                  defaultValue={loaded.defaults[key]}
                  error={errors[key]}
                  onChange={(value) => update(key, value)}
                />
              ))}
            </div>
            {group.id === 'schritt1' && (
              <>
                <h3 className="subheading">Zusätzliche Fragen</h3>
                <p className="muted small">
                  Erscheinen im ersten Schritt unter den festen Feldern. Antworten werden mit jeder
                  Einreichung gespeichert und in der Vereins-E-Mail, im Adminbereich und im Export
                  angezeigt. Wer das Formular gerade ausfüllt, sieht geänderte Fragen vor dem
                  Absenden.
                </p>
                <QuestionsEditor
                  questions={draft.questions}
                  error={errors.questions}
                  onChange={(questions) => update('questions', questions)}
                />
              </>
            )}
            {group.id === 'email' && <EmailPreview draft={draft} />}
            {group.id === 'pdf' && (
              <div className="editor-extra">
                <button
                  type="button"
                  className="button secondary"
                  onClick={samplePdf}
                  disabled={pdfBusy}
                >
                  {pdfBusy ? 'PDF wird erstellt …' : 'Beispiel-PDF herunterladen'}
                </button>
                <small className="muted">
                  Mit dem Beispielnamen „Anna Beispiel“ und den Texten, wie sie gerade im Editor
                  stehen.
                </small>
              </div>
            )}
          </details>
        );
      })}

      <div className="savebar">
        {message && (
          <p
            className={message.ok ? 'save-message ok' : 'save-message failed'}
            role={message.ok ? 'status' : 'alert'}
          >
            {message.text}
            {conflict && !message.ok && (
              <>
                {' '}
                <button type="button" className="link-button" onClick={reload}>
                  Neu laden
                </button>
              </>
            )}
          </p>
        )}
        <div className="savebar-row">
          <span className={dirty ? 'save-state unsaved' : 'save-state'}>
            {saving
              ? 'Wird gespeichert …'
              : dirty
                ? 'Ungespeicherte Änderungen'
                : 'Alles gespeichert'}
          </span>
          <div className="savebar-actions">
            <button type="button" className="button secondary" onClick={() => setPreview(true)}>
              Vorschau
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={!dirty || saving}
              onClick={discard}
            >
              Verwerfen
            </button>
            <button type="button" className="button" disabled={!dirty || saving} onClick={save}>
              {saving ? 'Speichern …' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
      {preview && <PortalPreview settings={draft} onClose={() => setPreview(false)} />}
    </div>
  );
}

function Field({
  name,
  value,
  defaultValue,
  error,
  onChange,
}: {
  name: TextKey;
  value: string;
  defaultValue: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const def = FIELDS[name];
  const id = 'f-' + name;
  const describedBy =
    [error && id + '-error', def.help && id + '-help'].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    value,
    maxLength: def.max,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
  };
  return (
    <div className={error ? 'field invalid' : 'field'}>
      <label htmlFor={id}>
        {def.label}
        {def.requiredToOpen && <span className="tag">zum Öffnen nötig</span>}
      </label>
      {def.type === 'textarea' ? (
        <textarea rows={def.rows ?? 3} {...common} />
      ) : (
        <input
          type={def.type === 'email' ? 'email' : 'text'}
          inputMode={def.type === 'url' ? 'url' : undefined}
          spellCheck={def.type === 'url' || def.type === 'email' ? false : undefined}
          autoComplete="off"
          {...common}
        />
      )}
      {error && (
        <p className="field-error" id={id + '-error'}>
          {error}
        </p>
      )}
      <div className="field-meta">
        {def.help ? <small id={id + '-help'}>{def.help}</small> : <span />}
        <span className="field-tools">
          {defaultValue && value !== defaultValue && (
            <button type="button" className="link-button" onClick={() => onChange(defaultValue)}>
              Standard wiederherstellen
            </button>
          )}
          {def.max >= 150 && (
            <small className="counter">
              {value.length}/{def.max}
            </small>
          )}
        </span>
      </div>
    </div>
  );
}

function EmailPreview({ draft }: { draft: Settings }) {
  const values = {
    vorname: 'Anna',
    nachname: 'Beispiel',
    verein: draft.clubName || 'Unser Verein',
  };
  return (
    <div className="email-preview" aria-label="Vorschau des E-Mail-Entwurfs">
      <small className="muted">So sieht der Entwurf für „Anna Beispiel“ aus:</small>
      <p>
        <strong>Betreff:</strong> {fillTemplate(draft.emailSubject, values)}
      </p>
      <p className="pre">{fillTemplate(draft.emailBody, values)}</p>
    </div>
  );
}
