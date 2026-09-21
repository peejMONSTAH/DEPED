require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveApplicationScore,
  scoreBreakdownFor,
  rankApplications,
} = require('../src/services/promotion-ranking.service');

test('an unrated application scores zero', () => {
  assert.equal(resolveApplicationScore(null), 0);
  assert.equal(resolveApplicationScore({}), 0);
  assert.equal(resolveApplicationScore({ annexCChecklist: { items: [] } }), 0);
});

test('a legacy totalScore only counts alongside a real rating', () => {
  // Without a rating the number is stale display data, not a score.
  assert.equal(resolveApplicationScore({ totalScore: 88 }), 0);
  assert.equal(resolveApplicationScore({ totalScore: 88, finalRating: {} }), 88);
});

test('an HRMO final score is added to the AO initial score', () => {
  const score = resolveApplicationScore({
    initialRating: { initialTotalScore: 60 },
    finalRating: { finalTotalScore: 35 },
  });
  assert.equal(score, 95);
});

test('a final score stands alone when no AO rating exists', () => {
  assert.equal(resolveApplicationScore({ finalRating: { finalTotalScore: 40 } }), 40);
});

test('a previously combined total takes precedence', () => {
  const score = resolveApplicationScore({
    initialRating: { initialTotalScore: 60 },
    finalRating: { finalTotalScore: 35, overallTotalScore: 98 },
  });
  assert.equal(score, 98);
});

test('an AO initial rating ranks before any HRMO deliberation', () => {
  assert.equal(resolveApplicationScore({ initialRating: { initialTotalScore: 42.5 } }), 42.5);
});

test('scores are rounded to two decimals', () => {
  const score = resolveApplicationScore({
    initialRating: { initialTotalScore: 10.005 },
    finalRating: { finalTotalScore: 0.1 },
  });
  assert.equal(score, 10.11);
});

test('applications are ordered by score, highest first', () => {
  const ranked = rankApplications([
    { id: 1, scoreDetailsJson: { finalRating: { overallTotalScore: 80 } } },
    { id: 2, scoreDetailsJson: { finalRating: { overallTotalScore: 98 } } },
    { id: 3, scoreDetailsJson: { finalRating: { overallTotalScore: 91 } } },
  ]);
  assert.deepEqual(ranked.map(r => r.app.id), [2, 3, 1]);
  assert.deepEqual(ranked.map(r => r.score), [98, 91, 80]);
});

test('unrated applications sink below rated ones', () => {
  const ranked = rankApplications([
    { id: 1, scoreDetailsJson: {} },
    { id: 2, scoreDetailsJson: { finalRating: { overallTotalScore: 55 } } },
  ]);
  assert.deepEqual(ranked.map(r => r.app.id), [2, 1]);
});

test('a breakdown is produced only for a scored application', () => {
  assert.equal(scoreBreakdownFor(0), undefined);
  assert.deepEqual(scoreBreakdownFor(100), {
    yearsOfServiceScore: 25, trainingScore: 25, performanceScore: 25, seniorityScore: 25,
  });
});

// Regression: a display label from scoreDetailsJson was written into the `status`
// enum column, so ranking threw and silently produced no ranks at all.
test('stageStatus is never treated as an application status', () => {
  const ranked = rankApplications([
    { id: 1, status: 'RANKED', scoreDetailsJson: { stageStatus: 'FINAL_RANKED', finalRating: { overallTotalScore: 70 } } },
  ]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].score, 70);
  assert.equal(ranked[0].app.status, 'RANKED', 'the stored enum must survive ranking untouched');
  assert.notEqual(ranked[0].app.status, 'FINAL_RANKED');
});
