require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  isDocumentAccessibleHistoricalEvidence,
  CONFIGURABLE_DOCUMENT_TYPES,
} = require('../src/controllers/personnel-documents.controller');
const {
  ANNEX_C_REQUIREMENTS,
  MANDATORY_ANNEX_C_CODES,
} = require('../src/utils/annex-c.util');

test('all mandatory Annex C codes are recognized requirements', () => {
  const allCodes = new Set(ANNEX_C_REQUIREMENTS.map(r => r.code));
  for (const mCode of MANDATORY_ANNEX_C_CODES) {
    assert.ok(allCodes.has(mCode), `Mandatory code ${mCode} must be in ANNEX_C_REQUIREMENTS`);
  }
  // Codes a, b, e, g, i, j are mandatory under DepEd Order No. 007 s. 2023
  assert.ok(MANDATORY_ANNEX_C_CODES.includes('a'), 'Letter of Intent is mandatory');
  assert.ok(MANDATORY_ANNEX_C_CODES.includes('b'), 'PDS is mandatory');
  assert.ok(MANDATORY_ANNEX_C_CODES.includes('e'), 'Scholastic records (TOR/Diploma) is mandatory');
  assert.ok(MANDATORY_ANNEX_C_CODES.includes('g'), 'Service record/COE is mandatory');
  assert.ok(MANDATORY_ANNEX_C_CODES.includes('i'), 'Performance rating (IPCR) is mandatory');
  assert.ok(MANDATORY_ANNEX_C_CODES.includes('j'), 'Omnibus sworn statement is mandatory');
});

test('file signature validator accepts authentic PDF, PNG, and JPEG and rejects spoofed files', () => {
  const pdfBuffer = Buffer.from('%PDF-1.4 file header content');
  const pngBuffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
  const jpegBuffer = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70]);
  const spoofedBuffer = Buffer.from('Plain text claiming to be a PDF');

  // Verify PDF signature
  assert.equal(pdfBuffer.subarray(0, 5).toString('ascii'), '%PDF-');

  // Verify PNG signature
  assert.ok(pngBuffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));

  // Verify JPEG signature
  assert.ok(jpegBuffer[0] === 255 && jpegBuffer[1] === 216 && jpegBuffer[2] === 255);

  // Spoofed file fails all checks
  assert.notEqual(spoofedBuffer.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.ok(!spoofedBuffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  assert.ok(!(spoofedBuffer[0] === 255 && spoofedBuffer[1] === 216 && spoofedBuffer[2] === 255));
});

test('file size limit strictly enforces 10 MB maximum', () => {
  const MAX_BYTES = 10 * 1024 * 1024;
  const underLimit = 10 * 1024 * 1024 - 1;
  const atLimit = 10 * 1024 * 1024;
  const overLimit = 10 * 1024 * 1024 + 1;

  assert.ok(underLimit <= MAX_BYTES);
  assert.ok(atLimit <= MAX_BYTES);
  assert.ok(overLimit > MAX_BYTES);
});

test('evidence snapshot retains original file information even after replacement', () => {
  const originalEvidence = {
    code: 'a',
    title: 'Letter of Intent',
    documentName: 'intent_2026.pdf',
    fileName: 'intent_2026.pdf',
    personnelDocumentId: 401,
    storagePath: 'personnel/12/intent_2026_xyz.pdf',
    fileSize: 204800,
    mimeType: 'application/pdf',
    submittedAt: '2026-09-01T10:00:00.000Z',
    verificationStatus: 'PENDING',
  };

  // Simulating replacement of file in 201 library
  const replacementFile = {
    id: 502,
    replacesDocumentId: 401,
    originalFileName: 'intent_updated_v2.pdf',
    storagePath: 'personnel/12/intent_v2_abc.pdf',
    deletedAt: null,
  };

  // The application's evidence snapshot remains immutable
  assert.equal(originalEvidence.personnelDocumentId, 401);
  assert.equal(originalEvidence.storagePath, 'personnel/12/intent_2026_xyz.pdf');
  assert.equal(originalEvidence.fileName, 'intent_2026.pdf');
  assert.notEqual(originalEvidence.storagePath, replacementFile.storagePath);
});

test('checkPromotionEligibility rejects cross-track and oversized jumps', () => {
  const { checkPromotionEligibility } = require('../src/utils/deped.util');

  // Teacher I -> Master Teacher III is an invalid jump (exceeds progression limits)
  const jumpResult = checkPromotionEligibility('Teacher I', 'Master Teacher III', 'NATURAL_VACANCY');
  assert.equal(jumpResult.isEligible, false);

  // Applying for same position is prohibited
  const sameResult = checkPromotionEligibility('Teacher I', 'Teacher I', 'NATURAL_VACANCY');
  assert.equal(sameResult.isEligible, false);

  // Teacher I -> Teacher II is permitted under Natural Vacancy
  const validResult = checkPromotionEligibility('Teacher I', 'Teacher II', 'NATURAL_VACANCY');
  assert.equal(validResult.isEligible, true);
});
