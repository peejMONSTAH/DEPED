require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { cycleSelectionBlockReason, isOutOfContest } = require('../src/utils/promotion-stage.util');
const { higherRankedUnselected } = require('../src/services/promotion-ranking.service');
const { applicationWindow, isWithinApplicationWindow } = require('../src/utils/promotion-window.util');

const verified = { status: 'COMPLETE' };
const rated = score => ({ requirementsCheck: verified, finalRating: { overallTotalScore: score } });
const app = (id, details, status = 'UNDER_REVIEW', name = `P${id}`) => ({ id, status, scoreDetailsJson: details, personnel: { firstName: name, lastName: 'X' } });

test('selection waits until every applicant is checked and every verified one is rated', () => {
  assert.match(cycleSelectionBlockReason([app(1, rated(90)), app(2, {}, 'SUBMITTED', 'Ana')]), /await the AO II completeness check \(Ana X\)/);
  assert.match(cycleSelectionBlockReason([app(1, rated(90)), app(2, { requirementsCheck: verified }, 'UNDER_REVIEW', 'Ben')]), /not been deliberated yet \(Ben X\)/);
  assert.equal(cycleSelectionBlockReason([app(1, rated(90)), app(2, rated(80))]), null);
});

test('applicants returned as deficient or out of the contest do not hold up selection', () => {
  const deficient = app(2, { requirementsCheck: { status: 'INCOMPLETE' } });
  const cancelled = app(3, { stageStatus: 'CANCELLED' }, 'SUBMITTED');
  const rejected = app(4, {}, 'REJECTED');
  assert.equal(cycleSelectionBlockReason([app(1, rated(90)), deficient, cancelled, rejected]), null);
  assert.ok(isOutOfContest(cancelled) && isOutOfContest(rejected) && !isOutOfContest(deficient));
});

test('choosing below the top needs a reason; ties and already-selected candidates do not count', () => {
  const top = app(1, rated(92));
  const tie = app(2, rated(85));
  const pick = app(3, rated(85));
  const chosen = app(4, { ...rated(95), manuallyPromoted: true }, 'APPROVED');
  const unrated = app(5, { requirementsCheck: verified });
  assert.deepEqual(higherRankedUnselected([top, tie, pick, chosen, unrated], pick).map(a => a.id), [1]);
  assert.deepEqual(higherRankedUnselected([top, tie, pick], top), []);
});

test('the application window runs from the opening day to the end of the deadline day, Manila time', () => {
  const cycle = { startDate: new Date('2026-10-01T00:00:00Z'), endDate: new Date('2026-10-15T00:00:00Z') };
  const w = applicationWindow(cycle);
  assert.equal(w.opensAt.toISOString(), '2026-09-30T16:00:00.000Z');
  assert.equal(w.closesAt.toISOString(), '2026-10-15T15:59:59.999Z');
  assert.ok(isWithinApplicationWindow(cycle, new Date('2026-10-15T15:00:00Z')), '11 PM on the deadline day is still open');
  assert.ok(!isWithinApplicationWindow(cycle, new Date('2026-10-15T16:30:00Z')), 'half past midnight after it is closed');
  assert.ok(!isWithinApplicationWindow(cycle, new Date('2026-09-30T15:00:00Z')), 'the day before opening is closed');
});
