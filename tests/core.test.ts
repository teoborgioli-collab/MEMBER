import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { submissionSchema, validDate, validPhone, canTransition } from '../lib/validation';
import { issueSession, verifySession, verifyPassword, allowedOrigin } from '../lib/security';
import { connectionUrl, sslMode } from '../lib/db';

process.env.SESSION_SECRET = 'a'.repeat(64);
process.env.APP_URL = 'https://members.example.org';

const valid = {
  requestId: 'dcd436f7-27bb-4fd5-b953-43c44172a6e3',
  kind: 'new',
  firstName: 'Müller',
  lastName: 'Öztürk',
  birthDate: '2000-02-29',
  email: 'm@example.org',
  phone: '+49 (0)30 123-4567',
  room: '3.12',
  privacyRead: 'on',
  accuracyConfirmed: 'on',
  statutesAccepted: 'on',
  consent: '0123456789abcdef',
};

test('requires acknowledgements and real past dates', () => {
  assert.equal(submissionSchema.safeParse(valid).success, true);
  for (const patch of [
    { privacyRead: undefined },
    { accuracyConfirmed: undefined },
    { statutesAccepted: undefined },
    { birthDate: '2023-02-29' },
    { birthDate: '2100-01-01' },
    { birthDate: '1899-12-31' },
    { email: 'invalid' },
    { phone: undefined },
    { phone: '' },
    { phone: '12345' },
    { phone: 'call me' },
    { room: undefined },
    { room: '  ' },
    { room: 'x'.repeat(21) },
    { room: 'A\u0000' },
    { firstName: '\n' },
    { firstName: 'A\u0000B' },
    { firstName: 'A‮B' },
    { firstName: 'x'.repeat(81) },
    { website: 'spam' },
    { consent: undefined },
    { consent: 'not-a-fingerprint' },
    { requestId: 'not-a-uuid' },
    { kind: 'admin' },
  ])
    assert.equal(
      submissionSchema.safeParse({ ...valid, ...patch }).success,
      false,
      JSON.stringify(patch),
    );
  assert.equal(validDate('2000-02-29'), true);
  assert.equal(validDate('2000-02-30'), false);
});

test('phone numbers accept common notations', () => {
  for (const ok of [
    '030 1234567',
    '+49 30 1234567',
    '0176/12345678',
    '(030) 12.34.56',
    '+1-202-555-0100',
  ])
    assert.equal(validPhone(ok), true, ok);
  for (const bad of ['', '12345', '++49 30 123456', '030 1234 abc', '1'.repeat(21), ' 0301234567'])
    assert.equal(validPhone(bad), false, bad);
});

test('names and email addresses are normalised', () => {
  const parsed = submissionSchema.parse({
    ...valid,
    firstName: '  Jürgen ',
    email: '  Juergen.Mueller@Example.ORG ',
    phone: ' 030 1234567 ',
    room: ' B 214 ',
  });
  assert.equal(parsed.phone, '030 1234567');
  assert.equal(parsed.room, 'B 214');
  assert.equal(parsed.firstName, 'Jürgen');
  assert.equal(parsed.email, 'juergen.mueller@example.org');
});

test('existing updates do not require statute acceptance', () => {
  assert.equal(
    submissionSchema.safeParse({ ...valid, kind: 'existing', statutesAccepted: undefined }).success,
    true,
  );
});

test('membership approval is distinct from data review', () => {
  assert.ok(canTransition('new', 'pending', 'approve'));
  assert.ok(canTransition('existing', 'pending', 'review'));
  assert.ok(canTransition('existing', 'pending', 'reject'));
  assert.equal(canTransition('existing', 'pending', 'approve'), false);
  assert.equal(canTransition('new', 'pending', 'review'), false);
  assert.equal(canTransition('new', 'pending', 'sent'), false);
  assert.equal(canTransition('new', 'approved', 'reject'), false);
  assert.equal(canTransition('new', 'rejected', 'approve'), false);
  assert.equal(canTransition('existing', 'reviewed', 'sent'), false);
  assert.ok(canTransition('new', 'approved', 'sent'));
});

test('sessions reject tampering and expiration', () => {
  const now = Date.now();
  const token = issueSession(now);
  assert.ok(verifySession(token, now));
  assert.equal(verifySession(token + '0', now), false);
  assert.equal(
    verifySession(
      token.replace(/^\d/, (d) => String((+d + 1) % 10)),
      now,
    ),
    false,
  );
  assert.equal(verifySession(token, now + 9 * 3600000), false);
  assert.equal(verifySession(undefined), false);
  assert.equal(verifySession('garbage'), false);
});

test('password hashes validate without storing plaintext', () => {
  const salt = randomBytes(16).toString('hex');
  process.env.ADMIN_PASSWORD_HASH =
    salt + ':' + scryptSync('test-password-only', salt, 64).toString('hex');
  assert.ok(verifyPassword('test-password-only'));
  assert.equal(verifyPassword('wrong'), false);
  assert.equal(verifyPassword('x'.repeat(257)), false);
  process.env.ADMIN_PASSWORD_HASH = 'not-a-hash';
  assert.equal(verifyPassword('test-password-only'), false);
});

test('cross-origin and missing-origin mutations are denied', () => {
  const req = (origin?: string) =>
    new Request('https://members.example.org/api', { headers: origin ? { origin } : {} });
  assert.ok(allowedOrigin(req('https://members.example.org')));
  assert.equal(allowedOrigin(req('https://evil.example')), false);
  assert.equal(allowedOrigin(req('http://members.example.org')), false);
  assert.equal(allowedOrigin(req('null')), false);
  assert.equal(allowedOrigin(req()), false);
});

test('database URLs drop libpq-only options such as Neon’s channel_binding', () => {
  const url = connectionUrl(
    'postgresql://user:p%40ss@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require&options=endpoint%3Dep-x',
  );
  assert.equal(
    url,
    'postgresql://user:p%40ss@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?options=endpoint%3Dep-x',
  );
  assert.throws(() => connectionUrl('mysql://localhost/db'));
  // Several hosts (supported by postgres.js) and URLs without parameters stay unchanged.
  assert.equal(
    connectionUrl('postgres://u:p@h1:5432,h2:5433/db?sslmode=verify-full&application_name=x'),
    'postgres://u:p@h1:5432,h2:5433/db?application_name=x',
  );
  assert.equal(connectionUrl(' postgres://u@localhost/db '), 'postgres://u@localhost/db');
  assert.equal(
    connectionUrl('postgres://u@localhost/db?sslmode=disable'),
    'postgres://u@localhost/db',
  );
});

test('DATABASE_SSL verifies certificates unless told otherwise', () => {
  assert.equal(sslMode(undefined), 'verify-full');
  assert.equal(sslMode('true'), 'verify-full');
  assert.equal(sslMode('verify-full'), 'verify-full');
  assert.equal(sslMode('require'), 'require');
  assert.equal(sslMode('false'), false);
  assert.equal(sslMode(' FALSE '), false);
});
