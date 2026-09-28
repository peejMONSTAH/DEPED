require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { precheckDocument, parseLooseDate } = require('../src/utils/document-precheck.util');

const person = { firstName: 'Marvin Jay', lastName: 'Escovidal' };
const today = new Date(2026, 8, 29);
const pad = ' Republic of the Philippines Department of Education Region XII Division of Koronadal City official document copy issued for records purposes only';

const byKey = (r, key) => r.checks.find(c => c.key === key);

test('a PRC license for the right person, valid for years, passes all three checks', () => {
  const text = `PROFESSIONAL REGULATION COMMISSION Registration No. 1234567 ESCOVIDAL MARVIN JAY Professional Teacher Valid Until 03/15/2029${pad}`;
  const r = precheckDocument(text, 'PRC License', person, today);
  assert.equal(byKey(r, 'type').state, 'ok');
  assert.equal(byKey(r, 'name').state, 'ok');
  assert.equal(byKey(r, 'validity').state, 'ok');
  assert.match(byKey(r, 'validity').label, /March 15, 2029/);
  assert.ok(r.facts.includes('License no. 1234567'));
});

test('an expired license is flagged', () => {
  const text = `Professional Regulation Commission ESCOVIDAL MARVIN Expiry Date: January 5, 2025${pad}`;
  assert.equal(byKey(precheckDocument(text, 'PRC License', person, today), 'validity').state, 'warn');
});

test('the wrong document in the slot is named', () => {
  const text = `CERTIFICATE OF LIVE BIRTH Philippine Statistics Authority child ESCOVIDAL MARVIN JAY${pad}`;
  const r = precheckDocument(text, 'PRC License', person, today);
  assert.equal(byKey(r, 'type').state, 'warn');
  assert.match(byKey(r, 'type').label, /PSA Birth Certificate, not a PRC license/);
});

test('someone else\'s document is flagged; one OCR slip in the name is tolerated', () => {
  const other = precheckDocument(`Transcript of Records SANTOS MARIA CLARA${pad}`, 'Transcript of Records', person, today);
  assert.equal(byKey(other, 'name').state, 'warn');
  const slip = precheckDocument(`Transcript of Records ESC0VIDAL MARVIN${pad}`, 'Transcript of Records', person, today);
  assert.equal(byKey(slip, 'name').state, 'ok');
});

test('IPCRF rating, training hours and degree are read as facts', () => {
  const r = precheckDocument(`IPCRF Final Rating 4.625 Very Satisfactory ESCOVIDAL MARVIN JAY${pad}`, 'IPCRF', person, today);
  assert.ok(r.facts.includes('Rating 4.625 (Very Satisfactory)'));
  const t = precheckDocument(`Certificate of Participation ESCOVIDAL MARVIN JAY 24 hours seminar${pad}`, 'Training certificate', person, today);
  assert.ok(t.facts.includes('24 training hours'));
  const d = precheckDocument(`Transcript of Records ESCOVIDAL MARVIN JAY Bachelor of Secondary Education major in English${pad}`, 'TOR', person, today);
  assert.ok(d.facts.includes('Bachelor of Secondary Education'));
});

test('an unreadable scan asks for a manual check and never passes', () => {
  const r = precheckDocument('~~ ## ..', 'PRC License', person, today);
  assert.equal(r.readable, false);
  assert.ok(r.checks.every(c => c.state !== 'ok'));
});

test('dates in the common Philippine formats parse', () => {
  assert.equal(parseLooseDate('2027-03-05').getMonth(), 2);
  assert.equal(parseLooseDate('03/05/2027').getDate(), 5);
  assert.equal(parseLooseDate('Mar. 5, 2027').getFullYear(), 2027);
  assert.equal(parseLooseDate('5 March 2027').getMonth(), 2);
});

test('the printed expiry date and a mismatched document are reported for the upload step', () => {
  const lic = precheckDocument(`Professional Regulation Commission ESCOVIDAL MARVIN Valid Until 03/15/2029${pad}`, 'PRC License', person, today);
  assert.equal(lic.expiresOn, '2029-03-15');
  assert.equal(lic.looksLike, undefined);
  const wrong = precheckDocument(`CERTIFICATE OF LIVE BIRTH Philippine Statistics Authority ESCOVIDAL${pad}`, 'PRC License', person, today);
  assert.equal(wrong.looksLike, 'PSA Birth Certificate');
});

test('the upload handler starts the background check after answering', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/controllers/personnel-documents.controller.ts'), 'utf8');
  assert.match(src, /sendCreated\(res, toApiShape\(record\)\);[\s\S]{0,200}void afterPersonnelUpload\(record\.id\)/);
});
