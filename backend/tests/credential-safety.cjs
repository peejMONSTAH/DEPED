require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { passwordTokenVersion } = require('../src/utils/jwt.util');

const src = file => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');

// ── the mechanism magic-link revocation relies on ──────────────────────────
test('password version changes when the stored hash changes', () => {
  const before = passwordTokenVersion('$argon2id$v=19$m=65536,t=3,p=4$AAAA$BBBB');
  const after = passwordTokenVersion('$argon2id$v=19$m=65536,t=3,p=4$CCCC$DDDD');
  assert.notEqual(before, after);
});

test('password version is stable for the same hash', () => {
  const hash = '$argon2id$v=19$m=65536,t=3,p=4$EEEE$FFFF';
  assert.equal(passwordTokenVersion(hash), passwordTokenVersion(hash));
});

test('password version does not expose the hash', () => {
  const hash = '$argon2id$v=19$m=65536,t=3,p=4$GGGG$HHHH';
  const version = passwordTokenVersion(hash);
  assert.ok(!hash.includes(version));
  assert.match(version, /^[0-9a-f]{24}$/);
});

// ── invariants that were regressions, pinned against the source ────────────
test('magic login rejects a link minted before a password change', () => {
  const auth = src('controllers/auth.controller.ts');
  const handler = auth.slice(auth.indexOf('export const magicLogin'));
  assert.ok(
    /payload\.pwdv !== passwordTokenVersion\(user\.passwordHash\)/.test(handler),
    'magicLogin must compare the token password version against the current hash, ' +
      'otherwise a reset does not revoke outstanding 48h magic links',
  );
});

test('magic login links are never written to logs', () => {
  const email = src('services/email.service.ts');
  const logsTheLink = /logger\.(info|warn|error|debug)\([^)]*magicLoginUrl/.test(email)
    || /console\.log\([^)]*magicLoginUrl/.test(email);
  assert.equal(logsTheLink, false, 'the magic login URL is a working credential and must not be logged');
});

test('undeliverable credential emails are scrubbed once retries are exhausted', () => {
  const outbox = src('services/workflow-outbox.service.ts');
  assert.ok(/MAX_ATTEMPTS/.test(outbox), 'the attempt ceiling should be a named constant');
  const failurePath = outbox.slice(outbox.indexOf('} catch (error: any) {'));
  assert.ok(
    /redacted: true/.test(failurePath),
    'a payload holding credentials must be redacted on terminal failure, or the ' +
      'plaintext password stays in the database and every backup',
  );
});

test('account creation queues its email inside the same transaction', () => {
  const users = src('controllers/users.controller.ts');
  const createUser = users.slice(users.indexOf('export const createUser'));
  const body = createUser.slice(0, createUser.indexOf('sendCreated'));
  const queueIndex = body.indexOf('queueTransactionalEmail');
  const txEndIndex = body.indexOf('return { newUser, generatedEmployeeId };');
  assert.ok(queueIndex > -1 && txEndIndex > -1);
  assert.ok(
    queueIndex < txEndIndex,
    'the outbox insert must happen before the transaction callback returns, so an ' +
      'account is never created without its notification being queued',
  );
});
