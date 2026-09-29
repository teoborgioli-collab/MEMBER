// Starts a throwaway database and the production build of the portal for integration tests.
//
// Database: an in-memory PGlite (Postgres compiled to WebAssembly) served over the Postgres
// wire protocol, or – if TEST_DATABASE_URL is set – a real Postgres server. With a real
// server every test file works in its own temporary schema, which is dropped afterwards; the
// database name must contain "test" as a safety net.
import { spawn } from 'node:child_process';
import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer, type AddressInfo } from 'node:net';
import path from 'node:path';
import postgres from 'postgres';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { connectionUrl, sslMode } from '../../lib/db';

export const ROOT = process.cwd();
export const PASSWORD = 'integration-test-password';

export type Db = {
  url: string;
  ssl: string;
  /** Connections the app may open (PGlite multiplexes a single session). */
  poolMax: string;
  sql: postgres.Sql;
  stop: () => Promise<void>;
};

export async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

export async function startDatabase(): Promise<Db> {
  const external = process.env.TEST_DATABASE_URL;
  if (external) {
    const url = new URL(external);
    if (!/test/i.test(url.pathname))
      throw new Error('TEST_DATABASE_URL must name a database containing "test".');
    const schema = 'it_' + randomBytes(6).toString('hex');
    const ssl = process.env.TEST_DATABASE_SSL ?? 'true';
    const admin = postgres(connectionUrl(external), {
      max: 1,
      ssl: sslMode(ssl),
      onnotice: () => {},
    });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    await admin.end({ timeout: 2 });
    // postgres.js passes unknown URL parameters to the server as settings.
    url.searchParams.set('search_path', schema);
    const scoped = url.toString();
    const sql = postgres(connectionUrl(scoped), {
      max: 2,
      ssl: sslMode(ssl),
      prepare: false,
      onnotice: () => {},
    });
    return {
      url: scoped,
      ssl,
      poolMax: '3',
      sql,
      stop: async () => {
        await sql.unsafe(`DROP SCHEMA ${schema} CASCADE`);
        await sql.end({ timeout: 2 });
      },
    };
  }
  const pglite = await PGlite.create();
  serializeClients(pglite);
  const port = await freePort();
  const server = new PGLiteSocketServer({
    db: pglite,
    host: '127.0.0.1',
    port,
    maxConnections: 12,
  });
  await server.start();
  const url = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  const sql = postgres(url, { max: 1, ssl: false, prepare: false, onnotice: () => {} });
  return {
    url,
    ssl: 'false',
    poolMax: '1',
    sql,
    stop: async () => {
      await sql.end({ timeout: 2 });
      await server.stop();
      await pglite.close();
    },
  };
}

/**
 * PGlite has a single session, and the socket server only keeps a client's queries together
 * inside a transaction. With the extended protocol (Parse/Bind/Execute … Sync) a query from a
 * second client could land between those messages. Treating an unfinished sequence like an open
 * transaction keeps each query of the test and the app (which sends e-mails in the background)
 * together. Test infrastructure only – a real Postgres server has separate sessions.
 */
function serializeClients(pglite: PGlite) {
  const EXTENDED = new Set([0x50, 0x42, 0x44, 0x45, 0x43, 0x48]); // P B D E C H
  let unfinished = false;
  const exec = pglite.execProtocolRawStream.bind(pglite);
  const inTransaction = pglite.isInTransaction.bind(pglite);
  pglite.execProtocolRawStream = (async (message: Uint8Array, options: never) => {
    unfinished = EXTENDED.has(message[0]);
    return exec(message, options);
  }) as typeof pglite.execProtocolRawStream;
  pglite.isInTransaction = () => {
    if (pglite.closed) return false; // late messages while the test database shuts down
    return unfinished || inTransaction();
  };
}

type Run = { code: number | null; output: string };

export function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

/** Runs the real migration script (npm run db:migrate) against the test database. */
export async function migrate(db: Db) {
  const result = await run(process.execPath, ['--import', 'tsx', 'scripts/migrate.mts'], {
    ...process.env,
    DATABASE_URL: db.url,
    DATABASE_SSL: db.ssl,
  });
  if (result.code !== 0) throw new Error('Migration failed:\n' + result.output);
  return result.output;
}

export function adminHash(password = PASSWORD) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export type App = {
  base: string;
  env: Record<string, string>;
  logs: () => string;
  stop: () => Promise<void>;
};

/** Starts `next start` (the production build) with an isolated set of portal variables. */
export async function startApp(db: Db | null, env: Record<string, string> = {}): Promise<App> {
  if (!existsSync(path.join(ROOT, '.next', 'BUILD_ID')))
    throw new Error('No production build found. Run `npm run build` first.');
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  // Every portal variable is set explicitly so values from a developer's .env.local cannot leak
  // into the test server (Next.js never overrides variables that are already defined).
  const portalEnv: Record<string, string> = {
    APP_URL: base,
    DATABASE_URL: db?.url ?? '',
    DATABASE_SSL: db?.ssl ?? 'false',
    DATABASE_POOL_MAX: db?.poolMax ?? '1',
    ADMIN_PASSWORD_HASH: adminHash(),
    SESSION_SECRET: randomBytes(32).toString('hex'),
    CLUB_NAME: '',
    CONTACT_EMAIL: '',
    STATUTES_URL: '',
    PRIVACY_URL: '',
    IMPRINT_URL: '',
    DOCUMENT_VERSION: '',
    PORTAL_OPEN: 'false',
    RESEND_API_KEY: '',
    RESEND_API_URL: '',
    MAIL_FROM: '',
    CLUB_NOTIFY_EMAIL: '',
    VERCEL: '',
    NEXT_TELEMETRY_DISABLED: '1',
    ...env,
  };
  const child = spawn(
    process.execPath,
    [
      path.join(ROOT, 'node_modules/next/dist/bin/next'),
      'start',
      '-H',
      '127.0.0.1',
      '-p',
      String(port),
    ],
    { cwd: ROOT, env: { ...process.env, ...portalEnv }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  const exited = new Promise<void>((resolve) => child.on('exit', () => resolve()));
  const deadline = Date.now() + 30_000;
  while (true) {
    if (child.exitCode !== null) throw new Error('next start exited:\n' + output);
    try {
      const res = await fetch(base + '/documents');
      await res.arrayBuffer();
      break;
    } catch {
      if (Date.now() > deadline) throw new Error('next start did not become ready:\n' + output);
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  return {
    base,
    env: portalEnv,
    logs: () => output,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
      }
    },
  };
}

/** Minimal HTTP client with a cookie jar for the admin session cookie. */
export class Client {
  cookie = '';
  setCookies: string[] = [];
  constructor(public base: string) {}

  async req(
    route: string,
    opts: {
      method?: string;
      json?: unknown;
      body?: string;
      headers?: Record<string, string>;
      origin?: string | false;
    } = {},
  ) {
    const headers: Record<string, string> = { ...opts.headers };
    const origin = opts.origin === undefined ? this.base : opts.origin;
    if (origin) headers.origin = origin;
    let body = opts.body;
    if (opts.json !== undefined) {
      headers['content-type'] ??= 'application/json';
      body = JSON.stringify(opts.json);
    }
    if (this.cookie) headers.cookie = this.cookie;
    const res = await fetch(this.base + route, {
      method: opts.method ?? (body === undefined ? 'GET' : 'POST'),
      headers,
      body,
      redirect: 'manual',
    });
    this.setCookies = res.headers.getSetCookie();
    for (const cookie of this.setCookies) {
      const [pair, ...attributes] = cookie.split(';');
      const [name, value] = pair.split('=');
      if (name !== 'portal_admin') continue;
      const expired = attributes.some((a) => /^\s*max-age=0\s*$/i.test(a));
      this.cookie = value && !expired ? `portal_admin=${value}` : '';
    }
    return res;
  }

  async json<T = any>(route: string, opts: Parameters<Client['req']>[1] = {}) {
    const res = await this.req(route, opts);
    const text = await res.text();
    let data: T;
    try {
      data = JSON.parse(text);
    } catch {
      data = text as T;
    }
    return { status: res.status, headers: res.headers, data };
  }

  async login(password = PASSWORD) {
    const { status } = await this.json('/api/admin/login', { json: { password } });
    if (status !== 200) throw new Error('Login failed with ' + status);
    return this;
  }
}

/** Rendered markup without the React payload scripts (which also carry hidden texts). */
export function visible(html: string) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
}

export async function visiblePage(base: string, route = '/') {
  return visible(await (await fetch(base + route)).text());
}

export type Consent = { new: string; existing: string };

/** The consent fingerprints the public page hands to the browser. */
export async function pageConsent(base: string): Promise<Consent> {
  const html = await (await fetch(base + '/')).text();
  const q = '\\\\?"';
  const match = html.match(
    new RegExp(
      `consent${q}:\\{${q}new${q}:${q}([0-9a-f]{16})${q},${q}existing${q}:${q}([0-9a-f]{16})`,
    ),
  );
  if (!match) throw new Error('No consent fingerprint in page');
  return { new: match[1], existing: match[2] };
}

export function newApplication(consent: Consent | string, overrides: Record<string, unknown> = {}) {
  const kind = (overrides.kind as 'new' | 'existing' | undefined) ?? 'new';
  return {
    requestId: crypto.randomUUID(),
    kind: 'new',
    firstName: 'Jürgen',
    lastName: 'Öztürk',
    birthDate: '1990-05-17',
    email: 'juergen.oeztuerk@example.org',
    phone: '+49 30 1234567',
    room: 'B 214',
    statutesAccepted: 'on',
    privacyRead: 'on',
    accuracyConfirmed: 'on',
    website: '',
    consent: typeof consent === 'string' ? consent : consent[kind],
    ...(kind === 'existing' ? { membershipStartMonth: '2024-10' } : {}),
    ...overrides,
  };
}

export const COMPLETE = {
  clubName: 'SV Beispielstadt 1920 e. V.',
  contactEmail: 'verwaltung@example.org',
  statutesUrl: '/documents/satzung-2026-09.pdf',
  privacyUrl: '/documents/datenschutz-2026-09.pdf',
  imprintUrl: 'https://example.org/impressum',
  documentVersion: '2026-09-28',
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type SentMail = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  reply_to?: string;
  headers?: Record<string, string>;
  idempotencyKey: string;
  authorization: string;
};

/**
 * A stand-in for the Resend API (POST /emails). Like Resend, a repeated Idempotency-Key is
 * answered with the first result and not delivered again. `failWith` makes it reject requests.
 */
export async function startMailServer() {
  const mails: SentMail[] = [];
  const seen = new Map<string, string>();
  const state = { requests: 0, failWith: 0, delayMs: 0 };
  const server = createHttpServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', async () => {
      state.requests++;
      if (state.delayMs) await sleep(state.delayMs);
      const reply = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.method !== 'POST' || req.url !== '/emails') return reply(404, {});
      if (state.failWith)
        return reply(state.failWith, { name: 'validation_error', message: 'rejected' });
      const key = String(req.headers['idempotency-key'] ?? '');
      if (key && seen.has(key)) return reply(200, { id: seen.get(key) });
      const id = crypto.randomUUID();
      if (key) seen.set(key, id);
      mails.push({
        ...JSON.parse(raw),
        idempotencyKey: key,
        authorization: String(req.headers.authorization ?? ''),
      });
      reply(200, { id });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    mails,
    state,
    /** Waits until at least `count` mails were delivered. */
    async waitFor(count: number, timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      while (mails.length < count) {
        if (Date.now() > deadline) throw new Error(`Expected ${count} mails, got ${mails.length}`);
        await sleep(50);
      }
      return mails;
    },
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export type MailServer = Awaited<ReturnType<typeof startMailServer>>;
