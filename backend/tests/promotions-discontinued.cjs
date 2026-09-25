require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/prisma').default;
const { applyForPromotion, getPromotionCycles } = require('../src/controllers/promotions.controller');

test('Discontinued Promotion Cycles: applying directly to a cancelled cycle fails with CYCLE_DISCONTINUED', async () => {
  // Mock req & res
  const req = {
    params: { id: '999999' },
    body: {},
    user: { userId: 1, personnelId: 1, role: 'TEACHING_PERSONNEL' },
  };

  let statusCode = 0;
  let responseData = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      responseData = payload;
      return this;
    },
  };

  // Temporarily stub prisma.promotionCycle.findUnique
  const origFindUnique = prisma.promotionCycle.findUnique;
  try {
    prisma.promotionCycle.findUnique = async () => ({
      id: 999999,
      name: 'Ranking for Vacancy: Cancelled Test Cycle',
      status: 'CANCELLED',
      type: 'NATURAL_VACANCY',
      rulesConfigurationJson: {},
    });

    await applyForPromotion(req, res);

    assert.equal(statusCode, 400);
    assert.equal(responseData?.code, 'CYCLE_DISCONTINUED');
    assert.match(responseData?.message, /cancelled or discontinued/i);
  } finally {
    prisma.promotionCycle.findUnique = origFindUnique;
  }
});

test('Discontinued Promotion Cycles: general opportunities query enforces status not CANCELLED', async () => {
  let capturedWhere = null;
  const origFindMany = prisma.promotionCycle.findMany;
  const origCount = prisma.promotionCycle.count;
  // The personnel lookups must never reach a real database from a unit test.
  const origPersonnel = prisma.personnel.findUnique;
  const origApps = prisma.promotionApplication.findMany;
  prisma.personnel.findUnique = async () => ({ id: 11, district: 'District 1', designation: 'Teacher I', plantillaItem: null });
  prisma.promotionApplication.findMany = async () => [];

  try {
    prisma.promotionCycle.findMany = async (args) => {
      capturedWhere = args.where;
      return [];
    };
    prisma.promotionCycle.count = async () => 0;

    const req = {
      query: { status: 'ACTIVE' },
      user: { userId: 14, personnelId: 11, role: 'TEACHING_PERSONNEL' },
    };

    let responseData = null;
    const res = {
      status() { return this; },
      json(payload) { responseData = payload; return this; },
    };

    await getPromotionCycles(req, res);

    assert.ok(capturedWhere);
    // where.status should either not contain CANCELLED or explicitly have { not: 'CANCELLED' }
    if (typeof capturedWhere.status === 'object' && capturedWhere.status.not) {
      assert.equal(capturedWhere.status.not, 'CANCELLED');
    } else if (capturedWhere.status?.in) {
      assert.ok(!capturedWhere.status.in.includes('CANCELLED'));
    }
  } finally {
    prisma.promotionCycle.findMany = origFindMany;
    prisma.promotionCycle.count = origCount;
    prisma.personnel.findUnique = origPersonnel;
    prisma.promotionApplication.findMany = origApps;
  }
});
