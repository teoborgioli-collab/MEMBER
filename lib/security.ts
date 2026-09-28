import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export const cookieName = 'portal_admin';
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('Session configuration missing');
  return s;
}
export function issueSession(now = Date.now()) {
  const value = `${now + 8 * 60 * 60 * 1000}.${randomBytes(16).toString('hex')}`;
  return value + '.' + createHmac('sha256', secret()).update(value).digest('hex');
}
export function verifySession(token: string | undefined, now = Date.now()) {
  if (!token) return false;
  try {
    const [expiry, nonce, signature, ...extra] = token.split('.');
    if (
      extra.length ||
      !/^\d+$/.test(expiry) ||
      !/^\w{32}$/.test(nonce) ||
      !/^\w{64}$/.test(signature) ||
      Number(expiry) <= now ||
      Number(expiry) > now + 8 * 60 * 60 * 1000
    )
      return false;
    const expected = createHmac('sha256', secret()).update(`${expiry}.${nonce}`).digest();
    const actual = Buffer.from(signature, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
export function verifyPassword(password: string) {
  const hash = process.env.ADMIN_PASSWORD_HASH || '';
  const [salt, value] = hash.split(':');
  if (!salt || !value || value.length !== 128 || password.length > 256) return false;
  const expected = Buffer.from(value, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function allowedOrigin(request: Request) {
  try {
    const expected =
      process.env.APP_URL ||
      (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:3000' : '');
    return new URL(request.headers.get('origin') || '').origin === new URL(expected).origin;
  } catch {
    return false;
  }
}
export function rateKey(request: Request, scope: string) {
  const ip = process.env.VERCEL
    ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    : 'local';
  return createHmac('sha256', secret())
    .update(scope + ':' + ip)
    .digest('hex');
}
