import { cookies } from 'next/headers';
import { cookieName, verifySession } from '../../lib/security';
import Admin from '../../components/Admin';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const authenticated = verifySession((await cookies()).get(cookieName)?.value);
  return <Admin authenticated={authenticated} view="submissions" />;
}
