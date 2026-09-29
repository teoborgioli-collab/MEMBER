import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  certificateAvailable,
  certificateCode,
  certificateFileName,
  certificateMessage,
  certificatePdf,
  checkSignature,
  parseCertificateCode,
  type CertTexts,
} from "../lib/certificate";
import { PdfGlyphError } from "../lib/pdf";
import { FIELDS } from "../lib/form-settings";

process.env.SESSION_SECRET ||= "test-secret-".repeat(4);

const row = {
  id: "dcd436f7-27bb-4fd5-b953-43c44172a6e3",
  kind: "new" as const,
  status: "approved",
  first_name: "Jürgen",
  last_name: "Öztürk",
  birth_date: "2003-04-12",
  decided_at: "2026-09-28T10:00:00Z",
};
const texts: CertTexts = {
  clubName: "SSV Potsdamer Str. e. V.",
  contactEmail: "info@ssvpotsdamerstr.de",
  certSubtitle: FIELDS.certSubtitle.value,
  certAddress: FIELDS.certAddress.value,
  certPlace: FIELDS.certPlace.value,
};

test("certificate only for accepted or reviewed members", async () => {
  assert.equal(certificateAvailable(row), true);
  assert.equal(
    certificateAvailable({ kind: "existing", status: "reviewed" }),
    true,
  );
  assert.equal(certificateAvailable({ kind: "new", status: "pending" }), false);
  assert.equal(
    certificateAvailable({ kind: "existing", status: "rejected" }),
    false,
  );
  await assert.rejects(() =>
    certificatePdf({ ...row, status: "rejected" }, texts, "digital"),
  );
});

test("digital and print certificates are one-page PDFs", async () => {
  for (const variant of ["digital", "print"] as const) {
    const pdf = await PDFDocument.load(
      await certificatePdf(row, texts, variant),
    );
    assert.equal(pdf.getPageCount(), 1);
    assert.equal(
      pdf.getTitle(),
      "Mitgliedsbescheinigung / Certificate of Membership",
    );
    assert.equal(pdf.getAuthor(), texts.clubName);
  }
  const long = await certificatePdf(
    {
      ...row,
      kind: "existing",
      status: "reviewed",
      membership_start_month: "2024-10",
      first_name: "W".repeat(80),
      last_name: "W".repeat(80),
    },
    texts,
    "print",
  );
  assert.equal((await PDFDocument.load(long)).getPageCount(), 1);
});

test("unsupported characters are rejected", async () => {
  await assert.rejects(
    () => certificatePdf({ ...row, first_name: "王" }, texts, "digital"),
    (err) => err instanceof PdfGlyphError,
  );
});

test("verification codes round-trip and reject tampering", () => {
  const code = certificateCode(row.id, "2026-09-29");
  assert.match(code, /^DCD436F7-260929-[A-Z2-9]{8}$/);
  const parsed = parseCertificateCode(
    " " + code.toLowerCase().replaceAll("-", " ") + " ",
  );
  assert.ok(parsed);
  assert.equal(parsed.prefix, "dcd436f7");
  assert.equal(parsed.day, "2026-09-29");
  assert.equal(checkSignature(row.id, parsed.day, parsed.sig), true);
  assert.equal(checkSignature(row.id, "2026-09-30", parsed.sig), false);
  assert.equal(
    checkSignature(
      "dcd436f7-0000-4000-8000-000000000000",
      parsed.day,
      parsed.sig,
    ),
    false,
  );
  assert.equal(parseCertificateCode("nonsense"), null);
});

test("bilingual e-mail text and ASCII file names", () => {
  const mail = certificateMessage("Jürgen", "SSV");
  assert.ok(
    mail.subject.startsWith(
      "Deine Mitgliedsbescheinigung / Your membership certificate",
    ),
  );
  assert.ok(
    mail.text.indexOf("Hallo Jürgen") < mail.text.indexOf("Hello Jürgen"),
  );
  assert.equal(
    certificateFileName("Jürgen", "Öztürk", "print"),
    "Mitgliedsbescheinigung-Juergen-Oeztuerk-Druck.pdf",
  );
});
