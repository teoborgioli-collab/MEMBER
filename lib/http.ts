import { cookies } from 'next/headers';
import { db } from './db';
import { HttpError, SCHEMA_OUTDATED, errorCode, logError } from './errors';
import { allowedOrigin, cookieName, rateKey, verifySession } from './security';

export { HttpError };

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function admin() {
  if (!verifySession((await cookies()).get(cookieName)?.value))
    throw new HttpError(401, 'Bitte melde dich erneut an.');
}

/** Reads a same-origin JSON object body of at most `maxBytes`. */
export async function body(request: Request, maxBytes = 8192): Promise<Record<string, unknown>> {
  if (!allowedOrigin(request)) throw new HttpError(403, 'Diese Anfrage ist nicht erlaubt.');
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new HttpError(415, 'Ungültiges Anfrageformat.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Leere Anfrage.');
  let raw = '';
  let size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, 'Die Anfrage ist zu groß.');
    }
    raw += decoder.decode(value, { stream: true });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw + decoder.decode());
  } catch {
    throw new HttpError(400, 'Ungültige Anfrage.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new HttpError(400, 'Ungültige Anfrage.');
  return parsed as Record<string, unknown>;
}

export async function limit(request: Request, scope: string, max: number) {
  const sql = db();
  const key = rateKey(request, scope);
  const bucket = Math.floor(Date.now() / 3600000);
  const rows =
    await sql`INSERT INTO rate_limits (key,bucket,count) VALUES (${key},${bucket},1) ON CONFLICT (key,bucket) DO UPDATE SET count=rate_limits.count+1 RETURNING count`;
  if (rows[0].count > max)
    throw new HttpError(429, 'Zu viele Versuche. Bitte versuche es in einer Stunde erneut.');
  await sql`DELETE FROM rate_limits WHERE bucket < ${bucket - 24}`;
}

export function failure(err: unknown, scope = 'request', { adminRoute = false } = {}) {
  if (err instanceof HttpError) return json({ error: err.message, ...err.extra }, err.status);
  logError(scope, err);
  if (adminRoute && SCHEMA_OUTDATED.has(errorCode(err)))
    return json(
      {
        error:
          'Die Datenbank ist nicht auf dem aktuellen Stand. Bitte „npm run db:migrate“ ausführen (oder scripts/schema.sql erneut einspielen).',
      },
      503,
    );
  return json(
    { error: 'Der Dienst ist vorübergehend nicht verfügbar. Bitte versuche es später erneut.' },
    503,
  );
}
