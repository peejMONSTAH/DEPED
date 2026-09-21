require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isRequirementsVerified,
  isDeliberated,
  deliberationBlockReason,
  selectionBlockReason,
} = require('../src/utils/promotion-stage.util');

const NOT_REVIEWED = { applicantNumber: 'APP-2026-0001' };
const DEFICIENT = { requirementsCheck: { status: 'INCOMPLETE', verifiedByUserId: 3 } };
const VERIFIED = { requirementsCheck: { status: 'COMPLETE', verifiedByUserId: 3 } };
const DELIBERATED = { ...VERIFIED, finalRating: { finalTotalScore: 98, ratedByUserId: 4 } };

test('an application AO II never reviewed is not verified', () => {
  assert.equal(isRequirementsVerified(NOT_REVIEWED), false);
  assert.equal(isRequirementsVerified(null), false);
  assert.equal(isRequirementsVerified(undefined), false);
});

test('only an explicit COMPLETE counts as verified', () => {
  assert.equal(isRequirementsVerified(DEFICIENT), false);
  assert.equal(isRequirementsVerified(VERIFIED), true);
  assert.equal(isRequirementsVerified({ requirementsCheck: {} }), false);
});

test('deliberation is blocked until AO II has reviewed', () => {
  const reason = deliberationBlockReason(NOT_REVIEWED);
  assert.ok(reason, 'an unreviewed application must block deliberation');
  assert.match(reason, /has not verified/i);
});

test('a deficient application is blocked with a different reason', () => {
  const reason = deliberationBlockReason(DEFICIENT);
  assert.ok(reason);
  assert.match(reason, /INCOMPLETE/);
  assert.notEqual(reason, deliberationBlockReason(NOT_REVIEWED));
});

test('deliberation opens once requirements are verified complete', () => {
  assert.equal(deliberationBlockReason(VERIFIED), null);
});

test('selection requires verification and a completed deliberation', () => {
  assert.ok(selectionBlockReason(NOT_REVIEWED), 'unverified cannot be selected');
  assert.ok(selectionBlockReason(DEFICIENT), 'deficient cannot be selected');
  const verifiedOnly = selectionBlockReason(VERIFIED);
  assert.ok(verifiedOnly, 'verified but undeliberated cannot be selected');
  assert.match(verifiedOnly, /not been deliberated/i);
  assert.equal(selectionBlockReason(DELIBERATED), null);
});

test('deliberation is recognised only from a stored final rating', () => {
  assert.equal(isDeliberated(VERIFIED), false);
  assert.equal(isDeliberated(DELIBERATED), true);
});

test('the gate survives malformed score details', () => {
  for (const bad of [null, undefined, 0, '', 'nonsense', []]) {
    assert.equal(isRequirementsVerified(bad), false);
    assert.ok(deliberationBlockReason(bad), `must block on ${JSON.stringify(bad)}`);
  }
});

test('the ungated initial-rating write path is gone', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const routes = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'promotions.routes.ts'), 'utf8');
  // It accepted score writes that feed ranking, was reachable by AO II and HRMO,
  // had no caller in either client, and bypassed the deliberation gate.
  assert.ok(!/initial-rating['"]/.test(routes), 'initial-rating must not be a reachable route');
  const controller = fs.readFileSync(path.join(__dirname, '..', 'src', 'controllers', 'promotions.controller.ts'), 'utf8');
  assert.ok(!controller.includes('export const submitInitialRating'), 'the dead controller should be gone too');
});
