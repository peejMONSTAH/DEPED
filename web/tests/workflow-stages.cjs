const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, name);
const test = require('node:test');
const assert = require('node:assert/strict');
const { transactionStage, applicationStage } = require('../src/constants/workflowStages.ts');

test('AO II validates, HRMO approves: wording never calls an AO II check an approval', () => {
  assert.match(transactionStage('FOR_APPROVAL').label, /Validated by AO II/);
  assert.doesNotMatch(transactionStage('FOR_APPROVAL').label, /Approved/);
  assert.match(transactionStage('APPROVED').label, /Approved by HRMO/);
});

test('returned for correction is not a final rejection', () => {
  const r = transactionStage('DEFICIENCY');
  assert.equal(r.needsYou, true); assert.equal(r.done, false);
  const f = transactionStage('REJECTED');
  assert.equal(f.done, true); assert.match(f.label, /final/i);
});

test('an escalated transaction names HRMO and does not claim AO II validated it', () => {
  const e = transactionStage('FOR_APPROVAL', { escalated: true });
  assert.equal(e.who, 'HRMO'); assert.doesNotMatch(e.label, /Validated/);
});

test('application stages name who has it and separate selection from appointment', () => {
  assert.equal(applicationStage({ status: 'SUBMITTED' }).who, 'AO II');
  assert.equal(applicationStage({ status: 'UNDER_REVIEW', requirementsCheck: { status: 'COMPLETE' } }).who, 'HRMO');
  assert.equal(applicationStage({ status: 'UNDER_REVIEW', canResubmit: true }).needsYou, true);
  const sel = applicationStage({ status: 'UNDER_REVIEW', transactionId: 4 });
  assert.match(sel.label, /Selected/); assert.equal(sel.done, false, 'selection is not an appointment');
  assert.equal(applicationStage({ status: 'APPROVED' }).done, true);
  assert.equal(applicationStage({ status: 'SUBMITTED', cycle: { status: 'CANCELLED' } }).done, true);
});

test('home tasks count a selected application once, through its appointment', () => {
  const { homeTasks } = require('../src/pages/personnel/components/homeTasks.ts');
  const r = homeTasks({ transactions: [{ id: 4, status: 'DRAFT' }], applications: [{ id: 1, status: 'UNDER_REVIEW', transactionId: 4, cycle: { id: 2 } }],
    missingRequiredFiles: 0, profileComplete: true, cycles: [] });
  assert.equal(r.tasks.length, 1); assert.equal(r.waiting.length, 0);
  const w = homeTasks({ transactions: [], applications: [{ id: 1, status: 'UNDER_REVIEW', requirementsCheck: { status: 'COMPLETE' }, cycle: { id: 2 } }],
    missingRequiredFiles: 0, profileComplete: true, cycles: [] });
  assert.equal(w.waiting[0].who, 'HRMO', 'an application waiting for HRMO rating is listed as waiting');
});
