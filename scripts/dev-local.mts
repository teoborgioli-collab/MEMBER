// `npm run dev:local`: try the complete portal on this computer without any external service.
// Starts a local PGlite database (stored in .local-db/, delete the folder to start over), applies
// the schema and runs `next dev` with a local admin password. Local testing only – never use
// this database or password for real member data. E-mails are not sent: a stand-in for the
// Resend API prints them in this terminal instead.
import { spawn } from 'node:child_process';
import { randomBytes, scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const PORT = Number(process.env.PORT || 3000);
const DB_PORT = Number(process.env.LOCAL_DB_PORT || 54329);
const PASSWORD = process.env.LOCAL_ADMIN_PASSWORD || 'lokal-testen';

const db = await PGlite.create('./.local-db');
await db.exec(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: DB_PORT, maxConnections: 10 });
await server.start();

const MAIL_PORT = DB_PORT + 1;
const mailServer = createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    try {
      const mail = JSON.parse(body);
      console.log(
        `\n  ── E-Mail (nicht versendet, nur lokal) ──\n  Von: ${mail.from}\n  An: ${mail.to}\n` +
          `  Antwort an: ${mail.reply_to ?? '–'}\n  Betreff: ${mail.subject}\n\n${mail.text}\n`,
      );
    } catch {}
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: randomBytes(8).toString('hex') }));
  });
});
await new Promise<void>((resolve) => mailServer.listen(MAIL_PORT, '127.0.0.1', resolve));

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
  RESEND_API_KEY: 'lokal',
  RESEND_API_URL: `http://127.0.0.1:${MAIL_PORT}`,
};

console.log(`
  Lokale Testumgebung
  Portal:      ${origin}
  Verwaltung:  ${origin}/admin   Passwort: ${PASSWORD}
  Daten:       .local-db/ (zum Zurücksetzen den Ordner löschen)
  E-Mails:     werden nicht versendet, sondern hier im Terminal angezeigt
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
  mailServer.close();
  await server.stop();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
next.on('exit', stop);
