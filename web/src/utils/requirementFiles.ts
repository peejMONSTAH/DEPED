import { PDFDocument } from 'pdf-lib';

const LIMIT = 10 * 1024 * 1024;
/** One reviewable attachment per requirement; multiple source files become a PDF. */
export async function prepareRequirementFiles(files: File[], name: string): Promise<File> {
  if (!files.length) throw new Error('Choose at least one file.');
  for (const file of files) {
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) throw new Error('Choose only PDF, PNG or JPEG files.');
    if (!file.size || file.size > LIMIT) throw new Error('Each file must be non-empty and no larger than 10 MB.');
  }
  if (files.reduce((size, file) => size + file.size, 0) > LIMIT) throw new Error('The selected files must total no more than 10 MB.');
  if (files.length === 1) return files[0];
  const output = await PDFDocument.create();
  for (const file of files) {
    try {
      const bytes = await file.arrayBuffer();
      if (/\.pdf$/i.test(file.name)) {
        const source = await PDFDocument.load(bytes);
        if (!source.getPageCount()) throw new Error('No pages');
        for (const page of await output.copyPages(source, source.getPageIndices())) output.addPage(page);
      } else {
        const image = /\.png$/i.test(file.name) ? await output.embedPng(bytes) : await output.embedJpg(bytes);
        const page = output.addPage([595.28, 841.89]);
        const scale = Math.min((page.getWidth() - 40) / image.width, (page.getHeight() - 40) / image.height);
        const width = image.width * scale, height = image.height * scale;
        page.drawImage(image, { x: (page.getWidth() - width) / 2, y: (page.getHeight() - height) / 2, width, height });
      }
    } catch {
      throw new Error(`Could not combine "${file.name}". Use an unencrypted, valid PDF, PNG or JPEG. Nothing was uploaded.`);
    }
  }
  const bytes = await output.save();
  if (bytes.length > LIMIT) throw new Error('The combined PDF exceeds 10 MB. Choose smaller files.');
  return new File([bytes as BlobPart], `${name.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80)}.pdf`, { type: 'application/pdf' });
}
