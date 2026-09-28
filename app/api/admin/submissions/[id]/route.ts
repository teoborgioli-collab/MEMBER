import { z } from 'zod';
import { admin, body, failure, HttpError, json } from '../../../../../lib/http';
import { db } from '../../../../../lib/db';
import { actionSchema, canTransition } from '../../../../../lib/validation';
import { mailErrorMessage } from '../../../../../lib/mail';
import { sendSubmissionEmails } from '../../../../../lib/notify';
import { fetchSettings } from '../../../../../lib/settings';
import { sendApprovalEmail } from '../../../../../lib/approval-mail';

export const maxDuration = 30;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await admin();
    const input = actionSchema.safeParse(await body(request));
    const { id } = await params;
    if (!z.uuid().safeParse(id).success || !input.success)
      throw new HttpError(400, 'Ungültige Aktion.');
    const sql = db();
    if (input.data.action === 'send_approval') {
      const error = await sendApprovalEmail(id);
      if (error === 'NOT_APPROVED') throw new HttpError(409, 'Zunächst muss der Antrag angenommen werden.');
      if (error) throw new HttpError(502, 'Mitgliedschaft angenommen, aber der PDF-Versand ist fehlgeschlagen: ' + mailErrorMessage(error));
      return json({ ok: true });
    }
    if (input.data.action === 'mails') {
      // Retry only the automatic e-mails that have not gone out yet.
      const [row] = await sql`SELECT 1 FROM submissions WHERE id=${id}`;
      if (!row) throw new HttpError(404, 'Eintrag nicht gefunden.');
      const failures = await sendSubmissionEmails(id, (await fetchSettings()).settings);
      if (failures?.length)
        throw new HttpError(
          502,
          'E-Mail-Versand fehlgeschlagen: ' + mailErrorMessage(failures.join(' ')),
        );
      return json({ ok: true });
    }
    await sql.begin(async (tx) => {
      const [row] = await tx`SELECT kind, status FROM submissions WHERE id=${id} FOR UPDATE`;
      if (!row) throw new HttpError(404, 'Eintrag nicht gefunden.');
      const action = input.data.action;
      if (action === 'delete') {
        if (input.data.confirm !== id) throw new HttpError(400, 'Löschen bitte bestätigen.');
        await tx`DELETE FROM submissions WHERE id=${id}`;
        return;
      }
      if (!canTransition(row.kind, row.status, action))
        throw new HttpError(
          409,
          'Dieser Eintrag wurde bereits bearbeitet. Bitte lade die Liste neu.',
        );
      if (action === 'sent') {
        await tx`UPDATE submissions SET sent_at=COALESCE(sent_at,now()) WHERE id=${id}`;
      } else {
        const status =
          action === 'approve' ? 'approved' : action === 'review' ? 'reviewed' : 'rejected';
        await tx`UPDATE submissions SET status=${status},decided_at=now() WHERE id=${id}`;
      }
    });
    if (input.data.action === 'approve') {
      const mailError = await sendApprovalEmail(id);
      return json({ ok: true, warning: mailError
        ? 'Aufnahme gespeichert, aber die E-Mail mit PDF wurde nicht versendet. Bitte unter „Angenommen“ erneut senden: ' + mailErrorMessage(mailError)
        : undefined });
    }
    return json({ ok: true });
  } catch (err) {
    return failure(err, 'updating submission', { adminRoute: true });
  }
}
