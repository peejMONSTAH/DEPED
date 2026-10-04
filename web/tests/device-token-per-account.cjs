const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, name);
const { deviceTokenFor, rememberDeviceToken, DEVICE_TOKEN_KEY } = require('../src/api/deviceTokens.ts');

const fakeStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('two accounts on one browser each keep their own trusted-device token', () => {
  const s = fakeStore();
  rememberDeviceToken('Teacher@Deped.gov.ph', 'token-teacher', s);
  rememberDeviceToken('ao@deped.gov.ph', 'token-ao', s);
  assert.equal(deviceTokenFor('teacher@deped.gov.ph', s), 'token-teacher');
  assert.equal(deviceTokenFor('ao@deped.gov.ph', s), 'token-ao');
});

test('signing back in without a new token makes that account\'s token the current one', () => {
  const s = fakeStore();
  rememberDeviceToken('a@x.ph', 'ta', s); rememberDeviceToken('b@x.ph', 'tb', s);
  assert.equal(s.getItem(DEVICE_TOKEN_KEY), 'tb');
  rememberDeviceToken('a@x.ph', undefined, s);
  assert.equal(s.getItem(DEVICE_TOKEN_KEY), 'ta');
});

test('a token saved before this change still works until the account earns its own', () => {
  const s = fakeStore();
  s.setItem(DEVICE_TOKEN_KEY, 'legacy');
  assert.equal(deviceTokenFor('anyone@x.ph', s), 'legacy');
});

test('the Android app also keeps one token per account and keeps them all across sign-out', () => {
  const dart = fs.readFileSync(path.join(__dirname, '../../mobile/lib/services/auth_service.dart'), 'utf8');
  assert.match(dart, /static String deviceKeyFor\(String email\)/);
  assert.match(dart, /startsWith\(keyDeviceToken\)/);
});
