const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// A device trusted before tokens were kept per account holds its token only in a shared slot.
// When a password sign-in succeeds because that token was trusted, the server must hand it back,
// so the web and phone clients can file it under this account before another account overwrites
// the shared slot. Otherwise that account is asked for an emailed code again.
const source = fs.readFileSync(path.join(__dirname, '../src/controllers/auth.controller.ts'), 'utf8');
const login = source.slice(source.indexOf('if (user.deviceVerification && !(await isTrustedDevice('), source.indexOf('const displayName = '));

test('a trusted password sign-in returns the accepted device token', () => {
  assert.match(login, /const trustedToken = config\.deviceVerification\.enabled && user\.deviceVerification && typeof req\.body\.deviceToken === 'string'/);
  assert.match(login, /completeSignIn\(user, req, res, trustedToken \? \{ deviceToken: trustedToken \} : \{\}\)/);
});

test('the echo happens only after the trust check passed', () => {
  assert.ok(login.indexOf('isTrustedDevice(') < login.indexOf('const trustedToken'), 'the token is echoed only on the trusted path');
});
