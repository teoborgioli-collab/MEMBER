import { cookies } from 'next/headers';
import { body, failure, json } from '../../../../lib/http';
import { cookieName } from '../../../../lib/security';

export async function POST(request: Request) {
  try {
    await body(request);
    (await cookies()).set(cookieName, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });
    return json({ ok: true });
  } catch (err) {
    return failure(err, 'logout', { adminRoute: true });
  }
}
