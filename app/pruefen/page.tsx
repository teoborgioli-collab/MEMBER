import type { Metadata } from "next";
import { headers } from "next/headers";
import { db } from "../../lib/db";
import { logError } from "../../lib/errors";
import { consume } from "../../lib/rate";
import { rateKey } from "../../lib/security";
import {
  berlinDay,
  certificateAvailable,
  checkSignature,
  memberSince,
  parseCertificateCode,
  type CertMember,
} from "../../lib/certificate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Bescheinigung prüfen · Verify certificate",
  robots: { index: false, follow: false },
};

type Result =
  | { state: "none" }
  | { state: "valid"; name: string; issued: string; since: string }
  | { state: "invalid" }
  | { state: "limited" }
  | { state: "error" };

const shortDate = (day: string) => day.split("-").reverse().join(".");

async function check(input: string): Promise<Result> {
  if (!input.trim()) return { state: "none" };
  try {
    // Same per-visitor rate limit as elsewhere; guessing codes is not practical.
    const request = new Request("http://local", { headers: await headers() });
    if (!(await consume(rateKey(request, "verify-certificate"), 30)))
      return { state: "limited" };
    const code = parseCertificateCode(input);
    if (!code) return { state: "invalid" };
    if (code.day > berlinDay()) return { state: "invalid" };
    const rows = (await db()`
      SELECT id, kind, status, first_name, last_name, birth_date::text AS birth_date,
             decided_at, membership_start_month
      FROM submissions
      WHERE id::text LIKE ${code.prefix + "%"}
      LIMIT 20`) as unknown as CertMember[];
    const row = rows.find(
      (r) =>
        certificateAvailable(r) && checkSignature(r.id, code.day, code.sig),
    );
    if (!row) return { state: "invalid" };
    return {
      state: "valid",
      name: `${row.first_name} ${row.last_name}`,
      issued: shortDate(code.day),
      since: memberSince(row, "de"),
    };
  } catch (err) {
    logError("verifying certificate", err);
    return { state: "error" };
  }
}

export default async function Verify({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const raw = (await searchParams).code;
  const input = (Array.isArray(raw) ? raw[0] : (raw ?? "")).slice(0, 60);
  const result = await check(input);
  return (
    <main className="admin">
      <section className="form-card">
        <span className="eyebrow">MITGLIEDSBESCHEINIGUNG · CERTIFICATE</span>
        <h1>Bescheinigung prüfen</h1>
        <p>
          Gib den Prüfcode von der Mitgliedsbescheinigung ein, um zu bestätigen,
          dass sie vom Verein ausgestellt wurde.
          <br />
          <span className="muted">
            Enter the verification code printed on the membership certificate to
            confirm that it was issued by the association.
          </span>
        </p>
        <form className="verify-form" method="get">
          <input
            name="code"
            defaultValue={input}
            placeholder="z. B. DCD436F7-260929-4229WLYU"
            aria-label="Prüfcode / Verification code"
            autoComplete="off"
            spellCheck={false}
            required
          />
          <button className="button" type="submit">
            Prüfen / Verify
          </button>
        </form>

        {result.state === "valid" && (
          <div className="verify-result valid" role="status">
            <strong>✓ Gültige Bescheinigung · Valid certificate</strong>
            <dl>
              <dt>Mitglied / Member</dt>
              <dd>{result.name}</dd>
              {result.since && (
                <>
                  <dt>Mitglied seit / Member since</dt>
                  <dd>{result.since}</dd>
                </>
              )}
              <dt>Ausgestellt am / Issued on</dt>
              <dd>{result.issued}</dd>
            </dl>
            <p className="muted small">
              Die Person ist weiterhin als Mitglied im Portal verzeichnet. Bitte
              vergleiche den Namen mit dem vorgelegten Dokument. · The person is
              still listed as a member. Please compare the name with the
              document presented.
            </p>
          </div>
        )}
        {result.state === "invalid" && (
          <div className="verify-result invalid" role="alert">
            <strong>
              Dieser Prüfcode ist nicht gültig · This code is not valid
            </strong>
            <p className="muted small">
              Bitte prüfe die Eingabe oder wende dich an den Verein. · Please
              check your input or contact the association.
            </p>
          </div>
        )}
        {result.state === "limited" && (
          <p className="error" role="alert">
            Zu viele Versuche. Bitte in einer Stunde erneut versuchen. · Too
            many attempts, please try again in an hour.
          </p>
        )}
        {result.state === "error" && (
          <p className="error" role="alert">
            Die Prüfung ist gerade nicht möglich. Bitte später erneut versuchen.
            · Verification is currently unavailable, please try again later.
          </p>
        )}
      </section>
    </main>
  );
}
