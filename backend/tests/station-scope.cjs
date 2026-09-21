require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hasStationAssignment,
  isWithinDistrict,
  isWithinStation,
  stationPersonnelFilter,
  stationPlantillaFilter,
} = require('../src/utils/scope.util');

const DIVISION = { isScoped: false };
const ASSIGNED = { isScoped: true, school: 'Mangga Elementary School', district: 'District 6', personnelId: 7 };
const DISTRICT_ONLY = { isScoped: true, district: 'District 1', personnelId: 8 };
const UNASSIGNED = { isScoped: true, personnelId: 9 };
const ORPHANED = { isScoped: true };

test('division-level roles are not restricted to a station', () => {
  assert.deepEqual(stationPersonnelFilter(DIVISION), {});
  assert.deepEqual(stationPlantillaFilter(DIVISION), {});
  assert.equal(hasStationAssignment(DIVISION), true);
  assert.equal(isWithinStation(DIVISION, { id: 1, school: 'Anything', district: null }), true);
  assert.equal(isWithinDistrict(DIVISION, 'District 1'), true);
});

test('an assigned officer is filtered to their own school plus their own record', () => {
  assert.deepEqual(stationPersonnelFilter(ASSIGNED), {
    OR: [
      { id: 7 },
      { school: { equals: 'Mangga Elementary School', mode: 'insensitive' } },
    ],
  });
  assert.deepEqual(stationPlantillaFilter(ASSIGNED), {
    department: { equals: 'Mangga Elementary School', mode: 'insensitive' },
  });
});

test('station comparison ignores case and surrounding whitespace', () => {
  assert.equal(isWithinStation(ASSIGNED, { id: 1, school: '  mangga elementary school ', district: null }), true);
});

test('a neighbouring school is not in scope just because its name shares a prefix', () => {
  // The previous resolver used substring matching, so an "... Annex" record leaked across stations.
  assert.equal(isWithinStation(ASSIGNED, { id: 1, school: 'Mangga Elementary School Annex', district: 'District 6' }), false);
  assert.equal(isWithinStation(ASSIGNED, { id: 1, school: 'Takilay Elementary School', district: 'District 6' }), false);
});

test('an officer always reaches their own personnel record', () => {
  assert.equal(isWithinStation(ASSIGNED, { id: 7, school: null, district: null }), true);
});

test('a district-only officer is scoped to the district', () => {
  assert.deepEqual(stationPersonnelFilter(DISTRICT_ONLY), {
    OR: [
      { id: 8 },
      { district: { equals: 'District 1', mode: 'insensitive' } },
    ],
  });
  assert.equal(isWithinStation(DISTRICT_ONLY, { id: 1, school: 'Salkan Elementary School', district: 'District 1' }), true);
  assert.equal(isWithinStation(DISTRICT_ONLY, { id: 1, school: 'Mangga Elementary School', district: 'District 6' }), false);
});

test('an officer with no station on file sees nothing but their own record', () => {
  assert.equal(hasStationAssignment(UNASSIGNED), false);
  assert.deepEqual(stationPersonnelFilter(UNASSIGNED), { id: 9 });
  assert.equal(isWithinStation(UNASSIGNED, { id: 9, school: null, district: null }), true);
  assert.equal(isWithinStation(UNASSIGNED, { id: 1, school: 'Mangga Elementary School', district: 'District 6' }), false);
});

test('an officer with neither station nor personnel record is denied outright', () => {
  assert.deepEqual(stationPersonnelFilter(ORPHANED), { id: -1 });
  assert.deepEqual(stationPlantillaFilter(ORPHANED), { id: -1 });
  assert.equal(isWithinStation(ORPHANED, { id: 1, school: 'Mangga Elementary School', district: 'District 6' }), false);
  assert.equal(isWithinStation(ORPHANED, null), false);
});

test('district-wide promotion cycles stay open while mismatches are refused', () => {
  assert.equal(isWithinDistrict(ASSIGNED, 'ALL'), true);
  assert.equal(isWithinDistrict(ASSIGNED, 'DIVISION_WIDE'), true);
  assert.equal(isWithinDistrict(ASSIGNED, null), true);
  assert.equal(isWithinDistrict(ASSIGNED, 'District 6'), true);
  assert.equal(isWithinDistrict(ASSIGNED, 'District 1'), false);
  assert.equal(isWithinDistrict(UNASSIGNED, 'District 1'), false);
});
