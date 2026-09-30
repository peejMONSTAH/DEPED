// HR-direct review, seat handover and the personnel view, end to end: the real app, routes,
// middleware, controllers, signed JWTs and PostgreSQL, with HR_DIRECT_REVIEW switched on.
//
// Creates, migrates and drops its own database on the server DATABASE_URL points at.
// Run only against a disposable local server.
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const base = new URL(process.env.DATABASE_URL || 'http://missing');
assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(base.hostname) && base.pathname.endsWith('_test'),
  'Integration tests require an explicitly configured local database ending in _test. Never use production.');

const dbName = `digital201_hrdirect_${process.pid}_test`;
const isolated = new URL(base.href);
isolated.pathname = `/${dbName}`;
Object.assign(process.env, {
  DATABASE_URL: isolated.href, DIRECT_URL: isolated.href, NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'integration-only-access-key-no-real-sessions',
  JWT_REFRESH_SECRET: 'integration-only-refresh-key-no-real-sessions',
  RATE_LIMIT_MAX_REQUESTS: '100000',
  SMTP_HOST: '', SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', DOCUMENT_STORAGE: 'local', OCR_PROVIDER: '',
  HR_DIRECT_REVIEW: 'on',
});

const client = require(process.env.GAP_PRISMA_CLIENT_PATH ? path.resolve(process.env.GAP_PRISMA_CLIENT_PATH) : '@prisma/client');
require.cache[require.resolve('@prisma/client')] = { exports: client };
const admin = new client.PrismaClient({ datasources: { db: { url: base.href } } });
let db;

const stub = (request, exports) => {
  const file = require.resolve(request);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub('../../src/services/workflow-outbox.service', {
  queueTransactionalEmail: async () => {}, queueDeficiencyEmail: async () => {},
  processWorkflowOutbox: async () => {}, startWorkflowOutboxWorker: () => {},
});
stub('../../src/services/tesseract-ocr.service', { extractWithTesseract: async () => { throw new Error('OCR is disabled in tests'); } });
const objects = new Map();
let objectSequence = 0;
stub('../../src/services/document-storage.service', {
  async storeDocument(buffer) { const key = `synthetic-object:${++objectSequence}`; objects.set(key, buffer); return key; },
  async readDocument(key) { if (!objects.has(key)) throw new Error('missing object'); return objects.get(key); },
  async discardUncommittedDocument(key) { objects.delete(key); },
});
stub('morgan', Object.assign(() => (req, res, next) => next(), { token() {} }));

const MORALES = 'Morales Elementary School';
const MATULAS = 'Matulas Elementary School'; // deliberately has no AO II
const people = {};
const f = {};
let server, baseUrl, generateAccessToken, passwordTokenVersion;

async function account(key, role, school, extra = {}) {
  const roleRow = await db.role.upsert({ where: { name: role }, create: { name: role }, update: {} });
  const passwordHash = `synthetic-hash-${key}`;
  const user = await db.user.create({
    data: {
      email: `${key}@hrdirect.invalid`, passwordHash, roleId: roleRow.id, accountStatus: 'ACTIVE',
      personnel: { create: {
        employeeId: `HRD-${key}`, firstName: key, lastName: 'Fixture', designation: extra.designation || 'Administrative Assistant II',
        school, district: 'District 1', status: 'ACTIVE', profileComplete: true,
      } },
    },
    include: { personnel: true },
  });
  const sid = `synthetic-session-${key}`;
  await db.refreshToken.create({ data: { userId: user.id, token: sid, expiresAt: new Date(Date.now() + 86400000) } });
  people[key] = {
    key, role, userId: user.id, personnelId: user.personnel.id,
    token: generateAccessToken({ userId: user.id, email: user.email, role, pwdv: passwordTokenVersion(passwordHash), sid }),
  };
  return people[key];
}

async function call(actor, method, url, { body, headers = {} } = {}) {
  const allHeaders = { 'user-agent': 'hr-direct-integration', ...headers };
  if (actor) allHeaders.authorization = `Bearer ${actor.token}`;
  let payload;
  if (body !== undefined) { allHeaders['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${baseUrl}/api/v1${url}`, { method, headers: allHeaders, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}
const get = (actor, url, headers) => call(actor, 'GET', url, { headers });
const post = (actor, url, body, headers) => call(actor, 'POST', url, { body, headers });

const validateBody = tx => ({ documentValidations: [{ documentId: tx.docId, isValid: true }], remarks: '' });

test.before(async () => {
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { cwd: path.resolve(__dirname, '../..'), env: process.env, stdio: 'pipe' });
  db = new client.PrismaClient({ datasources: { db: { url: isolated.href } } });
  stub('../../src/config/prisma', { __esModule: true, default: db });
  ({ generateAccessToken, passwordTokenVersion } = require('../../src/utils/jwt.util'));

  await account('moralesAo', 'AO_II', MORALES);
  await account('hrmo1', 'HRMO', null);
  await account('hrmo2', 'HRMO', null);
  await account('sysadmin', 'SYSTEM_ADMIN', null);
  await account('moralesTeacher', 'TEACHING_PERSONNEL', MORALES, { designation: 'Teacher I' });
  await account('matulasTeacher', 'TEACHING_PERSONNEL', MATULAS, { designation: 'Teacher I' });
  await account('moralesStaff', 'NON_TEACHING_PERSONNEL', MORALES);
  await account('moralesSuccessor', 'NON_TEACHING_PERSONNEL', MORALES);
  await account('matulasStaff', 'NON_TEACHING_PERSONNEL', MATULAS);

  const txType = await db.transactionType.create({ data: { name: 'Promotion' } });
  const template = await db.requirementTemplate.create({ data: { transactionTypeId: txType.id, name: 'Diploma', isMandatory: true, expectedDataType: 'PDF' } });
  // Approval of a promotion needs a linked application, which is not what is under test here, so the
  // HRMO approval cases use an ordinary records transaction.
  const recordsType = await db.transactionType.create({ data: { name: 'Records Update' } });
  const recordsTemplate = await db.requirementTemplate.create({ data: { transactionTypeId: recordsType.id, name: 'Supporting file', isMandatory: true, expectedDataType: 'PDF' } });
  const transaction = async (owner, status = 'PENDING_VALIDATION', type = txType, tpl = template) => {
    const tx = await db.transaction.create({ data: { personnelId: owner.personnelId, transactionTypeId: type.id, status, submissionDate: new Date() } });
    const key = `synthetic-object:${++objectSequence}`;
    objects.set(key, Buffer.from('%PDF-1.4\n'));
    const doc = await db.uploadedDocument.create({ data: {
      transactionId: tx.id, requirementTemplateId: tpl.id, storagePath: key, fileName: `${owner.key}.pdf`,
      mimeType: 'application/pdf', fileSize: 9, uploadedByUserId: owner.userId, status: 'REQUIRES_MANUAL_REVIEW',
    } });
    return { id: tx.id, docId: doc.id };
  };
  f.teacherTx = await transaction(people.moralesTeacher);
  f.matulasTeacherTx = await transaction(people.matulasTeacher);
  f.staffTx = await transaction(people.moralesStaff, 'PENDING_VALIDATION', recordsType, recordsTemplate);
  f.staffTx2 = await transaction(people.matulasStaff, 'PENDING_VALIDATION', recordsType, recordsTemplate);
  f.hrmoOwnTx = await transaction(people.hrmo1);
  f.aoOwnTx = await transaction(people.moralesAo);

  const app = require('../../src/app').default;
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (db) await db.$disconnect();
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.$disconnect();
});

test('1. an AO II validates a teaching transaction of their own station', async () => {
  const res = await post(people.moralesAo, `/transactions/${f.teacherTx.id}/validate`, validateBody(f.teacherTx));
  assert.equal(res.status, 200, res.text);
  assert.equal((await db.transaction.findUnique({ where: { id: f.teacherTx.id } })).status, 'FOR_APPROVAL');
});

test('2. an AO II is refused a non-teaching transaction: those go to HRMO directly', async () => {
  const res = await post(people.moralesAo, `/transactions/${f.staffTx.id}/validate`, validateBody(f.staffTx));
  assert.equal(res.status, 403);
  assert.match(res.json.message, /HRMO directly/);
  assert.equal((await db.transaction.findUnique({ where: { id: f.staffTx.id } })).status, 'PENDING_VALIDATION');
});

test('3. the AO II queue holds teaching transactions only', async () => {
  const res = await get(people.moralesAo, '/transactions?limit=100');
  assert.equal(res.status, 200);
  const ids = (res.json.data || []).map(r => r.id);
  assert.ok(ids.includes(f.teacherTx.id));
  assert.ok(!ids.includes(f.staffTx.id), 'a non-teaching transaction must not sit in the AO II queue');
});

test('4. HRMO validates non-teaching directly; the HRMO validation queue lists them', async () => {
  const queue = await get(people.hrmo1, '/transactions?limit=100&queue=validation');
  const ids = (queue.json.data || []).map(r => r.id);
  assert.ok(ids.includes(f.staffTx.id) && ids.includes(f.staffTx2.id));
  assert.ok(ids.includes(f.matulasTeacherTx.id), 'a teaching file at a station with no AO II is covered by HRMO, so it is listed');
  assert.ok(!ids.includes(f.teacherTx.id), 'a teaching file at a station with an AO II is not in the HRMO validation queue');
  const res = await post(people.hrmo1, `/transactions/${f.staffTx.id}/validate`, validateBody(f.staffTx));
  assert.equal(res.status, 200, res.text);
  assert.equal((await db.transaction.findUnique({ where: { id: f.staffTx.id } })).status, 'FOR_APPROVAL');
});

test('5. the HRMO who validated cannot give final approval; a different HRMO can', async () => {
  const same = await post(people.hrmo1, `/transactions/${f.staffTx.id}/approve`, { isApproved: true, notes: 'ok' });
  assert.equal(same.status, 403);
  assert.match(same.json.message, /different HRMO/);
  const other = await post(people.hrmo2, `/transactions/${f.staffTx.id}/approve`, { isApproved: true, notes: 'ok' });
  assert.equal(other.status, 200, other.text);
  assert.equal((await db.transaction.findUnique({ where: { id: f.staffTx.id } })).status, 'APPROVED');
});

test('6. the System Administrator may not approve while another HRMO could', async () => {
  const validated = await post(people.hrmo1, `/transactions/${f.staffTx2.id}/validate`, validateBody(f.staffTx2));
  assert.equal(validated.status, 200, validated.text);
  const res = await post(people.sysadmin, `/transactions/${f.staffTx2.id}/approve`, { isApproved: true, notes: 'ok' });
  assert.equal(res.status, 403);
  assert.match(res.json.message, /Another HRMO/);
});

test('7. HRMO does not validate a station that has its own AO II, but covers one that has none', async () => {
  const covered = await db.transaction.findUnique({ where: { id: f.matulasTeacherTx.id } });
  assert.equal(covered.status, 'PENDING_VALIDATION');
  const withAo = await post(people.hrmo1, `/transactions/${f.teacherTx.id}/validate`, validateBody(f.teacherTx));
  assert.equal(withAo.status, 403); // wrong state or wrong lane: either way refused
  const noAo = await post(people.hrmo1, `/transactions/${f.matulasTeacherTx.id}/validate`, validateBody(f.matulasTeacherTx));
  assert.equal(noAo.status, 200, noAo.text);
});

test('8. nobody validates their own transaction', async () => {
  const hr = await post(people.hrmo1, `/transactions/${f.hrmoOwnTx.id}/validate`, validateBody(f.hrmoOwnTx));
  assert.equal(hr.status, 403);
  const ao = await post(people.moralesAo, `/transactions/${f.aoOwnTx.id}/validate`, validateBody(f.aoOwnTx));
  assert.equal(ao.status, 403);
});

test('9. a submission by a non-teaching account notifies HRMO, not the AO II', async () => {
  const draft = await db.transaction.create({ data: { personnelId: people.moralesStaff.personnelId, transactionTypeId: (await db.transactionType.findFirst()).id, status: 'DRAFT' } });
  const tpl = await db.requirementTemplate.findFirst();
  const key = `synthetic-object:${++objectSequence}`;
  objects.set(key, Buffer.from('%PDF-1.4\n'));
  await db.uploadedDocument.create({ data: { transactionId: draft.id, requirementTemplateId: tpl.id, storagePath: key, fileName: 'x.pdf', mimeType: 'application/pdf', fileSize: 9, uploadedByUserId: people.moralesStaff.userId, status: 'REQUIRES_MANUAL_REVIEW' } });
  const res = await post(people.moralesStaff, `/transactions/${draft.id}/submit`, {});
  assert.equal(res.status, 200, res.text);
  const notes = await db.notification.findMany({ where: { relatedEntityId: draft.id, relatedEntityType: 'Transaction' } });
  const recipients = notes.map(n => n.userId);
  assert.ok(recipients.includes(people.hrmo1.userId) && recipients.includes(people.hrmo2.userId), 'both HRMOs are told');
  assert.ok(!recipients.includes(people.moralesAo.userId), 'the AO II is not told');
});

// ── Personnel view ────────────────────────────────────────────────────────────

test('10. an AO II in personnel view is handled as personnel: own record only, no admin access', async () => {
  const view = { 'x-view-mode': 'personnel' };
  const own = await get(people.moralesAo, '/personnel/me', view);
  assert.equal(own.status, 200, own.text);
  assert.equal(own.json.data.id, people.moralesAo.personnelId);
  const list = await get(people.moralesAo, '/personnel', view);
  assert.equal(list.status, 403, 'the personnel directory is an administrator function');
  const adminView = await get(people.moralesAo, '/personnel');
  assert.equal(adminView.status, 200, 'without the header the officer keeps the administrator workspace');
});

test('11. the view header can never widen access: personnel accounts and other roles gain nothing', async () => {
  const view = { 'x-view-mode': 'personnel' };
  const teacher = await get(people.moralesTeacher, '/personnel', view);
  assert.equal(teacher.status, 403);
  const sys = await get(people.sysadmin, '/personnel', view);
  assert.equal(sys.status, 200, 'a System Administrator is unaffected by the header (it only narrows AO II and HRMO)');
});

// ── Seat handover ─────────────────────────────────────────────────────────────

test('12. HRMO hands an AO II seat to a person at the same station; roles swap and cases follow the station', async () => {
  const res = await post(people.hrmo1, '/users/seat-handover', { outgoingUserId: people.moralesAo.userId, successorUserId: people.moralesSuccessor.userId });
  assert.equal(res.status, 200, res.text);
  const roles = async key => (await db.user.findUnique({ where: { id: people[key].userId }, include: { role: true } })).role.name;
  assert.equal(await roles('moralesAo'), 'NON_TEACHING_PERSONNEL');
  assert.equal(await roles('moralesSuccessor'), 'AO_II');
  const sessions = await db.refreshToken.count({ where: { userId: { in: [people.moralesAo.userId, people.moralesSuccessor.userId] }, revoked: false } });
  assert.equal(sessions, 0, 'both accounts must sign in again under their new roles');
  const log = await db.validationLog.findFirst({ where: { action: 'SEAT_HANDOVER' } });
  assert.ok(log, 'the handover is audited');
});

test('13. a successor from another station is refused with a clear reason', async () => {
  const res = await post(people.hrmo1, '/users/seat-handover', { outgoingUserId: people.moralesSuccessor.userId, successorUserId: people.matulasStaff.userId });
  assert.equal(res.status, 400);
  assert.equal(res.json.code, 'HANDOVER_STATION_MISMATCH');
});

test('14. only a System Administrator hands over an HRMO seat, and nobody hands over their own', async () => {
  const byHrmo = await post(people.hrmo1, '/users/seat-handover', { outgoingUserId: people.hrmo2.userId, successorUserId: people.matulasStaff.userId });
  assert.equal(byHrmo.status, 403);
  const own = await post(people.sysadmin, '/users/seat-handover', { outgoingUserId: people.sysadmin.userId, successorUserId: people.matulasStaff.userId });
  assert.equal(own.status, 403);
  const bySysadmin = await post(people.sysadmin, '/users/seat-handover', { outgoingUserId: people.hrmo2.userId, successorUserId: people.matulasStaff.userId });
  assert.equal(bySysadmin.status, 200, bySysadmin.text);
});

test('15. the options list shows only what the caller may hand over', async () => {
  const res = await get(people.hrmo1, '/users/seat-handover/options');
  assert.equal(res.status, 200);
  assert.ok(res.json.data.seats.every(s => s.role === 'AO_II'), 'HRMO sees AO II seats only');
  const denied = await get(people.moralesTeacher, '/users/seat-handover/options');
  assert.equal(denied.status, 403);
});

test('16. any signed-in user can read which workflow features are on', async () => {
  const res = await get(people.moralesTeacher, '/users/workflow-features');
  assert.equal(res.status, 200);
  assert.equal(res.json.data.hrDirectReview, true);
  assert.equal((await get(null, '/users/workflow-features')).status, 401);
});

// ── Phone app ─────────────────────────────────────────────────────────────────

const PHONE = { 'user-agent': 'Dart/3.2 (dart:io)' };

test('17. on the phone app an AO II or HRMO is their own staff account by default, with no admin power', async () => {
  // A fresh officer: the handover tests above ended the earlier officers' sessions, as they should.
  const phoneAo = await account('phoneAo', 'AO_II', MORALES);
  for (const actor of [people.hrmo1, phoneAo]) {
    const own = await get(actor, '/personnel/me', PHONE);
    assert.equal(own.status, 200, own.text);
    assert.equal(own.json.data.id, actor.personnelId);
    const directory = await get(actor, '/personnel', PHONE);
    assert.equal(directory.status, 403, 'the phone never carries the administrator role');
    const queue = await get(actor, '/transactions?limit=50', PHONE);
    assert.ok((queue.json.data || []).every(t => t.personnelId === actor.personnelId), 'only their own transactions');
  }
});

test('18. the phone still refuses the System Administrator', async () => {
  const res = await get(people.sysadmin, '/personnel/me', PHONE);
  assert.equal(res.status, 403);
  assert.equal(res.json.code, 'PHONE_APP_PERSONNEL_ONLY');
});
