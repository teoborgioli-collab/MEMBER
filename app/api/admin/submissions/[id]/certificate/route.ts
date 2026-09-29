import { z } from "zod";
import { admin, failure, HttpError } from "../../../../../../lib/http";
import { PdfGlyphError } from "../../../../../../lib/pdf";
import {
  certificateAvailable,
  certificateFileName,
  certificatePdf,
} from "../../../../../../lib/certificate";
import {
  certificateTexts,
  loadCertMember,
} from "../../../../../../lib/certificate-mail";

export const runtime = "nodejs";

/** Membership certificate as PDF: ?variant=digital (default) or ?variant=print (to sign). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await admin();
    const { id } = await params;
    const variant =
      new URL(request.url).searchParams.get("variant") === "print"
        ? "print"
        : "digital";
    if (!z.uuid().safeParse(id).success)
      throw new HttpError(400, "Ungültiger Eintrag.");
    const row = await loadCertMember(id);
    if (!row) throw new HttpError(404, "Eintrag nicht gefunden.");
    if (!certificateAvailable(row))
      throw new HttpError(
        409,
        "Eine Mitgliedsbescheinigung gibt es erst nach Annahme bzw. Abgleich.",
      );
    let bytes: Uint8Array;
    try {
      bytes = await certificatePdf(row, await certificateTexts(), variant);
    } catch (err) {
      if (!(err instanceof PdfGlyphError)) throw err;
      throw new HttpError(
        422,
        `Das PDF kann diese Zeichen nicht darstellen: ${err.chars.join(" ")}.`,
      );
    }
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${certificateFileName(row.first_name, row.last_name, variant)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return failure(err, "creating certificate", { adminRoute: true });
  }
}
