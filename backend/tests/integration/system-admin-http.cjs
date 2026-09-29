// System Administration over real HTTP against a throwaway database:
// authorization, last-administrator protection, sessions and devices, the
// email outbox, backup evidence, service health and backend CSV exports.
// Run only against a disposable local server whose database name ends in _test.
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const base = new URL(process.env.DATABASE_URL || 'http://missing');
assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(base.hostname) && base.pathname.endsWith('_test'),
  'Requires a local database ending in _test. Never production.');
const dbName = `digital201_sysadmin_${process.pid}_test`;
const isolated = new URL(base.href);
isolated.pathname = `/${dbName}`;
const REPORT_TOKEN = 'r'.repeat(40);
Object.assign(process.env, {
  DATABASE_URL: isolated.href, DIRECT_URL: isolated.href, NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'sysadmin-http-access-secret', JWT_REFRESH_SECRET: 'sysadmin-http-refresh-secret',
  RATE_LIMIT_MAX_REQUESTS: '100000', CLIENT_URL: 'http://sysadmin.invalid', CORS_ORIGIN: 'http://sysadmin.invalid',
  SMTP_HOST: '', MAILTRAP_API_TOKEN: '', DEVICE_CODE_FOR_TESTS: '424242', SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '',
  DOCUMENT_STORAGE: 'local', WORKFLOW_OUTBOX_ENABLED: 'false', BACKUP_REPORT_TOKEN: REPORT_TOKEN,
});

const client = require('@prisma/client');
const root = new client.PrismaClient({ datasources: { db: { url: base.href } } });
let db, server, baseUrl;
const stub = (request, exports) => {
  const file = require.resolve(request);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub('morgan', Object.assign(() => (req, res, next) => next(), { token() {} }));

const PASSWORD = 'Admin#Setup2026!';
async function http(token, method, url, body, headers = {}) {
  const h = { 'user-agent': 'sysadmin-e2e', ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (body !== undefined) h['content-type'] = 'application/json';
  const res = await fetch(`${baseUrl}/api/v1${url}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* csv */ }
  return { status: res.status, json, text, headers: res.headers };
}
async function login(email) {
  let r = await http(null, 'POST', '/auth/login', { email, password: PASSWORD });
  if (r.json?.data?.requiresVerification) r = await http(null, 'POST', '/auth/verify-device', { challengeToken: r.json.data.challengeToken, code: '424242' });
  assert.equal(r.status, 200, `login ${email}: ${r.text.slice(0, 200)}`);
  return r.json.data;
}
const SECRET_SHAPES = /"(token|tokenHash|codeHash|passwordHash|payload|refreshToken)"\s*:/;

const U = {};
test.before(async () => {
  await root.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await root.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    { cwd: path.resolve(__dirname, '../..'), env: process.env, stdio: 'pipe' });
  db = new client.PrismaClient({ datasources: { db: { url: isolated.href } } });
  stub('../../src/config/prisma', { __esModule: true, default: db });
  const { hashPassword } = require('../../src/utils/hash.util');
  const hash = await hashPassword(PASSWORD);
  const roles = {};
  for (const r of ['SYSTEM_ADMIN', 'HRMO', 'AO_II', 'TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL']) {
    roles[r] = (await db.role.upsert({ where: { name: r }, create: { name: r }, update: {} })).id;
  }
  const mk = (email, role, extra = {}) => db.user.create({ data: { email, passwordHash: hash, roleId: roles[role], accountStatus: 'ACTIVE', mustChangePassword: false, deviceVerification: false, ...extra } });
  U.admin = await mk('admin@sa.invalid', 'SYSTEM_ADMIN');
  U.hrmo = await mk('hrmo@sa.invalid', 'HRMO');
  U.teacher = await mk('teacher@sa.invalid', 'TEACHING_PERSONNEL');
  const app = require('../../src/app').default;
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  server?.close();
  await db?.$disconnect();
  await root.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await root.$disconnect();
});

test('only a System Administrator reaches /admin; HR roles and anonymous callers are refused', async () => {
  assert.equal((await http(null, 'GET', '/admin/sessions')).status, 401);
  for (const email of ['hrmo@sa.invalid', 'teacher@sa.invalid']) {
    const { accessToken } = await login(email);
    for (const url of ['/admin/sessions', '/admin/devices', '/admin/operations/email', '/admin/operations/health', '/admin/reports/accounts/export']) {
      assert.equal((await http(accessToken, 'GET', url)).status, 403, `${email} ${url}`);
    }
  }
  const { accessToken } = await login('admin@sa.invalid');
  assert.equal((await http(accessToken, 'GET', '/admin/sessions')).status, 200);
});

test('the last active System Administrator cannot be deactivated, locked, demoted or deleted', async () => {
  const { wouldRemoveLastAdministrator } = require('../../src/utils/system-admin.util');
  const current = { role: 'SYSTEM_ADMIN', accountStatus: 'ACTIVE' };
  for (const change of [{ accountStatus: 'INACTIVE' }, { accountStatus: 'LOCKED' }, { role: 'HRMO' }, { deleted: true }]) {
    assert.equal(await wouldRemoveLastAdministrator(U.admin.id, current, change), true, JSON.stringify(change));
  }
  assert.equal(await wouldRemoveLastAdministrator(U.admin.id, current, { accountStatus: 'ACTIVE' }), false, 'no change');
  const other = await db.user.create({ data: { email: 'admin2@sa.invalid', passwordHash: 'x', roleId: U.admin.roleId, accountStatus: 'ACTIVE' } });
  assert.equal(await wouldRemoveLastAdministrator(U.admin.id, current, { accountStatus: 'INACTIVE' }), false, 'another admin is active');
  await db.user.delete({ where: { id: other.id } });
  // Over HTTP an administrator cannot change their own status or role at all.
  const { accessToken } = await login('admin@sa.invalid');
  assert.equal((await http(accessToken, 'PUT', `/users/${U.admin.id}`, { accountStatus: 'INACTIVE' })).status, 400);
  assert.equal((await http(accessToken, 'DELETE', `/users/${U.admin.id}`)).status, 400);
  const src = fs.readFileSync(path.resolve(__dirname, '../../src/controllers/users.controller.ts'), 'utf8');
  assert.equal((src.match(/wouldRemoveLastAdministrator\(/g) || []).length, 2, 'update and delete both guarded');
});

test('sessions: listed without tokens, revocation stops refresh, bulk sign-out needs confirmation for yourself', async () => {
  const teacher = await login('teacher@sa.invalid');
  const { accessToken } = await login('admin@sa.invalid');
  const list = await http(accessToken, 'GET', `/admin/sessions?userId=${U.teacher.id}`);
  assert.equal(list.status, 200);
  assert.doesNotMatch(list.text, SECRET_SHAPES, 'no token or hash in the response');
  assert.ok(list.json.data.length >= 1);
  const sid = list.json.data[0].id;
  const revoked = await http(accessToken, 'DELETE', `/admin/sessions/${sid}`, { reason: 'test' });
  assert.equal(revoked.json.data.result, 'REVOKED');
  const refresh = await http(null, 'POST', '/auth/refresh', { refreshToken: teacher.refreshToken });
  assert.notEqual(refresh.status, 200, 'revoked session cannot refresh');
  const now = await http(teacher.accessToken, 'GET', '/notifications');
  assert.equal(now.status, 401, 'the access token stops working at once');
  assert.equal(now.json.code, 'SESSION_REVOKED');
  const own = await http(accessToken, 'DELETE', `/admin/accounts/${U.admin.id}/sessions`, {});
  assert.equal(own.json.code, 'OWN_SESSION_CONFIRM_REQUIRED');
  const all = await http(accessToken, 'DELETE', `/admin/accounts/${U.teacher.id}/sessions`, { reason: 'test' });
  assert.equal(all.json.data.result, 'SIGNED_OUT');
  const logs = await db.validationLog.findMany({ where: { action: { in: ['SESSION_REVOKED', 'SESSIONS_REVOKED_ALL'] } } });
  assert.equal(logs.length, 2, 'both revocations audited');
  assert.ok(await db.notification.findFirst({ where: { userId: U.teacher.id, message: { contains: 'signed' } } }), 'teacher notified');
});

test('devices: requiring verification revokes trusted devices and turns the check on', async () => {
  await db.trustedDevice.create({ data: { userId: U.teacher.id, tokenHash: crypto.randomBytes(16).toString('hex'), label: 'Chrome on Windows', expiresAt: new Date(Date.now() + 86400000) } });
  const { accessToken } = await login('admin@sa.invalid');
  const list = await http(accessToken, 'GET', `/admin/devices?userId=${U.teacher.id}`);
  assert.doesNotMatch(list.text, SECRET_SHAPES);
  assert.equal(list.json.data.length, 1);
  const r = await http(accessToken, 'POST', `/admin/accounts/${U.teacher.id}/require-device-verification`, { reason: 'test' });
  assert.equal(r.json.data.devicesRevoked, 1);
  assert.equal((await db.user.findUnique({ where: { id: U.teacher.id } })).deviceVerification, true);
  const next = await http(null, 'POST', '/auth/login', { email: 'teacher@sa.invalid', password: PASSWORD });
  assert.equal(next.json.data.requiresVerification, true, 'next sign-in asks for a code');
});

test('email outbox: masked recipients, no payload, retry only for failed messages, once per cooldown', async () => {
  const failed = await db.workflowOutbox.create({ data: { eventKey: 'account:1:setup', kind: 'TRANSACTIONAL', attempts: 8,
    payload: { recipientEmail: 'juan.delacruz@deped.gov.ph', subject: 'Set up', credentials: { initialPassword: 'Secret#123' } }, lastError: 'Rejected juan.delacruz@deped.gov.ph token=abc' } });
  await db.workflowOutbox.create({ data: { eventKey: 'account:2:setup', kind: 'TRANSACTIONAL', attempts: 0, payload: { recipientEmail: 'x@y.z' } } });
  const { accessToken } = await login('admin@sa.invalid');
  const list = await http(accessToken, 'GET', '/admin/operations/email?state=FAILED');
  assert.equal(list.json.data.length, 1);
  assert.doesNotMatch(list.text, /Secret#123|juan\.delacruz|token=abc/, 'no credential, address or token leaks');
  assert.equal(list.json.data[0].recipient, 'ju***@deped.gov.ph');
  assert.equal(list.json.data[0].state, 'FAILED');
  const retry = await http(accessToken, 'POST', `/admin/operations/email/${failed.id}/retry`);
  assert.equal(retry.json.data.result, 'REQUEUED');
  // It is RETRYING now, so a second retry is refused rather than queued twice.
  const again = await http(accessToken, 'POST', `/admin/operations/email/${failed.id}/retry`);
  assert.equal(again.json.code, 'NOT_FAILED');
  await db.workflowOutbox.update({ where: { id: failed.id }, data: { attempts: 8 } });
  const tooSoon = await http(accessToken, 'POST', `/admin/operations/email/${failed.id}/retry`);
  assert.equal(tooSoon.json.code, 'RETRY_RATE_LIMITED');
  assert.equal(await db.validationLog.count({ where: { action: 'EMAIL_RETRY_REQUESTED' } }), 1);
});

test('backups: no evidence is UNKNOWN, a failed report alerts admins, stale success is DEGRADED', async () => {
  const { accessToken } = await login('admin@sa.invalid');
  assert.equal((await http(accessToken, 'GET', '/admin/operations/backups')).json.data.status, 'UNKNOWN');
  assert.equal((await http(null, 'POST', '/admin/operations/backups/report', { kind: 'DATABASE_BACKUP', status: 'SUCCEEDED', runKey: 'run-1' })).status, 401, 'report needs the token');
  const H = { 'x-backup-report-token': REPORT_TOKEN };
  const failed = await http(null, 'POST', '/admin/operations/backups/report', { kind: 'DATABASE_BACKUP', status: 'FAILED', runKey: 'run-1', error: 'pg_dump: connection refused' }, H);
  assert.equal(failed.json.data.result, 'RECORDED');
  assert.equal((await http(null, 'POST', '/admin/operations/backups/report', { kind: 'DATABASE_BACKUP', status: 'FAILED', runKey: 'run-1' }, H)).json.data.result, 'UPDATED', 'same runKey is idempotent');
  assert.equal((await http(accessToken, 'GET', '/admin/operations/backups')).json.data.status, 'UNAVAILABLE');
  assert.ok(await db.notification.findFirst({ where: { userId: U.admin.id, relatedEntityType: 'BackupRun' } }), 'admin alerted');
  const old = new Date(Date.now() - 48 * 3600_000).toISOString();
  await http(null, 'POST', '/admin/operations/backups/report', { kind: 'DATABASE_BACKUP', status: 'SUCCEEDED', runKey: 'run-2', finishedAt: old, manifestVerified: true, missingObjects: 0 }, H);
  assert.equal((await http(accessToken, 'GET', '/admin/operations/backups')).json.data.status, 'DEGRADED', 'a 48-hour-old backup is not healthy');
  const routes = require('../../src/routes/system-admin.routes').default.stack.map(l => l.route?.path).filter(Boolean);
  assert.ok(!routes.some(p => /restore/i.test(p)), 'no restore endpoint');
});

test('service health performs its checks and reports unconfigured parts honestly', async () => {
  const { accessToken } = await login('admin@sa.invalid');
  const r = await http(accessToken, 'GET', '/admin/operations/health?refresh=1');
  assert.equal(r.status, 200);
  const by = Object.fromEntries(r.json.data.checks.map(c => [c.key, c]));
  assert.equal(by.database.status, 'OPERATIONAL');
  assert.equal(typeof by.database.metrics.latencyMs, 'number');
  assert.equal(by.email.status, 'NOT_CONFIGURED');
  assert.notEqual(by.storage.status, 'OPERATIONAL', 'local storage is not reported as the production store');
  assert.notEqual(by.backup.status, 'OPERATIONAL');
  assert.doesNotMatch(r.text, /postgres(ql)?:\/\/|secret|serviceKey/i, 'no connection strings or keys');
});

test('exports are generated server-side with filters, row count, checksum and an audit event', async () => {
  const { accessToken } = await login('admin@sa.invalid');
  const r = await http(accessToken, 'GET', '/admin/reports/accounts/export?role=TEACHING_PERSONNEL');
  assert.equal(r.status, 200);
  const [, , , meta, head, ...rows] = r.text.trim().split('\n');
  assert.match(meta, /rows=1 /);
  assert.equal(head.split(',')[0], 'id');
  assert.equal(rows.length, 1);
  assert.match(rows[0], /teacher@sa\.invalid/);
  const body = r.text.trim().split('\n').slice(4).join('\n');
  assert.equal(r.headers.get('x-export-checksum'), crypto.createHash('sha256').update(body).digest('hex'));
  assert.ok(await db.validationLog.findFirst({ where: { action: 'OPERATIONAL_REPORT_EXPORTED', targetReference: 'accounts' } }));
  assert.equal((await http(accessToken, 'GET', '/admin/reports/promotion-rankings/export')).json.code, 'UNKNOWN_REPORT', 'HR reports are not here');
});

test('onboarding: separate states, a queued email is never reported as sent, one resend per double click', async () => {
  const roleId = (await db.role.findUnique({ where: { name: 'TEACHING_PERSONNEL' } })).id;
  const fresh = await db.user.create({ data: { email: 'newbie@sa.invalid', passwordHash: 'x', roleId, accountStatus: 'ACTIVE', mustChangePassword: true } });
  const { accessToken } = await login('admin@sa.invalid');
  const before = await http(accessToken, 'GET', `/users/${fresh.id}/onboarding`);
  assert.equal(before.status, 200);
  assert.equal(before.json.data.invitation.state, 'NOT_SENT');
  assert.equal(before.json.data.setupCompleted, false);
  assert.equal(before.json.data.firstSignInAt, null);
  assert.equal(before.json.data.canResend, true);

  const [a, b] = await Promise.all([1, 2].map(() => http(accessToken, 'POST', `/users/${fresh.id}/resend-invitation`)));
  assert.deepEqual([a.status, b.status].sort(), [200, 409], 'a double click queues one setup email');
  assert.equal(await db.workflowOutbox.count({ where: { eventKey: { startsWith: `user:${fresh.id}:invite:` } } }), 1);

  const after = await http(accessToken, 'GET', `/users/${fresh.id}/onboarding`);
  assert.notEqual(after.json.data.invitation.state, 'SENT', 'no email service is configured, so it is not reported as sent');
  assert.ok(['QUEUED', 'RETRYING'].includes(after.json.data.invitation.state));
  assert.doesNotMatch(after.text, /initialPassword|setup-account\?token/, 'no credential in the onboarding view');

  const done = await http(accessToken, 'POST', `/users/${U.teacher.id}/resend-invitation`);
  assert.equal(done.json.code, 'INVITATION_NOT_NEEDED', 'an account already set up gets Reset password, not an invitation');
  const hr = await login('hrmo@sa.invalid');
  assert.notEqual((await http(hr.accessToken, 'POST', `/users/${U.admin.id}/resend-invitation`)).status, 200, 'HRMO cannot act on an administrator account');
});
