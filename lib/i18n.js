export const EN_FORM_TEXTS = {
    formEyebrow: 'MEMBERSHIP',
    form1Heading: 'A good start.',
    form1Text: 'Tell us briefly who you are.',
    kindQuestion: 'Are you already a member?',
    kindNewTitle: 'I am new here',
    kindNewText: 'Apply for membership',
    kindExistingTitle: 'I am already a member',
    kindExistingText: 'Update my membership details',
    labelFirstName: 'First name',
    labelLastName: 'Last name',
    labelBirthDate: 'Date of birth',
    labelEmail: 'Email address',
    emailPlaceholder: 'name@example.com',
    labelPhone: 'Telephone number',
    labelRoom: 'Room number',
    labelMembershipStart: 'Member since (month and year)',
    fieldHint: 'Fields marked as required must be completed.',
    nextButton: 'Continue',
    closedNotice: 'The membership portal is currently closed.',
    form2Heading: 'Almost done.',
    form2Text: 'Please review the documents and confirm the information below.',
    newTitle: 'Membership application',
    newText: 'Please read the statutes and privacy information before submitting your application.',
    existingTitle: 'Update membership details',
    existingText: 'Please confirm that your information is correct and up to date.',
    statutesTitle: 'Statutes',
    statutesHint: 'Rules of our association',
    privacyTitle: 'Privacy information',
    privacyHint: 'How we process your personal data',
    checkStatutes: 'I have read and accept the statutes. I hereby apply for membership.',
    checkPrivacy: 'I have read the privacy information.',
    checkAccuracy: 'I confirm that the information I provided is correct and up to date.',
    newNotice: 'Your application will be reviewed by the association before membership is confirmed.',
    existingNotice: 'We will compare your information with our membership records.',
    backButton: 'Back',
    submitNew: 'Submit membership application',
    submitExisting: 'Submit updated details',
    helpText: 'Questions?',
    helpLink: 'Contact the association',
    successEyebrow: 'SUBMITTED',
    successNewHeading: 'Your application has been received.',
    successNewText: 'Thank you. We will review your membership application and contact you after a decision has been made.',
    successNewNotice: 'Once accepted, you will receive your membership confirmation separately by email.',
    successExistingHeading: 'Your details have been received.',
    successExistingText: 'The association will review your information and compare it with the existing membership records.',
    successExistingNotice: 'If we have any questions, we will contact you by email.',
    referenceLabel: 'Your reference number',
    homeButton: 'Back to the start',
};
export const EN_INTRO = {
    introEyebrow: 'YOUR ASSOCIATION. YOUR MEMBERSHIP.',
    introHeading: 'Great to have you\nwith us.',
    introText: 'New to the association or already a member? This is the right place for your membership details.',
    journey1Title: 'Your membership status',
    journey1Text: 'New member or already registered?',
    journey2Title: 'Your details',
    journey2Text: 'Only the information we actually need.',
    journey3Title: 'Review & submit',
    journey3Text: 'Our team will take it from there.',
    privacyNoteTitle: 'Your data stays protected.',
    privacyNoteText: 'No advertising and no tracking. Your information is only used by the responsible association administration.',
};
export const UI = {
    de: {
        portal: 'MITGLIEDERPORTAL', privacy: 'Datenschutz', imprint: 'Impressum', admin: 'Verwaltung',
        step: (n) => `Schritt ${n} von 2`, open: 'Öffnen', sending: 'Wird übermittelt …',
        optional: 'optional', choose: 'Bitte wählen …', phoneTitle: 'Bitte eine Telefonnummer mit mindestens 6 Ziffern angeben.',
        offline: 'Keine Verbindung. Bitte prüfe deine Internetverbindung und versuche es erneut.',
        submitError: 'Die Übermittlung ist fehlgeschlagen. Bitte versuche es später erneut.',
        fallbackHelp: 'Deine Vereinsverwaltung hilft dir weiter.',
    },
    en: {
        portal: 'MEMBERSHIP PORTAL', privacy: 'Privacy', imprint: 'Legal notice', admin: 'Administration',
        step: (n) => `Step ${n} of 2`, open: 'Open', sending: 'Submitting …',
        optional: 'optional', choose: 'Please select …', phoneTitle: 'Please enter a telephone number with at least 6 digits.',
        offline: 'No connection. Please check your internet connection and try again.',
        submitError: 'Submission failed. Please try again later.',
        fallbackHelp: 'The association administration will be happy to help.',
    },
};
export function localizeFormTexts(texts, locale) {
    if (locale === 'de')
        return texts;
    return { ...texts, ...EN_FORM_TEXTS };
}
export function localizeQuestion(q, locale) {
    if (locale === 'de')
        return { label: q.label, help: q.help, options: q.options };
    return {
        label: q.labelEn?.trim() || q.label,
        help: q.helpEn?.trim() || q.help,
        options: q.options.map((option, i) => q.optionsEn?.[i]?.trim() || option),
    };
}
export function monthYear(value, locale) {
    if (!/^\d{4}-\d{2}$/.test(value))
        return value;
    const [year, month] = value.split('-').map(Number);
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
        month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, 1)));
}
