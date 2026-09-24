require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = rel => fs.readFileSync(path.join(__dirname, '../src', rel), 'utf8');
const PICTOGRAPH = /\p{Extended_Pictographic}/u;

test('AO II and HRMO notification templates contain no emoji', () => {
  for (const file of ['controllers/promotions.controller.ts', 'controllers/transactions.controller.ts', 'controllers/users.controller.ts']) {
    const lines = read(file).split('\n');
    const offenders = lines.map((line, i) => [i + 1, line]).filter(([, line]) => PICTOGRAPH.test(line));
    assert.deepEqual(offenders.map(([n]) => n), [], `${file} still has emoji`);
  }
});

test('stored notifications with emoji are served as clean text', () => {
  const { plainNotificationText } = require('../src/utils/notification-text.util');
  assert.equal(plainNotificationText('📋 New Promotion Application Received: Ana (EMP-1)'), 'New Promotion Application Received: Ana (EMP-1)');
  assert.equal(plainNotificationText('⚠️ Deficiency Alert on TRX-5'), 'Deficiency Alert on TRX-5');
  assert.equal(plainNotificationText('Done ✅ for TRX-9 🎉'), 'Done for TRX-9', 'no doubled or trailing spaces left behind');
  assert.equal(plainNotificationText('Plain text stays exactly as written.'), 'Plain text stays exactly as written.');
  assert.match(read('controllers/notifications.controller.ts'), /message: plainNotificationText\(n\.message\)/);
});

test('account status changes cannot target your own account and deactivation ends sessions', () => {
  const users = read('controllers/users.controller.ts');
  assert.match(users, /userId === req\.user!\.userId && \(\(accountStatus && accountStatus !== existing\.accountStatus\) \|\| role\)/);
  assert.match(users, /const deactivated = updateData\.accountStatus === 'INACTIVE'/);
  assert.match(users, /if \(roleChanged \|\| deactivated\) \{\s*await tx\.refreshToken\.updateMany/);
  assert.match(users, /'Another account already uses this email address\.'/);
  const routes = read('routes/users.routes.ts');
  assert.match(routes, /router\.put\('\/:id', authorize\('SYSTEM_ADMIN', 'HRMO'\), updateUser\);/, 'AO II cannot edit or change status');
});

test('plantilla district and school filters are exact, combined, and never widen scope', () => {
  const controller = read('controllers/plantilla.controller.ts');
  assert.match(controller, /department: \{ equals: String\(school\)\.trim\(\), mode: 'insensitive' \}/);
  assert.match(controller, /division: \{ endsWith: ` - \$\{name\}`, mode: 'insensitive' \}/);
  assert.match(controller, /if \(locationFilters\.length\) where\.AND = locationFilters;/);
  assert.doesNotMatch(controller, /where\.division = \{ contains:/);
  // Scope is applied after the filters, so a filter can only narrow it.
  assert.ok(controller.indexOf('where.AND = locationFilters') < controller.indexOf('Object.assign(where, stationPlantillaFilter(scope))'));
});

test('only a System Administrator grants or removes HRMO and System Administrator roles', () => {
  const { canAssignRole, canChangeRole } = require('../src/utils/role-assignment.util');
  for (const role of ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL', 'AO_II', 'HRMO', 'SYSTEM_ADMIN']) {
    assert.equal(canAssignRole('SYSTEM_ADMIN', role), true, `SYSTEM_ADMIN -> ${role}`);
  }
  for (const role of ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL', 'AO_II']) assert.equal(canAssignRole('HRMO', role), true, `HRMO -> ${role}`);
  for (const role of ['HRMO', 'SYSTEM_ADMIN']) assert.equal(canAssignRole('HRMO', role), false, `HRMO must not grant ${role}`);
  for (const actor of ['AO_II', 'TEACHING_PERSONNEL', undefined]) {
    assert.equal(canAssignRole(actor, 'TEACHING_PERSONNEL'), false, `${actor} grants no roles`);
  }
  assert.equal(canChangeRole('HRMO', 'SYSTEM_ADMIN', 'TEACHING_PERSONNEL'), false, 'HRMO cannot demote a System Administrator');
  assert.equal(canChangeRole('HRMO', 'TEACHING_PERSONNEL', 'AO_II'), true);

  const users = read('controllers/users.controller.ts');
  assert.match(users, /if \(!canAssignRole\(req\.user\?\.role, role\)\) \{\s*sendForbidden\(res, ROLE_REFUSAL\);/, 'createUser enforces it');
  assert.match(users, /role !== existing\.role\.name && !canChangeRole\(req\.user\?\.role, existing\.role\.name, role\)/, 'updateUser enforces it');
  assert.match(users, /if \(!isPersonnelRole\(req\.body\.role\)\) \{ sendBadRequest\(res, 'Only teaching and non-teaching personnel accounts can be requested\.'\)/, 'AO II requests stay personnel-only');
});
