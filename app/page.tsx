import PublicPortal from '../components/PublicPortal';
import { loadPortal } from '../lib/portal';
import { formConfig } from '../lib/settings';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const portal = await loadPortal();
  return <PublicPortal intro={portal.settings} config={formConfig(portal)} />;
}
