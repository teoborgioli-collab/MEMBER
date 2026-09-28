import { z } from 'zod';
import { admin, body, failure, HttpError, json } from '../../../../../lib/http';
import { db } from '../../../../../lib/db';
import { actionSchema, canTransition } from '../../../../../lib/validation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await admin();
    const input = actionSchema.safeParse(await body(request));
    const { id } = await params;
    if (!z.uuid().safeParse(id).success || !input.success)
      throw new HttpError(400, 'Ungültige Aktion.');
    const sql = db();
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
    return json({ ok: true });
  } catch (err) {
    return failure(err, 'updating submission', { adminRoute: true });
  }
}
