import { admin, body, failure, HttpError } from "../../../../lib/http";
import { PdfGlyphError } from "../../../../lib/pdf";
import {
  CERT_TEXT_KEYS,
  certificatePdf,
  type CertTexts,
} from "../../../../lib/certificate";
import { checkField, type FieldErrors } from "../../../../lib/settings";

export const runtime = "nodejs";

/** A sample certificate with unsaved editor texts and a fictional member. */
export async function POST(request: Request) {
  try {
    await admin();
    const input = await body(request, 16 * 1024);
    const variant = input.variant === "print" ? "print" : "digital";
    const texts = {} as CertTexts;
    const fields: FieldErrors = {};
    for (const key of CERT_TEXT_KEYS) {
      const { value, error } = checkField(key, input[key]);
      texts[key] = value;
      if (error) fields[key] = error;
    }
    if (Object.keys(fields).length)
      throw new HttpError(400, "Bitte prüfe die markierten Felder.", {
        fields,
      });
    let bytes: Uint8Array;
    try {
      bytes = await certificatePdf(
        {
          id: "00000000-0000-4000-8000-000000000000",
          kind: "new",
          status: "approved",
          first_name: "Anna",
          last_name: "Beispiel",
          birth_date: "2003-04-12",
          decided_at: new Date(),
        },
        texts,
        variant,
      );
    } catch (err) {
      if (!(err instanceof PdfGlyphError)) throw err;
      throw new HttpError(
        422,
        `Diese Zeichen kann das PDF nicht darstellen: ${err.chars.join(" ")}`,
      );
    }
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Beispiel-Mitgliedsbescheinigung${variant === "print" ? "-Druck" : ""}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return failure(err, "certificate preview", { adminRoute: true });
  }
}
