const fs0 = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs0.readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, name);
const test = require('node:test');
const assert = require('node:assert/strict');
const { homeTasks } = require('../src/pages/personnel/components/homeTasks.ts');

const now = new Date('2026-09-29T00:00:00Z');
const base = { transactions: [], applications: [], missingRequiredFiles: 0, profileComplete: true, cycles: [], now };

test('nothing to do is only reported when every source is empty', () => {
  const r = homeTasks(base);
  assert.deepEqual(r, { tasks: [], waiting: [] });
});

test('a returned transaction comes first and opens its checklist', () => {
  const r = homeTasks({ ...base, missingRequiredFiles: 2, transactions: [{ id: 7, status: 'DEFICIENCY', remarks: 'Unsigned page 2', transactionType: { name: 'Promotion' } }] });
  assert.equal(r.tasks[0].kind, 'returned');
  assert.equal(r.tasks[0].to, '/personnel/checklist?txId=7');
  assert.match(r.tasks[0].detail, /Unsigned page 2/);
  assert.equal(r.tasks[1].kind, 'files');
});

test('work waiting for a reviewer is separate and names who has it', () => {
  const r = homeTasks({ ...base, transactions: [
    { id: 1, status: 'PENDING_VALIDATION', submissionDate: '2026-09-20' },
    { id: 2, status: 'FOR_APPROVAL', submissionDate: '2026-09-21' },
    { id: 3, status: 'APPROVED' },
  ] });
  assert.equal(r.tasks.length, 0, 'waiting and finished items are not tasks');
  assert.deepEqual(r.waiting.map(w => w.who), ['AO II', 'HRMO']);
});

test('a returned application opens its cycle checklist', () => {
  const r = homeTasks({ ...base, applications: [{ id: 5, canResubmit: true, cycle: { id: 9, targetPosition: 'Teacher II' }, requirementsCheck: { remarks: 'Blurred scan' } }] });
  assert.equal(r.tasks[0].kind, 'application');
  assert.equal(r.tasks[0].cycleId, 9);
  assert.match(r.tasks[0].detail, /Blurred scan/);
});

test('deadlines appear only for open, eligible cycles closing within a week that were not applied to', () => {
  const soon = '2026-10-03T00:00:00Z', later = '2026-11-30T00:00:00Z';
  const r = homeTasks({ ...base, cycles: [
    { id: 1, name: 'A', endDate: soon, applicationsOpen: true },
    { id: 2, name: 'B', endDate: later, applicationsOpen: true },
    { id: 3, name: 'C', endDate: soon, applicationsOpen: true, myApplication: { id: 1 } },
    { id: 4, name: 'D', endDate: soon, applicationsOpen: true, isEligible: false },
    { id: 5, name: 'E', endDate: soon, applicationsOpen: false },
  ] });
  assert.deepEqual(r.tasks.map(t => t.cycleId), [1]);
});

test('an unknown profile state is not reported as incomplete', () => {
  assert.equal(homeTasks({ ...base, profileComplete: null }).tasks.length, 0);
  assert.equal(homeTasks({ ...base, profileComplete: false }).tasks[0].kind, 'profile');
});

test('the home page shows the load error instead of an empty task list', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/pages/personnel/Home.tsx'), 'utf8');
  assert.doesNotMatch(src, /my-transactions'\)\.catch/, 'a failed transactions load is not swallowed');
  assert.match(src, /apiClient\.get\('\/promotions\/my-applications'\)/);
});
