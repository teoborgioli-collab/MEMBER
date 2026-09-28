import { createHmac } from 'node:crypto';
import { db } from './db';

/**
 * Counts one event in the current hour for `key` and reports whether it stays within `max`.
 * Keys are HMAC hashes (see security.ts), never raw IP addresses.
 */
export async function consume(key: string, max: number) {
  const sql = db();
  const bucket = Math.floor(Date.now() / 3600000);
  const rows =
    await sql`INSERT INTO rate_limits (key,bucket,count) VALUES (${key},${bucket},1) ON CONFLICT (key,bucket) DO UPDATE SET count=rate_limits.count+1 RETURNING count`;
  if (rows[0].count > max) return false;
  await sql`DELETE FROM rate_limits WHERE bucket < ${bucket - 24}`;
  return true;
}

/** A rate-limit key that is the same for every visitor (e.g. all notification e-mails). */
export function globalKey(scope: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('Session configuration missing');
  return createHmac('sha256', secret)
    .update('global:' + scope)
    .digest('hex');
}
