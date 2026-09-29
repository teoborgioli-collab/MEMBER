// Deployment scenarios: migrations, environment defaults, missing or unreachable databases.
import { readFile } from 'node:fs/promises';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPLETE,
  Client,
  freePort,
  migrate,
  newApplication,
  pageConsent,
  startApp,
  startDatabase,
  startMailServer,
  sleep,
  visiblePage,
  type App,
  type Db,
} from './harness';

// The schema of the first release, before editable texts existed.
const FIRST_RELEASE_SCHEMA = `
CREATE TABLE submissions (
 id uuid PRIMARY KEY,
 kind text NOT NULL CHECK (kind IN ('new','existing')),
 first_name text NOT NULL CHECK(length(first_name) BETWEEN 1 AND 80),
 last_name text NOT NULL CHECK(length(last_name) BETWEEN 1 AND 80),
 birth_date date NOT NULL,
 email text NOT NULL CHECK(length(email)<=254),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','reviewed','rejected')),
 document_version text NOT NULL,
 statutes_url text NOT NULL,
 privacy_url text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 sent_at timestamptz,
 CHECK((kind='new' AND status<>'reviewed') OR (kind='existing' AND status<>'approved'))
);
CREATE INDEX submissions_status_created ON submissions(status,created_at DESC);
CREATE TABLE rate_limits (key text NOT NULL,bucket bigint NOT NULL,count integer NOT NULL,PRIMARY KEY(key,bucket));`;

const cleanup: (() => Promise<void>)[] = [];
after(async () => {
  for (const fn of cleanup.reverse()) await fn();
});
async function database() {
  const db = await startDatabase();
  cleanup.push(db.stop);
  return db;
}
async function app(db: Db | null, env: Record<string, string> = {}): Promise<App> {
  const started = await startApp(db, env);
  cleanup.push(started.stop);
  return started;
}

test('an outdated database is reported to admins and keeps the portal closed', async () => {
  const db = await database();
  await db.sql.unsafe(FIRST_RELEASE_SCHEMA);
  const server = await app(db, { ...envFor(COMPLETE), PORTAL_OPEN: 'true' });
  const page = await visiblePage(server.base);
  assert.match(page, /Das Portal ist gerade nicht erreichbar/);
  const admin = await new Client(server.base).login();
  const settings = await admin.json('/api/admin/settings');
  assert.equal(settings.status, 503);
  assert.match(settings.data.error, /npm run db:migrate/);
  assert.match(server.logs(), /\[portal\] reading settings failed \(42P01\)/);
});

test('the migration upgrades the first release and can run repeatedly', async () => {
  const db = await database();
  await db.sql.unsafe(FIRST_RELEASE_SCHEMA);
  const id = crypto.randomUUID();
  await db.sql`
    INSERT INTO submissions (id, kind, first_name, last_name, birth_date, email,
                             document_version, statutes_url, privacy_url)
    VALUES (${id}, 'new', 'Alt', 'Bestand', '1970-01-01', 'alt@example.org', 'v1', '/s.pdf', '/p.pdf')`;
  assert.match(await migrate(db), /Database tables ready/);
  assert.match(await migrate(db), /Database tables ready/);
  const [row] = await db.sql`SELECT first_name, acknowledgements FROM submissions WHERE id=${id}`;
  assert.equal(row.first_name, 'Alt');
  assert.deepEqual(row.acknowledgements, []);
  const tables = await db.sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema() ORDER BY table_name`;
  assert.deepEqual(
    tables.map((t) => t.table_name),
    ['portal_settings', 'rate_limits', 'submissions'],
  );
});

const NEW_COLUMNS = [
  'phone',
  'room',
  'answers',
  'club_notified_at',
  'confirmation_sent_at',
  'mail_error',
];

test('the SQL migration for Neon adds the new fields without touching existing data', async () => {
  const db = await database();
  await migrate(db);
  // The state before this update: none of the new columns yet, one stored record.
  await db.sql.unsafe(
    'ALTER TABLE submissions ' + NEW_COLUMNS.map((c) => `DROP COLUMN ${c}`).join(', '),
  );
  const id = crypto.randomUUID();
  await db.sql`
    INSERT INTO submissions (id, kind, first_name, last_name, birth_date, email,
                             document_version, statutes_url, privacy_url, status, decided_at)
    VALUES (${id}, 'new', 'Alt', 'Bestand', '1970-01-01', 'alt@example.org', 'v1', '/s.pdf',
            '/p.pdf', 'approved', now())`;
  await db.sql`INSERT INTO portal_settings (id, data, revision)
               VALUES (1, ${db.sql.json({ clubName: 'Mein Verein' })}, 7)`;
  const file = await readFile(
    'scripts/migrations/2026-09-29-telefon-zimmer-fragen-emails.sql',
    'utf8',
  );
  // Run exactly as pasted into the Neon SQL editor (one session, own BEGIN/COMMIT), twice.
  const session = await db.sql.reserve();
  await session.unsafe(file);
  await session.unsafe(file);
  session.release();
  assert.match(await migrate(db), /Database tables ready/);

  const columns = await db.sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'submissions'`;
  for (const c of NEW_COLUMNS)
    assert.ok(
      columns.some((r) => r.column_name === c),
      c,
    );
  const [row] = await db.sql`
    SELECT first_name, status, phone, room, answers, club_notified_at, mail_error
    FROM submissions WHERE id = ${id}`;
  assert.deepEqual(
    { ...row },
    {
      first_name: 'Alt',
      status: 'approved',
      phone: null,
      room: null,
      answers: [],
      club_notified_at: null,
      mail_error: null,
    },
  );
  const [settings] = await db.sql`SELECT data, revision FROM portal_settings`;
  assert.equal(settings.data.clubName, 'Mein Verein');
  assert.equal(settings.revision, 7);

  // The old record still works in the admin area, including its PDF.
  const server = await app(db, { ...envFor(COMPLETE) });
  const admin = await new Client(server.base).login();
  const list = await admin.json('/api/admin/submissions?status=all');
  assert.equal(list.status, 200);
  assert.equal(list.data.rows[0].phone, null);
  const pdf = await admin.req(`/api/admin/submissions/${id}/pdf`);
  assert.equal(pdf.status, 200);
  const csv = await admin.req('/api/admin/export');
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /Alt;Bestand;01\.01\.1970;alt@example\.org;;;/);
});

test('without the new columns submissions fail clearly instead of losing data', async () => {
  const db = await database();
  await migrate(db);
  await db.sql.unsafe('ALTER TABLE submissions DROP COLUMN phone');
  const server = await app(db, { ...envFor(COMPLETE), PORTAL_OPEN: 'true' });
  const consent = await pageConsent(server.base);
  const res = await new Client(server.base).json('/api/submissions', {
    json: newApplication(consent),
  });
  assert.equal(res.status, 503);
  assert.equal((await db.sql`SELECT count(*)::int AS n FROM submissions`)[0].n, 0);
});

test('without RESEND_API_KEY submissions are stored and the missing key is shown', async () => {
  const db = await database();
  await migrate(db);
  const server = await app(db, { ...envFor(COMPLETE), PORTAL_OPEN: 'true' });
  const consent = await pageConsent(server.base);
  const application = newApplication(consent);
  const res = await new Client(server.base).json('/api/submissions', { json: application });
  assert.equal(res.status, 201);
  const admin = await new Client(server.base).login();
  let row: any;
  for (let i = 0; i < 100 && !row?.mail_error; i++) {
    await sleep(50);
    row = (await admin.json('/api/admin/submissions?status=all')).data.rows[0];
  }
  assert.equal(row.id, application.requestId);
  assert.equal(row.mail_error, 'verein:NO_API_KEY bestaetigung:NO_API_KEY');
  const retry = await admin.json('/api/admin/submissions/' + row.id, { json: { action: 'mails' } });
  assert.equal(retry.status, 502);
  assert.match(retry.data.error, /RESEND_API_KEY ist in Vercel nicht gesetzt/);
  assert.doesNotMatch(server.logs(), /Öztürk|example\.org/);
});

test('sender and club inbox can be changed with environment variables', async () => {
  const db = await database();
  await migrate(db);
  const mail = await startMailServer();
  cleanup.push(mail.stop);
  const server = await app(db, {
    ...envFor(COMPLETE),
    PORTAL_OPEN: 'true',
    RESEND_API_KEY: 're_other',
    RESEND_API_URL: mail.url,
    MAIL_FROM: 'Vorstand <vorstand@example.org>',
    CLUB_NOTIFY_EMAIL: 'vorstand@example.org',
  });
  const consent = await pageConsent(server.base);
  await new Client(server.base).json('/api/submissions', { json: newApplication(consent) });
  const [club, receipt] = await mail.waitFor(2);
  assert.equal(club.from, 'Vorstand <vorstand@example.org>');
  assert.deepEqual(club.to, ['vorstand@example.org']);
  assert.equal(receipt.reply_to, 'vorstand@example.org');
  assert.match(receipt.subject, new RegExp(COMPLETE.clubName.replace(/\./g, '\\.') + '$'));
});

test('environment variables configure the portal until texts are saved', async () => {
  const db = await database();
  await migrate(db);
  const server = await app(db, { ...envFor(COMPLETE), PORTAL_OPEN: 'true' });
  const page = await visiblePage(server.base);
  assert.match(page, /Mitgliederportal · SV Beispielstadt 1920 e\. V\./);
  assert.doesNotMatch(page, /Das Portal wird eingerichtet/);
  const consent = await pageConsent(server.base);
  const res = await new Client(server.base).json('/api/submissions', {
    json: newApplication(consent),
  });
  assert.equal(res.status, 201);
  const [row] = await db.sql`SELECT document_version, privacy_url FROM submissions`;
  assert.equal(row.document_version, COMPLETE.documentVersion);
  assert.equal(row.privacy_url, COMPLETE.privacyUrl);
  // Saving in the editor takes over from the environment variables.
  const admin = await new Client(server.base).login();
  const current = (await admin.json('/api/admin/settings')).data;
  assert.equal(current.defaults.clubName, COMPLETE.clubName);
  const saved = await admin.json('/api/admin/settings', {
    method: 'PUT',
    json: { settings: { ...current.settings, clubName: 'Neuer Name e. V.' }, revision: 0 },
  });
  assert.equal(saved.status, 200);
  assert.match(await visiblePage(server.base), /Mitgliederportal · Neuer Name e\. V\./);
});

test('an unreachable database keeps the portal closed without exposing details', async () => {
  const port = await freePort();
  const server = await app(null, {
    ...envFor(COMPLETE),
    PORTAL_OPEN: 'true',
    DATABASE_URL: `postgres://nobody:secret@127.0.0.1:${port}/none`,
  });
  const page = await visiblePage(server.base);
  assert.match(page, /Das Portal ist gerade nicht erreichbar/);
  assert.doesNotMatch(page, /secret|ECONNREFUSED/);
  const visitor = new Client(server.base);
  const res = await visitor.json('/api/submissions', {
    json: newApplication('0123456789abcdef'),
  });
  assert.equal(res.status, 503);
  assert.equal(
    res.data.error,
    'Das Portal ist gerade nicht erreichbar. Bitte versuche es später erneut.',
  );
  const login = await visitor.json('/api/admin/login', { json: { password: 'x' } });
  assert.equal(login.status, 503);
  assert.match(login.data.error, /vorübergehend nicht verfügbar/);
  assert.match(server.logs(), /\[portal\] reading settings failed \(ECONNREFUSED\)/);
  assert.doesNotMatch(server.logs(), /secret/);
});

test('without any configuration the design can be previewed but nothing is accepted', async () => {
  const server = await app(null, { DATABASE_URL: '', ADMIN_PASSWORD_HASH: '', SESSION_SECRET: '' });
  const page = await visiblePage(server.base);
  assert.match(page, /Das Portal wird eingerichtet/);
  const res = await new Client(server.base).json('/api/submissions', {
    json: newApplication('0123456789abcdef'),
  });
  assert.equal(res.status, 503);
  const login = await new Client(server.base).json('/api/admin/login', {
    json: { password: 'x' },
  });
  assert.equal(login.status, 503);
});

function envFor(values: typeof COMPLETE) {
  return {
    CLUB_NAME: values.clubName,
    CONTACT_EMAIL: values.contactEmail,
    STATUTES_URL: values.statutesUrl,
    PRIVACY_URL: values.privacyUrl,
    IMPRINT_URL: values.imprintUrl,
    DOCUMENT_VERSION: values.documentVersion,
  };
}
