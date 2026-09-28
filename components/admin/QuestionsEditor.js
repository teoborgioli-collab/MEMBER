'use client';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { AUDIENCES, QUESTION_LIMITS, QUESTION_TYPES, newQuestionId, } from '../../lib/form-settings';
/** Add, edit, reorder and remove the additional questions of the public form. */
export default function QuestionsEditor({ questions, error, onChange, }) {
    const update = (index, patch) => onChange(questions.map((q, i) => (i === index ? { ...q, ...patch } : q)));
    const move = (index, by) => {
        const next = [...questions];
        const [item] = next.splice(index, 1);
        next.splice(index + by, 0, item);
        onChange(next);
    };
    const add = () => onChange([
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
    return (_jsxs("div", { className: "questions-editor", children: [error && (_jsx("p", { className: "field-error", role: "alert", id: "f-questions", children: error })), questions.length === 0 && (_jsx("p", { className: "muted small", children: "Noch keine zus\u00E4tzlichen Fragen. Vorname, Nachname, Geburtsdatum, E-Mail, Telefon und Zimmernummer werden immer abgefragt." })), questions.map((q, index) => {
                const id = (part) => `q-${q.id}-${part}`;
                return (_jsxs("fieldset", { className: "question-card", children: [_jsxs("legend", { children: ["Frage ", index + 1] }), _jsxs("div", { className: "editor-fields compact", children: [_jsxs("div", { className: "field wide", children: [_jsx("label", { htmlFor: id('label'), children: "Fragetext" }), _jsx("input", { id: id('label'), value: q.label, maxLength: QUESTION_LIMITS.label, placeholder: "z. B. Wie bist du auf uns aufmerksam geworden?", onChange: (e) => update(index, { label: e.target.value }) })] }), _jsxs("div", { className: "field wide", children: [_jsx("label", { htmlFor: id('labelEn'), children: "Fragetext auf Englisch (optional)" }), _jsx("input", { id: id('labelEn'), value: q.labelEn ?? '', maxLength: QUESTION_LIMITS.label, placeholder: "e.g. How did you hear about us?", onChange: (e) => update(index, { labelEn: e.target.value }) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: id('type'), children: "Antwortart" }), _jsx("select", { id: id('type'), value: q.type, onChange: (e) => update(index, { type: e.target.value }), children: QUESTION_TYPES.map(([value, label]) => (_jsx("option", { value: value, children: label }, value))) })] }), _jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: id('audience'), children: "Gilt f\u00FCr" }), _jsx("select", { id: id('audience'), value: q.appliesTo, onChange: (e) => update(index, { appliesTo: e.target.value }), children: AUDIENCES.map(([value, label]) => (_jsx("option", { value: value, children: label }, value))) })] }), q.type === 'select' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "field wide", children: [_jsx("label", { htmlFor: id('options'), children: "Auswahlm\u00F6glichkeiten (eine pro Zeile)" }), _jsx("textarea", { id: id('options'), rows: 4, value: q.options.join('\n'), onChange: (e) => update(index, { options: e.target.value.split('\n') }) })] }), _jsxs("div", { className: "field wide", children: [_jsx("label", { htmlFor: id('optionsEn'), children: "Auswahlm\u00F6glichkeiten auf Englisch (optional, gleiche Reihenfolge)" }), _jsx("textarea", { id: id('optionsEn'), rows: 4, value: (q.optionsEn ?? []).join('\n'), onChange: (e) => update(index, { optionsEn: e.target.value.split('\n') }) })] })] })), _jsxs("div", { className: "field wide", children: [_jsx("label", { htmlFor: id('help'), children: "Hinweis unter der Frage (optional)" }), _jsx("input", { id: id('help'), value: q.help, maxLength: QUESTION_LIMITS.help, onChange: (e) => update(index, { help: e.target.value }) })] }), _jsxs("div", { className: "field wide", children: [_jsx("label", { htmlFor: id('helpEn'), children: "Hinweis auf Englisch (optional)" }), _jsx("input", { id: id('helpEn'), value: q.helpEn ?? '', maxLength: QUESTION_LIMITS.help, onChange: (e) => update(index, { helpEn: e.target.value }) })] })] }), _jsxs("div", { className: "question-tools", children: [_jsxs("label", { className: "inline-check", children: [_jsx("input", { type: "checkbox", checked: q.required, onChange: (e) => update(index, { required: e.target.checked }) }), q.type === 'checkbox' ? 'Häkchen ist Pflicht' : 'Pflichtfrage'] }), _jsxs("span", { className: "question-buttons", children: [_jsx("button", { type: "button", className: "link-button", disabled: index === 0, onClick: () => move(index, -1), "aria-label": `Frage ${index + 1} nach oben`, children: "\u2191 nach oben" }), _jsx("button", { type: "button", className: "link-button", disabled: index === questions.length - 1, onClick: () => move(index, 1), "aria-label": `Frage ${index + 1} nach unten`, children: "\u2193 nach unten" }), _jsx("button", { type: "button", className: "link-button danger-link", onClick: () => {
                                                if (window.confirm('Diese Frage entfernen? Bereits gespeicherte Antworten bleiben erhalten.'))
                                                    onChange(questions.filter((_, i) => i !== index));
                                            }, children: "Entfernen" })] })] })] }, q.id));
            }), _jsx("button", { type: "button", className: "button secondary", onClick: add, disabled: questions.length >= QUESTION_LIMITS.count, children: "+ Frage hinzuf\u00FCgen" })] }));
}
