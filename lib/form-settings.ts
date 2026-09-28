// Admin-editable texts and settings of the public portal. Client-safe: no Node.js or database
// imports, so the admin editor and the public form can share these definitions.

export type FieldType = 'text' | 'textarea' | 'url' | 'email';

export type FieldDef = {
  /** Label in the admin editor. */
  label: string;
  /** Built-in default. Some are replaced by environment variables (see lib/settings.ts). */
  value: string;
  type?: FieldType;
  max: number;
  /** May be left empty; the element is then not shown. */
  optional?: boolean;
  /** May only be empty while the portal is closed. */
  requiredToOpen?: boolean;
  help?: string;
  rows?: number;
  maxLines?: number;
  /** Printed in the confirmation PDF: must use characters the bundled font supports. */
  pdf?: boolean;
  /** Supports the placeholders {vorname}, {nachname} and {verein}. */
  placeholders?: boolean;
};

const define = <T extends Record<string, FieldDef>>(fields: T) =>
  fields as { [K in keyof T]: FieldDef };

export const FIELDS = define({
  // Verein & Kontakt
  clubName: {
    label: 'Vereinsname',
    value: '',
    max: 120,
    requiredToOpen: true,
    pdf: true,
    help: 'Erscheint in der Kopfzeile, im E-Mail-Entwurf und im PDF.',
  },
  contactEmail: {
    label: 'E-Mail-Adresse der Vereinsverwaltung',
    value: '',
    type: 'email',
    max: 254,
    requiredToOpen: true,
    help: 'Wird im Formular für Rückfragen verlinkt.',
  },
  headerNote: {
    label: 'Kurzer Satz in der Kopfzeile',
    value: 'Gemeinsam im Verein.',
    max: 80,
    optional: true,
  },
  footerNote: {
    label: 'Satz in der Fußzeile',
    value: 'Mitgliedschaft. Einfach organisiert.',
    max: 80,
    optional: true,
  },

  // Dokumente & Links
  statutesUrl: {
    label: 'Satzung – Link',
    value: '',
    type: 'url',
    max: 500,
    requiredToOpen: true,
    help: 'Pfad wie /documents/satzung-2026-09.pdf oder ein vollständiger https://-Link.',
  },
  statutesTitle: { label: 'Satzung – Bezeichnung', value: 'Satzung', max: 60 },
  statutesHint: {
    label: 'Satzung – Kurzbeschreibung',
    value: 'Regeln unseres Vereins',
    max: 80,
    optional: true,
  },
  privacyUrl: {
    label: 'Datenschutzhinweise – Link',
    value: '',
    type: 'url',
    max: 500,
    requiredToOpen: true,
    help: 'Wird im Formular und in der Fußzeile verlinkt.',
  },
  privacyTitle: {
    label: 'Datenschutzhinweise – Bezeichnung',
    value: 'Datenschutzhinweise',
    max: 60,
  },
  privacyHint: {
    label: 'Datenschutzhinweise – Kurzbeschreibung',
    value: 'So verarbeiten wir deine Angaben',
    max: 80,
    optional: true,
  },
  imprintUrl: {
    label: 'Impressum – Link',
    value: '',
    type: 'url',
    max: 500,
    requiredToOpen: true,
    help: 'Wird in der Fußzeile verlinkt.',
  },
  documentVersion: {
    label: 'Dokumentenversion',
    value: '',
    max: 40,
    requiredToOpen: true,
    help: 'Z. B. das Datum der Fassung (2026-09-28). Wird mit jeder Einreichung gespeichert. Bei neuen Dokumenten ändern und die alten Dateien unter ihrem Namen erreichbar lassen.',
  },

  // Startseite
  introEyebrow: {
    label: 'Überzeile',
    value: 'DEIN VEREIN. DEINE MITGLIEDSCHAFT.',
    max: 80,
    optional: true,
  },
  introHeading: {
    label: 'Überschrift',
    value: 'Schön, dass du\ndabei bist.',
    type: 'textarea',
    rows: 2,
    maxLines: 3,
    max: 120,
    help: 'Ein Zeilenumbruch erzeugt auf großen Bildschirmen eine neue Zeile.',
  },
  introText: {
    label: 'Einleitungstext',
    value:
      'Neu im Verein oder schon mittendrin? Hier ist der richtige Platz für deine Mitgliedsdaten.',
    type: 'textarea',
    rows: 3,
    max: 400,
    optional: true,
  },
  journey1Title: {
    label: 'Ablauf 1 – Titel',
    value: 'Dein Mitgliedsstatus',
    max: 60,
    optional: true,
    help: 'Die drei Ablauf-Schritte erscheinen nur auf größeren Bildschirmen. Ohne Titel wird ein Schritt ausgeblendet.',
  },
  journey1Text: {
    label: 'Ablauf 1 – Text',
    value: 'Neu dabei oder bereits Mitglied?',
    max: 120,
    optional: true,
  },
  journey2Title: { label: 'Ablauf 2 – Titel', value: 'Deine Angaben', max: 60, optional: true },
  journey2Text: {
    label: 'Ablauf 2 – Text',
    value: 'Nur das, was wir wirklich brauchen.',
    max: 120,
    optional: true,
  },
  journey3Title: {
    label: 'Ablauf 3 – Titel',
    value: 'Prüfen & absenden',
    max: 60,
    optional: true,
  },
  journey3Text: {
    label: 'Ablauf 3 – Text',
    value: 'Danach kümmert sich unser Team.',
    max: 120,
    optional: true,
  },
  privacyNoteTitle: {
    label: 'Datenschutz-Kasten – Titel',
    value: 'Deine Daten bleiben geschützt.',
    max: 80,
    optional: true,
  },
  privacyNoteText: {
    label: 'Datenschutz-Kasten – Text',
    value:
      'Keine Werbung, kein Tracking. Deine Angaben sind nur für die zuständige Vereinsverwaltung bestimmt.',
    type: 'textarea',
    rows: 3,
    max: 300,
    optional: true,
  },

  // Formular · Schritt 1
  formEyebrow: { label: 'Überzeile', value: 'MITGLIEDSCHAFT', max: 40, optional: true },
  form1Heading: { label: 'Überschrift', value: 'Ein guter Anfang.', max: 80 },
  form1Text: {
    label: 'Untertitel',
    value: 'Erzähl uns kurz, wer du bist.',
    max: 200,
    optional: true,
  },
  kindQuestion: {
    label: 'Frage nach dem Mitgliedsstatus',
    value: 'Bist du bereits Mitglied?',
    max: 100,
  },
  kindNewTitle: { label: 'Auswahl „neu“ – Titel', value: 'Ich bin neu hier', max: 60 },
  kindNewText: {
    label: 'Auswahl „neu“ – Beschreibung',
    value: 'Mitgliedschaft beantragen',
    max: 80,
    optional: true,
  },
  kindExistingTitle: {
    label: 'Auswahl „Mitglied“ – Titel',
    value: 'Ich bin schon Mitglied',
    max: 60,
  },
  kindExistingText: {
    label: 'Auswahl „Mitglied“ – Beschreibung',
    value: 'Meine Daten aktualisieren',
    max: 80,
    optional: true,
  },
  labelFirstName: { label: 'Feld „Vorname“', value: 'Vorname', max: 40 },
  labelLastName: { label: 'Feld „Nachname“', value: 'Nachname', max: 40 },
  labelBirthDate: { label: 'Feld „Geburtsdatum“', value: 'Geburtsdatum', max: 40 },
  labelEmail: { label: 'Feld „E-Mail-Adresse“', value: 'E-Mail-Adresse', max: 40 },
  emailPlaceholder: {
    label: 'Beispiel im E-Mail-Feld',
    value: 'du@beispiel.de',
    max: 60,
    optional: true,
  },
  fieldHint: {
    label: 'Hinweis unter den Feldern',
    value:
      'Alle Felder sind erforderlich. Bei Minderjährigen muss die Vereinsverwaltung eine erforderliche Zustimmung der Sorgeberechtigten separat klären.',
    type: 'textarea',
    rows: 3,
    max: 400,
    optional: true,
  },
  nextButton: { label: 'Button „Weiter“', value: 'Weiter zu den Hinweisen', max: 50 },
  closedNotice: {
    label: 'Hinweis, solange das Portal geschlossen ist',
    value:
      'Das Portal wird eingerichtet. Du kannst das Formular ansehen; die Übermittlung ist noch nicht freigeschaltet.',
    type: 'textarea',
    rows: 2,
    max: 300,
  },

  // Formular · Schritt 2
  form2Heading: { label: 'Überschrift', value: 'Fast geschafft.', max: 80 },
  form2Text: {
    label: 'Untertitel',
    value: 'Bitte prüfe die Hinweise und bestätige deine Angaben.',
    max: 200,
    optional: true,
  },
  newTitle: {
    label: 'Neuer Antrag – Zwischenüberschrift',
    value: 'Dein Mitgliedsantrag',
    max: 80,
  },
  newText: {
    label: 'Neuer Antrag – Erklärung',
    value: 'Hier findest du die Unterlagen für deinen Beitritt. Bitte lies sie vor dem Absenden.',
    type: 'textarea',
    rows: 2,
    max: 400,
    optional: true,
  },
  existingTitle: {
    label: 'Datenaktualisierung – Zwischenüberschrift',
    value: 'Deine Datenbestätigung',
    max: 80,
  },
  existingText: {
    label: 'Datenaktualisierung – Erklärung',
    value:
      'Bitte bestätige, dass deine eingetragenen Angaben aktuell sind. Änderungen werden vor der Übernahme geprüft.',
    type: 'textarea',
    rows: 2,
    max: 400,
    optional: true,
  },
  checkStatutes: {
    label: 'Häkchen: Satzung (nur neue Mitglieder)',
    value:
      'Ich habe die Satzung gelesen und erkenne sie an. Ich beantrage die Aufnahme in den Verein.',
    type: 'textarea',
    rows: 2,
    max: 300,
    help: 'Gilt als Beitrittserklärung. Der Wortlaut wird mit jeder Einreichung gespeichert.',
  },
  checkPrivacy: {
    label: 'Häkchen: Datenschutzhinweise',
    value: 'Ich habe die Datenschutzhinweise zur Kenntnis genommen.',
    type: 'textarea',
    rows: 2,
    max: 300,
    help: 'Der Wortlaut wird mit jeder Einreichung gespeichert.',
  },
  checkAccuracy: {
    label: 'Häkchen: Richtigkeit der Angaben',
    value: 'Ich bestätige, dass meine Angaben richtig und aktuell sind.',
    type: 'textarea',
    rows: 2,
    max: 300,
    help: 'Der Wortlaut wird mit jeder Einreichung gespeichert.',
  },
  newNotice: {
    label: 'Hinweis vor dem Absenden – neuer Antrag',
    value:
      'Das Absenden ist ein Antrag. Über die Aufnahme entscheidet der Verein nach seiner Satzung.',
    type: 'textarea',
    rows: 2,
    max: 300,
    optional: true,
  },
  existingNotice: {
    label: 'Hinweis vor dem Absenden – Datenaktualisierung',
    value:
      'Mit dem Absenden werden deine Angaben zur Prüfung übermittelt. Vorhandene Mitgliedsdaten werden nicht automatisch überschrieben.',
    type: 'textarea',
    rows: 2,
    max: 300,
    optional: true,
  },
  backButton: { label: 'Button „Zurück“', value: 'Zurück', max: 40 },
  submitNew: { label: 'Button „Absenden“ – neuer Antrag', value: 'Antrag absenden', max: 50 },
  submitExisting: {
    label: 'Button „Absenden“ – Datenaktualisierung',
    value: 'Angaben übermitteln',
    max: 50,
  },
  helpText: { label: 'Hilfezeile – Einleitung', value: 'Fragen?', max: 60, optional: true },
  helpLink: {
    label: 'Hilfezeile – Linktext zur E-Mail-Adresse',
    value: 'Schreib der Vereinsverwaltung',
    max: 80,
  },

  // Eingangsbestätigung
  successEyebrow: {
    label: 'Überzeile',
    value: 'ERFOLGREICH ÜBERMITTELT',
    max: 60,
    optional: true,
  },
  successNewHeading: {
    label: 'Neuer Antrag – Überschrift',
    value: 'Dein Antrag ist eingegangen.',
    max: 100,
  },
  successNewText: {
    label: 'Neuer Antrag – Text',
    value:
      'Vielen Dank für dein Interesse! Die Vereinsverwaltung prüft deinen Antrag. Deine Mitgliedschaft ist damit noch nicht angenommen.',
    type: 'textarea',
    rows: 3,
    max: 500,
    help: 'Wichtig: Weise darauf hin, dass der Antrag damit noch nicht angenommen ist.',
  },
  successNewNotice: {
    label: 'Neuer Antrag – Hinweis',
    value: 'Nach einer Annahme erhältst du deine Mitgliedsbestätigung separat per E-Mail.',
    type: 'textarea',
    rows: 2,
    max: 300,
    optional: true,
  },
  successExistingHeading: {
    label: 'Datenaktualisierung – Überschrift',
    value: 'Deine Angaben sind eingegangen.',
    max: 100,
  },
  successExistingText: {
    label: 'Datenaktualisierung – Text',
    value:
      'Die Vereinsverwaltung prüft deine Angaben und gleicht sie mit den vorhandenen Mitgliedsdaten ab.',
    type: 'textarea',
    rows: 3,
    max: 500,
  },
  successExistingNotice: {
    label: 'Datenaktualisierung – Hinweis',
    value: 'Bei Rückfragen meldet sich die Vereinsverwaltung per E-Mail.',
    type: 'textarea',
    rows: 2,
    max: 300,
    optional: true,
  },
  referenceLabel: {
    label: 'Bezeichnung der Vorgangsnummer',
    value: 'Deine Vorgangsnummer',
    max: 60,
  },
  homeButton: { label: 'Button zur Startseite', value: 'Zur Startseite', max: 40 },

  // E-Mail-Entwurf
  emailSubject: {
    label: 'Betreff',
    value: 'Deine Mitgliedsbestätigung – {verein}',
    max: 150,
    placeholders: true,
  },
  emailBody: {
    label: 'Text',
    value:
      'Hallo {vorname},\n\nwir freuen uns, dir die Annahme deines Mitgliedsantrags bestätigen zu können. Deine Mitgliedsbestätigung findest du im beigefügten PDF.\n\nViele Grüße\n{verein}',
    type: 'textarea',
    rows: 9,
    maxLines: 30,
    max: 1500,
    placeholders: true,
  },

  // PDF
  pdfTitle: { label: 'Titel', value: 'Mitgliedsbestätigung', max: 60, pdf: true },
  pdfIntro: {
    label: 'Satz vor dem Namen',
    value: 'Wir bestätigen die Annahme des Mitgliedsantrags von',
    type: 'textarea',
    rows: 2,
    maxLines: 3,
    max: 200,
    pdf: true,
  },
  pdfWelcome: {
    label: 'Willkommensgruß',
    value: 'Herzlich willkommen in unserem Verein!',
    max: 120,
    optional: true,
    pdf: true,
  },
  pdfWelcomeText: {
    label: 'Weiterer Text',
    value: 'Wir freuen uns auf die gemeinsame Zeit.',
    type: 'textarea',
    rows: 3,
    maxLines: 8,
    max: 500,
    optional: true,
    pdf: true,
  },
  pdfSignature: {
    label: 'Absender',
    value: 'Die Vereinsverwaltung',
    type: 'textarea',
    rows: 2,
    maxLines: 3,
    max: 120,
    pdf: true,
  },
});

export type TextKey = keyof typeof FIELDS;
export type TextSettings = Record<TextKey, string>;
export type Settings = TextSettings & { portalOpen: boolean };

export const TEXT_KEYS = Object.keys(FIELDS) as TextKey[];

export type Group = { id: string; title: string; description: string; keys: TextKey[] };

export const GROUPS: Group[] = [
  {
    id: 'verein',
    title: 'Verein & Kontakt',
    description: 'Name und Ansprechpartner. Erscheint in Kopfzeile, Formular, E-Mail und PDF.',
    keys: ['clubName', 'contactEmail', 'headerNote', 'footerNote'],
  },
  {
    id: 'dokumente',
    title: 'Dokumente & Links',
    description:
      'Links zu den gültigen, öffentlichen Vereinsdokumenten. Version und Links werden mit jeder Einreichung gespeichert.',
    keys: [
      'statutesUrl',
      'statutesTitle',
      'statutesHint',
      'privacyUrl',
      'privacyTitle',
      'privacyHint',
      'imprintUrl',
      'documentVersion',
    ],
  },
  {
    id: 'startseite',
    title: 'Startseite',
    description: 'Einleitung neben dem Formular.',
    keys: [
      'introEyebrow',
      'introHeading',
      'introText',
      'journey1Title',
      'journey1Text',
      'journey2Title',
      'journey2Text',
      'journey3Title',
      'journey3Text',
      'privacyNoteTitle',
      'privacyNoteText',
    ],
  },
  {
    id: 'schritt1',
    title: 'Formular · Schritt 1',
    description: 'Mitgliedsstatus und persönliche Angaben. Die Felder selbst bleiben unverändert.',
    keys: [
      'formEyebrow',
      'form1Heading',
      'form1Text',
      'kindQuestion',
      'kindNewTitle',
      'kindNewText',
      'kindExistingTitle',
      'kindExistingText',
      'labelFirstName',
      'labelLastName',
      'labelBirthDate',
      'labelEmail',
      'emailPlaceholder',
      'fieldHint',
      'nextButton',
      'closedNotice',
    ],
  },
  {
    id: 'schritt2',
    title: 'Formular · Schritt 2',
    description:
      'Dokumente, Häkchen und Hinweise vor dem Absenden. Wer das Formular gerade ausfüllt, muss geänderte Häkchen-Texte vor dem Absenden erneut bestätigen.',
    keys: [
      'form2Heading',
      'form2Text',
      'newTitle',
      'newText',
      'existingTitle',
      'existingText',
      'checkStatutes',
      'checkPrivacy',
      'checkAccuracy',
      'newNotice',
      'existingNotice',
      'backButton',
      'submitNew',
      'submitExisting',
      'helpText',
      'helpLink',
    ],
  },
  {
    id: 'bestaetigung',
    title: 'Eingangsbestätigung',
    description: 'Seite, die nach dem Absenden erscheint.',
    keys: [
      'successEyebrow',
      'successNewHeading',
      'successNewText',
      'successNewNotice',
      'successExistingHeading',
      'successExistingText',
      'successExistingNotice',
      'referenceLabel',
      'homeButton',
    ],
  },
  {
    id: 'email',
    title: 'E-Mail-Entwurf nach Annahme',
    description:
      'Vorlage für die Bestätigungs-E-Mail, die du selbst aus dem Vereinspostfach sendest. Platzhalter: {vorname}, {nachname}, {verein}.',
    keys: ['emailSubject', 'emailBody'],
  },
  {
    id: 'pdf',
    title: 'PDF-Mitgliedsbestätigung',
    description:
      'Texte im PDF. Name, Aufnahmedatum und Vorgangsnummer werden automatisch eingefügt.',
    keys: ['pdfTitle', 'pdfIntro', 'pdfWelcome', 'pdfWelcomeText', 'pdfSignature'],
  },
];

export const REQUIRED_TO_OPEN = TEXT_KEYS.filter((key) => FIELDS[key].requiredToOpen);

export function missingToOpen(settings: TextSettings) {
  return REQUIRED_TO_OPEN.filter((key) => !settings[key].trim());
}

export const PLACEHOLDERS = ['vorname', 'nachname', 'verein'] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

export function unknownPlaceholders(template: string) {
  const unknown = new Set<string>();
  for (const match of template.matchAll(/\{([^{}]*)\}/g)) {
    if (!(PLACEHOLDERS as readonly string[]).includes(match[1])) unknown.add(match[0]);
  }
  return [...unknown];
}

export function fillTemplate(template: string, values: Record<Placeholder, string>) {
  return template.replace(/\{(vorname|nachname|verein)\}/g, (_, key: Placeholder) => values[key]);
}

/** Texts and links the public form needs; sent to the browser. */
export const FORM_TEXT_KEYS = [
  'formEyebrow',
  'form1Heading',
  'form1Text',
  'kindQuestion',
  'kindNewTitle',
  'kindNewText',
  'kindExistingTitle',
  'kindExistingText',
  'labelFirstName',
  'labelLastName',
  'labelBirthDate',
  'labelEmail',
  'emailPlaceholder',
  'fieldHint',
  'nextButton',
  'closedNotice',
  'form2Heading',
  'form2Text',
  'newTitle',
  'newText',
  'existingTitle',
  'existingText',
  'statutesTitle',
  'statutesHint',
  'privacyTitle',
  'privacyHint',
  'checkStatutes',
  'checkPrivacy',
  'checkAccuracy',
  'newNotice',
  'existingNotice',
  'backButton',
  'submitNew',
  'submitExisting',
  'helpText',
  'helpLink',
  'successEyebrow',
  'successNewHeading',
  'successNewText',
  'successNewNotice',
  'successExistingHeading',
  'successExistingText',
  'successExistingNotice',
  'referenceLabel',
  'homeButton',
  'statutesUrl',
  'privacyUrl',
  'contactEmail',
] as const satisfies readonly TextKey[];

export type FormTexts = Pick<TextSettings, (typeof FORM_TEXT_KEYS)[number]>;

export type FormConfig = {
  texts: FormTexts;
  /** Submissions are accepted right now. */
  open: boolean;
  /** The database could not be reached; show an outage notice instead of the closed notice. */
  unavailable: boolean;
  /** Fingerprints of the acknowledgement texts and documents shown on each path. */
  consent: { new: string; existing: string };
};

export function formTexts(settings: TextSettings): FormTexts {
  return Object.fromEntries(FORM_TEXT_KEYS.map((key) => [key, settings[key]])) as FormTexts;
}

export const UNAVAILABLE_NOTICE =
  'Das Portal ist gerade nicht erreichbar. Bitte versuche es später erneut.';
