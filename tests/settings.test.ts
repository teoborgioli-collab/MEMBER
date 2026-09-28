import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELDS,
  GROUPS,
  TEXT_KEYS,
  fillTemplate,
  missingToOpen,
  unknownPlaceholders,
} from '../lib/form-settings';
import {
  acknowledgements,
  checkField,
  consentVersion,
  defaultSettings,
  mergeStored,
  validLink,
  validateSettings,
} from '../lib/settings';

const complete = {
  ...defaultSettings({}),
  clubName: 'Turnverein Beispielstadt e. V.',
  contactEmail: 'verwaltung@example.org',
  statutesUrl: '/documents/satzung-2026-09.pdf',
  privacyUrl: 'https://example.org/datenschutz.pdf',
  imprintUrl: 'https://example.org/impressum',
  documentVersion: '2026-09-28',
};

test('every text field appears in exactly one editor group', () => {
  const grouped = GROUPS.flatMap((g) => g.keys);
  assert.deepEqual([...grouped].sort(), [...TEXT_KEYS].sort());
  assert.equal(new Set(grouped).size, grouped.length);
});

test('built-in defaults are valid and within their limits', async () => {
  for (const key of TEXT_KEYS) {
    const { value, error } = checkField(key, FIELDS[key].value);
    assert.equal(error, undefined, key);
    assert.equal(value, FIELDS[key].value, key);
  }
  const { errors } = await validateSettings(defaultSettings({}));
  assert.deepEqual(errors, {});
});

test('environment variables provide initial values; invalid ones are ignored', () => {
  const s = defaultSettings({
    CLUB_NAME: ' SV Grün-Weiß ',
    CONTACT_EMAIL: 'info@example.org',
    STATUTES_URL: 'javascript:alert(1)',
    PRIVACY_URL: '/documents/datenschutz.pdf',
    PORTAL_OPEN: 'true',
  });
  assert.equal(s.clubName, 'SV Grün-Weiß');
  assert.equal(s.contactEmail, 'info@example.org');
  assert.equal(s.statutesUrl, '');
  assert.equal(s.privacyUrl, '/documents/datenschutz.pdf');
  assert.equal(s.portalOpen, true);
  assert.equal(defaultSettings({ PORTAL_OPEN: 'yes' }).portalOpen, false);
});

test('links must be site paths or https URLs', () => {
  for (const ok of [
    '/documents/satzung.pdf',
    '/documents/satzung%202026.pdf',
    'https://example.org/a.pdf',
    'https://example.org/datenschutz?v=2#top',
  ])
    assert.equal(validLink(ok), true, ok);
  for (const bad of [
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,hi',
    'http://example.org/a.pdf',
    '//evil.example/a.pdf',
    '/\\evil.example',
    'https://user:pw@example.org/',
    'documents/satzung.pdf',
    'https://exa mple.org',
    'mailto:a@example.org',
    'https:/verein.de/satzung.pdf',
    'https:verein.de/satzung.pdf',
    'https:///satzung.pdf',
  ])
    assert.equal(validLink(bad), false, bad);
});

test('texts are trimmed, and single-line fields reject line breaks and control characters', () => {
  assert.deepEqual(checkField('form1Heading', '  Hallo.  '), { value: 'Hallo.' });
  assert.match(checkField('form1Heading', 'Zeile 1\nZeile 2').error!, /Zeilenumbruch/);
  assert.match(checkField('form1Heading', 'A\u0007B').error!, /Steuerzeichen/);
  assert.match(checkField('form1Heading', 'A‮B').error!, /Steuerzeichen/);
  assert.match(checkField('form1Heading', '').error!, /leer/);
  assert.match(checkField('form1Heading', 'x'.repeat(81)).error!, /Höchstens 80/);
  assert.match(checkField('form1Heading', 42).error!, /Ungültig/);
  // Multi-line fields keep inner line breaks, normalise Windows ones and trim line ends.
  assert.deepEqual(checkField('introHeading', 'Willkommen \r\nim Verein.\t'), {
    value: 'Willkommen\nim Verein.',
  });
  assert.match(checkField('introHeading', 'a\nb\nc\nd').error!, /Höchstens 3 Zeilen/);
  // Optional texts may be empty; required-to-open settings may be empty while closed.
  assert.deepEqual(checkField('headerNote', ''), { value: '' });
  assert.deepEqual(checkField('statutesUrl', ''), { value: '' });
  assert.match(checkField('contactEmail', 'keine-mail').error!, /E-Mail/);
});

test('email templates only allow known placeholders', () => {
  assert.deepEqual(unknownPlaceholders('Hallo {vorname} {nachname} – {verein}'), []);
  assert.deepEqual(unknownPlaceholders('Hallo {name} {Vorname} {vorname}'), [
    '{name}',
    '{Vorname}',
  ]);
  assert.match(checkField('emailSubject', 'Hallo {name}').error!, /Platzhalter \{name\}/);
  assert.equal(
    fillTemplate('Hallo {vorname} {nachname}, willkommen bei {verein}!', {
      vorname: 'Anna',
      nachname: 'Beispiel',
      verein: 'TV 1860',
    }),
    'Hallo Anna Beispiel, willkommen bei TV 1860!',
  );
});

test('the portal can only open when club, contact and documents are set', async () => {
  const empty = defaultSettings({});
  assert.deepEqual(missingToOpen(empty), [
    'clubName',
    'contactEmail',
    'statutesUrl',
    'privacyUrl',
    'imprintUrl',
    'documentVersion',
  ]);
  const closed = await validateSettings({ ...empty, portalOpen: false });
  assert.deepEqual(closed.errors, {});
  const opening = await validateSettings({ ...empty, portalOpen: true });
  assert.deepEqual(Object.keys(opening.errors).sort(), missingToOpen(empty).sort());
  const ready = await validateSettings({ ...complete, portalOpen: true });
  assert.deepEqual(ready.errors, {});
  assert.equal(ready.settings.portalOpen, true);
});

test('validation reports every problem and rejects incomplete input', async () => {
  const { errors } = await validateSettings({
    ...complete,
    privacyUrl: 'http://insecure.example',
    checkPrivacy: '',
    pdfTitle: 'Bestätigung ☃',
    portalOpen: 'yes',
  });
  assert.match(errors.privacyUrl!, /https/);
  assert.match(errors.checkPrivacy!, /leer/);
  assert.match(errors.pdfTitle!, /PDF nicht darstellen: ☃/);
  assert.match(errors.portalOpen!, /Ungültig/);
  const partial = await validateSettings({ clubName: 'Nur ein Feld' });
  assert.ok(Object.keys(partial.errors).length > 50);
  assert.ok((await validateSettings(null)).errors.portalOpen);
});

test('saved values override defaults, but invalid or unknown saved values are ignored', () => {
  const merged = mergeStored(complete, {
    form1Heading: 'Willkommen!',
    statutesUrl: 'javascript:alert(1)',
    unknownKey: 'x',
    portalOpen: true,
    checkPrivacy: 42,
  });
  assert.equal(merged.form1Heading, 'Willkommen!');
  assert.equal(merged.statutesUrl, complete.statutesUrl);
  assert.equal(merged.checkPrivacy, complete.checkPrivacy);
  assert.equal(merged.portalOpen, true);
  assert.equal('unknownKey' in merged, false);
  assert.deepEqual(mergeStored(complete, null), complete);
});

test('the consent fingerprint changes only with texts or documents shown on that path', () => {
  const changed = (kind: 'new' | 'existing', key: keyof typeof complete) =>
    consentVersion({ ...complete, [key]: complete[key] + ' x' }, kind) !==
    consentVersion(complete, kind);
  assert.match(consentVersion(complete, 'new'), /^[0-9a-f]{16}$/);
  assert.notEqual(consentVersion(complete, 'new'), consentVersion(complete, 'existing'));
  for (const key of ['headerNote', 'emailBody', 'form1Heading', 'successNewText'] as const) {
    assert.equal(changed('new', key), false, key);
    assert.equal(changed('existing', key), false, key);
  }
  for (const key of [
    'checkStatutes',
    'checkPrivacy',
    'checkAccuracy',
    'statutesUrl',
    'statutesTitle',
    'privacyUrl',
    'documentVersion',
    'newNotice',
  ] as const)
    assert.equal(changed('new', key), true, key);
  for (const key of [
    'checkPrivacy',
    'checkAccuracy',
    'privacyUrl',
    'documentVersion',
    'existingNotice',
  ] as const)
    assert.equal(changed('existing', key), true, key);
  // Existing members never see the statutes, so changes there do not interrupt them.
  for (const key of ['checkStatutes', 'statutesUrl', 'statutesTitle', 'newNotice'] as const)
    assert.equal(changed('existing', key), false, key);
  assert.equal(changed('new', 'existingNotice'), false);
});

test('submissions record the confirmed acknowledgement texts', () => {
  assert.deepEqual(acknowledgements(complete, 'new'), [
    complete.checkStatutes,
    complete.checkPrivacy,
    complete.checkAccuracy,
  ]);
  assert.deepEqual(acknowledgements(complete, 'existing'), [
    complete.checkPrivacy,
    complete.checkAccuracy,
  ]);
});
