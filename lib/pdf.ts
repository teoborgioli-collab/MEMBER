import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { pdfFont } from './font';
import type { TextSettings } from './form-settings';
import type { Submission } from './validation';
import { monthYear, type Locale } from './i18n';

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
    membership_start_month?: string | null;
    locale?: Locale;
  },
  texts: PdfTexts,
) {
  const validNew = row.kind === 'new' && row.status === 'approved' && row.decided_at;
  const validExisting = row.kind === 'existing' && row.status === 'reviewed' && row.membership_start_month;
  if (!validNew && !validExisting) throw new Error('Confirmation unavailable');
  const locale: Locale = row.locale === 'en' ? 'en' : 'de';
  const club = texts.clubName.trim() || (locale === 'en' ? 'Our Association' : 'Unser Verein');
  const name = `${row.first_name} ${row.last_name}`;
  const printed = PDF_TEXT_KEYS.map((key) => texts[key]).join('');
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await pdfFont(), { subset: true });
  const supported = new Set(font.getCharacterSet());
  const unsupported = [...new Set([...(club + name + printed)].filter((char) => char !== '\n' && !supported.has(char.codePointAt(0)!)))];
  if (unsupported.length) throw new PdfGlyphError(unsupported);

  const green = rgb(0.07, 0.38, 0.28);
  const ink = rgb(0.09, 0.17, 0.22);
  const line = rgb(0.82, 0.87, 0.86);
  const date = row.decided_at ? new Date(row.decided_at).toLocaleDateString(locale === 'en' ? 'en-GB' : 'de-DE', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: 'long', year: 'numeric',
  }) : '';
  const memberSince = row.membership_start_month ? monthYear(row.membership_start_month, locale) : date;

  let page: PDFPage;
  let y = 0;
  const addPage = () => {
    const first = doc.getPageCount() === 0;
    page = doc.addPage(A4);
    page.drawRectangle({ x: 0, y: 817, width: 596, height: 25, color: green });
    page.drawLine({ start: { x: LEFT, y: 100 }, end: { x: 540, y: 100 }, thickness: 1, color: line });
    const footer = locale === 'en'
      ? `Membership confirmation · ${memberSince}`
      : `Mitgliedsbestätigung · ${memberSince}`;
    page.drawText(footer, { x: LEFT, y: 77, font, size: 9, color: ink });
    y = first ? 738 : 770;
  };
  const text = (value: string, size = 12, gap = 22) => {
    for (const content of wrapLines(value, font, size)) {
      if (y < BOTTOM) addPage();
      if (content) page.drawText(content, { x: LEFT, y, size, font, color: ink });
      y -= gap;
    }
  };
  const space = (points: number) => { y -= points; };

  addPage();
  text(club, 18, 28);
  space(40);
  text(locale === 'en' ? 'Membership confirmation' : texts.pdfTitle, 28, 38);
  space(18);
  if (row.kind === 'existing') {
    text(locale === 'en' ? 'This is to confirm that' : 'Hiermit bestätigen wir, dass', 12, 24);
    space(12); text(name, 20, 29); space(25);
    text(locale === 'en' ? `has been a member since ${memberSince}.` : `seit ${memberSince} Mitglied der ${club} ist.`);
  } else {
    text(locale === 'en' ? 'We confirm the admission as a member of' : texts.pdfIntro, 12, 24);
    space(12); text(name, 20, 29); space(25);
    text(locale === 'en' ? `Membership effective from: ${memberSince}` : 'Aufnahme bestätigt am: ' + memberSince);
  }
  text((locale === 'en' ? 'Reference number: ' : 'Vorgangsnummer: ') + row.id, 10);
  space(35);
  if (row.kind === 'new') {
    if (locale === 'en') {
      text('Welcome to our association!', 14, 26);
      text('We look forward to having you with us.');
    } else {
      if (texts.pdfWelcome) text(texts.pdfWelcome, 14, 26);
      if (texts.pdfWelcomeText) text(texts.pdfWelcomeText);
    }
  }
  space(55);
  text(locale === 'en' ? 'Association administration' : texts.pdfSignature);

  doc.setTitle(locale === 'en' ? 'Membership confirmation' : texts.pdfTitle);
  doc.setAuthor(club);
  doc.setCreator('Mitgliederportal');
  return doc.save();
}
