// Deployment scenarios: migrations, environment defaults, missing or unreachable databases.
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
