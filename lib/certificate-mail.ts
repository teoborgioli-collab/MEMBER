import { db } from "./db";
import { errorCode } from "./errors";
import { MailError, mailConfig, sendMail } from "./mail";
import {
  CERT_TEXT_KEYS,
  certificateAvailable,
  certificateFileName,
  certificateMessage,
  certificatePdf,
  type CertMember,
  type CertTexts,
} from "./certificate";
import { PdfGlyphError } from "./pdf";
import { fetchSettings } from "./settings";

export async function certificateTexts(): Promise<CertTexts> {
  const { settings } = await fetchSettings();
  return Object.fromEntries(
    CERT_TEXT_KEYS.map((key) => [key, settings[key]]),
  ) as CertTexts;
}

export async function loadCertMember(id: string) {
  const [row] = await db()`
    SELECT id, kind, status, first_name, last_name, birth_date::text AS birth_date, email,
           decided_at, membership_start_month
    FROM submissions WHERE id=${id}`;
  return row as (CertMember & { email: string }) | undefined;
}

/**
 * Sends the digital (machine-generated) certificate to the member. Can be repeated on purpose,
 * e.g. when a member asks for a fresh copy; `requestId` stops a double click from sending twice.
 * Returns null on success or a short error code without personal data.
 */
export async function sendCertificateEmail(
  id: string,
  requestId: string,
): Promise<string | null> {
  const sql = db();
  const row = await loadCertMember(id);
  if (!row) return "NOT_FOUND";
  if (!certificateAvailable(row)) return "NOT_MEMBER";
  try {
    const config = mailConfig();
    if (!config.configured) throw new MailError("NO_API_KEY");
    const texts = await certificateTexts();
    const pdf = await certificatePdf(row, texts, "digital");
    const club = texts.clubName.trim() || "SSV Potsdamer Straße";
    await sendMail({
      ...certificateMessage(row.first_name, club),
      to: [row.email],
      replyTo: config.clubInbox,
      idempotencyKey: `${id}-bescheinigung-${requestId}`,
      attachments: [
        {
          filename: certificateFileName(
            row.first_name,
            row.last_name,
            "digital",
          ),
          content: Buffer.from(pdf).toString("base64"),
        },
      ],
    });
    await sql`UPDATE submissions SET certificate_sent_at=now(), certificate_mail_error=NULL WHERE id=${id}`;
    return null;
  } catch (err) {
    const code =
      err instanceof MailError
        ? err.code
        : err instanceof PdfGlyphError
          ? "PDF_GLYPH"
          : errorCode(err);
    console.error(`[portal] certificate mail for ${id} failed (${code})`);
    await sql`UPDATE submissions SET certificate_mail_error=${code} WHERE id=${id}`.catch(
      () => {},
    );
    return code;
  }
}
