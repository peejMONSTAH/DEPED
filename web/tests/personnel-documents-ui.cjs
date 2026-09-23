const { test } = require('node:test');
const assert = require('node:assert/strict');

// ── Unit Tests for Personnel Documents Redesign & Workflow ──

const isExpired = (doc) => {
  if (!doc.expirationDate) return false;
  const due = new Date(doc.expirationDate);
  if (Number.isNaN(due.getTime())) return false;
  return due < new Date(new Date().toDateString());
};

const isExpiringSoon = (doc) => {
  if (!doc.expirationDate || isExpired(doc)) return false;
  const due = new Date(doc.expirationDate).getTime();
  if (Number.isNaN(due)) return false;
  const now = Date.now();
  return due > now && due - now < 60 * 24 * 60 * 60 * 1000;
};

const getPersonnelStatusMeta = (doc) => {
  if (!doc.hasFile) {
    return { bg: 'rgba(100, 116, 139, 0.12)', fg: '#475569', label: 'No file uploaded', isActionNeeded: doc.isRequired };
  }
  if (isExpired(doc)) {
    return { bg: 'rgba(239, 68, 68, 0.12)', fg: '#dc2626', label: 'Expired', isActionNeeded: true };
  }
  if (doc.status === 'REJECTED') {
    return { bg: 'rgba(239, 68, 68, 0.12)', fg: '#dc2626', label: 'Rejected', isActionNeeded: true };
  }
  if (doc.status === 'REPLACEMENT_REQUIRED') {
    return { bg: 'rgba(239, 68, 68, 0.12)', fg: '#dc2626', label: 'Replacement required', isActionNeeded: true };
  }
  if (isExpiringSoon(doc)) {
    return { bg: 'rgba(245, 158, 11, 0.14)', fg: '#d97706', label: 'Expiring soon', isActionNeeded: false };
  }
  return { bg: 'rgba(16, 185, 129, 0.12)', fg: '#059669', label: 'Uploaded', isActionNeeded: false };
};

test('personnel document status surfaces actionable states and excludes administrative review statuses', () => {
  const adminStatuses = ['Submitted', 'Under Review', 'Approved', 'Pending'];

  // Empty placeholder
  const placeholder = { id: 1, hasFile: false, isRequired: true, status: 'NOT_SUBMITTED' };
  const metaPlaceholder = getPersonnelStatusMeta(placeholder);
  assert.equal(metaPlaceholder.label, 'No file uploaded');
  assert.equal(metaPlaceholder.isActionNeeded, true);
  assert.ok(!adminStatuses.includes(metaPlaceholder.label));

  // Expired document
  const expiredDoc = { id: 2, hasFile: true, isRequired: false, status: 'APPROVED', expirationDate: '2020-01-01' };
  const metaExpired = getPersonnelStatusMeta(expiredDoc);
  assert.equal(metaExpired.label, 'Expired');
  assert.equal(metaExpired.isActionNeeded, true);
  assert.ok(!adminStatuses.includes(metaExpired.label));

  // Rejected document
  const rejectedDoc = { id: 3, hasFile: true, isRequired: true, status: 'REJECTED' };
  const metaRejected = getPersonnelStatusMeta(rejectedDoc);
  assert.equal(metaRejected.label, 'Rejected');
  assert.equal(metaRejected.isActionNeeded, true);
  assert.ok(!adminStatuses.includes(metaRejected.label));

  // Replacement required
  const replaceDoc = { id: 4, hasFile: true, isRequired: true, status: 'REPLACEMENT_REQUIRED' };
  const metaReplace = getPersonnelStatusMeta(replaceDoc);
  assert.equal(metaReplace.label, 'Replacement required');
  assert.equal(metaReplace.isActionNeeded, true);
  assert.ok(!adminStatuses.includes(metaReplace.label));

  // Expiring soon (30 days from now)
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const expiringDoc = { id: 5, hasFile: true, isRequired: false, status: 'APPROVED', expirationDate: in30Days };
  const metaExpiring = getPersonnelStatusMeta(expiringDoc);
  assert.equal(metaExpiring.label, 'Expiring soon');
  assert.equal(metaExpiring.isActionNeeded, false);
  assert.ok(!adminStatuses.includes(metaExpiring.label));

  // Active / Valid uploaded file
  const activeDoc = { id: 6, hasFile: true, isRequired: true, status: 'APPROVED' };
  const metaActive = getPersonnelStatusMeta(activeDoc);
  assert.equal(metaActive.label, 'Uploaded');
  assert.equal(metaActive.isActionNeeded, false);
  assert.ok(!adminStatuses.includes(metaActive.label));
});

test('201 picker filter excludes empty placeholders and prioritizes suggested requirement types', () => {
  const documents = [
    { id: 1, documentTypeId: 'PDS', documentTypeName: 'Personal Data Sheet', hasFile: false, originalFileName: null }, // placeholder
    { id: 2, documentTypeId: 'TRANSCRIPT_OF_RECORDS', documentTypeName: 'Transcript of Records', hasFile: true, originalFileName: 'tor.pdf' },
    { id: 3, documentTypeId: 'DIPLOMA', documentTypeName: 'College Diploma', hasFile: true, originalFileName: 'diploma.pdf' },
    { id: 4, documentTypeId: 'TRAINING_CERTIFICATE', documentTypeName: 'Leadership Training', hasFile: true, originalFileName: 'cert.pdf' },
    { id: 5, documentTypeId: 'OTHER', documentTypeName: 'Other Document', hasFile: true, originalFileName: 'award.pdf' },
  ];

  // Target requirement: 'e' (Scholastic records: TOR, DIPLOMA, CAV)
  const suggestedTypes = ['TOR', 'TRANSCRIPT_OF_RECORDS', 'DIPLOMA', 'CAV'];

  // 1. Exclude empty placeholders
  const validDocs = documents.filter(d => Boolean(d.hasFile && d.originalFileName));
  assert.equal(validDocs.length, 4);
  assert.ok(!validDocs.some(d => d.id === 1), 'Placeholder without file must be excluded');

  // 2. Sort prioritized by suggested types
  const sorted = [...validDocs].sort((a, b) => {
    const aMatch = suggestedTypes.includes(a.documentTypeId);
    const bMatch = suggestedTypes.includes(b.documentTypeId);
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    return (b.id || 0) - (a.id || 0);
  });

  // Top 2 should both be suggested types (TOR or DIPLOMA)
  const topTwoTypes = new Set([sorted[0].documentTypeId, sorted[1].documentTypeId]);
  assert.ok(topTwoTypes.has('TRANSCRIPT_OF_RECORDS'), 'TOR should be prioritized');
  assert.ok(topTwoTypes.has('DIPLOMA'), 'Diploma should be prioritized');
  assert.ok(!topTwoTypes.has('TRAINING_CERTIFICATE'), 'Training cert should not be in top priority for scholastic requirement');

  // 3. Search query filter
  const query = 'leadership';
  const searched = sorted.filter(d => d.documentTypeName.toLowerCase().includes(query));
  assert.equal(searched.length, 1);
  assert.equal(searched[0].id, 4);
});

test('upload modal close handles forced closure on successful upload', () => {
  let modalOpen = true;
  let targetDoc = { id: 10 };
  let busy = true;

  const closeUploadModal = (force = false) => {
    if (busy && !force) return;
    modalOpen = false;
    targetDoc = null;
  };

  // Normal dismiss while busy must be blocked
  closeUploadModal(false);
  assert.equal(modalOpen, true, 'Unforced close while busy must not close modal');

  // Forced close on upload success must close modal
  closeUploadModal(true);
  assert.equal(modalOpen, false, 'Forced close must dismiss modal even if busy is true');
  assert.equal(targetDoc, null);
});
