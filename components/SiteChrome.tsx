'use client';
import { Fragment } from 'react';
import { useLocale } from './LocaleProvider';
import { usePathname } from 'next/navigation';
import { UI } from '../lib/i18n';

/** Renders line breaks. The space before <br> keeps words apart where CSS hides the break. */
export function Lines({ text }: { text: string }) {
  return <>{text.split('\n').map((line, i) => <Fragment key={i}>{i > 0 && <>{' '}<br /></>}{line}</Fragment>)}</>;
}
const previewLink = { target: '_blank', rel: 'noreferrer' } as const;

export function SiteHeader({ clubName, headerNote, preview = false }: { clubName: string; headerNote: string; preview?: boolean }) {
  const { locale, setLocale } = useLocale();
  const pathname = usePathname();
  const shownLocale = pathname.startsWith('/admin') ? 'de' : locale;
  const ui = UI[shownLocale];
  return <header className="header">
    <a className="brand" href="/" {...(preview ? previewLink : {})}>
      <span className="brand-icon" aria-hidden="true">M</span>
      <span>{clubName || (shownLocale === 'en' ? 'Our Association' : 'Unser Verein')}<small>{ui.portal}</small></span>
    </a>
    <div className="header-actions">
      {headerNote && <span className="header-note">{headerNote}</span>}
      {!pathname.startsWith('/admin') && <div className="locale-switch" role="group" aria-label="Language / Sprache">
        <button type="button" className={locale === 'de' ? 'active' : ''} onClick={() => setLocale('de')}>DE</button>
        <button type="button" className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>EN</button>
      </div>}
    </div>
  </header>;
}

export function SiteFooter({ footerNote, privacyUrl, imprintUrl, preview = false }: { footerNote: string; privacyUrl: string; imprintUrl: string; preview?: boolean }) {
  const { locale } = useLocale();
  const pathname = usePathname();
  const shownLocale = pathname.startsWith('/admin') ? 'de' : locale;
  const ui = UI[shownLocale];
  const extra = preview ? previewLink : {};
  return <footer>
    <span>{shownLocale === 'en' ? 'Membership. Simply organised.' : footerNote}</span>
    <nav aria-label={shownLocale === 'en' ? 'Legal and administration' : 'Rechtliches und Verwaltung'}>
      <a href={privacyUrl || '/documents'} {...extra}>{ui.privacy}</a>
      <a href={imprintUrl || '/documents'} {...extra}>{ui.imprint}</a>
      <a href="/admin" {...extra}>{ui.admin}</a>
    </nav>
  </footer>;
}
