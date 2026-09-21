require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { CONFIGURABLE_DOCUMENT_TYPES } = require('../src/controllers/personnel-documents.controller');
const { ANNEX_C_REQUIREMENTS } = require('../src/utils/annex-c.util');

const byAnnexCode = code => CONFIGURABLE_DOCUMENT_TYPES.filter(t => t.annexCCode === code);

test('every mandatory Annex C item has a dedicated document type', () => {
  const uncovered = ANNEX_C_REQUIREMENTS
    .filter(item => item.isMandatory && byAnnexCode(item.code).length === 0)
    .map(item => `(${item.code}) ${item.title}`);
  assert.deepEqual(
    uncovered, [],
    'a mandatory requirement with no matching type can only be filed as OTHER, ' +
      'which leaves AO II verifying a stack of identically labelled documents',
  );
});

test('every Annex C item maps to at least one document type', () => {
  const uncovered = ANNEX_C_REQUIREMENTS
    .filter(item => byAnnexCode(item.code).length === 0)
    .map(item => item.code);
  assert.deepEqual(uncovered, []);
});

test('the Personal Data Sheet is its own type, not a resume', () => {
  const pds = CONFIGURABLE_DOCUMENT_TYPES.find(t => t.id === 'PDS');
  assert.ok(pds, 'CS Form 212 is mandatory under Annex C (b) and needs its own type');
  assert.match(pds.name, /CS Form 212/);

  const resume = CONFIGURABLE_DOCUMENT_TYPES.find(t => t.id === 'RESUME_CV');
  assert.ok(resume);
  assert.ok(
    !/\bPDS\b|Personal Data Sheet/i.test(resume.description.replace(/does not replace the Personal Data Sheet[^.]*\./i, '')),
    'a resume must not be presented as an acceptable PDS substitute',
  );
});

test('only documents that genuinely lapse are marked as expiring', () => {
  const expiring = CONFIGURABLE_DOCUMENT_TYPES.filter(t => t.supportsExpiration).map(t => t.id).sort();
  // Clearances, medical certificates and IDs lapse. A certificate of completion
  // does not: the training happened and the certificate is permanent evidence.
  assert.deepEqual(expiring, ['GOV_ID', 'LICENSE', 'MED_CERT', 'NBI_CLEARANCE', 'POLICE_CLEARANCE']);
});

test('document type ids are unique and stable', () => {
  const ids = CONFIGURABLE_DOCUMENT_TYPES.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id would make uploads ambiguous');
  // Ids already written to stored documents must not be renamed.
  for (const id of ['GOV_ID', 'BIRTH_CERT', 'DIPLOMA', 'TOR', 'COE', 'NBI_CLEARANCE',
                    'POLICE_CLEARANCE', 'MED_CERT', 'TRAINING_CERT', 'LICENSE', 'RESUME_CV', 'OTHER']) {
    assert.ok(ids.includes(id), `${id} is referenced by documents already stored and cannot be removed`);
  }
});

test('every type carries the fields the clients render', () => {
  for (const t of CONFIGURABLE_DOCUMENT_TYPES) {
    assert.ok(t.id && t.name && t.description && t.category, `incomplete definition: ${t.id}`);
    assert.equal(typeof t.supportsExpiration, 'boolean');
  }
});
