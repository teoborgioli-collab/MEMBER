import { z } from 'zod';
import { admin, failure, HttpError } from '../../../../../../lib/http';
import { db } from '../../../../../../lib/db';
import {
  attachmentName,
  confirmationPdf,
  PDF_TEXT_KEYS,
  PdfGlyphError,
  type PdfTexts,
} from '../../../../../../lib/pdf';
import { fetchSettings } from '../../../../../../lib/settings';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await admin();
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new HttpError(400, 'Ungültiger Eintrag.');
    const [row] = await db()`
      SELECT id, kind, status, locale, first_name, last_name, decided_at, membership_start_month FROM submissions WHERE id=${id}`;
    if (!row) throw new HttpError(404, 'Eintrag nicht gefunden.');
    const available = (row.kind === 'new' && row.status === 'approved') || (row.kind === 'existing' && row.status === 'reviewed' && row.membership_start_month);
    if (!available) throw new HttpError(409, 'Eine Bestätigung ist erst nach Annahme bzw. Abgleich verfügbar.');
    const { settings } = await fetchSettings();
    let bytes: Uint8Array;
    try {
      bytes = await confirmationPdf(
        {
          id: row.id,
          kind: row.kind,
          status: row.status,
          first_name: row.first_name,
          last_name: row.last_name,
          decided_at: row.decided_at,
          membership_start_month: row.membership_start_month,
          locale: row.locale,
        },
        Object.fromEntries(PDF_TEXT_KEYS.map((key) => [key, settings[key]])) as PdfTexts,
      );
    } catch (err) {
      if (!(err instanceof PdfGlyphError)) throw err;
      throw new HttpError(
        422,
        `Das PDF kann diese Zeichen nicht darstellen: ${err.chars.join(' ')}. Bitte erstelle die Bestätigung in diesem Fall manuell.`,
      );
    }
    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': attachmentName(row.first_name, row.last_name),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    return failure(err, 'creating PDF', { adminRoute: true });
  }
}
