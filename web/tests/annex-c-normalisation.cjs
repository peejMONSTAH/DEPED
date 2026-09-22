const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, name);
const { normaliseAnnexCItem } = require('../src/pages/personnel/checklistData.ts');

// The web checklist and the Flutter app spell the same three fields
// differently, and the backend stores the object exactly as it is handed over.
// Both readers previously understood only the web spelling, so an AO II opening
// an application submitted from a phone was told "No document attached by
// applicant" against all eleven items -- while the record held every one of
// them. The applicant reopening their own checklist saw the same nothing.
//
// The mobile fixture below is copied verbatim from
// promotion_applications.score_details_json for APP-2026-7011.

const MOBILE_ITEM = {
  code: 'a',
  title: 'Letter of Intent',
  remarks: null,
  fileName: 'Scanned_Doc_1790059439453.pdf',
  fileSize: 967595,
  mimeType: 'application/pdf',
  description: 'Letter of intent addressed to the Head of Office or highest human resource officer indicating position & item number',
  isMandatory: true,
  isSubmitted: true,
  uploadedFileUrl: '/api/v1/personnel/documents/18/file',
  existingDocumentId: 18,
};

const WEB_ITEM = {
  code: 'a',
  title: 'Letter of Intent',
  isMandatory: true,
  submitted: true,
  documentName: 'letter-of-intent.pdf',
  personnelDocumentId: 42,
  uploadedFileUrl: '/api/v1/personnel/documents/42/file',
  fileSize: 1234,
  remarks: '',
};

test('an application submitted from the phone reads as attached', () => {
  const item = normaliseAnnexCItem(MOBILE_ITEM);
  assert.equal(item.submitted, true, 'isSubmitted must count as submitted');
  assert.equal(item.documentName, 'Scanned_Doc_1790059439453.pdf', 'fileName must surface as the document name');
  assert.equal(item.personnelDocumentId, 18, 'existingDocumentId must surface as the id the View link needs');
  assert.equal(item.uploadedFileUrl, '/api/v1/personnel/documents/18/file');
});

test('an application submitted from the web still reads as attached', () => {
  const item = normaliseAnnexCItem(WEB_ITEM);
  assert.equal(item.submitted, true);
  assert.equal(item.documentName, 'letter-of-intent.pdf');
  assert.equal(item.personnelDocumentId, 42);
});

test('an unattached item is not reported as attached', () => {
  const item = normaliseAnnexCItem({ code: 'd', title: 'Certificate of Eligibility', isMandatory: false });
  assert.equal(item.submitted, false);
  assert.equal(item.documentName, undefined);
  assert.equal(item.personnelDocumentId, undefined);
});

test('an id or filename alone is enough evidence of an attachment', () => {
  // A flag lost in a round trip must not hide a document that is plainly there.
  assert.equal(normaliseAnnexCItem({ code: 'e', existingDocumentId: 7 }).submitted, true);
  assert.equal(normaliseAnnexCItem({ code: 'f', fileName: 'tor.pdf' }).submitted, true);
});

test('a non-numeric document id is not passed to the View link', () => {
  // The link builds a URL from this; a string or null would produce
  // /personnel/documents/undefined/file and a confusing 404.
  const item = normaliseAnnexCItem({ code: 'g', isSubmitted: true, existingDocumentId: null });
  assert.equal(item.personnelDocumentId, undefined);
});

test('a missing or malformed item does not throw', () => {
  assert.equal(normaliseAnnexCItem(null), null);
  assert.equal(normaliseAnnexCItem(undefined), null);
  assert.equal(normaliseAnnexCItem('not an object'), null);
});
