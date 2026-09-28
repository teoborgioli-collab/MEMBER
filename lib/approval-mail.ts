import { db } from './db';
import { errorCode } from './errors';
import { MailError, mailConfig, sendMail } from './mail';
import { confirmationPdf, PDF_TEXT_KEYS, type PdfTexts } from './pdf';
import { fetchSettings } from './settings';

/** Friendly, personal acceptance notice. Only used after an actual approval. */
export function approvalMessage(firstName: string, club: string, approvedDate: string) {
  return {
    subject: `Deine Mitgliedschaft wurde bestätigt – ${club}`,
    text: [
      `Hallo ${firstName},`, '',
      `dein Mitgliedsantrag wurde angenommen. Deine Aufnahme wurde am ${approvedDate} bestätigt.`,
      'Im Anhang findest du deine persönliche Mitgliedsbestätigung als PDF.', '',
      'Falls du Fragen hast, antworte gerne auf diese E-Mail.', '',
      'Viele Grüße', club,
    ].join('\n'),
  };
}

/**
 * Send only if approved and not already marked sent. The confirmation PDF is generated
 * from the persisted decision, never the user's original form input. If sending fails,
 * retain the approved status and allow a manual retry from the admin panel.
 * Resend also deduplicates retries within its idempotency window.
 */
export async function sendApprovalEmail(id: string): Promise<string | null> {
  const sql = db();
  const [row] = await sql`
    SELECT id, kind, status, first_name, last_name, email, decided_at, sent_at
    FROM submissions WHERE id=${id}`;
  if (!row || row.kind !== 'new' || row.status !== 'approved' || !row.decided_at)
    return 'NOT_APPROVED';
  if (row.sent_at) return null;
  try {
    const config = mailConfig();
    if (!config.configured) throw new MailError('NO_API_KEY');
    const { settings } = await fetchSettings();
    const pdf = await confirmationPdf(
      {
        id: row.id, kind: row.kind, status: row.status,
        first_name: row.first_name, last_name: row.last_name,
        decided_at: row.decided_at,
      },
      Object.fromEntries(PDF_TEXT_KEYS.map((key) => [key, settings[key]])) as PdfTexts,
    );
    const approvedDate = new Date(row.decided_at).toLocaleDateString('de-DE', {
      timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const club = settings.clubName.trim() || 'SSV Potsdamer Straße';
    await sendMail({
      ...approvalMessage(row.first_name, club, approvedDate),
      to: [row.email],
      replyTo: config.clubInbox,
      idempotencyKey: `${id}-aufnahme-${new Date(row.decided_at).getTime()}`,
      attachments: [{ filename: 'Mitgliedsbestaetigung.pdf', content: Buffer.from(pdf).toString('base64') }],
    });
    await sql`UPDATE submissions SET sent_at = COALESCE(sent_at, now()), approval_mail_error = NULL
              WHERE id=${id} AND status='approved'`;
    return null;
  } catch (err) {
    const code = err instanceof MailError ? err.code : errorCode(err);
    // Don't expose personal data from the provider error or document.
    console.error(`[portal] approval mail for ${id} failed (${code})`);
    await sql`UPDATE submissions SET approval_mail_error=${code} WHERE id=${id}`;
    return code;
  }
}
