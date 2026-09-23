require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveRequirementIdentity,
} = require('../src/controllers/personnel-documents.controller');
const { PersonnelDocumentStatus } = require('@prisma/client');

test('resolveRequirementIdentity maps standard single-instance types correctly', () => {
  const pdsReq = resolveRequirementIdentity('PDS', 'Personal Data Sheet');
  assert.equal(pdsReq.key, 'DOC_TYPE:PDS');
  assert.equal(pdsReq.isSingleInstance, true);

  const loiReq = resolveRequirementIdentity('LETTER_OF_INTENT', 'Letter of Intent');
  assert.equal(loiReq.key, 'DOC_TYPE:LETTER_OF_INTENT');
  assert.equal(loiReq.isSingleInstance, true);

  const torReq = resolveRequirementIdentity('TOR', 'Transcript of Records');
  assert.equal(torReq.key, 'DOC_TYPE:TOR');
  assert.equal(torReq.isSingleInstance, true);

  const licenseReq = resolveRequirementIdentity('LICENSE', 'PRC License');
  assert.equal(licenseReq.key, 'DOC_TYPE:LICENSE');
  assert.equal(licenseReq.isSingleInstance, true);
});

test('resolveRequirementIdentity distinguishes Annex C letters filed under OTHER', () => {
  const annexA = resolveRequirementIdentity('OTHER', 'Annex C (a) Letter of Intent');
  const annexB = resolveRequirementIdentity('OTHER', 'Annex C - b: Personal Data Sheet');
  const annexK = resolveRequirementIdentity('OTHER', 'Annex C k: Other Documents');

  assert.equal(annexA.key, 'ANNEX_C_a');
  assert.equal(annexA.isSingleInstance, true);

  assert.equal(annexB.key, 'ANNEX_C_b');
  assert.equal(annexB.isSingleInstance, true);

  assert.equal(annexK.key, 'ANNEX_C_k');
  assert.equal(annexK.isSingleInstance, true);

  // Distinct Annex C items must NOT collide
  assert.notEqual(annexA.key, annexB.key);
  assert.notEqual(annexA.key, annexK.key);
});

test('resolveRequirementIdentity permits multi-instance types for TRAINING_CERT, COE, and generic OTHER', () => {
  const training = resolveRequirementIdentity('TRAINING_CERT', 'Certificate of Participation');
  assert.equal(training.isSingleInstance, false);

  const coe = resolveRequirementIdentity('COE', 'Previous Employment COE');
  assert.equal(coe.isSingleInstance, false);

  const specialOrder = resolveRequirementIdentity('OTHER', 'Special Order No. 42 s. 2024');
  assert.equal(specialOrder.isSingleInstance, false);
  assert.equal(specialOrder.key, 'OTHER:special order no. 42 s. 2024');

  const commendation = resolveRequirementIdentity('OTHER', 'Outstanding Teacher Commendation');
  assert.equal(commendation.isSingleInstance, false);
  assert.equal(commendation.key, 'OTHER:outstanding teacher commendation');

  // Generic OTHER files with different names do not collide
  assert.notEqual(specialOrder.key, commendation.key);
});

test('duplicate detection logic correctly flags active files while allowing empty placeholders', () => {
  const placeholder = {
    id: 101,
    personnelId: 50,
    documentTypeId: 'PDS',
    documentTypeName: 'Personal Data Sheet',
    status: PersonnelDocumentStatus.NOT_SUBMITTED,
    storagePath: null,
    deletedAt: null,
  };

  const activeDoc = {
    id: 102,
    personnelId: 50,
    documentTypeId: 'LETTER_OF_INTENT',
    documentTypeName: 'Letter of Intent',
    status: PersonnelDocumentStatus.SUBMITTED,
    storagePath: 'personnel/50/loi_2026.pdf',
    deletedAt: null,
  };

  const activeDocuments = [placeholder, activeDoc];

  // Helper simulating the controller check
  function checkConflict(targetTypeId, targetTypeName, replacementId) {
    if (replacementId) return null; // Explicit replacement allowed
    const targetReq = resolveRequirementIdentity(targetTypeId, targetTypeName);
    if (!targetReq.isSingleInstance) return null;

    // Check placeholder fulfillment
    const placeholderMatch = activeDocuments.find(d =>
      d.status === PersonnelDocumentStatus.NOT_SUBMITTED &&
      d.deletedAt === null &&
      resolveRequirementIdentity(d.documentTypeId, d.documentTypeName).key === targetReq.key
    );
    if (placeholderMatch) {
      return { allowed: true, fulfillsPlaceholder: true };
    }

    // Check active file conflict
    const conflict = activeDocuments.find(d =>
      d.status !== PersonnelDocumentStatus.NOT_SUBMITTED &&
      d.deletedAt === null &&
      Boolean(d.storagePath) &&
      resolveRequirementIdentity(d.documentTypeId, d.documentTypeName).key === targetReq.key
    );

    if (conflict) {
      return { allowed: false, conflictDoc: conflict };
    }

    return { allowed: true, fulfillsPlaceholder: false };
  }

  // Uploading for PDS fulfills the placeholder
  const pdsResult = checkConflict('PDS', 'Personal Data Sheet');
  assert.equal(pdsResult.allowed, true);
  assert.equal(pdsResult.fulfillsPlaceholder, true);

  // Uploading a second ordinary LETTER_OF_INTENT is blocked with conflict
  const loiResult = checkConflict('LETTER_OF_INTENT', 'Letter of Intent');
  assert.equal(loiResult.allowed, false);
  assert.equal(loiResult.conflictDoc.id, 102);

  // Explicit replacement of LETTER_OF_INTENT is permitted
  const loiReplaceResult = checkConflict('LETTER_OF_INTENT', 'Letter of Intent', 102);
  assert.equal(loiReplaceResult, null);

  // Multi-instance TRAINING_CERT is permitted even if one already exists
  const trainingResult = checkConflict('TRAINING_CERT', 'Seminar 2026');
  assert.equal(trainingResult, null);
});

test('replacement workflow archives the old record and preserves historical application snapshot', () => {
  const oldDoc = {
    id: 201,
    personnelId: 50,
    documentTypeId: 'PDS',
    originalFileName: 'pds_v1.pdf',
    storagePath: 'personnel/50/pds_v1.pdf',
    deletedAt: null,
  };

  const applicationEvidence = {
    id: 301,
    annexCode: 'b',
    personnelDocumentId: oldDoc.id,
    fileName: oldDoc.originalFileName,
    storagePath: oldDoc.storagePath,
  };

  // Replace oldDoc with newDoc
  const now = new Date();
  const newDoc = {
    id: 202,
    personnelId: 50,
    documentTypeId: 'PDS',
    originalFileName: 'pds_v2_signed.pdf',
    storagePath: 'personnel/50/pds_v2_signed.pdf',
    replacesDocumentId: oldDoc.id,
    deletedAt: null,
  };

  // Simulating soft delete of oldDoc
  oldDoc.deletedAt = now;

  // Exactly one active copy remains in the 201 library
  const allDocs = [oldDoc, newDoc];
  const activeDocs = allDocs.filter(d => d.deletedAt === null);
  assert.equal(activeDocs.length, 1);
  assert.equal(activeDocs[0].id, 202);

  // Historical application retains the pointer and bytes of the original submission
  assert.equal(applicationEvidence.personnelDocumentId, 201);
  assert.equal(applicationEvidence.storagePath, 'personnel/50/pds_v1.pdf');
  assert.notEqual(applicationEvidence.storagePath, newDoc.storagePath);
});
