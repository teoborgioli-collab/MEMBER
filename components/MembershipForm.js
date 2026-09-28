'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from 'react';
import { localizeFormTexts, localizeQuestion, UI } from '../lib/i18n';
import { QUESTION_LIMITS, UNAVAILABLE_NOTICE, questionsFor, } from '../lib/form-settings';
const SAMPLE_REFERENCE = '3f6c2a1e-8b4d-4c9a-9e2f-7a1b5c8d0e42';
export default function MembershipForm({ config: initialConfig, preview, locale = 'de', }) {
    const [liveConfig, setLiveConfig] = useState(initialConfig);
    // In the preview the editor's draft (props) is the source of truth.
    const config = preview ? initialConfig : liveConfig;
    const t = localizeFormTexts(config.texts, locale);
    const ui = UI[locale];
    const [ownKind, setOwnKind] = useState('new');
    const [ownStep, setOwnStep] = useState(1);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [ownReceipt, setOwnReceipt] = useState('');
    const form = useRef(null);
    const requestId = useRef('');
    const kind = preview ? preview.kind : ownKind;
    const step = preview ? (preview.step === 3 ? 2 : preview.step) : ownStep;
    const receipt = preview ? (preview.step === 3 ? SAMPLE_REFERENCE : '') : ownReceipt;
    const setKind = (value) => (preview ? preview.onKind(value) : setOwnKind(value));
    const setStep = (value) => (preview ? preview.onStep(value) : setOwnStep(value));
    async function submit(e) {
        e.preventDefault();
        if (preview)
            return preview.onStep(3);
        if (!config.open || busy)
            return;
        setError('');
        setBusy(true);
        const formData = new FormData(e.currentTarget);
        const answers = {};
        for (const q of questionsFor(config.questions, kind))
            answers[q.id] =
                q.type === 'checkbox' ? formData.has('q:' + q.id) : String(formData.get('q:' + q.id) ?? '');
        const data = Object.fromEntries([...formData].filter(([key]) => !key.startsWith('q:')));
        // Reused for retries of unchanged data, so a lost response cannot create a duplicate.
        requestId.current ||= crypto.randomUUID();
        try {
            let res;
            try {
                res = await fetch('/api/submissions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...data,
                        answers,
                        kind,
                        locale,
                        requestId: requestId.current,
                        consent: config.consent[kind],
                    }),
                });
            }
            catch {
                throw new Error(ui.offline);
            }
            const result = await res.json().catch(() => ({}));
            if (res.status === 409 && result.code === 'stale' && result.config) {
                // The acknowledgement texts changed while the form was open: show the new version
                // and ask for a fresh confirmation. Entered personal data is kept.
                setLiveConfig(result.config);
                form.current
                    ?.querySelectorAll('input[type=checkbox]')
                    .forEach((box) => (box.checked = false));
                requestId.current = '';
            }
            if (!res.ok)
                throw new Error(result.error || ui.submitError);
            setOwnReceipt(result.reference);
            form.current?.reset();
        }
        catch (err) {
            setError(err instanceof Error && err.message
                ? err.message
                : ui.submitError);
        }
        finally {
            setBusy(false);
        }
    }
    if (receipt)
        return (_jsxs("section", { className: "form-card success", "aria-live": "polite", children: [_jsx("div", { className: "success-mark", "aria-hidden": "true", children: "\u2713" }), t.successEyebrow && _jsx("span", { className: "eyebrow", children: t.successEyebrow }), _jsx("h2", { children: kind === 'new' ? t.successNewHeading : t.successExistingHeading }), _jsx("p", { className: "pre", children: kind === 'new' ? t.successNewText : t.successExistingText }), (kind === 'new' ? t.successNewNotice : t.successExistingNotice) && (_jsx("div", { className: "notice pre", children: kind === 'new' ? t.successNewNotice : t.successExistingNotice })), _jsxs("p", { className: "muted", children: [t.referenceLabel, _jsx("br", {}), _jsx("strong", { className: "reference", children: receipt })] }), preview ? (_jsx("button", { type: "button", className: "button", onClick: () => preview.onStep(1), children: t.homeButton })) : (_jsx("a", { className: "button", href: "/", children: t.homeButton }))] }));
    const kindNotice = kind === 'new' ? t.newNotice : t.existingNotice;
    const kindText = kind === 'new' ? t.newText : t.existingText;
    return (_jsxs("section", { className: "form-card", children: [_jsxs("div", { className: "card-top", children: [_jsx("span", { className: "eyebrow", children: t.formEyebrow }), _jsx("span", { className: "pill", children: ui.step(step) })] }), _jsx("h2", { children: step === 1 ? t.form1Heading : t.form2Heading }), (step === 1 ? t.form1Text : t.form2Text) && (_jsx("p", { className: "muted", children: step === 1 ? t.form1Text : t.form2Text })), _jsxs("div", { className: "progress", "aria-hidden": "true", children: [_jsx("span", {}), _jsx("span", { className: step === 2 ? 'active' : '' })] }), !config.open && (_jsx("div", { className: "notice pre", role: "status", children: config.unavailable ? UNAVAILABLE_NOTICE : t.closedNotice })), _jsxs("form", { ref: form, onSubmit: submit, noValidate: Boolean(preview), onChange: () => {
                    requestId.current = '';
                }, children: [_jsxs("div", { hidden: step !== 1, children: [_jsxs("fieldset", { children: [_jsx("legend", { children: t.kindQuestion }), _jsxs("div", { className: "choices", children: [_jsxs("label", { className: kind === 'new' ? 'choice selected' : 'choice', children: [_jsx("input", { type: "radio", name: "kind", value: "new", checked: kind === 'new', onChange: () => setKind('new') }), _jsx("strong", { children: t.kindNewTitle }), t.kindNewText && _jsx("span", { children: t.kindNewText })] }), _jsxs("label", { className: kind === 'existing' ? 'choice selected' : 'choice', children: [_jsx("input", { type: "radio", name: "kind", value: "existing", checked: kind === 'existing', onChange: () => setKind('existing') }), _jsx("strong", { children: t.kindExistingTitle }), t.kindExistingText && _jsx("span", { children: t.kindExistingText })] })] })] }), _jsxs("div", { className: "field-grid", children: [_jsxs("label", { children: [t.labelFirstName, _jsx("input", { name: "firstName", autoComplete: "given-name", required: true, maxLength: 80 })] }), _jsxs("label", { children: [t.labelLastName, _jsx("input", { name: "lastName", autoComplete: "family-name", required: true, maxLength: 80 })] }), _jsxs("label", { children: [t.labelBirthDate, _jsx("input", { name: "birthDate", type: "date", autoComplete: "bday", min: "1900-01-01", max: new Date().toISOString().slice(0, 10), required: true, suppressHydrationWarning: true })] }), _jsxs("label", { children: [t.labelEmail, _jsx("input", { name: "email", type: "email", autoComplete: "email", required: true, maxLength: 254, placeholder: t.emailPlaceholder || undefined })] }), _jsxs("label", { children: [t.labelPhone, _jsx("input", { name: "phone", type: "tel", autoComplete: "tel", required: true, maxLength: 30, pattern: "\\+?[0-9\\(][0-9 \\(\\)\\/.\\-]{4,}", title: ui.phoneTitle })] }), _jsxs("label", { children: [t.labelRoom, _jsx("input", { name: "room", required: true, maxLength: 20, autoComplete: "off" })] }), kind === 'existing' && (_jsxs("label", { children: [t.labelMembershipStart, _jsx("input", { name: "membershipStartMonth", type: "month", min: "1900-01", max: new Date().toISOString().slice(0, 7), required: true })] }))] }), questionsFor(config.questions, kind).length > 0 && (_jsx("div", { className: "questions", children: questionsFor(config.questions, kind).map((q) => (_jsx(QuestionField, { question: q, locale: locale }, q.id))) })), t.fieldHint ? _jsx("p", { className: "field-hint pre", children: t.fieldHint }) : _jsx("div", { className: "gap" }), _jsxs("button", { type: "button", className: "button full", onClick: () => {
                                    if (preview || form.current?.reportValidity()) {
                                        setStep(2);
                                        setError('');
                                    }
                                }, children: [t.nextButton, " ", _jsx("span", { "aria-hidden": "true", children: "\u2192" })] })] }), _jsxs("div", { hidden: step !== 2, children: [_jsx("h3", { children: kind === 'new' ? t.newTitle : t.existingTitle }), kindText && _jsx("p", { className: "pre", children: kindText }), _jsxs("div", { className: "documents", children: [kind === 'new' && (_jsxs("a", { href: t.statutesUrl || '/documents', target: "_blank", rel: "noreferrer", children: [_jsx("span", { "aria-hidden": "true", children: "\u2197" }), _jsxs("div", { children: [_jsx("strong", { children: t.statutesTitle }), t.statutesHint && _jsx("small", { children: t.statutesHint })] }), _jsx("span", { children: ui.open })] })), _jsxs("a", { href: t.privacyUrl || '/documents', target: "_blank", rel: "noreferrer", children: [_jsx("span", { "aria-hidden": "true", children: "\u2197" }), _jsxs("div", { children: [_jsx("strong", { children: t.privacyTitle }), t.privacyHint && _jsx("small", { children: t.privacyHint })] }), _jsx("span", { children: ui.open })] })] }), kind === 'new' && (_jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", name: "statutesAccepted", required: step === 2 }), _jsx("span", { className: "pre", children: t.checkStatutes })] })), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", name: "privacyRead", required: step === 2 }), _jsx("span", { className: "pre", children: t.checkPrivacy })] }), _jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", name: "accuracyConfirmed", required: step === 2 }), _jsx("span", { className: "pre", children: t.checkAccuracy })] }), kindNotice && _jsx("div", { className: "notice pre", children: kindNotice }), _jsxs("label", { className: "trap", "aria-hidden": "true", children: ["Website", _jsx("input", { name: "website", tabIndex: -1, autoComplete: "off" })] }), error && (_jsx("p", { className: "error", role: "alert", children: error })), _jsxs("div", { className: "actions", children: [_jsx("button", { type: "button", className: "button secondary", onClick: () => setStep(1), children: t.backButton }), _jsxs("button", { className: "button", disabled: !preview && (busy || !config.open), children: [busy ? ui.sending : kind === 'new' ? t.submitNew : t.submitExisting, ' ', _jsx("span", { "aria-hidden": "true", children: "\u2192" })] })] })] })] }), (t.helpText || t.contactEmail) && (_jsxs("p", { className: "help", children: [t.helpText, ' ', t.contactEmail ? (_jsx("a", { href: 'mailto:' + t.contactEmail, children: t.helpLink })) : (ui.fallbackHelp)] }))] }));
}
function QuestionField({ question: q, locale }) {
    const name = 'q:' + q.id;
    const localized = localizeQuestion(q, locale);
    const ui = UI[locale];
    const hint = localized.help ? _jsx("small", { className: "question-help", children: localized.help }) : null;
    if (q.type === 'checkbox')
        return (_jsxs("label", { className: "check", children: [_jsx("input", { type: "checkbox", name: name, required: q.required }), _jsxs("span", { children: [localized.label, hint] })] }));
    return (_jsxs("label", { className: "question", children: [_jsxs("span", { children: [localized.label, !q.required && _jsxs("span", { className: "optional", children: [" (", ui.optional, ")"] })] }), q.type === 'select' ? (_jsxs("select", { name: name, required: q.required, defaultValue: "", children: [_jsx("option", { value: "", disabled: q.required, children: ui.choose }), q.options.map((option, i) => (_jsx("option", { value: option, children: localized.options[i] ?? option }, option)))] })) : q.type === 'textarea' ? (_jsx("textarea", { name: name, required: q.required, rows: 3, maxLength: QUESTION_LIMITS.longAnswer })) : (_jsx("input", { name: name, required: q.required, maxLength: QUESTION_LIMITS.answer })), hint] }));
}
