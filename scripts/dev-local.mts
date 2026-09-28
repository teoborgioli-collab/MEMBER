// `npm run dev:local`: try the complete portal on this computer without any external service.
// Starts a local PGlite database (stored in .local-db/, delete the folder to start over), applies
// the schema and runs `next dev` with a local admin password. Local testing only – never use
// this database or password for real member data.
import { spawn } from 'node:child_process';
import { randomBytes, scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const PORT = Number(process.env.PORT || 3000);
const DB_PORT = Number(process.env.LOCAL_DB_PORT || 54329);
const PASSWORD = process.env.LOCAL_ADMIN_PASSWORD || 'lokal-testen';

const db = await PGlite.create('./.local-db');
await db.exec(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: DB_PORT, maxConnections: 10 });
await server.start();

const salt = randomBytes(16).toString('hex');
const origin = `http://127.0.0.1:${PORT}`;
const env = {
  ...process.env,
  APP_URL: origin,
  DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`,
  DATABASE_SSL: 'false',
  DATABASE_POOL_MAX: '1',
  ADMIN_PASSWORD_HASH: `${salt}:${scryptSync(PASSWORD, salt, 64).toString('hex')}`,
  SESSION_SECRET: randomBytes(32).toString('hex'),
};

console.log(`
  Lokale Testumgebung
  Portal:      ${origin}
  Verwaltung:  ${origin}/admin   Passwort: ${PASSWORD}
  Daten:       .local-db/ (zum Zurücksetzen den Ordner löschen)
`);

const next = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-H', '127.0.0.1', '-p', String(PORT)],
  { env, stdio: 'inherit' },
);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  next.kill('SIGTERM');
  await server.stop();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
next.on('exit', stop);
