import { cookies } from 'next/headers';
import { body, failure, HttpError, json, limit } from '../../../../lib/http';
import { cookieName, issueSession, verifyPassword } from '../../../../lib/security';

export async function POST(request: Request) {
  try {
    const data = await body(request);
    await limit(request, 'login', 8);
    if (typeof data.password !== 'string' || !data.password)
      throw new HttpError(400, 'Bitte das Verwaltungspasswort eingeben.');
    if (!verifyPassword(data.password)) throw new HttpError(401, 'Anmeldung fehlgeschlagen.');
    (await cookies()).set(cookieName, issueSession(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 8 * 60 * 60,
    });
    return json({ ok: true });
  } catch (err) {
    return failure(err, 'login', { adminRoute: true });
  }
}
