const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');

// 1x1 8-bit JPEG baseline image
const sampleJpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const sampleJpegBytes = Buffer.from(sampleJpegBase64, 'base64');

test('scanner compiler produces valid multi-page PDF from captured images', async () => {
  const pdfDoc = await PDFDocument.create();

  // Page 1
  const img1 = await pdfDoc.embedJpg(sampleJpegBytes);
  const page1 = pdfDoc.addPage([612, 792]); // Standard letter size
  page1.drawImage(img1, { x: 50, y: 50, width: 500, height: 650 });

  // Page 2
  const img2 = await pdfDoc.embedJpg(sampleJpegBytes);
  const page2 = pdfDoc.addPage([612, 792]);
  page2.drawImage(img2, { x: 50, y: 50, width: 500, height: 650 });

  const pdfBytes = await pdfDoc.save();

  // Validate PDF binary header
  const header = Buffer.from(pdfBytes.subarray(0, 5)).toString('ascii');
  assert.equal(header, '%PDF-', 'Compiled document must have valid PDF header');

  // Reload PDF to verify page count
  const loadedPdf = await PDFDocument.load(pdfBytes);
  assert.equal(loadedPdf.getPageCount(), 2, 'Compiled PDF must contain exactly 2 pages');
});

test('scanner compiler handles single-page document capture', async () => {
  const pdfDoc = await PDFDocument.create();
  const img = await pdfDoc.embedJpg(sampleJpegBytes);
  const page = pdfDoc.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });

  const pdfBytes = await pdfDoc.save();
  const loadedPdf = await PDFDocument.load(pdfBytes);
  assert.equal(loadedPdf.getPageCount(), 1);
});
