const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ── Unit Tests for DepEd Personnel Portal Redesign ──

const readWebSrc = (rel) => fs.readFileSync(path.join(__dirname, '../src', rel), 'utf8');

// Import or recreate the shared pure functions for node runtime testing
const {
  computeReadiness,
  resolveDocumentLifecycle,
  detectDuplicateHashes,
} = require('../src/models/documentStatus.ts');

const {
  isActiveTransaction,
  isCompletedTransaction,
  buildTransactionTimeline,
  getTransactionStageSummary,
} = require('../src/models/transactionState.ts');

test('Dashboard (Home) and Repository (My 201 Files) readiness counts match with single source of truth', () => {
  const sampleDocs = [
    { id: 1, documentTypeId: 'PDS', documentTypeName: 'Personal Data Sheet', hasFile: true, status: 'APPROVED' },
    { id: 2, documentTypeId: 'OATH', documentTypeName: 'Oath of Office', hasFile: true, status: 'VERIFIED' },
    { id: 3, documentTypeId: 'TOR', documentTypeName: 'Transcript of Records', hasFile: false, status: 'NOT_SUBMITTED', isRequired: true },
    { id: 4, documentTypeId: 'PRC', documentTypeName: 'PRC License', hasFile: true, status: 'REPLACEMENT_REQUIRED' },
    { id: 5, documentTypeId: 'IPCRF', documentTypeName: 'IPCRF 2024', hasFile: true, status: 'UNDER_REVIEW' },
    { id: 6, documentTypeId: 'CERT_TRAINING', documentTypeName: 'Training Certificate', hasFile: true, status: 'APPROVED' },
  ];

  const readiness = computeReadiness(sampleDocs);

  assert.equal(readiness.total, 6);
  // 201 files are not reviewed on their own: anything on file counts as uploaded.
  assert.equal(readiness.verified, 4); // 1, 2, 5, 6
  assert.equal(readiness.missing, 1);  // 3
  assert.equal(readiness.returned, 1); // 4
  assert.equal(readiness.underReview, 0);
  assert.equal(readiness.percent, 67); // 4 of 6
  assert.equal(readiness.statusLevel, 'critical'); // because returned > 0

  // Verify that both Home.tsx and MyDocuments.tsx invoke computeReadiness
  const homeSrc = readWebSrc('pages/personnel/Home.tsx');
  const myDocsSrc = readWebSrc('pages/personnel/MyDocuments.tsx');
  assert.match(homeSrc, /computeReadiness\(documents\)/);
  assert.match(myDocsSrc, /computeReadiness\(documents\)/);
});

test('Completed transactions are never classified as active transactions', () => {
  const completedStatuses = ['APPROVED', 'COMPLETED', 'REJECTED', 'ABANDONED', 'ARCHIVED'];
  const activeStatuses = ['DRAFT', 'PENDING_VALIDATION', 'FOR_APPROVAL', 'DEFICIENCY', 'ESCALATED'];

  for (const s of completedStatuses) {
    assert.equal(isActiveTransaction(s), false, `${s} must NOT be active`);
    assert.equal(isCompletedTransaction(s), true, `${s} must be completed`);
  }

  for (const s of activeStatuses) {
    assert.equal(isActiveTransaction(s), true, `${s} must be active`);
    assert.equal(isCompletedTransaction(s), false, `${s} must NOT be completed`);
  }

  // Check CurrentTransaction component strictly excludes approved/completed
  const currentTxSrc = readWebSrc('pages/personnel/components/CurrentTransaction.tsx');
  assert.match(currentTxSrc, /isActiveTransaction\(tx\.status\)/);

  // Applications page groups active work and history by the shared stage rules
  // (their behaviour is tested in workflow-stages.cjs).
  const myTxSrc = readWebSrc('pages/personnel/MyTransactions.tsx');
  assert.match(myTxSrc, /transactionStage\(/);
  assert.match(myTxSrc, /applicationStage\(/);
  assert.match(myTxSrc, /e\.stage\.done/);
});

test('API network failures show retryable error banners and never render as empty "No transactions" state', () => {
  const myTxSrc = readWebSrc('pages/personnel/MyTransactions.tsx');
  // Check that catch block sets error message and does not simply silence it
  assert.match(myTxSrc, /setError\(/);
  assert.match(myTxSrc, /role="alert"[\s\S]{0,200}Try again/, 'a failed load shows the error with a retry, not an empty list');

  // Check CareerRecord also uses AsyncState with onRetry
  const careerSrc = readWebSrc('pages/personnel/CareerRecord.tsx');
  assert.match(careerSrc, /<AsyncState/);
  assert.match(careerSrc, /onRetry=\{fetchServiceRecord\}/);
});

test('CareerRecord strictly removes all "Teacher I" fallbacks and "DB Synchronized" badges', () => {
  const careerSrc = readWebSrc('pages/personnel/CareerRecord.tsx');

  // Must NOT fall back to 'Teacher I'
  assert.doesNotMatch(careerSrc, /'Teacher I'/);
  assert.doesNotMatch(careerSrc, /Teacher I/);

  // Must NOT show 'DB Synchronized'
  assert.doesNotMatch(careerSrc, /DB Synchronized/);

  // Must show 'Verified by HRMO'
  assert.match(careerSrc, /Verified by HRMO/);

  // Must fallback safely to 'Not recorded'
  assert.match(careerSrc, /'Not recorded'/);
});

test('Verified, under review, and approved documents cannot be directly deleted', () => {
  const myDocsSrc = readWebSrc('pages/personnel/MyDocuments.tsx');

  // Verify deletion guard in handleDelete
  assert.match(myDocsSrc, /lifecycle === 'VERIFIED' \|\| lifecycle === 'UNDER_REVIEW'/);
  assert.match(myDocsSrc, /Official records that are verified or under active review cannot be deleted/);

  // Verify ActionMenu deletion item condition
  assert.match(myDocsSrc, /!isVerified && !isUnderReview/);
});

test('Transaction timeline maps chronological DepEd stages and branches on DEFICIENCY', () => {
  const deficiencyTx = {
    id: 101,
    status: 'DEFICIENCY',
    createdAt: '2026-09-01T08:00:00Z',
    validationDate: '2026-09-02T10:00:00Z',
    remarks: 'Clearance photocopy is blurred and signature is missing',
    resubmissionCount: 1,
    transactionType: { name: 'Reclassification Application' },
    uploadedDocuments: [
      { id: 201, fileName: 'prc_license.pdf', status: 'REPLACEMENT_REQUIRED' },
    ],
  };

  const timeline = buildTransactionTimeline(deficiencyTx);
  assert.ok(timeline.length >= 2);

  // Step 1: Submission
  assert.equal(timeline[0].status, 'COMPLETED');
  assert.match(timeline[0].description, /Submitted Reclassification Application/);

  // Step 2: Deficiency branch
  const deficiencyEvent = timeline.find(e => e.isDeficiencyBranch);
  assert.ok(deficiencyEvent, 'Must include deficiency branch event');
  assert.equal(deficiencyEvent.status, 'DEFICIENCY');
  assert.match(deficiencyEvent.remarks, /Clearance photocopy is blurred/);
  assert.deepEqual(deficiencyEvent.affectedDocuments, ['prc_license.pdf']);
  assert.equal(deficiencyEvent.remainingAttempts, 2); // 3 - 1 = 2
  assert.equal(deficiencyEvent.actionRequired.route, '/personnel/checklist?txId=101');
});

test('Duplicate file hash detection identifies identical documents attached to multiple requirements', () => {
  const docsWithDuplicates = [
    { id: 1, documentTypeId: 'TOR', documentTypeName: 'Transcript of Records', hasFile: true, fileHash: 'hash-abc-123' },
    { id: 2, documentTypeId: 'DIPLOMA', documentTypeName: 'College Diploma', hasFile: true, fileHash: 'hash-abc-123' }, // duplicate hash!
    { id: 3, documentTypeId: 'PDS', documentTypeName: 'Personal Data Sheet', hasFile: true, fileHash: 'hash-xyz-789' },
  ];

  const duplicates = detectDuplicateHashes(docsWithDuplicates);
  assert.equal(duplicates.size, 1);
  assert.ok(duplicates.has('hash-abc-123'));
  assert.deepEqual(duplicates.get('hash-abc-123'), ['Transcript of Records', 'College Diploma']);
});
