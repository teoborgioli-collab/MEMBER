import { Fragment } from 'react';

/** Renders line breaks. The space before <br> keeps words apart where CSS hides the break. */
export function Lines({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <>
              {' '}
              <br />
            </>
          )}
          {line}
        </Fragment>
      ))}
    </>
  );
}

// In the admin preview, links open in a new tab so unsaved edits are not lost.
const previewLink = { target: '_blank', rel: 'noreferrer' } as const;

export function SiteHeader({
  clubName,
  headerNote,
  preview = false,
}: {
  clubName: string;
  headerNote: string;
  preview?: boolean;
}) {
  return (
    <header className="header">
      <a className="brand" href="/" {...(preview ? previewLink : {})}>
        <span className="brand-icon" aria-hidden="true">
          M
        </span>
        <span>
          {clubName || 'Unser Verein'}
          <small>MITGLIEDERPORTAL</small>
        </span>
      </a>
      {headerNote && <span className="header-note">{headerNote}</span>}
    </header>
  );
}

export function SiteFooter({
  footerNote,
  privacyUrl,
  imprintUrl,
  preview = false,
}: {
  footerNote: string;
  privacyUrl: string;
  imprintUrl: string;
  preview?: boolean;
}) {
  const extra = preview ? previewLink : {};
  return (
    <footer>
      <span>{footerNote}</span>
      <nav aria-label="Rechtliches und Verwaltung">
        <a href={privacyUrl || '/documents'} {...extra}>
          Datenschutz
        </a>
        <a href={imprintUrl || '/documents'} {...extra}>
          Impressum
        </a>
        <a href="/admin" {...extra}>
          Verwaltung
        </a>
      </nav>
    </footer>
  );
}
