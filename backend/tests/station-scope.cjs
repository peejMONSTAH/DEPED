require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');

// getStationScope reads the officer's station from the database; everything
// else here is pure. The double answers user.findUnique from a fixed table so
// the role-to-scope mapping is tested through the real module.
const accounts = new Map([
  [21, { personnel: { id: 7, school: 'Morales Elementary School', district: 'District 1' } }],
  [22, { personnel: { id: 8, school: null, district: 'District 1' } }],
  [23, { personnel: { id: 9, school: '   ', district: 'District 1' } }],
  [24, { personnel: null }],
]);
const prismaPath = require.resolve('../src/config/prisma');
require.cache[prismaPath] = {
  id: prismaPath, filename: prismaPath, loaded: true,
  exports: { __esModule: true, default: { user: { findUnique: async ({ where }) => accounts.get(where.id) ?? null } } },
};

const {
  getStationScope,
  hasStationAssignment,
  isWithinDistrict,
  normalizeStationName,
  plantillaAssignmentScopeFilter,
  personnelScopeFilter,
  promotionApplicationScopeFilter,
  sameStation,
  stationKey,
  stationPersonnelFilter,
  stationPlantillaFilter,
  transactionScopeFilter,
  userReviewFilter,
} = require('../src/utils/scope.util');

const DIVISION = { kind: 'DIVISION', isScoped: false, role: 'HRMO' };
const MORALES = { kind: 'STATION', isScoped: true, role: 'AO_II', school: 'Morales Elementary School', district: 'District 1', personnelId: 7 };
const UNASSIGNED = { kind: 'SELF', isScoped: true, role: 'AO_II', district: 'District 1', personnelId: 8 };
const TEACHER = { kind: 'SELF', isScoped: true, role: 'TEACHING_PERSONNEL', personnelId: 42 };
const NOTHING = { kind: 'NONE', isScoped: true };
const SUBJECT = { user: { role: { name: { in: ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'] } } } };
const MORALES_SUBJECTS = {
  AND: [{ school: { equals: 'Morales Elementary School' } }, SUBJECT, { NOT: { id: 7 } }],
};

test('each role resolves to exactly one explicit scope, and unknowns resolve to nothing', async () => {
  assert.equal((await getStationScope({ userId: 1, role: 'HRMO' })).kind, 'DIVISION');
  assert.equal((await getStationScope({ userId: 2, role: 'SYSTEM_ADMIN' })).kind, 'DIVISION');
  assert.deepEqual(await getStationScope({ userId: 21, role: 'AO_II' }), MORALES);
  assert.deepEqual(await getStationScope({ userId: 3, role: 'TEACHING_PERSONNEL', personnelId: 42 }), TEACHER);
  assert.equal((await getStationScope({ userId: 3, role: 'NON_TEACHING_PERSONNEL', personnelId: 43 })).kind, 'SELF');
  // Every one of these used to be "unscoped", which meant everything.
  for (const actor of [
    undefined,
    null,
    { userId: 3, role: 'TEACHING_PERSONNEL' },
    { userId: 5, role: 'RECORDS_PERSONNEL' },
    { userId: 6, role: 'SOMETHING_NEW' },
    { userId: 6 },
    { userId: 0, role: 'HRMO' },
    { userId: -4, role: 'HRMO' },
  ]) {
    assert.equal((await getStationScope(actor)).kind, 'NONE', JSON.stringify(actor));
  }
});

test('an AO II without a usable station fails closed to their own record', async () => {
  assert.deepEqual(await getStationScope({ userId: 22, role: 'AO_II' }), UNASSIGNED);
  assert.equal((await getStationScope({ userId: 23, role: 'AO_II' })).kind, 'SELF', 'whitespace is not a station');
  assert.equal((await getStationScope({ userId: 24, role: 'AO_II' })).kind, 'NONE', 'no personnel record');
  assert.equal((await getStationScope({ userId: 99, role: 'AO_II' })).kind, 'NONE', 'unknown account');
});

test('the station comes from the database, never from what the client claims', async () => {
  // Extra fields on the actor are ignored; only userId and role select the row.
  const scope = await getStationScope({ userId: 21, role: 'AO_II', school: 'Matulas Elementary School', personnelId: 999 });
  assert.equal(scope.school, 'Morales Elementary School');
  assert.equal(scope.personnelId, 7);
});

test('division-level roles are not restricted to a station', () => {
  assert.deepEqual(personnelScopeFilter(DIVISION), {});
  assert.deepEqual(personnelScopeFilter(DIVISION, 'review'), {});
  assert.deepEqual(transactionScopeFilter(DIVISION), {});
  assert.deepEqual(promotionApplicationScopeFilter(DIVISION, 'review'), {});
  assert.deepEqual(userReviewFilter(DIVISION), {});
  assert.deepEqual(stationPlantillaFilter(DIVISION), {});
  assert.deepEqual(plantillaAssignmentScopeFilter(DIVISION), {});
  assert.equal(hasStationAssignment(DIVISION), true);
  assert.equal(isWithinDistrict(DIVISION, 'District 6'), true);
});

test('an assigned officer reads their own record plus their station, and reviews only their station', () => {
  assert.deepEqual(personnelScopeFilter(MORALES), { OR: [{ id: 7 }, MORALES_SUBJECTS] });
  assert.deepEqual(stationPersonnelFilter(MORALES), personnelScopeFilter(MORALES, 'read'));
  assert.deepEqual(personnelScopeFilter(MORALES, 'review'), MORALES_SUBJECTS);
  assert.deepEqual(transactionScopeFilter(MORALES, 'review'), { personnel: MORALES_SUBJECTS });
  assert.deepEqual(promotionApplicationScopeFilter(MORALES, 'review'), { personnel: MORALES_SUBJECTS });
  assert.deepEqual(userReviewFilter(MORALES), { personnel: MORALES_SUBJECTS });
  assert.deepEqual(plantillaAssignmentScopeFilter(MORALES), { department: { equals: 'Morales Elementary School' } });
  assert.equal(hasStationAssignment(MORALES), true);
});

test('station filters are exact equality: no ILIKE mode, no substring, no prefix', () => {
  // `mode: 'insensitive'` compiles to ILIKE, where _ and % are wildcards; the
  // column is citext so a plain equals is already case-insensitive.
  for (const filter of [personnelScopeFilter(MORALES), transactionScopeFilter(MORALES), userReviewFilter(MORALES)]) {
    const json = JSON.stringify(filter);
    assert.doesNotMatch(json, /insensitive|contains|startsWith|endsWith|district/);
  }
});

test('station comparison ignores case and surrounding whitespace, and nothing else', () => {
  assert.equal(normalizeStationName('  Morales   Elementary\tSchool '), 'Morales Elementary School');
  assert.equal(normalizeStationName('   '), undefined);
  assert.equal(normalizeStationName(''), undefined);
  assert.equal(normalizeStationName(null), undefined);
  assert.equal(normalizeStationName(12), undefined);
  assert.equal(stationKey(' MORALES Elementary School'), 'morales elementary school');
  assert.equal(sameStation('morales elementary school', '  Morales Elementary School '), true);
});

test('similar station names never match through prefixes, substrings or wildcards', () => {
  assert.equal(sameStation('Morales Elementary School', 'Morales Elementary School Annex'), false);
  assert.equal(sameStation('Morales Elementary School Annex', 'Morales Elementary School'), false);
  assert.equal(sameStation('Morales', 'Morales Elementary School'), false);
  assert.equal(sameStation('Morales Elementary School', 'Matulas Elementary School'), false);
  assert.equal(sameStation('M%', 'Morales Elementary School'), false);
  assert.equal(sameStation('M_rales Elementary School', 'Morales Elementary School'), false);
});

test('empty or missing station identity never matches anything', () => {
  for (const [a, b] of [[undefined, undefined], [null, null], ['', ''], ['  ', '  '], ['', 'Morales Elementary School'], [null, 'x']]) {
    assert.equal(sameStation(a, b), false, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  }
});

test('a station scope that somehow lost its school matches no row instead of every row', () => {
  // Prisma drops `equals: undefined`, which would silently mean "all schools".
  const broken = { ...MORALES, school: undefined };
  assert.deepEqual(personnelScopeFilter(broken), { id: -1 });
  assert.deepEqual(personnelScopeFilter(broken, 'review'), { id: -1 });
  assert.deepEqual(transactionScopeFilter(broken), { personnel: { id: -1 } });
});

test('a district-only officer is not widened to the district: they fail closed', () => {
  // The previous policy gave an officer with only a district every school in it,
  // which is how a Morales record became visible to a Matulas officer and back.
  assert.equal(hasStationAssignment(UNASSIGNED), false);
  assert.deepEqual(personnelScopeFilter(UNASSIGNED), { id: 8 });
  assert.deepEqual(personnelScopeFilter(UNASSIGNED, 'review'), { id: -1 });
  assert.deepEqual(transactionScopeFilter(UNASSIGNED), { personnelId: 8 });
  assert.deepEqual(transactionScopeFilter(UNASSIGNED, 'review'), { id: -1 });
  assert.deepEqual(userReviewFilter(UNASSIGNED), { id: -1 });
  assert.deepEqual(stationPlantillaFilter(UNASSIGNED), { id: -1 });
  assert.deepEqual(plantillaAssignmentScopeFilter(UNASSIGNED), { id: -1 });
  assert.doesNotMatch(JSON.stringify(personnelScopeFilter(UNASSIGNED)), /District/);
});

test('personnel reach their own records only and review nobody', () => {
  assert.deepEqual(personnelScopeFilter(TEACHER), { id: 42 });
  assert.deepEqual(personnelScopeFilter(TEACHER, 'review'), { id: -1 });
  assert.deepEqual(transactionScopeFilter(TEACHER), { personnelId: 42 });
  assert.deepEqual(promotionApplicationScopeFilter(TEACHER), { personnelId: 42 });
  assert.deepEqual(promotionApplicationScopeFilter(TEACHER, 'review'), { id: -1 });
  assert.deepEqual(userReviewFilter(TEACHER), { id: -1 });
});

test('no scope is denied outright everywhere', () => {
  assert.deepEqual(personnelScopeFilter(NOTHING), { id: -1 });
  assert.deepEqual(transactionScopeFilter(NOTHING), { id: -1 });
  assert.deepEqual(promotionApplicationScopeFilter(NOTHING), { id: -1 });
  assert.deepEqual(userReviewFilter(NOTHING), { id: -1 });
  assert.deepEqual(stationPlantillaFilter(NOTHING), { id: -1 });
  assert.deepEqual(plantillaAssignmentScopeFilter(NOTHING), { id: -1 });
  assert.equal(hasStationAssignment(NOTHING), false);
  assert.equal(isWithinDistrict(NOTHING, null), false);
});

test('the plantilla registry is division-level only', () => {
  assert.deepEqual(stationPlantillaFilter(MORALES), { id: -1 });
});

test('account assignment offers an AO II only exact-station plantilla items', () => {
  const filter = plantillaAssignmentScopeFilter(MORALES);
  assert.deepEqual(filter, { department: { equals: 'Morales Elementary School' } });
  assert.doesNotMatch(JSON.stringify(filter), /contains|insensitive|district/);
});

test('a cycle district narrows an officer further but never grants access', () => {
  assert.equal(isWithinDistrict(MORALES, 'ALL'), true);
  assert.equal(isWithinDistrict(MORALES, 'DIVISION_WIDE'), true);
  assert.equal(isWithinDistrict(MORALES, 'All Districts / Division-Wide'), true);
  assert.equal(isWithinDistrict(MORALES, null), true);
  assert.equal(isWithinDistrict(MORALES, ' district 1 '), true);
  assert.equal(isWithinDistrict(MORALES, 'District 6'), false);
  assert.equal(isWithinDistrict(MORALES, 'District 1 Annex'), false);
  // Without a station the district check cannot pass, whatever the cycle says.
  assert.equal(isWithinDistrict(UNASSIGNED, 'District 1'), false);
  assert.equal(isWithinDistrict(UNASSIGNED, 'ALL'), false);
});
