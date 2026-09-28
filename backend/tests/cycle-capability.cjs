require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const c = require('../src/utils/cycle-capability.util');

test('a cancelled cycle is read-only for every write', () => {
  assert.equal(c.canRegisterApplicants('CANCELLED'), false);
  assert.equal(c.canReviewApplicants('CANCELLED'), false);
  assert.equal(c.canChangeSelection('CANCELLED'), false);
  assert.equal(c.canGenerateCar('CANCELLED'), false);
  assert.equal(c.canEditCycle('CANCELLED'), false);
  assert.match(c.readOnlyReason('CANCELLED'), /cancelled/);
});

test('finalized cycles are sealed; a closed cycle still allows selection fixes', () => {
  for (const s of ['FINALIZED', 'PUBLISHED', 'RESOLVED']) {
    assert.equal(c.canReviewApplicants(s), false, s);
    assert.equal(c.canChangeSelection(s), false, s);
    assert.equal(c.canEditCycle(s), false, s);
    assert.equal(c.canGenerateCar(s), true, `${s} keeps its CAR as a record`);
  }
  assert.equal(c.canRegisterApplicants('CLOSED'), false);
  assert.equal(c.canChangeSelection('CLOSED'), true);
});

test('upcoming cycles take no applicants; only an active one does', () => {
  assert.equal(c.canRegisterApplicants('PLANNING'), false);
  assert.equal(c.canGenerateCar('PLANNING'), false);
  assert.equal(c.canRegisterApplicants('ACTIVE'), true);
  assert.equal(c.canRegisterApplicants('EVALUATION'), false, 'applications closed');
  assert.equal(c.canReviewApplicants('EVALUATION'), true, 'review continues after applications close');
});

test('illegal status transitions are refused', () => {
  assert.equal(c.transitionBlockReason('ACTIVE', 'CANCELLED'), null);
  assert.equal(c.transitionBlockReason('PLANNING', 'ACTIVE'), null);
  assert.match(c.transitionBlockReason('CANCELLED', 'ACTIVE'), /cancelled cycle/);
  assert.match(c.transitionBlockReason('FINALIZED', 'ACTIVE'), /finalized/);
  assert.ok(c.transitionBlockReason('PLANNING', 'FINALIZED'));
  assert.ok(c.transitionBlockReason('CLOSED', 'ACTIVE'), 'reopen goes to results ready only');
  assert.equal(c.isReopening('CLOSED', 'RESULTS_READY'), true);
});

test('every write endpoint consults the shared rules', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/controllers/promotions.controller.ts'), 'utf8');
  for (const [fn, rule] of [
    ['submitManualApplication', 'canRegisterApplicants'],
    ['selectPromotionCandidate', 'canChangeSelection'],
    ['generateCarDocument', 'canGenerateCar'],
    ['generateRanking', 'canReviewApplicants'],
    ['submitFinalRating', 'canReviewApplicants'],
    ['verifyApplicationRequirements', 'canReviewApplicants'],
    ['updatePromotionCycle', 'transitionBlockReason'],
  ]) {
    const start = src.indexOf(`export const ${fn}`);
    const next = src.indexOf('\nexport const ', start + 10);
    assert.ok(start >= 0, fn);
    assert.ok(src.slice(start, next).includes(rule), `${fn} uses ${rule}`);
  }
  assert.match(src, /CYCLE_STATUS_CHANGED/, 'status changes are logged');
});
