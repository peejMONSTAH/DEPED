require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = rel => fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');

test('the web and backend agree on the Privacy Notice version', () => {
  const web = /PRIVACY_NOTICE_VERSION = '([^']+)'/.exec(read('web/src/constants/privacyNotice.ts'))[1];
  const api = /PRIVACY_NOTICE_VERSION = '([^']+)'/.exec(read('backend/src/utils/privacy-notice.util.ts'))[1];
  assert.equal(web, api);
  const mobile = /privacyNoticeVersion = '([^']+)'/.exec(read('mobile/lib/config/privacy_notice.dart'))[1];
  assert.equal(mobile, api);
});

test('consent routes require sign-in and the account-request route requires the attestation', () => {
  const routes = read('backend/src/routes/auth.routes.ts');
  assert.match(routes, /router\.get\('\/privacy-consent', authenticate, getPrivacyConsent\)/);
  assert.match(routes, /router\.post\('\/privacy-consent', authenticate, acceptPrivacyConsent\)/);
  const users = read('backend/src/controllers/users.controller.ts');
  assert.match(users, /String\(req\.body\.privacyAttested\) !== 'true'/);
});

test('consent is stored once per person and notice version, with an audit entry', () => {
  const schema = read('backend/prisma/schema.prisma');
  assert.match(schema, /model PrivacyConsent[\s\S]*@@unique\(\[userId, noticeVersion\]\)/);
  const controller = read('backend/src/controllers/privacy.controller.ts');
  assert.match(controller, /PRIVACY_NOTICE_OUTDATED/);
  assert.match(controller, /action: 'PRIVACY_NOTICE_ACCEPTED'/);
});

test('the sign-in gate starts unchecked and never blocks while a password change is pending', () => {
  const gate = read('web/src/components/common/PrivacyConsentGate.tsx');
  assert.match(gate, /useState\(false\)/);
  assert.match(gate, /!user\?\.mustChangePassword/);
  assert.match(read('web/src/App.tsx'), /path="\/privacy"/);
});
