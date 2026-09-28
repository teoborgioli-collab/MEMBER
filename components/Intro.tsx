import type { TextSettings } from '../lib/form-settings';
import { Lines } from './SiteChrome';

export type IntroTexts = Pick<
  TextSettings,
  | 'introEyebrow'
  | 'introHeading'
  | 'introText'
  | 'journey1Title'
  | 'journey1Text'
  | 'journey2Title'
  | 'journey2Text'
  | 'journey3Title'
  | 'journey3Text'
  | 'privacyNoteTitle'
  | 'privacyNoteText'
>;

export default function Intro({ t }: { t: IntroTexts }) {
  const journey = [
    [t.journey1Title, t.journey1Text],
    [t.journey2Title, t.journey2Text],
    [t.journey3Title, t.journey3Text],
  ].filter(([title]) => title);
  return (
    <aside className="intro">
      {t.introEyebrow && <span className="eyebrow">{t.introEyebrow}</span>}
      <h1>
        <Lines text={t.introHeading} />
      </h1>
      {t.introText && <p className="pre">{t.introText}</p>}
      {journey.length > 0 && (
        <>
          <div className="aside-divider" />
          <ol className="journey">
            {journey.map(([title, text], i) => (
              <li key={i}>
                <b>{String(i + 1).padStart(2, '0')}</b>
                <span>
                  <strong>{title}</strong>
                  {text}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      {(t.privacyNoteTitle || t.privacyNoteText) && (
        <div className="privacy-note">
          <span aria-hidden="true">◈</span>
          <p>
            {t.privacyNoteTitle && <strong>{t.privacyNoteTitle}</strong>}
            <span className="pre">{t.privacyNoteText}</span>
          </p>
        </div>
      )}
    </aside>
  );
}
