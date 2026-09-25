require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');

// The Work Experience Sheet is maintained by the authorized office. The web
// form for it was editable by personnel — every input honoured a per-entry
// `isLocked` flag, but that flag was reset to false on every load path, so a
// teacher could fill in the whole sheet and add rows before the save was
// refused.
//
// The UI is now locked by role. These tests pin the half that actually
// matters: the API refuses the mutation regardless of what any client shows,
// so route manipulation, a stale bundle or a crafted request cannot write WES.
//
// updateMyProfile is exercised through its real module with prisma mocked, so
// the assertions are about the controller's own authorization branch rather
// than a re-implementation of it.

const PERSONNEL = { userId: 11, personnelId: 8, role: 'TEACHING_PERSONNEL', email: 't@deped.gov' };
const NON_TEACHING = { ...PERSONNEL, role: 'NON_TEACHING_PERSONNEL' };
const AO = { userId: 9, personnelId: 6, role: 'AO_II', email: 'ao@deped.gov' };

const WES_BODY = {
  wes: [{ dateFrom: '2020-01-01', dateTo: '2021-01-01', positionTitle: 'Teacher I', department: 'X' }],
};

/** Minimal prisma double: enough for the controller to reach its guard. */
function mockPrisma(overrides = {}) {
  return {
    personnel: {
      findUnique: async () => ({ id: 8, userId: 11, school: 'A', district: 'D', plantillaItemId: null }),
      findFirst: async () => null,
      update: async (args) => ({ id: 8, ...args.data }),
      ...overrides.personnel,
    },
    careerHistoryEntry: { findMany: async () => [], createMany: async () => ({ count: 0 }) },
    validationLog: { create: async () => ({}) },
    $transaction: async (fn) => (typeof fn === 'function' ? fn(mockPrisma(overrides)) : []),
  };
}

function loadController(prisma) {
  const prismaPath = require.resolve('../src/config/prisma');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { __esModule: true, default: prisma } };
  delete require.cache[require.resolve('../src/controllers/personnel.controller')];
  return require('../src/controllers/personnel.controller');
}

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    locals: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; },
  };
}

async function callUpdate(user, body, record) {
  const { updateMyProfile } = loadController(mockPrisma(record ? { personnel: { findUnique: async () => record } } : {}));
  const res = fakeRes();
  await updateMyProfile({ user, body, params: {}, ip: '127.0.0.1' }, res);
  return res;
}

test('a teaching personnel account cannot write WES through PUT /personnel/me', async () => {
  const res = await callUpdate(PERSONNEL, WES_BODY);
  assert.equal(res.statusCode, 403, 'WES mutation from a personnel account must be forbidden');
  assert.match(String(res.body?.message ?? ''), /maintained by AO II/i);
});

test('non-teaching personnel are refused on the same grounds', async () => {
  const res = await callUpdate(NON_TEACHING, WES_BODY);
  assert.equal(res.statusCode, 403);
});

test('an empty WES array is still a WES mutation and is refused', async () => {
  // Sending [] would clear the sheet, so it must not be treated as "no change".
  const res = await callUpdate(PERSONNEL, { wes: [] });
  assert.equal(res.statusCode, 403);
});

test('the refusal covers the other office-maintained identity fields too', async () => {
  // Each value is individually plausible so the request reaches the
  // authorization branch rather than being turned back by field validation
  // first. The point is that the role is refused, not that the value is bad.
  const officeFields = {
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    birthDate: '1990-05-14',
    designation: 'Teacher III',
    dateHired: '2015-06-01',
  };
  // A record the office already filled in: every field is on record.
  const filled = { id: 8, userId: 11, school: 'A', district: 'D', plantillaItemId: null, firstName: 'Ana', lastName: 'Cruz',
    birthDate: new Date('1988-01-01'), designation: 'Teacher I', dateHired: new Date('2012-06-01') };
  for (const [field, value] of Object.entries(officeFields)) {
    const res = await callUpdate(PERSONNEL, { [field]: value }, filled);
    assert.equal(res.statusCode, 403, `${field} already on record must be refused for a personnel account`);
  }
});

test('personnel may fill an identity field the office left blank, once', async () => {
  // The creating AO II/HRMO left these out; the person may supply them.
  const blank = { id: 8, userId: 11, school: 'A', district: 'D', plantillaItemId: null, firstName: 'Ana', lastName: 'Cruz' };
  for (const [field, value] of Object.entries({ birthDate: '1990-05-14', designation: 'Teacher III', dateHired: '2015-06-01', civilStatus: 'MARRIED' })) {
    const res = await callUpdate(PERSONNEL, { [field]: value }, blank);
    assert.notEqual(res.statusCode, 403, `a blank ${field} may be filled by the person`);
  }
  // Names are never blank, so they are never personnel-editable.
  assert.equal((await callUpdate(PERSONNEL, { firstName: 'Other' }, blank)).statusCode, 403);
});

test('the fields personnel do own are still accepted', async () => {
  // The lock must not turn into a blanket refusal: contact details remain
  // theirs to correct.
  const res = await callUpdate(PERSONNEL, { contactNumber: '09171234567', address: 'Koronadal' });
  assert.notEqual(res.statusCode, 403, 'contact details are not office-maintained');
});

test('an authorized officer may still maintain WES', async () => {
  const res = await callUpdate(AO, WES_BODY);
  assert.notEqual(res.statusCode, 403, 'AO II must retain the ability to maintain WES');
});
