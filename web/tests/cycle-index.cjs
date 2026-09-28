const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, name);

const ci = require('../src/promotions/cycleIndex.ts');

const cycles = [
  { id: 1, status: 'CLOSED', type: 'ECP', endDate: '2026-11-27', applicantCount: 1, name: 'Ranking for Vacancy: Teacher VII (OSEC-DECSB-TCH7-369792-2026)', rulesConfigurationJson: { openTo: 'DISTRICT', district: 'District 1', school: 'KCES 1' } },
  { id: 2, status: 'ACTIVE', type: 'NATURAL_VACANCY', endDate: '2026-11-24', applicantCount: 0, name: 'Teacher III (OSEC-DECSB-TCH3-508168-2026)', rulesConfigurationJson: { openTo: 'DISTRICT', district: 'District 6', vacantPositions: 2 } },
  { id: 3, status: 'PLANNING', type: 'NATURAL_VACANCY', endDate: '2026-10-01', applicantCount: 3, name: 'Master Teacher II', rulesConfigurationJson: { openTo: 'DIVISION', plantillaItemNumber: 'OSEC-X-1' } },
  { id: 4, status: 'CANCELLED', type: 'NATURAL_VACANCY', endDate: '2026-12-01', applicantCount: 0, name: 'Teacher V (OSEC-DECSB-TCH5-776700-2026)', rulesConfigurationJson: {} },
  { id: 5, status: 'ACTIVE', type: 'ECP', endDate: '2026-10-05', applicantCount: 2, name: 'Teacher I', rulesConfigurationJson: {} },
];

test('status groups and context-aware actions', () => {
  assert.equal(ci.cycleGroup('ACTIVE'), 'ONGOING');
  assert.equal(ci.cycleGroup('PLANNING'), 'UPCOMING');
  assert.equal(ci.cycleGroup('RESULTS_READY'), 'FINISHED');
  assert.equal(ci.cycleGroup('CANCELLED'), 'CANCELLED');
  assert.deepEqual(ci.GROUP_ACTION, { ONGOING: 'Open cycle', UPCOMING: 'Review setup', FINISHED: 'View results', CANCELLED: 'View record' });
});

test('ongoing cycles come first, archive holds finished and cancelled', () => {
  const { active, archive } = ci.groupCycles(cycles);
  assert.deepEqual(active.map(c => c.id), [5, 2, 3], 'ongoing (soonest close first), then upcoming');
  assert.deepEqual(archive.map(c => c.id), [4, 1], 'archive newest first');
});

test('title and plantilla item are separated', () => {
  assert.deepEqual(ci.splitCycleName(cycles[0]), { title: 'Teacher VII', item: 'OSEC-DECSB-TCH7-369792-2026' });
  assert.deepEqual(ci.splitCycleName(cycles[2]), { title: 'Master Teacher II', item: 'OSEC-X-1' });
});

test('district, school and type filters narrow the server list', () => {
  assert.deepEqual(ci.applyFilters(cycles, { district: 'District 1', school: '', type: '' }).map(c => c.id), [1]);
  assert.deepEqual(ci.applyFilters(cycles, { district: '', school: 'KCES 1', type: '' }).map(c => c.id), [1]);
  assert.deepEqual(ci.applyFilters(cycles, { district: '', school: '', type: 'ECP' }).map(c => c.id), [1, 5]);
  assert.equal(ci.applyFilters(cycles, ci.EMPTY_FILTERS).length, 5);
  assert.deepEqual(ci.filterOptions(cycles).districts, ['District 1', 'District 6']);
});

test('summary counts come from the data', () => {
  assert.deepEqual(ci.summarize(cycles), { ONGOING: 2, UPCOMING: 1, FINISHED: 1, CANCELLED: 1, applicants: 6 });
  assert.equal(ci.scopeLabel(cycles[2]), 'Division-wide');
  assert.equal(ci.scopeLabel(cycles[0]), 'District 1 only');
});

test('layout rules guard against horizontal overflow', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/pages/admin/cycle-index.css'), 'utf8');
  assert.match(css, /\.ci-page, \.ci-page \* \{ min-width: 0; \}/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 720px\) \{ \.ci-grid \{ grid-template-columns: minmax\(0, 1fr\); \} \}/);
  assert.match(css, /@media \(max-width: 960px\)[\s\S]*\.ci-arow--head \{ display: none; \}/, 'archive stacks on small screens');
  assert.doesNotMatch(css, /(^|[;{ ])width: \d{3,}px/m, 'no fixed wide widths');
});
