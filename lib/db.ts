import postgres from 'postgres';

// URL parameters understood by libpq/psql but not by postgres.js. postgres.js would
// otherwise forward them to the server as runtime settings, which Postgres rejects
// (e.g. Neon's default `channel_binding=require` → "unrecognized configuration parameter").
const LIBPQ_ONLY_PARAMS = [
  'sslmode',
  'channel_binding',
  'sslrootcert',
  'sslcert',
  'sslkey',
  'sslcrl',
  'sslcrldir',
  'sslpassword',
  'sslcertmode',
  'sslcompression',
  'sslsni',
  'ssl_min_protocol_version',
  'ssl_max_protocol_version',
  'gssencmode',
  'gssdelegation',
  'gsslib',
  'krbsrvname',
  'requiressl',
  'require_auth',
  'passfile',
  'service',
  'load_balance_hosts',
  'hostaddr',
];

export type SslMode = false | 'require' | 'verify-full';

/**
 * DATABASE_SSL: `true`/unset → TLS with full certificate verification (recommended; works with
 * Neon and other providers using publicly trusted certificates), `require` → TLS without
 * certificate verification (only for providers with a private CA), `false` → no TLS (trusted
 * local test databases only).
 */
export function sslMode(value = process.env.DATABASE_SSL): SslMode {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'false' || v === 'disable' || v === 'off' || v === '0') return false;
  if (v === 'require' || v === 'no-verify') return 'require';
  return 'verify-full';
}

export function connectionUrl(raw: string) {
  const value = raw.trim();
  if (!/^postgres(ql)?:\/\//i.test(value))
    throw new Error('DATABASE_URL must start with postgres:// or postgresql://');
  // Only the query string is rewritten, so user, password and (multiple) hosts stay untouched.
  const q = value.indexOf('?');
  if (q === -1) return value;
  const params = new URLSearchParams(value.slice(q + 1));
  for (const key of LIBPQ_ONLY_PARAMS) params.delete(key);
  const rest = params.toString();
  return value.slice(0, q) + (rest ? '?' + rest : '');
}

export function connect(raw: string, options: postgres.Options<{}> = {}) {
  return postgres(connectionUrl(raw), {
    prepare: false,
    connect_timeout: 10,
    ssl: sslMode(),
    onnotice: () => {},
    ...options,
  });
}

// DATABASE_POOL_MAX: connections per server instance (default 3). The local PGlite test database
// multiplexes one session, so dev:local and the integration tests use a single connection.
const poolMax = () => Math.max(1, Math.min(10, Number(process.env.DATABASE_POOL_MAX) || 3));

let client: ReturnType<typeof postgres> | undefined;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('Database unavailable');
  return (client ||= connect(process.env.DATABASE_URL, { max: poolMax(), idle_timeout: 20 }));
}
