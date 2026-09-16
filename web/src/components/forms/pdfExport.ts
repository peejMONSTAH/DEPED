import { PDFDocument, StandardFonts, rgb, degrees, type PDFPage } from 'pdf-lib';
import { fieldEntryId, type TemplateField } from './formFields';
import { layoutField } from './fieldLayout';

export interface FormEntry { id: string; page: number; x: number; y: number; size: number; text: string }
export function pageGeometry(page: PDFPage) {
  const crop = page.getCropBox();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  return {
    width: rotation % 180 ? crop.height : crop.width,
    height: rotation % 180 ? crop.width : crop.height,
    rotation,
    point: (left: number, top: number) => {
      const [x, y] = rotation === 90 ? [top, left] : rotation === 180 ? [crop.width - left, top] : rotation === 270 ? [crop.width - top, crop.height - left] : [left, crop.height - top];
      return { x: crop.x + x, y: crop.y + y };
    },
  };
}
export async function exportFilledPdf(source: ArrayBuffer, pages: number[], entries: FormEntry[], fields: TemplateField[] = []) {
  const original = await PDFDocument.load(source);
  const output = await PDFDocument.create();
  const copies = await output.copyPages(original, pages);
  copies.forEach(page => output.addPage(page));
  const font = await output.embedFont(StandardFonts.Helvetica);
  for (const entry of entries) {
    if (!entry.text.trim()) continue;
    const page = copies[entry.page];
    if (!page) throw new Error('An entry refers to a missing page.');
    const geometry = pageGeometry(page);
    const { width, height } = geometry;
    const field = fields.find(item => item.page === pages[entry.page] && fieldEntryId(item, entry.page, pages) === entry.id);
    if (fields.length && !field) throw new Error('Some older answers need to be moved into the corrected fields. Review Previous draft answers before exporting.');
    if (field) {
      const layout = layoutField(entry.text, field, width, height, font);
      layout.lines.forEach((text, i) => page.drawText(text, {
        ...geometry.point(field.x * width, field.y * height + layout.baseline + i * layout.lineHeight),
        size: layout.size, font, color: rgb(0, 0, 0), rotate: degrees(geometry.rotation),
      }));
      continue;
    }
    const lines = entry.text.replace(/\r/g, '').split('\n');
    for (let line = 0; line < lines.length; line++) {
      const value = lines[line];
      let textWidth: number;
      try { textWidth = font.widthOfTextAtSize(value, entry.size); }
      catch { throw new Error('Some characters cannot be printed in this template. Use Latin text (including ñ), numbers and standard punctuation.'); }
      const y = height - entry.y * height - entry.size - line * entry.size * 1.2;
      if (entry.x * width + textWidth > width - 2 || y < 2) {
        throw new Error(`Text extends beyond page ${entry.page + 1}. Move it, reduce its size or insert line breaks.`);
      }
      page.drawText(value, { x: entry.x * width, y, size: entry.size, font, color: rgb(0, 0, 0) });
    }
  }
  output.setTitle('Personnel completed form - requires review');
  output.setProducer('Digital 201 - template editor');
  return new Blob([new Uint8Array(await output.save())], { type: 'application/pdf' });
}
