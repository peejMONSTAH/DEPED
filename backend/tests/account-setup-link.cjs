require('ts-node/register/transpile-only');
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret-0123456789abcdef0123456789';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-0123456789abcdef012345678';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// A tiny in-memory stand-in for the three tables the setup flow touches.
const state = { users: new Map(), used: new Set(), writes: [] };
const prismaPath = require.resolve('../src/config/prisma');
require.cache[prismaPath] = {
  id: prismaPath, filename: prismaPath, loaded: true,
  exports: { __esModule: true, default: {
    user: {
      findUnique: async ({ where }) => state.users.get(where.id) ?? null,
      update: args => ({ op: 'user.update', args }),
    },
    usedMagicToken: {
      create: args => ({ op: 'used.create', args }),
      findUnique: async ({ where }) => (state.used.has(where.jti) ? { jti: where.jti } : null),
    },
    refreshToken: { updateMany: args => ({ op: 'rt.revoke', args }), create: args => ({ op: 'rt.create', args }) },
    validationLog: { create: args => ({ op: 'log', args }) },
    $transaction: async ops => {
      const used = ops.find(o => o.op === 'used.create');
      if (used && state.used.has(used.args.data.jti)) { const e = new Error('dup'); e.code = 'P2002'; throw e; }
      if (used) state.used.add(used.args.data.jti);
      for (const o of ops) {
        state.writes.push(o);
        if (o.op === 'user.update') Object.assign(state.users.get(o.args.where.id), o.args.data);
      }
      return ops;
    },
  } },
};

const { hashPassword } = require('../src/utils/hash.util');
const { generateMagicToken, passwordTokenVersion } = require('../src/utils/jwt.util');
const { completeAccountSetup, magicLogin } = require('../src/controllers/auth.controller');

const call = async (handler, body) => {
  const res = { statusCode: 200, body: null, locals: {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ body, ip: '127.0.0.1' }, res);
  return res;
};

let user;
const TEMP = 'Temp#Issued123';
test.before(async () => {
  user = {
    id: 11, email: 'teacher@deped.gov.ph', accountStatus: 'ACTIVE', mustChangePassword: true,
    passwordHash: await hashPassword(TEMP), role: { name: 'TEACHING_PERSONNEL' },
    personnel: { id: 8, firstName: 'Ana', lastName: 'Reyes', designation: 'Teacher I', address: '' },
  };
  state.users.set(user.id, user);
});

const setupToken = (overrides = {}) => generateMagicToken({
  userId: user.id, email: user.email, role: user.role.name, purpose: 'ACCOUNT_SETUP',
  pwdv: passwordTokenVersion(user.passwordHash), ...overrides,
});

test('a setup link cannot be used as a passwordless sign-in', async () => {
  const res = await call(magicLogin, { token: setupToken() });
  assert.equal(res.statusCode, 401);
  assert.match(res.body.message, /account setup link/);
});

test('a sign-in (deficiency) link cannot set a password', async () => {
  const token = generateMagicToken({ userId: user.id, email: user.email, role: user.role.name, pwdv: passwordTokenVersion(user.passwordHash), txId: 5 });
  const res = await call(completeAccountSetup, { token, newPassword: 'MyOwnPass2026' });
  assert.equal(res.statusCode, 401);
});

test('the temporary password cannot be kept as the new one', async () => {
  const res = await call(completeAccountSetup, { token: setupToken(), newPassword: TEMP });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /not the temporary one/);
});

test('setting a password signs the user in, clears the forced change and ends old sessions', async () => {
  const token = setupToken();
  const res = await call(completeAccountSetup, { token, newPassword: 'MyOwnPass2026' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.ok(res.body.data.accessToken && res.body.data.refreshToken);
  assert.equal(res.body.data.user.mustChangePassword, false);
  assert.equal(user.mustChangePassword, false);
  assert.ok(state.writes.some(o => o.op === 'rt.revoke'), 'temporary-password sessions revoked');
  assert.ok(state.writes.some(o => o.op === 'log' && o.args.data.action === 'ACCOUNT_SETUP_COMPLETED'), 'audited');

  const again = await call(completeAccountSetup, { token, newPassword: 'AnotherPass2026' });
  assert.equal(again.statusCode, 401, 'the link works once');
});

test('a link minted before the password changed is void', async () => {
  const stale = generateMagicToken({ userId: user.id, email: user.email, role: user.role.name, purpose: 'ACCOUNT_SETUP', pwdv: 'not-the-current-version' });
  const res = await call(completeAccountSetup, { token: stale, newPassword: 'FreshPass2026' });
  assert.equal(res.statusCode, 401);
  assert.match(res.body.message, /already changed/);
});

test('distribution emails a setup link and a fresh temporary password, forces a change, and both are wiped once sent', () => {
  const users = fs.readFileSync(path.join(__dirname, '../src/controllers/users.controller.ts'), 'utf8');
  assert.match(users, /const temporaryPassword = generateInitialPassword\(\);/);
  assert.match(users, /data: \{ accountStatus: 'ACTIVE', mustChangePassword: true, passwordHash: await hashPassword\(temporaryPassword\) \}/);
  assert.match(users, /credentials: \{ username: user\.email, initialPassword: temporaryPassword \}/);
  assert.match(users, /purpose: 'ACCOUNT_SETUP'/);
  assert.match(users, /actionUrl: `\$\{config\.clientUrl\}\/auth\/setup-account\?token=\$\{encodeURIComponent\(setupToken\)\}`/);
  assert.match(users, /sensitive: true,/);
  const outbox = fs.readFileSync(path.join(__dirname, '../src/services/workflow-outbox.service.ts'), 'utf8');
  assert.match(outbox, /\(item\.payload as any\)\?\.credentials \|\| \(item\.payload as any\)\?\.sensitive/);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/routes/auth.routes.ts'), 'utf8'), /router\.post\('\/complete-setup', completeAccountSetup\);/);
});
