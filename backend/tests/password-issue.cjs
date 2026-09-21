require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { generateInitialPassword } = require('../src/utils/password-issue.util');
const { validatePasswordComplexity } = require('../src/utils/hash.util');

const src = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('issued passwords satisfy the complexity rule', () => {
  for (let i = 0; i < 200; i++) {
    const pw = generateInitialPassword();
    const result = validatePasswordComplexity(pw);
    assert.equal(result.valid, true, `rejected "${pw}": ${result.message}`);
  }
});

test('issued passwords are unique per account', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(generateInitialPassword());
  assert.equal(seen.size, 500, 'a repeat means one leaked password opens several accounts');
});

test('issued passwords avoid glyphs that are misread aloud or on paper', () => {
  for (let i = 0; i < 100; i++) {
    assert.doesNotMatch(generateInitialPassword(), /[0O1lI]/);
  }
});

test('no shared password literal remains in any client source', () => {
  // Scoped to one file at first, which missed a second Add Personnel form that
  // carried its own copy of the same literal. Walk the whole web source instead.
  const webRoot = path.join(__dirname, '..', '..', 'web', 'src');
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /.(ts|tsx)$/.test(full) ? [full] : [];
  });
  const offenders = [];
  for (const file of walk(webRoot)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const literal of ['Personnel@Pass123', 'Reset@Pass2026']) {
      if (text.includes(literal)) offenders.push(`${path.relative(webRoot, file)}: ${literal}`);
    }
  }
  assert.deepEqual(offenders, [], 'a shared literal would be every account' + String.fromCharCode(39) + 's password');
  assert.ok(!src('src/controllers/users.controller.ts').includes("startsWith('Temp@')"),
    'the Temp@ heuristic never matched an issued password and is superseded by mustChangePassword');
});

test('every password an administrator issues arms the forced change', () => {
  const users = src('src/controllers/users.controller.ts');
  const flags = (users.match(/mustChangePassword: true/g) || []).length;
  // createUser, admin reset, and approving an account request.
  assert.ok(flags >= 3, `expected all three issuance paths to flag the account, found ${flags}`);
});

test('the gate is enforced by the API, not only by the client', () => {
  const mw = src('src/middleware/auth.middleware.ts');
  assert.match(mw, /user\.mustChangePassword && !isPasswordChangeRoute\(req\)/);
  assert.match(mw, /PASSWORD_CHANGE_REQUIRED/);
});

test('changing or resetting a password clears the cached user record', () => {
  assert.match(src('src/controllers/auth.controller.ts'), /invalidateAuthUserCache\(userId\)/,
    'without this the freshly issued token is rejected as stale for up to 30s');
  assert.match(src('src/controllers/users.controller.ts'), /invalidateAuthUserCache\(userId\)/);
});
