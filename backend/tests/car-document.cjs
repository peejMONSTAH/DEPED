require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PizZip = require('pizzip');

// The generator reads one cycle with its (scoped) applications; answer from a fixture.
let fixture = null;
const prismaPath = require.resolve('../src/config/prisma');
require.cache[prismaPath] = {
  id: prismaPath, filename: prismaPath, loaded: true,
  exports: { __esModule: true, default: { promotionCycle: { findUnique: async () => fixture } } },
};
const { CarDocumentService, CarDataIncompleteError, CarCycleNotFoundError, sanitizeFilename } = require('../src/services/car-document.service');

const verified = { requirementsCheck: { status: 'COMPLETE' } };
const teachingRating = { educationScore: 8, trainingScore: 7, experienceScore: 9, performanceScore: 27, ppstCoiScore: 20, ppstNcoiScore: 12, hrmoRemarks: 'Deliberated' };
const app = (id, first, last, details, extra = {}) => ({
  id, status: 'RANKED', finalRank: null, createdAt: new Date(), personnel: { firstName: first, lastName: last, employeeId: `EMP-${id}` },
  scoreDetailsJson: details, ...extra,
});
const cycle = (applications, rules = {}) => ({
  id: 7, name: 'Teacher III – Koronadal Central', endDate: new Date('2026-09-01'),
  rulesConfigurationJson: { track: 'TEACHING', targetPosition: 'Teacher III – Division', plantillaItemNumber: 'OSEC-T3-1', ...rules },
  promotionApplications: applications,
});

test('the CAR is a valid, non-empty Word file listing every deliberated candidate', async () => {
  fixture = cycle([
    app(1, 'Ana', 'Reyes', { ...verified, finalRating: teachingRating }),
    app(2, 'Ben', 'Cruz', { ...verified, finalRating: { ...teachingRating, educationScore: 10 } }),
  ]);
  const result = await CarDocumentService.generateCarDocument(7, {});
  assert.ok(result.buffer.length > 1000, 'non-empty file');
  assert.deepEqual([...result.buffer.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04], 'ZIP (docx) signature');
  assert.equal(result.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const xml = new PizZip(result.buffer).file('word/document.xml').asText();
  assert.match(xml, /Ana Reyes/);
  assert.match(xml, /Ben Cruz/);
  assert.match(xml, /83\.00/, 'recorded scores are summed: 8+7+9+27+20+12');
  assert.ok(xml.indexOf('Ben Cruz') < xml.indexOf('Ana Reyes'), 'higher total ranks first');
});

test('the filename is ASCII-only, carries the cycle id, and is safe in Content-Disposition', async () => {
  fixture = cycle([app(1, 'Ana', 'Reyes', { ...verified, finalRating: teachingRating })]);
  const { filename } = await CarDocumentService.generateCarDocument(7, {});
  assert.equal(filename, 'CAR-Teaching-Teacher-III-Division-cycle-7.docx');
  assert.match(filename, /^[A-Za-z0-9.-]+$/);
  assert.equal(sanitizeFilename('Guro sa Paaralán / "Ñ" <x>'), 'Guro-sa-Paaralan-N-x');
  assert.equal(sanitizeFilename('–––'), 'Cycle');
});

test('an unrated verified candidate blocks the CAR with a message naming them', async () => {
  fixture = cycle([
    app(1, 'Ana', 'Reyes', { ...verified, finalRating: teachingRating }),
    app(2, 'Ben', 'Cruz', { ...verified }),
  ]);
  await assert.rejects(CarDocumentService.generateCarDocument(7, {}), err =>
    err instanceof CarDataIncompleteError && /Ben Cruz/.test(err.message) && !/Ana Reyes/.test(err.message));
});

test('unverified and rejected applications are not candidates; none left is a clear error', async () => {
  fixture = cycle([
    app(1, 'Ana', 'Reyes', { requirementsCheck: { status: 'INCOMPLETE' } }),
    app(2, 'Ben', 'Cruz', { ...verified, finalRating: teachingRating }, { status: 'REJECTED' }),
  ]);
  await assert.rejects(CarDocumentService.generateCarDocument(7, {}), err =>
    err instanceof CarDataIncompleteError && /nothing to compare/.test(err.message));
});

test('missing score components are 0, never an assumed maximum', async () => {
  fixture = cycle([app(1, 'Ana', 'Reyes', { ...verified, finalRating: { educationScore: 5 } })]);
  const result = await CarDocumentService.generateCarDocument(7, {});
  const xml = new PizZip(result.buffer).file('word/document.xml').asText();
  assert.match(xml, />5\.00</, 'recorded total');
  assert.doesNotMatch(xml, /Meets DepEd Quality Standards|Recommended for Appointment|T-III-2026-001/, 'no invented outcomes');
});

test('a missing cycle is reported as not found', async () => {
  fixture = null;
  await assert.rejects(CarDocumentService.generateCarDocument(99, {}), err => err instanceof CarCycleNotFoundError);
});

test('the production image ships the CAR templates', () => {
  const dockerfile = fs.readFileSync(path.join(__dirname, '../Dockerfile'), 'utf8');
  assert.match(dockerfile, /^COPY templates \.\/templates$/m);
  for (const name of ['CAR-Teaching.docx', 'CAR-NonTeaching.docx']) {
    assert.ok(fs.existsSync(path.join(__dirname, '../templates', name)), name);
  }
});
