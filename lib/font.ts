import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Bundled OFL Noto Sans used for the confirmation PDF (see public/fonts/OFL.txt).
let bytes: Promise<Buffer> | undefined;
export function pdfFont() {
  return (bytes ||= readFile(path.join(process.cwd(), 'public/fonts/NotoSans-Regular.ttf')));
}

let codePoints: Promise<Set<number>> | undefined;
function supported() {
  return (codePoints ||= pdfFont().then((data) => new Set(fontkit.create(data).characterSet)));
}

/** Characters of `text` the PDF font cannot draw (line breaks are handled separately). */
export async function unsupportedPdfChars(text: string) {
  const set = await supported();
  return [...new Set([...text].filter((ch) => ch !== '\n' && !set.has(ch.codePointAt(0)!)))];
}
