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
