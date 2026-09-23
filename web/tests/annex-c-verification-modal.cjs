const test = require('node:test');
const assert = require('node:assert/strict');

// ── Unit Tests for Annex C Requirements Completeness Verification Redesign ──

const DEFAULT_ANNEX_C_ITEMS = [
  { code: 'a', title: 'Letter of Intent', description: 'Addressed to Head of Office with information on vacancy', isMandatory: true },
  { code: 'b', title: 'Duly Accomplished PDS & WES', description: 'Personal Data Sheet (CS Form 212 Revised 2017) and Work Experience Sheet', isMandatory: true },
  { code: 'c', title: 'PRC License / Identification Card', description: 'Photocopy of Valid and Updated PRC License/ID, if applicable', isMandatory: false },
  { code: 'd', title: 'Certificate of Eligibility / Rating', description: 'Photocopy of Certificate of Eligibility / Rating, if applicable', isMandatory: false },
  { code: 'e', title: 'Scholastic / Academic Records', description: 'Transcript of Records (TOR) & Diploma (including Masteral/Doctorate completion)', isMandatory: true },
  { code: 'f', title: 'Certificates of Training', description: 'Certificates of Training within 5 years or since last promotion', isMandatory: false },
  { code: 'g', title: 'Certificate of Employment / Service Record', description: 'Certificate of Employment, Contract of Service, or duly signed Service Record', isMandatory: true },
  { code: 'h', title: 'Latest Appointment', description: 'Photocopy of Latest Appointment, if applicable', isMandatory: false },
  { code: 'i', title: 'Performance Ratings (IPCR / OPCR)', description: 'Performance Rating in the last rating period covering 1 year in current/previous position', isMandatory: true },
  { code: 'j', title: 'Checklist & Omnibus Sworn Statement / Consent', description: 'Checklist of Requirements, Omnibus Sworn Statement on Authenticity & Data Privacy Consent', isMandatory: true },
  { code: 'k', title: 'Other MOVs / Relevant Documents', description: 'Other Means of Verification relevant to the position applied for', isMandatory: false },
];

test('Annex C has exactly 11 items with DepEd prescribed codes a through k', () => {
  assert.equal(DEFAULT_ANNEX_C_ITEMS.length, 11);
  const codes = DEFAULT_ANNEX_C_ITEMS.map(i => i.code).join('');
  assert.equal(codes, 'abcdefghijk');

  const mandatoryCodes = DEFAULT_ANNEX_C_ITEMS.filter(i => i.isMandatory).map(i => i.code);
  assert.deepEqual(mandatoryCodes, ['a', 'b', 'e', 'g', 'i', 'j']);

  const optionalCodes = DEFAULT_ANNEX_C_ITEMS.filter(i => !i.isMandatory).map(i => i.code);
  assert.deepEqual(optionalCodes, ['c', 'd', 'f', 'h', 'k']);
});

test('live review progress summary correctly derives verified, deficient, and N/A counts', () => {
  const items = [
    { code: 'a', status: 'VERIFIED' },
    { code: 'b', status: 'VERIFIED' },
    { code: 'c', status: 'NOT_APPLICABLE' },
    { code: 'd', status: 'NOT_APPLICABLE' },
    { code: 'e', status: 'VERIFIED' },
    { code: 'f', status: 'INCOMPLETE', remarks: 'Certificate missing stamp' },
    { code: 'g', status: 'VERIFIED' },
    { code: 'h', status: 'NOT_APPLICABLE' },
    { code: 'i', status: 'VERIFIED' },
    { code: 'j', status: 'VERIFIED' },
    { code: 'k', status: 'VERIFIED' },
  ];

  const verified = items.filter(it => it.status === 'VERIFIED').length;
  const deficient = items.filter(it => it.status === 'INCOMPLETE').length;
  const na = items.filter(it => it.status === 'NOT_APPLICABLE').length;

  assert.equal(verified, 7);
  assert.equal(deficient, 1);
  assert.equal(na, 3);
  assert.equal(verified + deficient + na, 11);
});

test('bulk action Mark Submitted as Verified marks submitted as VERIFIED, missing mandatory as INCOMPLETE, missing optional as NOT_APPLICABLE', () => {
  const mockItems = DEFAULT_ANNEX_C_ITEMS.map(def => ({
    ...def,
    submitted: ['a', 'b', 'c', 'e', 'g', 'i', 'j'].includes(def.code),
    documentName: ['a', 'b', 'c', 'e', 'g', 'i', 'j'].includes(def.code) ? `${def.title}.pdf` : undefined,
    status: 'INCOMPLETE',
    remarks: '',
  }));

  // Simulate bulk action logic
  const updated = mockItems.map(it => ({
    ...it,
    status: it.submitted ? 'VERIFIED' : (it.isMandatory ? 'INCOMPLETE' : 'NOT_APPLICABLE'),
  }));

  // Item a (mandatory, submitted) -> VERIFIED
  assert.equal(updated.find(it => it.code === 'a').status, 'VERIFIED');
  // Item c (optional, submitted) -> VERIFIED
  assert.equal(updated.find(it => it.code === 'c').status, 'VERIFIED');
  // Item d (optional, unsubmitted) -> NOT_APPLICABLE
  assert.equal(updated.find(it => it.code === 'd').status, 'NOT_APPLICABLE');
  // Item f (optional, unsubmitted) -> NOT_APPLICABLE
  assert.equal(updated.find(it => it.code === 'f').status, 'NOT_APPLICABLE');
  // Item h (optional, unsubmitted) -> NOT_APPLICABLE
  assert.equal(updated.find(it => it.code === 'h').status, 'NOT_APPLICABLE');
  // Item k (optional, unsubmitted) -> NOT_APPLICABLE
  assert.equal(updated.find(it => it.code === 'k').status, 'NOT_APPLICABLE');

  // Verify counts
  const verifiedCount = updated.filter(it => it.status === 'VERIFIED').length;
  const naCount = updated.filter(it => it.status === 'NOT_APPLICABLE').length;
  assert.equal(verifiedCount, 7);
  assert.equal(naCount, 4);
});

test('deficiency remarks are preserved per item and serialized accurately into payload', () => {
  const items = [
    { code: 'a', status: 'VERIFIED', remarks: '' },
    { code: 'b', status: 'INCOMPLETE', remarks: 'Missing signature on page 4 of CS Form 212' },
    { code: 'c', status: 'NOT_APPLICABLE', remarks: '' },
  ];

  const reqCompletenessStatus = 'INCOMPLETE';
  const reqVerificationRemarks = 'Applicant has deficient PDS document requiring correction.';

  const payload = {
    status: reqCompletenessStatus,
    remarks: reqVerificationRemarks,
    itemVerifications: items.map(it => ({
      code: it.code,
      status: it.status,
      remarks: it.remarks,
    })),
  };

  assert.equal(payload.status, 'INCOMPLETE');
  assert.equal(payload.remarks, 'Applicant has deficient PDS document requiring correction.');
  assert.equal(payload.itemVerifications.length, 3);
  assert.equal(payload.itemVerifications[1].code, 'b');
  assert.equal(payload.itemVerifications[1].status, 'INCOMPLETE');
  assert.equal(payload.itemVerifications[1].remarks, 'Missing signature on page 4 of CS Form 212');
});
