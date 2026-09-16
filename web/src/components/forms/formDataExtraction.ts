import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { fieldEntryId, fieldsForTemplate } from './formFields';
import type { FormEntry } from './pdfExport';

GlobalWorkerOptions.workerSrc = workerUrl;

export type StructuredFormData = { templateId: string; fields: Record<string, string> };

export function structuredDataFromEntries(templateId: string, pages: number[], entries: FormEntry[]): StructuredFormData {
  const fields: Record<string, string> = {};
  for (let page = 0; page < pages.length; page++) {
    for (const field of fieldsForTemplate(templateId).filter(item => item.page === pages[page])) {
      const value = entries.find(entry => entry.id === fieldEntryId(field, page, pages))?.text.trim();
      if (value && fields[field.key] === undefined) fields[field.key] = value;
    }
  }
  return { templateId, fields };
}

type PdfText = { text: string; x: number; y: number; width: number; height: number };
type PdfPageText = { items: PdfText[]; width: number; height: number };
async function readPageText(bytes: ArrayBuffer, pageIndex: number): Promise<PdfPageText> {
  const document = await getDocument({ data: bytes.slice(0), isEvalSupported: false }).promise;
  try {
    if (pageIndex >= document.numPages) return { items: [], width: 1, height: 1 };
    const page = await document.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.flatMap((raw: any) => {
      const text = String(raw.str || '').trim();
      if (!text) return [];
      const [x, baseline] = viewport.convertToViewportPoint(raw.transform[4], raw.transform[5]);
      const height = Math.max(1, Math.abs(raw.height || raw.transform[3] || 1));
      return [{ text, x, y: baseline - height, width: Math.abs(raw.width || 1), height }];
    });
    return { items, width: viewport.width, height: viewport.height };
  } finally { await document.destroy(); }
}

const samePrintedText = (a: PdfText, b: PdfText) => a.text === b.text && Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;

export async function extractStructuredDataFromPdf(file: File, templateId: string, blankBytes: ArrayBuffer): Promise<StructuredFormData | undefined> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return undefined;
  const fields = fieldsForTemplate(templateId);
  if (!fields.length) return undefined;
  const uploadedBytes = await file.arrayBuffer();
  const result: Record<string, string> = {};
  for (const pageIndex of [...new Set(fields.map(field => field.page))]) {
    const [uploaded, blank] = await Promise.all([readPageText(uploadedBytes, pageIndex), readPageText(blankBytes, pageIndex)]);
    const added = uploaded.items.filter(item => !blank.items.some(original => samePrintedText(item, original)));
    for (const field of fields.filter(item => item.page === pageIndex)) {
      const pageWidth = uploaded.width, pageHeight = uploaded.height;
      const left = field.x * pageWidth - 2, right = (field.x + field.width) * pageWidth + 2;
      const top = field.y * pageHeight - 2, bottom = (field.y + field.height) * pageHeight + 2;
      const values = added.filter(item => item.x + item.width / 2 >= left && item.x + item.width / 2 <= right && item.y + item.height / 2 >= top && item.y + item.height / 2 <= bottom)
        .sort((a, b) => a.y - b.y || a.x - b.x).map(item => item.text);
      if (values.length) result[field.key] = values.join(field.type === 'multiline' ? '\n' : ' ');
    }
  }
  return Object.keys(result).length ? { templateId, fields: result } : undefined;
}
