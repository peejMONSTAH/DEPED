const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, name);

const c = require('../src/promotions/cycleCapability.ts');

const now = new Date('2026-10-10T12:00:00');
const open = { startDate: '2026-10-01', endDate: '2026-11-30' };
const ended = { startDate: '2026-09-01', endDate: '2026-10-01' };
const counts = (o = {}) => ({ applicants: 0, checked: 0, qualified: 0, rated: 0, selected: 0, slots: 1, ...o });

test('a cancelled cycle is read-only: no actions, no registration, no CAR', () => {
  assert.equal(c.isCycleReadOnly('CANCELLED'), true);
  assert.equal(c.canRegisterApplicant('CANCELLED', 'HRMO', open, now), false);
  assert.equal(c.canGenerateCar('CANCELLED', 'HRMO'), false);
  assert.equal(c.nextCycleAction('CANCELLED', counts(), 'HRMO', open, now), null);
  assert.deepEqual(c.cycleMoves('CANCELLED', 'HRMO'), []);
  const stages = c.workflowStages('CANCELLED', counts(), 'HRMO');
  assert.ok(stages.every(s => s.state === 'READ_ONLY' || s.state === 'COMPLETED'));
  assert.match(c.cycleBlockReason('CANCELLED', open, now), /cancelled/);
});

test('a finalized cycle is read-only but keeps its results', () => {
  assert.equal(c.isCycleReadOnly('FINALIZED'), true);
  assert.equal(c.canDeliberate('FINALIZED', 'HRMO'), false);
  assert.equal(c.canGenerateCar('FINALIZED', 'HRMO'), true);
  assert.deepEqual(c.nextCycleAction('FINALIZED', counts({ applicants: 2 }), 'HRMO', open, now), { label: 'View final results', stage: 'CAR', kind: 'OPEN_STAGE' });
});

test('registration needs an active cycle inside its application period', () => {
  assert.equal(c.canRegisterApplicant('ACTIVE', 'HRMO', open, now), true);
  assert.equal(c.canRegisterApplicant('ACTIVE', 'HRMO', ended, now), false, 'period ended');
  assert.equal(c.canRegisterApplicant('PLANNING', 'HRMO', open, now), false, 'upcoming');
  assert.equal(c.canRegisterApplicant('ACTIVE', 'SYSTEM_ADMINISTRATOR', open, now), false, 'role');
  assert.match(c.cycleBlockReason('ACTIVE', ended, now), /application period has ended/);
});

test('the next action follows the real state of the cycle', () => {
  const next = o => c.nextCycleAction('ACTIVE', counts(o), 'HRMO', open, now)?.label ?? null;
  assert.equal(next({}), 'Register applicant');
  assert.equal(next({ applicants: 2, checked: 1 }), 'Review requirements');
  assert.equal(next({ applicants: 2, checked: 2, qualified: 2 }), 'Begin board deliberation');
  assert.equal(next({ applicants: 2, checked: 2, qualified: 2, rated: 1 }), 'Continue board rating');
  assert.equal(next({ applicants: 2, checked: 2, qualified: 2, rated: 2 }), 'Select candidate');
  assert.equal(next({ applicants: 2, checked: 2, qualified: 2, rated: 2, selected: 1 }), 'Open CAR');
  assert.equal(c.nextCycleAction('ACTIVE', counts(), 'HRMO', ended, now), null, 'no register after the period');
});

test('later stages stay blocked until their prerequisites are met', () => {
  const st = (o, role = 'HRMO') => Object.fromEntries(c.workflowStages('ACTIVE', counts(o), role).map(s => [s.key, s]));
  let s = st({});
  assert.equal(s.REQUIREMENTS.available, false);
  assert.equal(s.SELECTION.state, 'BLOCKED');
  s = st({ applicants: 2, checked: 1, qualified: 1, rated: 1 });
  assert.equal(s.SELECTION.available, false);
  assert.match(s.SELECTION.reason, /requirements review/);
  s = st({ applicants: 2, checked: 2, qualified: 2, rated: 2 });
  assert.equal(s.SELECTION.available, true);
  assert.equal(s.DELIBERATION.state, 'COMPLETED');
  s = st({ applicants: 2, checked: 2, qualified: 2, rated: 2 }, 'AO_II');
  assert.equal(s.DELIBERATION.available, false, 'AO II does not deliberate');
  assert.equal(s.REQUIREMENTS.available, true);
});

test('status moves are a controlled list, not a free dropdown', () => {
  const labels = s => c.cycleMoves(s, 'HRMO').map(m => m.to);
  assert.deepEqual(labels('PLANNING'), ['ACTIVE', 'CANCELLED']);
  assert.deepEqual(labels('ACTIVE'), ['EVALUATION', 'CLOSED', 'CANCELLED']);
  assert.deepEqual(labels('CLOSED'), ['FINALIZED', 'RESULTS_READY']);
  assert.ok(c.cycleMoves('ACTIVE', 'HRMO').find(m => m.to === 'CANCELLED').needsReason);
  assert.deepEqual(c.cycleMoves('ACTIVE', 'AO_II'), []);
});

test('the page wires the capability model instead of a status dropdown', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/pages/admin/PromotionManagement.tsx'), 'utf8');
  assert.doesNotMatch(src, /aria-label="Promotion cycle status"/, 'status dropdown removed');
  assert.match(src, /cycleMoves\(status, user\?\.role\)/);
  assert.match(src, /nextCycleAction\(/);
  assert.doesNotMatch(src, />\s*Live\s*</, 'no Live badge');
  assert.doesNotMatch(src, /Submit Applicant Form/, 'one register action only');
  const css = fs.readFileSync(path.join(__dirname, '../src/pages/admin/cycle-detail.css'), 'utf8');
  assert.match(css, /@media \(max-width: 640px\) \{ \.cd-steps ol \{ grid-template-columns: minmax\(0, 1fr\); \} \}/);
});
