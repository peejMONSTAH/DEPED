require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CONFIGURABLE_DOCUMENT_TYPES,
  BASELINE_REQUIRED_DOCUMENTS,
} = require('../src/controllers/personnel-documents.controller');
const {
  generateDocumentAccessToken,
  verifyDocumentAccessToken,
} = require('../src/utils/jwt.util');

test('baseline required documents are defined for all personnel tracks', () => {
  assert.ok(BASELINE_REQUIRED_DOCUMENTS.TEACHING_PERSONNEL, 'TEACHING_PERSONNEL track must have baseline requirements');
  assert.ok(BASELINE_REQUIRED_DOCUMENTS.NON_TEACHING_PERSONNEL, 'NON_TEACHING_PERSONNEL track must have baseline requirements');
  assert.ok(BASELINE_REQUIRED_DOCUMENTS.DEFAULT, 'DEFAULT fallback track must have baseline requirements');

  // Teaching personnel requires PRC License
  assert.ok(BASELINE_REQUIRED_DOCUMENTS.TEACHING_PERSONNEL.includes('LICENSE'));
  assert.ok(BASELINE_REQUIRED_DOCUMENTS.TEACHING_PERSONNEL.includes('PDS'));

  // Non-teaching personnel requires CSC Eligibility
  assert.ok(BASELINE_REQUIRED_DOCUMENTS.NON_TEACHING_PERSONNEL.includes('CSC_ELIGIBILITY'));
  assert.ok(BASELINE_REQUIRED_DOCUMENTS.NON_TEACHING_PERSONNEL.includes('PDS'));
});

test('all baseline required document types exist in configurable types', () => {
  const knownTypeIds = new Set(CONFIGURABLE_DOCUMENT_TYPES.map(t => t.id));
  for (const [track, list] of Object.entries(BASELINE_REQUIRED_DOCUMENTS)) {
    for (const typeId of list) {
      assert.ok(
        knownTypeIds.has(typeId),
        `Track ${track} references unknown document type ${typeId}`
      );
    }
  }
});

test('generateDocumentAccessToken produces valid signed token verifiable by verifyDocumentAccessToken', () => {
  const payload = {
    userId: 42,
    email: 'teacher@deped.gov.ph',
    role: 'TEACHING_PERSONNEL',
    documentId: 101,
    docType: 'personnel',
    pwdv: 'hash-version-xyz',
  };

  const token = generateDocumentAccessToken(payload);
  assert.ok(typeof token === 'string' && token.length > 20);

  const decoded = verifyDocumentAccessToken(token);
  assert.equal(decoded.userId, 42);
  assert.equal(decoded.email, 'teacher@deped.gov.ph');
  assert.equal(decoded.documentId, 101);
  assert.equal(decoded.docType, 'personnel');
  assert.equal(decoded.type, 'DOCUMENT_VIEW');
  assert.equal(decoded.pwdv, 'hash-version-xyz');
});

test('verifyDocumentAccessToken rejects tampered tokens or invalid token type', () => {
  const payload = {
    userId: 42,
    email: 'teacher@deped.gov.ph',
    role: 'TEACHING_PERSONNEL',
    documentId: 101,
    docType: 'personnel',
    pwdv: 'hash-version-xyz',
  };

  const token = generateDocumentAccessToken(payload);
  const tampered = token.slice(0, -5) + 'abcde';

  assert.throws(() => {
    verifyDocumentAccessToken(tampered);
  });
});
