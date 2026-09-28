'use client';
import { useRef, useState } from 'react';
import {
  QUESTION_LIMITS,
  UNAVAILABLE_NOTICE,
  questionsFor,
  type FormConfig,
  type Question,
} from '../lib/form-settings';

type Kind = 'new' | 'existing';

/** Lets the admin preview drive the form without submitting anything. */
export type PreviewControls = {
  kind: Kind;
  step: 1 | 2 | 3;
  onKind: (kind: Kind) => void;
  onStep: (step: 1 | 2 | 3) => void;
};

const SAMPLE_REFERENCE = '3f6c2a1e-8b4d-4c9a-9e2f-7a1b5c8d0e42';

export default function MembershipForm({
  config: initialConfig,
  preview,
}: {
  config: FormConfig;
  preview?: PreviewControls;
}) {
  const [liveConfig, setLiveConfig] = useState(initialConfig);
  // In the preview the editor's draft (props) is the source of truth.
  const config = preview ? initialConfig : liveConfig;
  const t = config.texts;
  const [ownKind, setOwnKind] = useState<Kind>('new');
  const [ownStep, setOwnStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ownReceipt, setOwnReceipt] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const requestId = useRef('');

  const kind = preview ? preview.kind : ownKind;
  const step = preview ? (preview.step === 3 ? 2 : preview.step) : ownStep;
  const receipt = preview ? (preview.step === 3 ? SAMPLE_REFERENCE : '') : ownReceipt;
  const setKind = (value: Kind) => (preview ? preview.onKind(value) : setOwnKind(value));
  const setStep = (value: 1 | 2) => (preview ? preview.onStep(value) : setOwnStep(value));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (preview) return preview.onStep(3);
    if (!config.open || busy) return;
    setError('');
    setBusy(true);
    const formData = new FormData(e.currentTarget);
    const answers: Record<string, string | boolean> = {};
    for (const q of questionsFor(config.questions, kind))
      answers[q.id] =
        q.type === 'checkbox' ? formData.has('q:' + q.id) : String(formData.get('q:' + q.id) ?? '');
    const data = Object.fromEntries([...formData].filter(([key]) => !key.startsWith('q:')));
    // Reused for retries of unchanged data, so a lost response cannot create a duplicate.
    requestId.current ||= crypto.randomUUID();
    try {
      let res: Response;
      try {
        res = await fetch('/api/submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...data,
            answers,
            kind,
            requestId: requestId.current,
            consent: config.consent[kind],
          }),
        });
      } catch {
        throw new Error(
          'Keine Verbindung. Bitte prüfe deine Internetverbindung und versuche es erneut.',
        );
      }
      const result = await res.json().catch(() => ({}));
      if (res.status === 409 && result.code === 'stale' && result.config) {
        // The acknowledgement texts changed while the form was open: show the new version
        // and ask for a fresh confirmation. Entered personal data is kept.
        setLiveConfig(result.config);
        form.current
          ?.querySelectorAll<HTMLInputElement>('input[type=checkbox]')
          .forEach((box) => (box.checked = false));
        requestId.current = '';
      }
      if (!res.ok)
        throw new Error(
          result.error || 'Die Übermittlung ist fehlgeschlagen. Bitte versuche es später erneut.',
        );
      setOwnReceipt(result.reference);
      form.current?.reset();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Die Übermittlung ist fehlgeschlagen. Bitte versuche es später erneut.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (receipt)
    return (
      <section className="form-card success" aria-live="polite">
        <div className="success-mark" aria-hidden="true">
          ✓
        </div>
        {t.successEyebrow && <span className="eyebrow">{t.successEyebrow}</span>}
        <h2>{kind === 'new' ? t.successNewHeading : t.successExistingHeading}</h2>
        <p className="pre">{kind === 'new' ? t.successNewText : t.successExistingText}</p>
        {(kind === 'new' ? t.successNewNotice : t.successExistingNotice) && (
          <div className="notice pre">
            {kind === 'new' ? t.successNewNotice : t.successExistingNotice}
          </div>
        )}
        <p className="muted">
          {t.referenceLabel}
          <br />
          <strong className="reference">{receipt}</strong>
        </p>
        {preview ? (
          <button type="button" className="button" onClick={() => preview.onStep(1)}>
            {t.homeButton}
          </button>
        ) : (
          <a className="button" href="/">
            {t.homeButton}
          </a>
        )}
      </section>
    );

  const kindNotice = kind === 'new' ? t.newNotice : t.existingNotice;
  const kindText = kind === 'new' ? t.newText : t.existingText;
  return (
    <section className="form-card">
      <div className="card-top">
        <span className="eyebrow">{t.formEyebrow}</span>
        <span className="pill">Schritt {step} von 2</span>
      </div>
      <h2>{step === 1 ? t.form1Heading : t.form2Heading}</h2>
      {(step === 1 ? t.form1Text : t.form2Text) && (
        <p className="muted">{step === 1 ? t.form1Text : t.form2Text}</p>
      )}
      <div className="progress" aria-hidden="true">
        <span />
        <span className={step === 2 ? 'active' : ''} />
      </div>
      {!config.open && (
        <div className="notice pre" role="status">
          {config.unavailable ? UNAVAILABLE_NOTICE : t.closedNotice}
        </div>
      )}
      <form
        ref={form}
        onSubmit={submit}
        noValidate={Boolean(preview)}
        onChange={() => {
          requestId.current = '';
        }}
      >
        <div hidden={step !== 1}>
          <fieldset>
            <legend>{t.kindQuestion}</legend>
            <div className="choices">
              <label className={kind === 'new' ? 'choice selected' : 'choice'}>
                <input
                  type="radio"
                  name="kind"
                  value="new"
                  checked={kind === 'new'}
                  onChange={() => setKind('new')}
                />
                <strong>{t.kindNewTitle}</strong>
                {t.kindNewText && <span>{t.kindNewText}</span>}
              </label>
              <label className={kind === 'existing' ? 'choice selected' : 'choice'}>
                <input
                  type="radio"
                  name="kind"
                  value="existing"
                  checked={kind === 'existing'}
                  onChange={() => setKind('existing')}
                />
                <strong>{t.kindExistingTitle}</strong>
                {t.kindExistingText && <span>{t.kindExistingText}</span>}
              </label>
            </div>
          </fieldset>
          <div className="field-grid">
            <label>
              {t.labelFirstName}
              <input name="firstName" autoComplete="given-name" required maxLength={80} />
            </label>
            <label>
              {t.labelLastName}
              <input name="lastName" autoComplete="family-name" required maxLength={80} />
            </label>
            <label>
              {t.labelBirthDate}
              <input
                name="birthDate"
                type="date"
                autoComplete="bday"
                min="1900-01-01"
                max={new Date().toISOString().slice(0, 10)}
                required
                suppressHydrationWarning
              />
            </label>
            <label>
              {t.labelEmail}
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder={t.emailPlaceholder || undefined}
              />
            </label>
            <label>
              {t.labelPhone}
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                required
                maxLength={30}
                pattern="\+?[0-9\(][0-9 \(\)\/.\-]{4,}"
                title="Bitte eine Telefonnummer mit mindestens 6 Ziffern angeben."
              />
            </label>
            <label>
              {t.labelRoom}
              <input name="room" required maxLength={20} autoComplete="off" />
            </label>
          </div>
          {questionsFor(config.questions, kind).length > 0 && (
            <div className="questions">
              {questionsFor(config.questions, kind).map((q) => (
                <QuestionField key={q.id} question={q} />
              ))}
            </div>
          )}
          {t.fieldHint ? <p className="field-hint pre">{t.fieldHint}</p> : <div className="gap" />}
          <button
            type="button"
            className="button full"
            onClick={() => {
              if (preview || form.current?.reportValidity()) {
                setStep(2);
                setError('');
              }
            }}
          >
            {t.nextButton} <span aria-hidden="true">→</span>
          </button>
        </div>
        <div hidden={step !== 2}>
          <h3>{kind === 'new' ? t.newTitle : t.existingTitle}</h3>
          {kindText && <p className="pre">{kindText}</p>}
          <div className="documents">
            {kind === 'new' && (
              <a href={t.statutesUrl || '/documents'} target="_blank" rel="noreferrer">
                <span aria-hidden="true">↗</span>
                <div>
                  <strong>{t.statutesTitle}</strong>
                  {t.statutesHint && <small>{t.statutesHint}</small>}
                </div>
                <span>Öffnen</span>
              </a>
            )}
            <a href={t.privacyUrl || '/documents'} target="_blank" rel="noreferrer">
              <span aria-hidden="true">↗</span>
              <div>
                <strong>{t.privacyTitle}</strong>
                {t.privacyHint && <small>{t.privacyHint}</small>}
              </div>
              <span>Öffnen</span>
            </a>
          </div>
          {kind === 'new' && (
            <label className="check">
              <input type="checkbox" name="statutesAccepted" required={step === 2} />
              <span className="pre">{t.checkStatutes}</span>
            </label>
          )}
          <label className="check">
            <input type="checkbox" name="privacyRead" required={step === 2} />
            <span className="pre">{t.checkPrivacy}</span>
          </label>
          <label className="check">
            <input type="checkbox" name="accuracyConfirmed" required={step === 2} />
            <span className="pre">{t.checkAccuracy}</span>
          </label>
          {kindNotice && <div className="notice pre">{kindNotice}</div>}
          <label className="trap" aria-hidden="true">
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button type="button" className="button secondary" onClick={() => setStep(1)}>
              {t.backButton}
            </button>
            <button className="button" disabled={!preview && (busy || !config.open)}>
              {busy ? 'Wird übermittelt …' : kind === 'new' ? t.submitNew : t.submitExisting}{' '}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </form>
      {(t.helpText || t.contactEmail) && (
        <p className="help">
          {t.helpText}{' '}
          {t.contactEmail ? (
            <a href={'mailto:' + t.contactEmail}>{t.helpLink}</a>
          ) : (
            'Deine Vereinsverwaltung hilft dir weiter.'
          )}
        </p>
      )}
    </section>
  );
}

function QuestionField({ question: q }: { question: Question }) {
  const name = 'q:' + q.id;
  const hint = q.help ? <small className="question-help">{q.help}</small> : null;
  if (q.type === 'checkbox')
    return (
      <label className="check">
        <input type="checkbox" name={name} required={q.required} />
        <span>
          {q.label}
          {hint}
        </span>
      </label>
    );
  return (
    <label className="question">
      <span>
        {q.label}
        {!q.required && <span className="optional"> (optional)</span>}
      </span>
      {q.type === 'select' ? (
        <select name={name} required={q.required} defaultValue="">
          <option value="" disabled={q.required}>
            Bitte wählen …
          </option>
          {q.options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : q.type === 'textarea' ? (
        <textarea
          name={name}
          required={q.required}
          rows={3}
          maxLength={QUESTION_LIMITS.longAnswer}
        />
      ) : (
        <input name={name} required={q.required} maxLength={QUESTION_LIMITS.answer} />
      )}
      {hint}
    </label>
  );
}
