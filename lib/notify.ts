import { db } from './db';
import { errorCode } from './errors';
import type { Settings } from './form-settings';
import { MailError, mailConfig, sendMail } from './mail';
import { consume, globalKey } from './rate';

// Two automatic e-mails per submission, sent only after it has been stored:
//  1. to the club inbox, with the submitted data, so the committee knows when to act;
//  2. to the person, as a receipt (explicitly NOT an acceptance of the application).
// Each is sent at most once: the submission row records when it went out, and Resend's
// idempotency key rejects repeated requests. Failures are stored as short codes (no personal data)
// and can be retried from /admin.

/** Upper bounds per hour for all visitors together, so a spam wave cannot flood inboxes. */
export const CLUB_MAILS_PER_HOUR = 60;
export const RECEIPTS_PER_HOUR = 60;

type Row = {
  id: string;
  kind: 'new' | 'existing';
  first_name: string;
  last_name: string;
  birth_date: string;
  email: string;
  phone: string | null;
  room: string | null;
  answers: { question: string; answer: string }[];
  created_at: Date;
  club_notified_at: Date | null;
  confirmation_sent_at: Date | null;
};

const berlin = (date: Date) =>
  date.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' Uhr';
const day = (iso: string) => iso.split('-').reverse().join('.');
const clubOf = (settings: Settings) => settings.clubName.trim() || 'SSV Potsdamer Straße';
const table = (rows: [string, string][]) => {
  const width = Math.max(...rows.map(([k]) => k.length)) + 2;
  return rows.map(([k, v]) => `  ${(k + ':').padEnd(width)}${v}`).join('\n');
};

export function clubMessage(row: Row, adminUrl: string) {
  const name = `${row.first_name} ${row.last_name}`;
  const answers = row.answers.filter((a) => a.answer);
  return {
    subject: `Neue Mitgliedererfassung – ${name}`,
    text: [
      'Im Mitgliederportal ist eine neue Einreichung eingegangen.',
      '',
      table([
        [
          'Art',
          row.kind === 'new'
            ? 'Neuer Mitgliedsantrag'
            : 'Bestehendes Mitglied (Datenaktualisierung)',
        ],
        ['Vorname', row.first_name],
        ['Nachname', row.last_name],
        ['Geburtsdatum', day(row.birth_date)],
        ['E-Mail', row.email],
        ['Telefon', row.phone ?? '–'],
        ['Zimmernummer', row.room ?? '–'],
        ['Eingegangen', berlin(row.created_at)],
        ['Vorgangsnummer', row.id],
      ]),
      ...(answers.length
        ? ['', 'Zusätzliche Angaben:', ...answers.map((a) => `  ${a.question}: ${a.answer}`)]
        : []),
      '',
      `Zur Bearbeitung: ${adminUrl}`,
      '',
      'Diese E-Mail enthält personenbezogene Daten. Bitte nicht weiterleiten und nach der',
      'Übernahme in das Mitgliederverzeichnis löschen.',
    ].join('\n'),
  };
}

export function receiptMessage(row: Row, club: string) {
  const isNew = row.kind === 'new';
  return {
    subject: isNew
      ? `Eingangsbestätigung: dein Mitgliedsantrag – ${club}`
      : `Eingangsbestätigung: deine Mitgliedsdaten – ${club}`,
    text: [
      `Hallo ${row.first_name},`,
      '',
      isNew
        ? `vielen Dank für deinen Mitgliedsantrag. Wir haben ihn am ${berlin(row.created_at)} erhalten.`
        : `vielen Dank! Wir haben deine aktualisierten Mitgliedsdaten am ${berlin(row.created_at)} erhalten.`,
      '',
      ...(isNew
        ? [
            'Bitte beachte: Dies ist nur eine Eingangsbestätigung. Deine Mitgliedschaft ist damit',
            'noch nicht angenommen. Über die Aufnahme entscheidet der Verein nach seiner Satzung;',
            'wir melden uns nach der Entscheidung gesondert bei dir.',
          ]
        : [
            'Wir gleichen deine Angaben mit unserem Mitgliederverzeichnis ab. Bei Rückfragen',
            'melden wir uns bei dir.',
          ]),
      '',
      'Deine Angaben:',
      table([
        ['Name', `${row.first_name} ${row.last_name}`],
        ['Geburtsdatum', day(row.birth_date)],
        ['E-Mail', row.email],
        ['Telefon', row.phone ?? '–'],
        ['Zimmernummer', row.room ?? '–'],
      ]),
      `  Vorgangsnummer: ${row.id}`,
      '',
      'Falls etwas nicht stimmt, antworte einfach auf diese E-Mail.',
      '',
      'Viele Grüße',
      club,
      '',
      '-- ',
      'Diese E-Mail wurde automatisch versendet, weil deine Adresse im Mitgliederportal',
      'angegeben wurde. Falls du das Formular nicht ausgefüllt hast, kannst du sie ignorieren.',
    ].join('\n'),
  };
}

const code = (err: unknown) => (err instanceof MailError ? err.code : errorCode(err));

/**
 * Sends whichever of the two e-mails has not been sent yet. Never throws: the submission is
 * already saved, and failures are recorded on the row for a retry from /admin.
 */
export async function sendSubmissionEmails(id: string, settings: Settings) {
  const sql = db();
  const failures: string[] = [];
  try {
    const [row] = (await sql`
      SELECT id, kind, first_name, last_name, birth_date::text AS birth_date, email, phone, room,
             answers, created_at, club_notified_at, confirmation_sent_at
      FROM submissions WHERE id = ${id}`) as unknown as Row[];
    if (!row) return;
    const config = mailConfig();
    const adminUrl = new URL('/admin', process.env.APP_URL).toString();

    if (!row.club_notified_at) {
      try {
        if (!config.configured) throw new MailError('NO_API_KEY');
        if (!(await consume(globalKey('mail:club'), CLUB_MAILS_PER_HOUR)))
          throw new MailError('LIMIT');
        await sendMail({
          to: [config.clubInbox],
          replyTo: row.email,
          idempotencyKey: `${id}-verein`,
          ...clubMessage(row, adminUrl),
        });
        await sql`UPDATE submissions SET club_notified_at = now()
                  WHERE id = ${id} AND club_notified_at IS NULL`;
      } catch (err) {
        failures.push('verein:' + code(err));
      }
    }

    if (!row.confirmation_sent_at) {
      try {
        if (!config.configured) throw new MailError('NO_API_KEY');
        if (!(await consume(globalKey('mail:receipt'), RECEIPTS_PER_HOUR)))
          throw new MailError('LIMIT');
        await sendMail({
          to: [row.email],
          replyTo: config.clubInbox,
          idempotencyKey: `${id}-bestaetigung`,
          ...receiptMessage(row, clubOf(settings)),
        });
        await sql`UPDATE submissions SET confirmation_sent_at = now()
                  WHERE id = ${id} AND confirmation_sent_at IS NULL`;
      } catch (err) {
        failures.push('bestaetigung:' + code(err));
      }
    }
  } catch (err) {
    failures.push('db:' + code(err));
  }
  // Only codes and the reference are logged – never names or addresses.
  if (failures.length) console.error(`[portal] e-mail for ${id} failed (${failures.join(', ')})`);
  try {
    await sql`UPDATE submissions SET mail_error = ${failures.length ? failures.join(' ') : null}
              WHERE id = ${id}`;
  } catch {}
  return failures;
}
