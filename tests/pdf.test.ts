import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { attachmentName, confirmationPdf, PdfGlyphError, type PdfTexts } from '../lib/pdf';
import { FIELDS } from '../lib/form-settings';

const row = {
  id: 'dcd436f7-27bb-4fd5-b953-43c44172a6e3',
  kind: 'new' as const,
  status: 'approved' as const,
  first_name: 'Jürgen',
  last_name: 'Öztürk',
  decided_at: '2026-09-28T10:00:00Z',
};

const texts: PdfTexts = {
  clubName: 'Testverein',
  pdfTitle: FIELDS.pdfTitle.value,
  pdfIntro: FIELDS.pdfIntro.value,
  pdfWelcome: FIELDS.pdfWelcome.value,
  pdfWelcomeText: FIELDS.pdfWelcomeText.value,
  pdfSignature: FIELDS.pdfSignature.value,
};

test('confirmation PDF requires approval and supports umlauts', async () => {
  await assert.rejects(() => confirmationPdf({ ...row, status: 'pending' }, texts));
  await assert.rejects(() => confirmationPdf({ ...row, kind: 'existing' }, texts));
  await assert.rejects(() => confirmationPdf({ ...row, decided_at: null }, texts));
  const bytes = await confirmationPdf(row, texts);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.getTitle(), 'Mitgliedsbestätigung');
  assert.equal(pdf.getAuthor(), 'Testverein');
});

test('edited PDF texts are used, and very long texts continue on a second page', async () => {
  const custom = await PDFDocument.load(
    await confirmationPdf(row, { ...texts, pdfTitle: 'Aufnahmebestätigung' }),
  );
  assert.equal(custom.getTitle(), 'Aufnahmebestätigung');
  const long = await confirmationPdf(
    { ...row, first_name: 'W'.repeat(80), last_name: 'W'.repeat(80) },
    {
      clubName: 'Verein '.repeat(17).trim(),
      pdfTitle: 'Mitgliedsbestätigung '.repeat(2).trim(),
      pdfIntro: 'Wir bestätigen die Annahme des Antrags '.repeat(5).trim(),
      pdfWelcome: 'Herzlich willkommen! '.repeat(5).trim(),
      pdfWelcomeText: Array(8).fill('Eine weitere Zeile mit etwas Text für das PDF.').join('\n'),
      pdfSignature: 'Der Vorstand\nim Namen aller\nMitglieder',
    },
  );
  assert.equal((await PDFDocument.load(long)).getPageCount(), 2);
});

test('unsupported characters are rejected instead of silently changed', async () => {
  await assert.rejects(
    () => confirmationPdf({ ...row, first_name: '王' }, texts),
    (err) => err instanceof PdfGlyphError && err.chars.includes('王'),
  );
  await assert.rejects(
    () => confirmationPdf(row, { ...texts, pdfSignature: 'Grüße ☃' }),
    PdfGlyphError,
  );
});

test('only printed texts must be supported by the PDF font', async () => {
  // Callers may pass all settings; symbols in texts that are not printed must not matter.
  const everything = {
    ...texts,
    introText: 'Willkommen 🎉',
    headerNote: '⚽ Sport',
    helpLink: '✉',
  };
  const pdf = await PDFDocument.load(await confirmationPdf(row, everything as PdfTexts));
  assert.equal(pdf.getPageCount(), 1);
});

test('download names are readable and safe', () => {
  assert.equal(
    attachmentName('Jürgen', 'Öztürk-Weiß'),
    `attachment; filename="Mitgliedsbestaetigung-Juergen-Oeztuerk-Weiss.pdf"; filename*=UTF-8''Mitgliedsbest%C3%A4tigung%20J%C3%BCrgen%20%C3%96zt%C3%BCrk-Wei%C3%9F.pdf`,
  );
  assert.match(
    attachmentName('"; x', "O'Brien"),
    /^attachment; filename="Mitgliedsbestaetigung-x-O-Brien\.pdf"; filename\*=UTF-8''[A-Za-z0-9%._-]+$/,
  );
  assert.match(attachmentName('王', '李'), /filename="Mitgliedsbestaetigung-Mitglied\.pdf"/);
  for (const [first, last, ascii] of [
    ['Hélène', 'Côté', 'Helene-Cote'],
    ['Ana María', 'Núñez', 'Ana-Maria-Nunez'],
    ['Łukasz', 'Żółć', 'Lukasz-Zolc'],
    ['Søren', 'Æbelø', 'Soren-Aebelo'],
  ])
    assert.match(
      attachmentName(first, last),
      new RegExp(`^attachment; filename="Mitgliedsbestaetigung-${ascii}\\.pdf"`),
      ascii,
    );
});
