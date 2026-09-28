// Additional questions, e-mail texts and Resend configuration.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkAnswers,
  checkQuestions,
  consentVersion,
  defaultSettings,
  mergeStored,
} from '../lib/settings';
import { newQuestionId, questionsFor, type Question } from '../lib/form-settings';
import { DEFAULT_CLUB_INBOX, DEFAULT_FROM, mailConfig, mailErrorMessage } from '../lib/mail';
import { clubMessage, receiptMessage } from '../lib/notify';

const q = (patch: Partial<Question> = {}): Question => ({
  id: newQuestionId(),
  label: 'Wie hast du von uns erfahren?',
  type: 'text',
  required: false,
  options: [],
  appliesTo: 'all',
  help: '',
  ...patch,
});

test('questions are validated and normalised', () => {
  const ok = checkQuestions([
    q({ label: '  Sportart  ' }),
    q({ type: 'select', options: ['Fußball', ' Fußball ', 'Tennis', ''], appliesTo: 'new' }),
    { ...q({ type: 'checkbox' }), required: 'yes' },
  ]);
  assert.equal(ok.error, undefined);
  assert.equal(ok.questions[0].label, 'Sportart');
  assert.deepEqual(ok.questions[1].options, ['Fußball', 'Tennis']);
  assert.equal(ok.questions[2].required, false);
  assert.deepEqual(checkQuestions(undefined), { questions: [] });

  const id = newQuestionId();
  for (const bad of [
    'x',
    [q({ label: '' })],
    [q({ label: 'x'.repeat(151) })],
    [q({ label: 'A‮B' })],
    [q({ type: 'file' as never })],
    [q({ appliesTo: 'admins' as never })],
    [q({ type: 'select', options: ['nur eine'] })],
    [q({ id: 'drop table' })],
    [q({ id }), q({ id })],
    Array.from({ length: 16 }, () => q()),
  ])
    assert.ok(checkQuestions(bad).error, JSON.stringify(bad).slice(0, 80));
});

test('invalid stored questions fall back to the defaults instead of breaking the portal', () => {
  const defaults = defaultSettings({});
  assert.deepEqual(mergeStored(defaults, { questions: [{ id: 'bad' }] }).questions, []);
  const good = [q()];
  assert.deepEqual(mergeStored(defaults, { questions: good }).questions, good);
});

test('answers are checked against the questions of the chosen path', () => {
  const text = q({ required: true, label: 'Sportart' });
  const select = q({ type: 'select', options: ['A', 'B'] });
  const check = q({ type: 'checkbox', required: true, label: 'Ich helfe mit' });
  const onlyExisting = q({ appliesTo: 'existing', required: true });
  const questions = [text, select, check, onlyExisting];
  assert.deepEqual(questionsFor(questions, 'new'), [text, select, check]);

  const ok = checkAnswers(questions, 'new', {
    [text.id]: '  Tisch\ttennis  ',
    [select.id]: 'B',
    [check.id]: 'on',
    [onlyExisting.id]: 'ignored',
    unknown: 'ignored',
  });
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.answers, [
    { id: text.id, question: 'Sportart', answer: 'Tisch tennis' },
    { id: select.id, question: select.label, answer: 'B' },
    { id: check.id, question: 'Ich helfe mit', answer: 'Ja' },
  ]);

  const base = { [text.id]: 'x', [check.id]: true };
  assert.match(checkAnswers(questions, 'new', {}).error!, /Sportart/);
  assert.match(checkAnswers(questions, 'new', { [text.id]: 'x' }).error!, /Ich helfe mit/);
  assert.ok(checkAnswers(questions, 'new', { ...base, [select.id]: 'C' }).error);
  assert.ok(checkAnswers(questions, 'new', { ...base, [text.id]: 'x'.repeat(301) }).error);
  assert.ok(checkAnswers(questions, 'new', { ...base, [text.id]: 'a\u0007' }).error);
  assert.equal(checkAnswers(questions, 'new', base).answers[1].answer, '');
  assert.match(checkAnswers(questions, 'existing', {}).error!, /Sportart/);
  assert.deepEqual(checkAnswers([], 'new', undefined), { answers: [] });
});

test('changing a question asks visitors on that path to reload', () => {
  const settings = defaultSettings({});
  const before = {
    new: consentVersion(settings, 'new'),
    existing: consentVersion(settings, 'existing'),
  };
  const onlyNew = { ...settings, questions: [q({ appliesTo: 'new' })] };
  assert.notEqual(consentVersion(onlyNew, 'new'), before.new);
  assert.equal(consentVersion(onlyNew, 'existing'), before.existing);
  const renamed = { ...onlyNew, questions: [{ ...onlyNew.questions[0], label: 'Neu' }] };
  assert.notEqual(consentVersion(renamed, 'new'), consentVersion(onlyNew, 'new'));
  // The help text is not part of what a visitor answers.
  const helped = { ...onlyNew, questions: [{ ...onlyNew.questions[0], help: 'Hinweis' }] };
  assert.equal(consentVersion(helped, 'new'), consentVersion(onlyNew, 'new'));
});

const row = {
  id: '2b1f0d4e-8a7c-4f7b-9d8a-1c2b3d4e5f60',
  kind: 'new' as const,
  first_name: 'Jürgen',
  last_name: 'Öztürk',
  birth_date: '1990-05-17',
  email: 'juergen@example.org',
  phone: '+49 30 1234567',
  room: 'B 214',
  locale: 'de' as const,
  membership_start_month: null,
  answers: [
    { question: 'Sportart', answer: 'Tennis' },
    { question: 'Leer', answer: '' },
  ],
  created_at: new Date('2026-09-28T16:05:00Z'),
  club_notified_at: null,
  confirmation_sent_at: null,
};

test('the club notification lists all submitted data', () => {
  const mail = clubMessage(row, 'https://member.example.org/admin');
  assert.equal(mail.subject, 'Neue Mitgliedererfassung – Jürgen Öztürk');
  for (const part of [
    'Neuer Mitgliedsantrag',
    'Vorname:        Jürgen',
    'Nachname:       Öztürk',
    'Geburtsdatum:   17.05.1990',
    'E-Mail:         juergen@example.org',
    'Telefon:        +49 30 1234567',
    'Zimmernummer:   B 214',
    'Eingegangen:    28.09.2026, 18:05 Uhr',
    row.id,
    'Sportart: Tennis',
    'https://member.example.org/admin',
  ])
    assert.ok(mail.text.includes(part), part);
  assert.doesNotMatch(mail.text, /Leer:/);
  const update = clubMessage(
    { ...row, kind: 'existing', phone: null, room: null, locale: 'de' as const, membership_start_month: '2024-09', answers: [] },
    'x',
  );
  assert.match(update.text, /Bestehendes Mitglied \(Datenaktualisierung\)/);
  assert.match(update.text, /Telefon:\s+–/);
  assert.doesNotMatch(update.text, /Zusätzliche Angaben/);
});

test('the receipt confirms receipt only – never admission', () => {
  const application = receiptMessage(row, 'SSV Potsdamer Straße');
  assert.match(application.subject, /^Eingangsbestätigung: dein Mitgliedsantrag/);
  assert.match(application.text, /Hallo Jürgen,/);
  assert.match(application.text, /Mitgliedsantrag.*erhalten/);
  assert.match(application.text, /nur eine Eingangsbestätigung/);
  assert.match(application.text, /noch nicht angenommen/);
  const update = receiptMessage({ ...row, kind: 'existing', locale: 'de' as const, membership_start_month: '2024-09' }, 'SSV Potsdamer Straße');
  assert.match(update.subject, /deine Mitgliedsdaten/);
  assert.match(update.text, /aktualisierten Mitgliedsdaten.*erhalten/);
  for (const mail of [application, update]) {
    assert.doesNotMatch(
      mail.text,
      /(herzlich willkommen|bist (jetzt|nun) Mitglied|aufgenommen\b)/i,
    );
    assert.doesNotMatch(mail.text, /Sportart/, 'additional answers stay out of the receipt');
    assert.match(mail.text, /Zimmernummer:\s+B 214/);
  }
});

test('Resend settings come from the environment with the club address as default', () => {
  assert.deepEqual(mailConfig({}), {
    configured: false,
    apiKey: '',
    from: DEFAULT_FROM,
    clubInbox: DEFAULT_CLUB_INBOX,
    apiUrl: 'https://api.resend.com',
  });
  assert.equal(DEFAULT_CLUB_INBOX, 'info@ssvpotsdamerstr.de');
  assert.match(DEFAULT_FROM, /<info@ssvpotsdamerstr\.de>$/);
  const custom = mailConfig({
    RESEND_API_KEY: ' re_x ',
    MAIL_FROM: 'Verein <a@b.de>',
    CLUB_NOTIFY_EMAIL: 'c@b.de',
  });
  assert.equal(custom.configured, true);
  assert.equal(custom.apiKey, 're_x');
  assert.equal(custom.from, 'Verein <a@b.de>');
  assert.equal(custom.clubInbox, 'c@b.de');
  assert.match(mailErrorMessage('verein:NO_API_KEY'), /RESEND_API_KEY/);
  assert.match(mailErrorMessage('verein:HTTP_403_validation_error'), /Domain/);
  assert.match(mailErrorMessage('bestaetigung:TIMEOUT'), /später/);
});
