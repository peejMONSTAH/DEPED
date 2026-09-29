require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { getSubmissionTransition } = require('../src/utils/transaction-workflow.util');

test('initial submission does not consume a correction attempt', () => {
  assert.deepEqual(getSubmissionTransition('DRAFT', 0), {
    isResubmission: false,
    shouldEscalate: false,
    nextStatus: 'PENDING_VALIDATION',
    incrementResubmissionCount: false,
  });
});

test('three correction resubmissions are allowed before HRMO escalation', () => {
  for (const count of [0, 1, 2]) {
    const transition = getSubmissionTransition('DEFICIENCY', count);
    assert.equal(transition.nextStatus, 'PENDING_VALIDATION');
    assert.equal(transition.incrementResubmissionCount, true);
  }
  assert.deepEqual(getSubmissionTransition('DEFICIENCY', 3), {
    isResubmission: true,
    shouldEscalate: true,
    nextStatus: 'FOR_APPROVAL',
    incrementResubmissionCount: false,
  });
});

test('after HRMO reviews an escalation, corrections go to AO II instead of escalating again', () => {
  // Before review: the fourth resubmission escalates to HRMO.
  assert.equal(getSubmissionTransition('DEFICIENCY', 3).nextStatus, 'FOR_APPROVAL');
  // After HRMO returned it with instructions: AO II validates the correction.
  const t = getSubmissionTransition('DEFICIENCY', 3, true);
  assert.equal(t.nextStatus, 'PENDING_VALIDATION');
  assert.equal(t.shouldEscalate, false);
  assert.equal(t.incrementResubmissionCount, true, 'the correction count keeps growing, so email keys stay unique');
  assert.equal(getSubmissionTransition('DEFICIENCY', 9, true).nextStatus, 'PENDING_VALIDATION', 'no second escalation loop');
});
