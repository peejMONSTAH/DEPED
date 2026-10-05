// The default workflow (HR_DIRECT_REVIEW off) must keep working exactly as before, with the new
// review state, notification ownership and correction rules layered on top: AO II validates
// everyone at their station, any HRMO approves, and there is no System Administrator fallback.
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

const dbName = `digital201_handoff_off_${process.pid}_test`;
const isolated = new URL(base.href);
isolated.pathname = `/${dbName}`;
Object.assign(process.env, {
  DATABASE_URL: isolated.href, DIRECT_URL: isolated.href, NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'integration-only-access-key-no-real-sessions',
  JWT_REFRESH_SECRET: 'integration-only-refresh-key-no-real-sessions',
  RATE_LIMIT_MAX_REQUESTS: '100000',
  SMTP_HOST: '', SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', DOCUMENT_STORAGE: 'local', OCR_PROVIDER: '',
  HR_DIRECT_REVIEW: '',
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
const people = {};
let server, baseUrl, generateAccessToken, passwordTokenVersion, recordsType, recordsTemplate;

async function account(key, role, school, designation = 'Administrative Assistant I') {
  const roleRow = await db.role.upsert({ where: { name: role }, create: { name: role }, update: {} });
  const passwordHash = `synthetic-hash-${key}`;
  const user = await db.user.create({
    data: {
      email: `${key}@handoff-off.invalid`, passwordHash, roleId: roleRow.id, accountStatus: 'ACTIVE',
      personnel: { create: { employeeId: `OFF-${key}`, firstName: key, lastName: 'Fixture', designation, school, district: 'District 1', status: 'ACTIVE', profileComplete: true } },
    },
    include: { personnel: true },
  });
  const sid = `synthetic-session-${key}`;
  await db.refreshToken.create({ data: { userId: user.id, token: sid, expiresAt: new Date(Date.now() + 86400000) } });
  people[key] = { key, role, userId: user.id, personnelId: user.personnel.id,
    token: generateAccessToken({ userId: user.id, email: user.email, role, pwdv: passwordTokenVersion(passwordHash), sid }) };
}
async function call(actor, method, url, body) {
  const headers = { 'user-agent': 'review-handoff-off' };
  if (actor) headers.authorization = `Bearer ${actor.token}`;
  let payload;
  if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${baseUrl}/api/v1${url}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}
const get = (a, u) => call(a, 'GET', u);
const post = (a, u, b) => call(a, 'POST', u, b);
const put = (a, u, b) => call(a, 'PUT', u, b);
const validateBody = tx => ({ documentValidations: [{ documentId: tx.docId, isValid: true }], remarks: '' });

async function draft(owner) {
  const tx = await db.transaction.create({ data: { personnelId: owner.personnelId, transactionTypeId: recordsType.id, status: 'DRAFT' } });
  const key = `synthetic-object:${++objectSequence}`;
  objects.set(key, Buffer.from('%PDF-1.4\n'));
  const doc = await db.uploadedDocument.create({ data: { transactionId: tx.id, requirementTemplateId: recordsTemplate.id, storagePath: key, fileName: `${owner.key}.pdf`,
    mimeType: 'application/pdf', fileSize: 9, uploadedByUserId: owner.userId, status: 'REQUIRES_MANUAL_REVIEW' } });
  return { id: tx.id, docId: doc.id };
}

test.before(async () => {
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { cwd: path.resolve(__dirname, '../..'), env: process.env, stdio: 'pipe' });
  db = new client.PrismaClient({ datasources: { db: { url: isolated.href } } });
  stub('../../src/config/prisma', { __esModule: true, default: db });
  ({ generateAccessToken, passwordTokenVersion } = require('../../src/utils/jwt.util'));
  await account('ao', 'AO_II', MORALES);
  await account('hrmo1', 'HRMO', null);
  await account('hrmo2', 'HRMO', null);
  await account('sysadmin', 'SYSTEM_ADMIN', null);
  await account('teacher', 'TEACHING_PERSONNEL', MORALES, 'Teacher I');
  await account('staff', 'NON_TEACHING_PERSONNEL', MORALES);
  recordsType = await db.transactionType.create({ data: { name: 'Records Update' } });
  recordsTemplate = await db.requirementTemplate.create({ data: { transactionTypeId: recordsType.id, name: 'Supporting file', isMandatory: true, expectedDataType: 'PDF' } });
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

test('off 1. everyone at a station goes to that station AO II, and HRMO is not asked to validate', async () => {
  const tx = await draft(people.staff);
  const sent = await put(people.staff, `/transactions/${tx.id}/submit`, {});
  assert.equal(sent.status, 200, sent.text);
  assert.match(sent.json.message, /Your AO II will validate/);
  const told = (await db.notification.findMany({ where: { relatedEntityId: tx.id, relatedEntityType: 'Transaction' } })).map(n => n.userId);
  assert.deepEqual(told, [people.ao.userId], 'only the station AO II is told');
  const review = (await get(people.ao, `/transactions/${tx.id}`)).json.data.review;
  assert.equal(review.validator, 'AO_II');
  assert.equal(review.canValidate, true);
  assert.equal((await get(people.hrmo1, `/transactions/${tx.id}`)).json.data.review.canValidate, false, 'HRMO does not validate while HR-direct review is off');
  assert.equal((await post(people.hrmo1, `/transactions/${tx.id}/validate`, validateBody(tx))).status, 403);
  // The AO II action queue and the HRMO validation lane behave as before.
  assert.ok((await get(people.ao, '/transactions?queue=awaiting')).json.data.some(r => r.id === tx.id));
  assert.deepEqual((await get(people.hrmo1, '/transactions?lane=validation&limit=100')).json.data, [], 'HRMO has no validation lane in the default workflow');
  assert.deepEqual((await get(people.hrmo1, '/transactions?queue=awaiting&limit=100')).json.data, [], 'and nothing awaiting until AO II validates');
  const done = await post(people.ao, `/transactions/${tx.id}/validate`, validateBody(tx));
  assert.equal(done.status, 200, done.text);
  assert.match(done.json.message, /waits for final approval by HRMO \(2 notified\)/);
  assert.match((await db.notification.findMany({ where: { userId: people.staff.userId, relatedEntityId: tx.id } })).map(n => n.message).join('\n'), /AO II validated all documents/);
  Object.assign(globalThis, { offTx: tx });
});

test('off 2. any HRMO approves; the System Administrator has no fallback; notices follow the queue', async () => {
  const tx = globalThis.offTx;
  const inbox = async key => (await get(people[key], '/notifications')).json.data.filter(n => n.relatedEntityId === tx.id);
  for (const key of ['hrmo1', 'hrmo2']) {
    const notes = await inbox(key);
    const approval = notes.find(n => /Final approval needed/.test(n.message));
    assert.ok(approval, `${key} is asked for final approval`);
    assert.equal(approval.actionResolved, false);
    assert.equal(approval.actionTarget.path, `/admin/approvals?txId=${tx.id}`);
  }
  const awaiting = await get(people.hrmo1, '/transactions?queue=awaiting&limit=100');
  assert.deepEqual(awaiting.json.data.map(r => r.id), [tx.id]);
  assert.equal(awaiting.json.counts.awaitingMyReview, 1);
  assert.equal(awaiting.json.data[0].review.canApprove, true);
  const sys = await post(people.sysadmin, `/transactions/${tx.id}/approve`, { isApproved: true, notes: 'x' });
  assert.equal(sys.status, 403, 'no System Administrator approval in the default workflow');
  assert.deepEqual((await get(people.sysadmin, '/transactions?queue=fallback')).json.data, []);
  assert.equal((await post(people.hrmo1, `/transactions/${tx.id}/approve`, { isApproved: true, notes: 'ok' })).status, 200);
  for (const key of ['hrmo1', 'hrmo2']) assert.ok((await inbox(key)).every(n => n.actionResolved === true), `${key} has nothing left after approval`);
});

test('off 3. the correction rules do not depend on the switch: a returned requirement needs a new file', async () => {
  const { ANNEX_C_REQUIREMENTS, MANDATORY_ANNEX_C_CODES } = require('../../src/utils/annex-c.util');
  const cycle = await db.promotionCycle.create({ data: { name: 'Off cycle', type: 'NATURAL_VACANCY', status: 'ACTIVE', startDate: new Date(Date.now() - 86400000),
    endDate: new Date(Date.now() + 30 * 86400000), rulesConfigurationJson: { district: 'District 1', targetPosition: 'Teacher II', maxApplicants: 50 } } });
  const file = async label => (await db.personnelFile.create({ data: { personnelId: people.teacher.personnelId, documentTypeId: 'OTHER', documentTypeName: label,
    originalFileName: `${label}.pdf`, storagePath: `synthetic-object:${++objectSequence}`, mimeType: 'application/pdf', fileSize: 9, status: 'SUBMITTED' } })).id;
  const items = [];
  for (const req of ANNEX_C_REQUIREMENTS) items.push(MANDATORY_ANNEX_C_CODES.includes(req.code) ? { code: req.code, submitted: true, personnelDocumentId: await file(`f-${req.code}`) } : { code: req.code, submitted: false });
  const applied = await post(people.teacher, `/promotions/cycles/${cycle.id}/apply`, { checklist: { items } });
  assert.equal(applied.status, 201, applied.text);
  const appId = applied.json.data.id;
  const code = MANDATORY_ANNEX_C_CODES[0];
  assert.equal((await post(people.ao, `/promotions/cycles/${cycle.id}/applications/${appId}/verify-requirements`, { status: 'INCOMPLETE', remarks: 'Blurred', itemVerifications: [{ code, status: 'INCOMPLETE', remarks: 'Blurred' }] })).status, 200);
  const same = await post(people.teacher, `/promotions/cycles/${cycle.id}/apply`, { checklist: { items } });
  assert.equal(same.status, 409);
  assert.equal(same.json.code, 'REPLACEMENT_REQUIRED');
  const fixed = items.map(i => (i.code === code ? { ...i } : i));
  fixed.find(i => i.code === code).personnelDocumentId = await file('replacement');
  const before = await db.notification.count();
  const ok = await post(people.teacher, `/promotions/cycles/${cycle.id}/apply`, { checklist: { items: fixed } });
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual((await db.notification.findMany({ where: { id: { gt: before }, relatedEntityId: appId } })).map(n => n.userId), [people.ao.userId], 'the station AO II is told');
});
