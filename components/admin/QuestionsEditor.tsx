'use client';
import {
  AUDIENCES,
  QUESTION_LIMITS,
  QUESTION_TYPES,
  newQuestionId,
  type Question,
} from '../../lib/form-settings';

/** Add, edit, reorder and remove the additional questions of the public form. */
export default function QuestionsEditor({
  questions,
  error,
  onChange,
}: {
  questions: Question[];
  error?: string;
  onChange: (questions: Question[]) => void;
}) {
  const update = (index: number, patch: Partial<Question>) =>
    onChange(questions.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  const move = (index: number, by: number) => {
    const next = [...questions];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    onChange(next);
  };
  const add = () =>
    onChange([
      ...questions,
      {
        id: newQuestionId(),
        label: '',
        labelEn: '',
        type: 'text',
        required: false,
        options: [],
        optionsEn: [],
        appliesTo: 'all',
        help: '',
        helpEn: '',
      },
    ]);

  return (
    <div className="questions-editor">
      {error && (
        <p className="field-error" role="alert" id="f-questions">
          {error}
        </p>
      )}
      {questions.length === 0 && (
        <p className="muted small">
          Noch keine zusätzlichen Fragen. Vorname, Nachname, Geburtsdatum, E-Mail, Telefon und
          Zimmernummer werden immer abgefragt; bei bestehenden Mitgliedern zusätzlich Eintrittsmonat/-jahr.
        </p>
      )}
      {questions.map((q, index) => {
        const id = (part: string) => `q-${q.id}-${part}`;
        return (
          <fieldset className="question-card" key={q.id}>
            <legend>Frage {index + 1}</legend>
            <div className="editor-fields compact">
              <div className="field wide">
                <label htmlFor={id('label')}>Fragetext</label>
                <input
                  id={id('label')}
                  value={q.label}
                  maxLength={QUESTION_LIMITS.label}
                  placeholder="z. B. Wie bist du auf uns aufmerksam geworden?"
                  onChange={(e) => update(index, { label: e.target.value })}
                />
              </div>
              <div className="field wide">
                <label htmlFor={id('labelEn')}>Fragetext auf Englisch (optional)</label>
                <input
                  id={id('labelEn')}
                  value={q.labelEn ?? ''}
                  maxLength={QUESTION_LIMITS.label}
                  placeholder="e.g. How did you hear about us?"
                  onChange={(e) => update(index, { labelEn: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor={id('type')}>Antwortart</label>
                <select
                  id={id('type')}
                  value={q.type}
                  onChange={(e) => update(index, { type: e.target.value as Question['type'] })}
                >
                  {QUESTION_TYPES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={id('audience')}>Gilt für</label>
                <select
                  id={id('audience')}
                  value={q.appliesTo}
                  onChange={(e) =>
                    update(index, { appliesTo: e.target.value as Question['appliesTo'] })
                  }
                >
                  {AUDIENCES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {q.type === 'select' && (
                <>
                  <div className="field wide">
                    <label htmlFor={id('options')}>Auswahlmöglichkeiten (eine pro Zeile)</label>
                    <textarea
                      id={id('options')}
                      rows={4}
                      value={q.options.join('\n')}
                      onChange={(e) => update(index, { options: e.target.value.split('\n') })}
                    />
                  </div>
                  <div className="field wide">
                    <label htmlFor={id('optionsEn')}>Auswahlmöglichkeiten auf Englisch (optional, gleiche Reihenfolge)</label>
                    <textarea
                      id={id('optionsEn')}
                      rows={4}
                      value={(q.optionsEn ?? []).join('\n')}
                      onChange={(e) => update(index, { optionsEn: e.target.value.split('\n') })}
                    />
                  </div>
                </>
              )}
              <div className="field wide">
                <label htmlFor={id('help')}>Hinweis unter der Frage (optional)</label>
                <input
                  id={id('help')}
                  value={q.help}
                  maxLength={QUESTION_LIMITS.help}
                  onChange={(e) => update(index, { help: e.target.value })}
                />
              </div>
              <div className="field wide">
                <label htmlFor={id('helpEn')}>Hinweis auf Englisch (optional)</label>
                <input
                  id={id('helpEn')}
                  value={q.helpEn ?? ''}
                  maxLength={QUESTION_LIMITS.help}
                  onChange={(e) => update(index, { helpEn: e.target.value })}
                />
              </div>
            </div>
            <div className="question-tools">
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) => update(index, { required: e.target.checked })}
                />
                {q.type === 'checkbox' ? 'Häkchen ist Pflicht' : 'Pflichtfrage'}
              </label>
              <span className="question-buttons">
                <button
                  type="button"
                  className="link-button"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Frage ${index + 1} nach oben`}
                >
                  ↑ nach oben
                </button>
                <button
                  type="button"
                  className="link-button"
                  disabled={index === questions.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Frage ${index + 1} nach unten`}
                >
                  ↓ nach unten
                </button>
                <button
                  type="button"
                  className="link-button danger-link"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Diese Frage entfernen? Bereits gespeicherte Antworten bleiben erhalten.',
                      )
                    )
                      onChange(questions.filter((_, i) => i !== index));
                  }}
                >
                  Entfernen
                </button>
              </span>
            </div>
          </fieldset>
        );
      })}
      <button
        type="button"
        className="button secondary"
        onClick={add}
        disabled={questions.length >= QUESTION_LIMITS.count}
      >
        + Frage hinzufügen
      </button>
    </div>
  );
}
