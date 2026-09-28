'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formTexts, missingToOpen, type FormConfig, type Settings } from '../../lib/form-settings';
import Intro from '../Intro';
import MembershipForm from '../MembershipForm';
import { SiteFooter, SiteHeader } from '../SiteChrome';

type Kind = 'new' | 'existing';
type Step = 1 | 2 | 3;

const KINDS: [Kind, string][] = [
  ['new', 'Neuer Antrag'],
  ['existing', 'Bestehendes Mitglied'],
];
const STEPS: [Step, string][] = [
  [1, 'Schritt 1'],
  [2, 'Schritt 2'],
  [3, 'Bestätigung'],
];

/** Full-page preview of the public portal with the editor's unsaved draft. */
export default function PortalPreview({
  settings,
  onClose,
}: {
  settings: Settings;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>('new');
  const [step, setStep] = useState<Step>(1);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => setHost(document.body), []);

  // Modal behaviour: everything behind the preview is inert, Escape closes it, and focus
  // returns to where it was.
  useEffect(() => {
    if (!host) return;
    const previous = document.activeElement as HTMLElement | null;
    const hidden = [...host.children].filter(
      (el): el is HTMLElement =>
        el instanceof HTMLElement && el !== overlay.current && !el.hasAttribute('inert'),
    );
    hidden.forEach((el) => el.setAttribute('inert', ''));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      hidden.forEach((el) => el.removeAttribute('inert'));
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [host]);

  if (!host) return null;
  const config: FormConfig = {
    texts: formTexts(settings),
    open: settings.portalOpen && missingToOpen(settings).length === 0,
    unavailable: false,
    consent: { new: '', existing: '' },
    questions: settings.questions,
  };
  return createPortal(
    <div
      ref={overlay}
      className="preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-title"
    >
      <div className="preview-bar">
        <div className="preview-title">
          <strong id="preview-title">Vorschau</strong>
          <small>mit deinen ungespeicherten Änderungen</small>
        </div>
        <div className="segmented" role="group" aria-label="Art der Einreichung">
          {KINDS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Ansicht">
          {STEPS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={step === value}
              onClick={() => setStep(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          ref={closeButton}
          type="button"
          className="button secondary"
          onClick={() => close.current()}
        >
          Vorschau schließen
        </button>
      </div>
      <div className="preview-page">
        <SiteHeader clubName={settings.clubName} headerNote={settings.headerNote} preview />
        <main className="portal">
          <Intro t={settings} />
          <MembershipForm
            config={config}
            preview={{ kind, step, onKind: setKind, onStep: setStep }}
          />
        </main>
        <SiteFooter
          footerNote={settings.footerNote}
          privacyUrl={settings.privacyUrl}
          imprintUrl={settings.imprintUrl}
          preview
        />
      </div>
    </div>,
    host,
  );
}
