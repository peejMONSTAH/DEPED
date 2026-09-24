require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Only promotionApplication.findMany is needed; it answers from a fixed table.
const applications = new Map([[42, { id: 42, promotionCycleId: 7 }], [43, { id: 43, promotionCycleId: 8 }]]);
const queries = [];
const prismaPath = require.resolve('../src/config/prisma');
require.cache[prismaPath] = {
  id: prismaPath, filename: prismaPath, loaded: true,
  exports: { __esModule: true, default: { promotionApplication: {
    findMany: async args => { queries.push(args); return args.where.id.in.map(id => applications.get(id)).filter(Boolean); },
  } } },
};

const { withPromotionTargets } = require('../src/controllers/notifications.controller');

test('promotion notifications carry stable cycle and application ids', async () => {
  queries.length = 0;
  const rows = await withPromotionTargets([
    { id: 1, relatedEntityType: 'PromotionApplication', relatedEntityId: 42 },
    { id: 2, relatedEntityType: 'PromotionApplication', relatedEntityId: 42 },
    { id: 3, relatedEntityType: 'PromotionCycle', relatedEntityId: 9 },
    { id: 4, relatedEntityType: 'AccountCreationRequest', relatedEntityId: 5 },
    { id: 5, relatedEntityType: 'PromotionApplication', relatedEntityId: 999 },
  ]);
  assert.deepEqual(rows[0], { id: 1, relatedEntityType: 'PromotionApplication', relatedEntityId: 42, promotionApplicationId: 42, promotionCycleId: 7 });
  assert.equal(rows[2].promotionCycleId, 9);
  assert.equal(rows[2].promotionApplicationId, undefined);
  assert.deepEqual(rows[3], { id: 4, relatedEntityType: 'AccountCreationRequest', relatedEntityId: 5 }, 'non-promotion rows are untouched');
  assert.equal(rows[4].promotionApplicationId, 999);
  assert.equal(rows[4].promotionCycleId, undefined, 'a deleted application links nowhere specific');
  assert.equal(queries.length, 1, 'one batched lookup per page');
  assert.deepEqual(queries[0].select, { id: true, promotionCycleId: true }, 'only ids are read');
});

test('a page without application notifications makes no lookup', async () => {
  queries.length = 0;
  await withPromotionTargets([{ id: 1, relatedEntityType: 'PromotionCycle', relatedEntityId: 3 }]);
  assert.equal(queries.length, 0);
});

test('reviewer notifications about one applicant reference that application', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/controllers/promotions.controller.ts'), 'utf8');
  const reviewerNotices = [/AO II Requirements Verified[\s\S]{0,400}?relatedEntityId: appId,\s*relatedEntityType: 'PromotionApplication'/,
    /registered for \$\{cycle\.name\}[\s\S]{0,200}?relatedEntityId: application\.id,\s*relatedEntityType: 'PromotionApplication'/,
    /applied for \$\{cycle\.name\}[\s\S]{0,200}?relatedEntityId: application\.id,\s*relatedEntityType: 'PromotionApplication'/];
  for (const pattern of reviewerNotices) assert.match(src, pattern);
});
