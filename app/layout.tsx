import './globals.css';
import type { Metadata } from 'next';
import { SiteFooter, SiteHeader } from '../components/SiteChrome';
import { LocaleProvider } from '../components/LocaleProvider';
import { loadPortal } from '../lib/portal';

// Texts come from the database and can change at any time, so nothing is prerendered.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await loadPortal();
  return {
    title: settings.clubName ? `Mitgliederportal · ${settings.clubName}` : 'Mitgliederportal',
    description: 'Mitglied werden oder Mitgliedsdaten aktualisieren.',
    robots: { index: false, follow: false },
    icons: { icon: '/favicon.svg' },
  };
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { settings } = await loadPortal();
  return (
    <html lang="de">
      <body>
        <LocaleProvider>
        <SiteHeader clubName={settings.clubName} headerNote={settings.headerNote} />
        {children}
        <SiteFooter
          footerNote={settings.footerNote}
          privacyUrl={settings.privacyUrl}
          imprintUrl={settings.imprintUrl}
        />
        </LocaleProvider>
      </body>
    </html>
  );
}
