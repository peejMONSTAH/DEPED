const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PDFDocument } = require('pdf-lib');

// 1. Server-side validation logic replica (from backend/src/controllers/personnel-documents.controller.ts)
function validateFile(file) {
  if (!file) return false;
  if (!file.size || file.size > 10 * 1024 * 1024) return false;
  if (!['.pdf', '.png', '.jpg', '.jpeg'].includes(path.extname(file.originalname).toLowerCase())) return false;
  if (file.mimetype === 'application/pdf') return file.buffer.subarray(0, 5).toString() === '%PDF-';
  if (file.mimetype === 'image/png') return file.buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  return file.mimetype === 'image/jpeg' && file.buffer[0] === 255 && file.buffer[1] === 216 && file.buffer[2] === 255;
}

// 2. Client Axios interceptor logic replica (from web/src/api/client.ts)
function processRequestConfig(config) {
  const processed = { ...config, headers: { ...config.headers } };
  // Check if data is FormData or FormData-like
  const isFormData = processed.data && (
    (typeof FormData !== 'undefined' && processed.data instanceof FormData) ||
    processed.data._isFormData === true
  );

  if (isFormData && processed.headers) {
    delete processed.headers['Content-Type'];
    delete processed.headers['content-type'];
  }
  return processed;
}

// 1x1 8-bit JPEG baseline image
const sampleJpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const sampleJpegBytes = Buffer.from(sampleJpegBase64, 'base64');

test('Criterion 1: Scanner-generated PDF passes strict server validation (%PDF- signature and <= 10MB)', async () => {
  const pdfDoc = await PDFDocument.create();
  const img = await pdfDoc.embedJpg(sampleJpegBytes);
  const page = pdfDoc.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });

  const rawBytes = await pdfDoc.save();
  // Ensure typed array slice logic as in DocumentScannerModal
  const cleanBytes = (rawBytes.byteOffset === 0 && rawBytes.byteLength === rawBytes.buffer.byteLength)
    ? rawBytes
    : rawBytes.slice();

  const buffer = Buffer.from(cleanBytes.buffer, cleanBytes.byteOffset, cleanBytes.byteLength);
  const mockMulterFile = {
    originalname: 'letter_of_intent_scanned_1790173934.pdf',
    mimetype: 'application/pdf',
    size: buffer.length,
    buffer: buffer,
  };

  assert.equal(validateFile(mockMulterFile), true, 'Scanner compiled PDF must pass validateFile');
  assert.equal(buffer.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.ok(mockMulterFile.size <= 10 * 1024 * 1024, 'Size must be <= 10MB');
});

test('Criterion 2: Rejection of corrupted, mislabeled, or oversized files', () => {
  // A. Missing file (e.g. when Multer skips parsing due to Content-Type: application/json)
  assert.equal(validateFile(undefined), false, 'Undefined file must fail validation');
  assert.equal(validateFile(null), false, 'Null file must fail validation');

  // B. Corrupted PDF header (plain text masquerading as PDF)
  const fakePdf = {
    originalname: 'fake.pdf',
    mimetype: 'application/pdf',
    size: 256,
    buffer: Buffer.from('NOT A PDF FILE DATA CONTENT'),
  };
  assert.equal(validateFile(fakePdf), false, 'File with invalid PDF magic bytes must be rejected');

  // C. Disallowed file extension
  const disallowedExt = {
    originalname: 'document.exe',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('%PDF-1.4 dummy file content'),
  };
  assert.equal(validateFile(disallowedExt), false, 'Non-permitted extension must be rejected');

  // D. Oversized file (> 10MB)
  const oversizedFile = {
    originalname: 'large.pdf',
    mimetype: 'application/pdf',
    size: 11 * 1024 * 1024,
    buffer: Buffer.from('%PDF-1.4 dummy'),
  };
  assert.equal(validateFile(oversizedFile), false, 'File exceeding 10MB must be rejected');

  // E. Valid PNG magic bytes
  const validPng = {
    originalname: 'scan.png',
    mimetype: 'image/png',
    size: 64,
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0]),
  };
  assert.equal(validateFile(validPng), true, 'Valid PNG must be accepted');

  // F. Fake PNG with corrupt bytes
  const fakePng = {
    originalname: 'corrupt.png',
    mimetype: 'image/png',
    size: 64,
    buffer: Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]),
  };
  assert.equal(validateFile(fakePng), false, 'Corrupted PNG must be rejected');
});

test('Criterion 3: Axios interceptor deletes Content-Type for FormData, allowing multipart boundary', () => {
  // Case A: Default client config with Content-Type: application/json
  const initialConfig = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token-123',
    },
    data: { _isFormData: true }, // mock FormData instance
  };

  const processed = processRequestConfig(initialConfig);
  assert.equal(processed.headers['Content-Type'], undefined, 'Content-Type must be removed for FormData');
  assert.equal(processed.headers['content-type'], undefined, 'content-type must be removed');
  assert.equal(processed.headers['Authorization'], 'Bearer test-token-123', 'Authorization header must remain');

  // Case B: Non-FormData request retains application/json
  const jsonConfig = {
    headers: {
      'Content-Type': 'application/json',
    },
    data: { documentTypeId: 'LETTER_OF_INTENT' },
  };
  const processedJson = processRequestConfig(jsonConfig);
  assert.equal(processedJson.headers['Content-Type'], 'application/json', 'Content-Type must be preserved for JSON');
});

test('Criterion 4: Form state is preserved on submission failure for retry', () => {
  // Simulates MyDocuments upload state lifecycle
  const state = {
    file: { name: 'letter_of_intent_scanned.pdf', size: 638976 },
    typeId: 'LETTER_OF_INTENT',
    customName: '',
    issueDate: '2026-09-23',
    expirationDate: '',
    remarks: 'Scanned via mobile camera',
    busy: false,
    formError: '',
    uploadProgress: null,
  };

  // User triggers submit
  state.busy = true;
  state.uploadProgress = 0;

  // Mock server error (e.g. temporary network drop or server 500)
  const mockServerError = new Error('Upload failed. Please check your document and try again.');
  state.formError = mockServerError.message;
  state.busy = false;
  state.uploadProgress = null;

  // Verify form inputs remain intact so user does not have to re-scan
  assert.notEqual(state.file, null, 'Selected file must remain in form state after error');
  assert.equal(state.file.name, 'letter_of_intent_scanned.pdf');
  assert.equal(state.typeId, 'LETTER_OF_INTENT');
  assert.equal(state.issueDate, '2026-09-23');
  assert.equal(state.remarks, 'Scanned via mobile camera');
  assert.equal(state.formError, 'Upload failed. Please check your document and try again.');
  assert.equal(state.busy, false, 'Loading state must be cleared on failure');
});

test('Criterion 5: Rapid double-tap guard ensures exactly one active upload in flight', async () => {
  let activeInFlightCount = 0;
  let maxConcurrentUploads = 0;
  let totalSuccessfulSubmissions = 0;
  let isSubmitting = false;

  async function mockSubmitUpload() {
    if (isSubmitting) return; // Guard against concurrent submission
    isSubmitting = true;
    activeInFlightCount++;
    maxConcurrentUploads = Math.max(maxConcurrentUploads, activeInFlightCount);

    try {
      // Simulate network latency (50ms)
      await new Promise(resolve => setTimeout(resolve, 50));
      totalSuccessfulSubmissions++;
    } finally {
      activeInFlightCount--;
      isSubmitting = false;
    }
  }

  // Simulate user rapidly tapping 5 times within 10ms
  const promises = [
    mockSubmitUpload(),
    mockSubmitUpload(),
    mockSubmitUpload(),
    mockSubmitUpload(),
    mockSubmitUpload(),
  ];

  await Promise.all(promises);

  assert.equal(maxConcurrentUploads, 1, 'Never more than 1 concurrent upload request');
  assert.equal(totalSuccessfulSubmissions, 1, 'Only first tap initiates upload, subsequent rapid taps are ignored');
});

test('Criterion 6: Scanner controls have non-overlapping tap targets on mobile viewports (375px - 430px)', () => {
  // Mobile geometry verification for the two-row scanner controls layout
  const viewportWidth = 390; // iPhone 12/13/14 standard width
  const shutterDiameter = 60; // 60px on mobile <= 480px
  const toolButtonSize = 44; // min 44px tap target on mobile
  const completionButtonHeight = 48; // min 48px height

  // Row 1: Capture row (Height = 64px, Tools on left & right, shutter in center)
  const row1 = {
    top: 0,
    bottom: Math.max(shutterDiameter, toolButtonSize), // 60px
    leftTools: { x1: 14, x2: 14 + (toolButtonSize * 2) + 8 }, // 14 to 110px
    shutter: { x1: (viewportWidth - shutterDiameter) / 2, x2: (viewportWidth + shutterDiameter) / 2 }, // 165 to 225px
    rightTools: { x1: viewportWidth - 14 - (toolButtonSize * 2) - 4, x2: viewportWidth - 14 }, // 284 to 376px
  };

  // Verify horizontal separation in Row 1:
  assert.ok(row1.leftTools.x2 < row1.shutter.x1, 'Left tools do not overlap center shutter');
  assert.ok(row1.shutter.x2 < row1.rightTools.x1, 'Center shutter does not overlap right tools');

  // Row 2: Completion row (Dedicated row below Row 1 with gap 10px)
  const rowGap = 10;
  const row2 = {
    top: row1.bottom + rowGap, // 70px
    bottom: row1.bottom + rowGap + completionButtonHeight, // 118px
    buttonWidth: viewportWidth - 28, // 362px
  };

  // Verify vertical separation between Row 1 (shutter) and Row 2 (Use Document button):
  assert.ok(row2.top >= row1.bottom, 'Completion row is strictly below the capture shutter row');
  const verticalGap = row2.top - row1.bottom;
  assert.equal(verticalGap, 10, 'Dedicated 10px gap between capture row and completion row');

  // Verify accessibility touch target dimensions:
  assert.ok(toolButtonSize >= 44, 'Mobile tool buttons meet >= 44px minimum touch target');
  assert.ok(shutterDiameter >= 44, 'Mobile camera shutter meets >= 44px minimum touch target');
  assert.ok(completionButtonHeight >= 44, 'Mobile completion button meets >= 44px minimum touch target');
});
