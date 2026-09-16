import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
import { fieldEntryId, type TemplateField } from './formFields';
import type { FormEntry } from './pdfExport';

let metrics: Promise<PDFFont> | undefined;
export function getFieldFont() {
  return metrics ||= PDFDocument.create().then(doc => doc.embedFont(StandardFonts.Helvetica));
}

export function mapEntries(pages: number[], entries: FormEntry[], fields: TemplateField[]) {
  const old = new Map(entries.map(entry => [entry.id, entry]));
  const mapped = pages.flatMap((sourcePage, page) => fields.filter(field => field.page === sourcePage).map(field => {
    const id = fieldEntryId(field, page, pages);
    const previous = old.get(id);
    old.delete(id);
    return { id, page, x: field.x, y: field.y, size: field.size, text: previous?.text || '' };
  }));
  // Keep answers from the previous combined fields for the owner to redistribute.
  // They must not be silently printed at their obsolete coordinates.
  return [...mapped, ...Array.from(old.values()).filter(entry => entry.text.trim())];
}

export function layoutField(text: string, field: TemplateField, width: number, height: number, font: PDFFont) {
  const boxWidth = field.width * width, boxHeight = field.height * height;
  const clean = text.replace(/\r/g, '');
  if (!clean.trim()) return { lines: [] as string[], size: field.size, baseline: 0, lineHeight: 0 };
  const start = field.type === 'checkbox' ? Math.min(field.size, boxHeight) : field.size;
  const minimum = field.type === 'checkbox' ? start : 6;
  for (let size = start; size >= minimum; size -= .25) {
    const lines: string[] = [];
    for (const paragraph of clean.split('\n')) {
      if (field.type !== 'multiline') { lines.push(paragraph); continue; }
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && font.widthOfTextAtSize(candidate, size) > boxWidth) { lines.push(line); line = word; }
        else line = candidate;
      }
      lines.push(line);
    }
    const ascent = font.heightAtSize(size, { descender: false });
    const lineHeight = size * 1.15;
    const usedHeight = font.heightAtSize(size) + (lines.length - 1) * lineHeight;
    if (usedHeight <= boxHeight + .01 && lines.every(line => font.widthOfTextAtSize(line, size) <= boxWidth)) {
      return { lines, size, baseline: ascent + (field.type === 'multiline' ? 0 : (boxHeight - usedHeight) / 2), lineHeight };
    }
  }
  throw new Error(`“${field.label}” is too long for its printed box. Shorten this answer${field.type === 'multiline' ? ' or use a continuation page' : ''}.`);
}
