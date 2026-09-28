import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { pdfFont } from './font';
import type { TextSettings } from './form-settings';
import type { Submission } from './validation';

export const PDF_TEXT_KEYS = [
  'clubName',
  'pdfTitle',
  'pdfIntro',
  'pdfWelcome',
  'pdfWelcomeText',
  'pdfSignature',
] as const;

export type PdfTexts = Pick<TextSettings, (typeof PDF_TEXT_KEYS)[number]>;

export class PdfGlyphError extends Error {
  constructor(public chars: string[]) {
    super('Unsupported PDF glyph');
  }
}

// German transliteration first; other accents are dropped (é → e) and a few letters without a
// decomposition are mapped explicitly.
const ASCII: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  Ä: 'Ae',
  Ö: 'Oe',
  Ü: 'Ue',
  ß: 'ss',
  Ł: 'L',
  ł: 'l',
  Ø: 'O',
  ø: 'o',
  Đ: 'D',
  đ: 'd',
  Æ: 'Ae',
  æ: 'ae',
  Œ: 'Oe',
  œ: 'oe',
  Þ: 'Th',
  þ: 'th',
  ı: 'i',
};

/** Content-Disposition with an ASCII fallback and an RFC 5987 UTF-8 file name. */
export function attachmentName(firstName: string, lastName: string) {
  const name = `${firstName} ${lastName}`;
  const ascii =
    name
      .replace(/[äöüÄÖÜßŁłØøĐđÆæŒœÞþı]/g, (c) => ASCII[c])
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'Mitglied';
  const utf8 = encodeURIComponent(`Mitgliedsbestätigung ${name}.pdf`).replace(
    /['()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `attachment; filename="Mitgliedsbestaetigung-${ascii}.pdf"; filename*=UTF-8''${utf8}`;
}

const A4: [number, number] = [595.28, 841.89];
const LEFT = 55;
const WIDTH = 480;
const BOTTOM = 130; // keep clear of the footer line at y=100

/** Splits text into lines that fit `width`, preferring breaks between words. */
export function wrapLines(value: string, font: PDFFont, size: number, width = WIDTH) {
  const lines: string[] = [];
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= width;
  for (const paragraph of value.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/ +/)) {
      const candidate = line ? line + ' ' + word : word;
      if (fits(candidate)) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      // A single word wider than the line is broken by characters.
      for (const char of word) {
        if (line && !fits(line + char)) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function confirmationPdf(
  row: Pick<Submission, 'id' | 'kind' | 'status' | 'first_name' | 'last_name'> & {
    decided_at: string | Date | null;
  },
  texts: PdfTexts,
) {
  if (row.kind !== 'new' || row.status !== 'approved' || !row.decided_at)
    throw new Error('Approval required');
  const club = texts.clubName.trim() || 'Unser Verein';
  const name = `${row.first_name} ${row.last_name}`;
  // Only texts that are printed are checked (callers may pass all settings).
  const printed = PDF_TEXT_KEYS.map((key) => texts[key]).join('');
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await pdfFont(), { subset: true });

  // Reject unsupported glyphs rather than silently changing a member's name.
  const supported = new Set(font.getCharacterSet());
  const unsupported = [
    ...new Set(
      [...(club + name + printed)].filter(
        (char) => char !== '\n' && !supported.has(char.codePointAt(0)!),
      ),
    ),
  ];
  if (unsupported.length) throw new PdfGlyphError(unsupported);

  const green = rgb(0.07, 0.38, 0.28);
  const ink = rgb(0.09, 0.17, 0.22);
  const line = rgb(0.82, 0.87, 0.86);
  const date = new Date(row.decided_at).toLocaleDateString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  let page: PDFPage;
  let y = 0;
  const addPage = () => {
    const first = doc.getPageCount() === 0;
    page = doc.addPage(A4);
    page.drawRectangle({ x: 0, y: 817, width: 596, height: 25, color: green });
    page.drawLine({
      start: { x: LEFT, y: 100 },
      end: { x: 540, y: 100 },
      thickness: 1,
      color: line,
    });
    page.drawText('Bestätigung der Aufnahmeentscheidung · ' + date, {
      x: LEFT,
      y: 77,
      font,
      size: 9,
      color: ink,
    });
    y = first ? 738 : 770;
  };
  const text = (value: string, size = 12, gap = 22) => {
    for (const content of wrapLines(value, font, size)) {
      if (y < BOTTOM) addPage();
      if (content) page.drawText(content, { x: LEFT, y, size, font, color: ink });
      y -= gap;
    }
  };
  const space = (points: number) => {
    y -= points;
  };

  addPage();
  text(club, 18, 28);
  space(40);
  text(texts.pdfTitle, 28, 38);
  space(18);
  text(texts.pdfIntro, 12, 24);
  space(12);
  text(name, 20, 29);
  space(25);
  text('Aufnahme bestätigt am: ' + date);
  text('Vorgangsnummer: ' + row.id, 10);
  space(35);
  if (texts.pdfWelcome) text(texts.pdfWelcome, 14, 26);
  if (texts.pdfWelcomeText) text(texts.pdfWelcomeText);
  space(55);
  text(texts.pdfSignature);

  doc.setTitle(texts.pdfTitle);
  doc.setAuthor(club);
  doc.setCreator('Mitgliederportal');
  return doc.save();
}
