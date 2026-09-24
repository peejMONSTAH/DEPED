const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, name);

const {
  notificationPromotionPath, parsePromotionTarget, resolveTargetCycle, resolveTargetApplication,
} = require('../src/promotions/deepLink.ts');

test('an application notification links to its exact cycle and application', () => {
  const path = notificationPromotionPath({ relatedEntityType: 'PromotionApplication', relatedEntityId: 42, promotionApplicationId: 42, promotionCycleId: 7 });
  assert.equal(path, '/admin/promotions?cycleId=7&applicationId=42');
  const target = parsePromotionTarget(new URL(path, 'http://x').searchParams);
  assert.deepEqual(target, { cycleId: 7, applicationId: 42 });
});

test('cycle-only notifications, including rows written before this change, link to the cycle', () => {
  assert.equal(notificationPromotionPath({ relatedEntityType: 'PromotionCycle', relatedEntityId: 7 }), '/admin/promotions?cycleId=7');
  assert.equal(notificationPromotionPath({ relatedEntityType: 'PromotionCycle', relatedEntityId: 7, promotionCycleId: 7 }), '/admin/promotions?cycleId=7');
});

test('an application whose cycle cannot be resolved falls back to the plain Promotions page', () => {
  assert.equal(notificationPromotionPath({ relatedEntityType: 'PromotionApplication', relatedEntityId: 42, promotionApplicationId: 42 }), '/admin/promotions');
  assert.equal(notificationPromotionPath({ relatedEntityType: 'PromotionCycle', relatedEntityId: null }), '/admin/promotions');
});

test('malformed or hostile ids in the URL are ignored', () => {
  for (const qs of ['cycleId=abc', 'cycleId=-3', 'cycleId=0', 'cycleId=1.5', 'cycleId=1e3', 'applicationId=5', 'cycleId=9007199254740993']) {
    assert.equal(parsePromotionTarget(new URLSearchParams(qs)), null, qs);
  }
  assert.deepEqual(parsePromotionTarget(new URLSearchParams('cycleId=3&applicationId=x')), { cycleId: 3 });
});

test('the target resolves only against the cycles and applications the server listed', () => {
  const cycles = [{ id: 1 }, { id: 7 }];
  assert.equal(resolveTargetCycle({ cycleId: 7 }, cycles).cycle, cycles[1]);
  const apps = [{ id: 41 }, { id: 42 }];
  assert.equal(resolveTargetApplication({ cycleId: 7, applicationId: 42 }, apps).application, apps[1]);
  assert.equal(resolveTargetApplication({ cycleId: 7 }, apps), null);
});

test('a deleted or out-of-station target fails safely with a message', () => {
  // An AO II's cycle list and application list are station-scoped server-side,
  // so another station's record is simply absent and reads as unavailable.
  const cycle = resolveTargetCycle({ cycleId: 99 }, [{ id: 1 }]);
  assert.equal(cycle.kind, 'unavailable');
  assert.match(cycle.message, /no longer exists or is outside your assigned station/);
  const app = resolveTargetApplication({ cycleId: 1, applicationId: 500 }, [{ id: 41 }]);
  assert.equal(app.kind, 'unavailable');
  assert.match(app.message, /outside your assigned station/);
});

test('notification clicks route promotion records before keyword heuristics', () => {
  for (const file of ['Notifications.tsx', 'Dashboard.tsx']) {
    const src = fs.readFileSync(require.resolve(`../src/pages/admin/${file}`), 'utf8');
    const promo = src.indexOf("entity === 'promotioncycle' || entity === 'promotionapplication'");
    const credentials = src.indexOf("entity === 'accountcreationrequest'");
    assert.ok(promo > 0 && promo < credentials, `${file}: promotion routing must come first`);
    assert.match(src, /notificationPromotionPath\(n\)/);
  }
});

test('the Promotions page resolves links from its scoped lists and clears them from the URL', () => {
  const src = fs.readFileSync(require.resolve('../src/pages/admin/PromotionManagement.tsx'), 'utf8');
  assert.match(src, /resolveTargetCycle\(deepLink\.target, cycles\)/);
  assert.match(src, /resolveTargetApplication\(deepLink\.target, submittedApps\)/);
  assert.match(src, /appsLoadedForCycleId !== cycleId/);
  assert.match(src, /setSearchParams\(rest, \{ replace: true \}\)/);
});
