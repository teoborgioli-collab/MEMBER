import { admin, body, failure, HttpError } from '../../../../lib/http';
import { confirmationPdf, PDF_TEXT_KEYS, PdfGlyphError, type PdfTexts } from '../../../../lib/pdf';
import { checkField, type FieldErrors } from '../../../../lib/settings';

export const runtime = 'nodejs';

/** A sample confirmation with unsaved editor texts and a fictional member. */
export async function POST(request: Request) {
  try {
    await admin();
    const input = await body(request, 16 * 1024);
    const texts = {} as PdfTexts;
    const fields: FieldErrors = {};
    for (const key of PDF_TEXT_KEYS) {
      const { value, error } = checkField(key, input[key]);
      texts[key] = value;
      if (error) fields[key] = error;
    }
    if (Object.keys(fields).length)
      throw new HttpError(400, 'Bitte prüfe die markierten Felder.', { fields });
    let bytes: Uint8Array;
    try {
      bytes = await confirmationPdf(
        {
          id: '00000000-0000-4000-8000-000000000000',
          kind: 'new',
          status: 'approved',
          first_name: 'Anna',
          last_name: 'Beispiel',
          decided_at: new Date(),
        },
        texts,
      );
    } catch (err) {
      if (!(err instanceof PdfGlyphError)) throw err;
      throw new HttpError(
        422,
        `Diese Zeichen kann das PDF nicht darstellen: ${err.chars.join(' ')}`,
      );
    }
    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="Beispiel-Mitgliedsbestaetigung.pdf"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    return failure(err, 'PDF preview', { adminRoute: true });
  }
}
