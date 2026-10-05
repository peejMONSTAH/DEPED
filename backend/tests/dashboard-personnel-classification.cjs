// Exercise the real dashboard handler with an in-memory aggregate database.
// No database connection or production writes are allowed in this test.
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
let records = [];
const queries = [];
function matches(row, where = {}) {
  if (where.AND && !where.AND.every(part => matches(row, part))) return false;
  if (where.school && row.school !== where.school.equals) return false;
  if (where.id !== undefined && row.id !== where.id) return false;
  const role = where.user?.role?.name;
  if (typeof role === 'string' && row.role !== role) return false;
  if (role?.in && !role.in.includes(row.role)) return false;
  return true;
}
const db = {
  transaction: { count: async () => 0 },
  personnel: { count: async ({ where }) => {
    queries.push(where);
    return records.filter(row => matches(row, where)).length;
  } },
  $transaction: async callback => callback(db),
};
const stub = (file, exports) => { require.cache[require.resolve(file)] = { exports }; };
stub('../src/config/prisma', { __esModule: true, default: db });
stub('../src/config', { config: {} });
stub('../src/utils/transaction-access.util', { transactionAccessFilter: async () => ({}) });
stub('../src/utils/scope.util', {
  getStationScope: async user => user.school ? { school: user.school } : {},
  personnelScopeFilter: scope => scope.school ? { school: { equals: scope.school } } : {},
});
const { getDashboardSummary } = require('../src/controllers/dashboard.controller');
async function summary(user = { role: 'HRMO' }) {
  queries.length = 0;
  const res = { status(code) { assert.equal(code, 200); return this; }, json(body) { this.body = body; return this; } };
  await getDashboardSummary({ user }, res);
  return res.body.data;
}
test('12 teachers and 4 AO II plus 2 HRMO yield 18 total, 67% teaching and 33% non-teaching', async () => {
  records = [
    ...Array.from({ length: 12 }, () => ({ role: 'TEACHING_PERSONNEL' })),
    ...Array.from({ length: 4 }, () => ({ role: 'AO_II' })),
    ...Array.from({ length: 2 }, () => ({ role: 'HRMO' })),
  ];
  const result = await summary();
  assert.equal(result.totalPersonnel, 18);
  assert.equal(result.teachingCount, 12);
  assert.equal(result.nonTeachingCount, 6);
  assert.equal(Math.round(result.teachingCount / result.totalPersonnel * 100), 67);
  assert.equal(Math.round(result.nonTeachingCount / result.totalPersonnel * 100), 33);
});
test('ordinary non-teaching personnel remain counted alongside AO II and HRMO', async () => {
  records = ['NON_TEACHING_PERSONNEL', 'AO_II', 'HRMO', 'TEACHING_PERSONNEL'].map(role => ({ role }));
  const result = await summary();
  assert.equal(result.nonTeachingCount, 3);
  assert.equal(result.teachingCount, 1);
});
test('all three personnel count queries retain the supplied school scope', async () => {
  records = [
    { school: 'Matulas', role: 'TEACHING_PERSONNEL' },
    { school: 'Matulas', role: 'NON_TEACHING_PERSONNEL' },
    { school: 'Morales', role: 'AO_II' },
    { school: 'Morales', role: 'HRMO' },
  ];
  const result = await summary({ role: 'AO_II', school: 'Matulas' });
  assert.equal(result.totalPersonnel, 2);
  assert.equal(result.teachingCount, 1);
  assert.equal(result.nonTeachingCount, 1);
  assert.ok(queries.every(where => where.school?.equals === 'Matulas'
    || where.AND?.some(part => part.school?.equals === 'Matulas')));
});
test('empty personnel scope returns zero counts', async () => {
  records = [];
  const result = await summary();
  assert.equal(result.totalPersonnel, 0);
  assert.equal(result.teachingCount, 0);
  assert.equal(result.nonTeachingCount, 0);
});
