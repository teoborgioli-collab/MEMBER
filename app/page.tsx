import Intro from '../components/Intro';
import MembershipForm from '../components/MembershipForm';
import { loadPortal } from '../lib/portal';
import { formConfig } from '../lib/settings';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const portal = await loadPortal();
  return (
    <main className="portal">
      <Intro t={portal.settings} />
      <MembershipForm config={formConfig(portal)} />
    </main>
  );
}
