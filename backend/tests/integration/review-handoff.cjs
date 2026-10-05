// Review hand-off, end to end: the real app, routes, middleware, controllers, signed JWTs and
// PostgreSQL, with HR_DIRECT_REVIEW switched on and synthetic people only.
//
// Covers: independent approval and the System Administrator's narrow fallback, notification
// ownership / action state / links, queue completeness and counts, cross-station denial,
// AO II and HRMO submitting as personnel, and the promotion correction loop.
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

const dbName = `digital201_handoff_${process.pid}_test`;
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
let server, baseUrl, generateAccessToken, passwordTokenVersion, recordsType, recordsTemplate;

async function account(key, role, school, extra = {}) {
  const roleRow = await db.role.upsert({ where: { name: role }, create: { name: role }, update: {} });
  const passwordHash = `synthetic-hash-${key}`;
  const user = await db.user.create({
    data: {
      email: `${key}@handoff.invalid`, passwordHash, roleId: roleRow.id, accountStatus: 'ACTIVE',
      personnel: { create: {
        employeeId: `HND-${key}`, firstName: key, lastName: 'Fixture', designation: extra.designation || 'Administrative Assistant I',
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
  const allHeaders = { 'user-agent': 'review-handoff-integration', ...headers };
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
const put = (actor, url, body, headers) => call(actor, 'PUT', url, { body, headers });
const PERSONNEL_VIEW = { 'x-view-mode': 'personnel' };

const validateBody = tx => ({ documentValidations: [{ documentId: tx.docId, isValid: true }], remarks: '' });
const returnBody = tx => ({ targetStatus: 'DEFICIENCY', documentValidations: [{ documentId: tx.docId, isValid: false, feedback: 'Blurred scan' }], remarks: 'Blurred scan' });

/** A transaction with one uploaded file, in the given state, owned by a synthetic person. */
async function transaction(owner, status = 'DRAFT') {
  const tx = await db.transaction.create({ data: { personnelId: owner.personnelId, transactionTypeId: recordsType.id, status, submissionDate: status === 'DRAFT' ? null : new Date() } });
  const key = `synthetic-object:${++objectSequence}`;
  objects.set(key, Buffer.from('%PDF-1.4\n'));
  const doc = await db.uploadedDocument.create({ data: {
    transactionId: tx.id, requirementTemplateId: recordsTemplate.id, storagePath: key, fileName: `${owner.key}.pdf`,
    mimeType: 'application/pdf', fileSize: 9, uploadedByUserId: owner.userId, status: 'REQUIRES_MANUAL_REVIEW',
  } });
  return { id: tx.id, docId: doc.id };
}
const submit = (owner, tx, headers) => put(owner, `/transactions/${tx.id}/submit`, {}, headers);
const notices = (userId, where = {}) => db.notification.findMany({ where: { userId, ...where }, orderBy: { id: 'asc' } });
const setStatus = (key, accountStatus) => db.user.update({ where: { id: people[key].userId }, data: { accountStatus } });

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
  await account('matulasStaff', 'NON_TEACHING_PERSONNEL', MATULAS);

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

// ── 1. Independent approval and the narrow System Administrator fallback ─────────────────────────

test('1. two HRMOs: the validator is not asked to approve; the other HRMO is, with a link to the exact file', async () => {
  f.staff = await transaction(people.moralesStaff);
  const sent = await submit(people.moralesStaff, f.staff);
  assert.equal(sent.status, 200, sent.text);
  assert.match(sent.json.message, /HRMO will validate/);
  // Both HRMOs are told to validate; the applicant is not their own reviewer.
  for (const key of ['hrmo1', 'hrmo2']) assert.equal((await notices(people[key].userId, { relatedEntityId: f.staff.id })).length, 1, `${key} is asked to validate`);

  const validated = await post(people.hrmo1, `/transactions/${f.staff.id}/validate`, validateBody(f.staff));
  assert.equal(validated.status, 200, validated.text);
  assert.match(validated.json.message, /waits for final approval by a different HRMO \(1 notified\)/);
  assert.equal(validated.json.data.nextOwner, 'HRMO');

  const finalNotices = (await notices(people.hrmo2.userId, { relatedEntityId: f.staff.id })).filter(n => /Final approval needed/.test(n.message));
  assert.equal(finalNotices.length, 1, 'the eligible HRMO is asked for final approval');
  assert.match(finalNotices[0].message, /validated .* by|HRMO validated/i);
  assert.equal((await notices(people.hrmo1.userId, { relatedEntityId: f.staff.id })).filter(n => /Final approval needed/.test(n.message)).length, 0, 'the validator is not asked to approve their own validation');
  assert.equal((await notices(people.sysadmin.userId)).length, 0, 'the System Administrator is not involved while an HRMO can approve');
});

test('2. the server says who may act: review state on list and detail, per viewer', async () => {
  const detail = viewer => get(viewer, `/transactions/${f.staff.id}`);
  const v = await detail(people.hrmo1);
  assert.equal(v.json.data.review.canApprove, false);
  assert.equal(v.json.data.review.validatedBy.role, 'HRMO');
  assert.match(v.json.data.review.summary, /Validated by HRMO .*Waiting for final approval by a different HRMO/);
  assert.match(v.json.data.review.youCan, /You validated this file/);
  const o = await detail(people.hrmo2);
  assert.equal(o.json.data.review.canApprove, true);
  assert.equal(o.json.data.review.approver, 'HRMO');
  const s = await detail(people.sysadmin);
  assert.equal(s.json.data.review.canApprove, false, 'the System Administrator is not the approver while another HRMO can');
  const applicant = await detail(people.moralesStaff);
  assert.equal(applicant.json.data.review.canApprove, false);
  assert.match(applicant.json.data.review.youCan, /Nothing to do now/);
  // The same facts are on the list rows, so the buttons and the server cannot disagree.
  const list = await get(people.hrmo2, '/transactions?limit=100&queue=awaiting');
  assert.equal(list.json.data.find(r => r.id === f.staff.id).review.canApprove, true);
});

test('3. notification action state: a validator has nothing left, the approver still does, and reading does not resolve it', async () => {
  const state = async (key, headers) => {
    const res = await get(people[key], '/notifications', headers);
    assert.equal(res.status, 200, res.text);
    return res.json.data.filter(n => n.relatedEntityId === f.staff.id);
  };
  const forValidator = await state('hrmo1');
  assert.ok(forValidator.length > 0);
  assert.ok(forValidator.every(n => n.actionResolved === true), 'the HRMO who validated has nothing left on it');
  const forApprover = await state('hrmo2');
  assert.ok(forApprover.every(n => n.actionResolved === false), 'both the validation notice and the approval notice are still actionable for the other HRMO');
  const approval = forApprover.find(n => /Final approval needed/.test(n.message));
  assert.equal(approval.actionTarget.path, `/admin/approvals?txId=${f.staff.id}`);
  const validation = forApprover.find(n => /waiting for HRMO validation/.test(n.message));
  assert.equal(validation.actionTarget.kind, 'review');
  // Marking it read is not doing the work.
  const read = await call(people.hrmo2, 'PUT', `/notifications/${approval.id}/read`);
  assert.equal(read.status, 200);
  assert.equal((await state('hrmo2')).find(n => n.id === approval.id).actionResolved, false);
  // An HRMO looking at their personnel view is still an HRMO for review work.
  const inPersonnelView = await state('hrmo2', PERSONNEL_VIEW);
  assert.ok(inPersonnelView.every(n => n.actionResolved === false), 'the personnel view does not turn open review work into "already handled"');
  assert.equal(inPersonnelView.find(n => n.id === approval.id).actionTarget.path, `/admin/approvals?txId=${f.staff.id}`);
});

test('4. queues are complete and consistent: awaiting, validation lane in every status, and counts', async () => {
  f.pending = await transaction(people.matulasStaff, 'PENDING_VALIDATION');
  f.returned = await transaction(people.moralesStaff, 'PENDING_VALIDATION');
  const ret = await post(people.hrmo1, `/transactions/${f.returned.id}/validate`, returnBody(f.returned));
  assert.equal(ret.status, 200, ret.text);
  assert.match(ret.json.message, /returned to the applicant for correction/);

  const awaiting = await get(people.hrmo1, '/transactions?limit=100&queue=awaiting');
  const ids = awaiting.json.data.map(r => r.id);
  assert.ok(ids.includes(f.pending.id), 'HRMO validation work is in the HRMO action queue');
  assert.ok(!ids.includes(f.staff.id), 'a file the HRMO validated is not on their action queue');
  assert.equal(awaiting.json.counts.awaitingMyReview, awaiting.json.pagination.totalItems, 'the count and the list agree');
  assert.equal(awaiting.json.data.every(r => r.review.canValidate || r.review.canApprove), true, 'every row in the action queue is something the HRMO can do');

  const lane = await get(people.hrmo1, '/transactions?limit=100&lane=validation');
  const statuses = new Set(lane.json.data.map(r => r.status));
  for (const s of ['PENDING_VALIDATION', 'DEFICIENCY', 'FOR_APPROVAL']) assert.ok(statuses.has(s), `the lane list includes ${s} files, so Returned and Done are not empty`);
  const onlyPending = await get(people.hrmo1, '/transactions?limit=100&queue=validation');
  assert.ok(onlyPending.json.data.every(r => r.status === 'PENDING_VALIDATION'));
});

test('5. approval rules: not the validator, not the System Administrator while another HRMO can, then the other HRMO', async () => {
  const same = await post(people.hrmo1, `/transactions/${f.staff.id}/approve`, { isApproved: true, notes: 'ok' });
  assert.equal(same.status, 403);
  const sys = await post(people.sysadmin, `/transactions/${f.staff.id}/approve`, { isApproved: true, notes: 'ok' });
  assert.equal(sys.status, 403);
  const fallbackList = await get(people.sysadmin, '/transactions?queue=fallback&limit=100');
  assert.deepEqual(fallbackList.json.data, [], 'nothing an HRMO can approve is shown to the System Administrator');
  const done = await post(people.hrmo2, `/transactions/${f.staff.id}/approve`, { isApproved: true, notes: 'ok' });
  assert.equal(done.status, 200, done.text);
  assert.match(done.json.message, /approved/);
  const approvedReview = (await get(people.moralesStaff, `/transactions/${f.staff.id}`)).json.data.review;
  assert.equal(approvedReview.approvedBy, 'HRMO');
  assert.match(approvedReview.summary, /^Approved by HRMO\./);
  const after = (await get(people.hrmo2, '/notifications')).json.data.filter(n => n.relatedEntityId === f.staff.id);
  assert.ok(after.every(n => n.actionResolved === true), 'once approved, no reviewer notice is still asking for action');
  const staffNotice = (await notices(people.moralesStaff.userId, { relatedEntityId: f.staff.id })).map(n => n.message).join('\n');
  assert.match(staffNotice, /validated by HRMO and approved by HRMO/);
  assert.doesNotMatch(staffNotice, /AO II/, 'the applicant is never told an AO II validated what an HRMO validated');
});

test('6. the only eligible HRMO validated it: a clear, narrow System Administrator fallback', async () => {
  await setStatus('hrmo2', 'INACTIVE');
  f.solo = await transaction(people.matulasStaff, 'PENDING_VALIDATION');
  const validated = await post(people.hrmo1, `/transactions/${f.solo.id}/validate`, validateBody(f.solo));
  assert.equal(validated.status, 200, validated.text);
  assert.match(validated.json.message, /No other HRMO can approve it, so the System Administrator was asked for the fallback approval/);
  assert.equal(validated.json.data.nextOwner, 'SYSTEM_ADMIN');

  const hrNotices = await notices(people.hrmo1.userId, { relatedEntityId: f.solo.id });
  assert.ok(!hrNotices.some(n => /Fallback approval|Final approval/.test(n.message)), 'the validator is not asked to approve');
  const adminNotice = (await notices(people.sysadmin.userId)).find(n => n.relatedEntityId === f.solo.id);
  assert.ok(adminNotice, 'the System Administrator is notified');
  assert.equal(adminNotice.relatedEntityType, 'ApprovalFallback');

  const inbox = (await get(people.sysadmin, '/notifications')).json.data.find(n => n.id === adminNotice.id);
  assert.equal(inbox.actionResolved, false, 'the fallback notice is actionable');
  assert.equal(inbox.actionTarget.path, `/admin/approvals?txId=${f.solo.id}`);

  // Narrow list: exactly the files no HRMO can approve.
  const list = await get(people.sysadmin, '/transactions?queue=fallback&limit=100');
  assert.deepEqual(list.json.data.map(r => r.id), [f.solo.id]);
  const detail = await get(people.sysadmin, `/transactions/${f.solo.id}`);
  assert.equal(detail.json.data.review.approver, 'SYSTEM_ADMIN');
  assert.equal(detail.json.data.review.canApprove, true);
  assert.match(detail.json.data.review.summary, /System Administrator \(fallback/);
  assert.equal((await get(people.hrmo1, `/transactions/${f.solo.id}`)).json.data.review.canApprove, false);

  // No general expansion of authority.
  assert.equal((await post(people.sysadmin, `/transactions/${f.solo.id}/validate`, validateBody(f.solo))).status, 403, 'the System Administrator never validates');
  assert.equal((await post(people.hrmo1, `/transactions/${f.solo.id}/approve`, { isApproved: true, notes: 'ok' })).status, 403, 'the validator still cannot approve');
  assert.equal((await get(people.moralesAo, '/transactions?queue=fallback')).json.data.length, 0, 'other roles get nothing from the fallback list');

  const approved = await post(people.sysadmin, `/transactions/${f.solo.id}/approve`, { isApproved: true, notes: 'Fallback approval' });
  assert.equal(approved.status, 200, approved.text);
  assert.equal((await db.transaction.findUnique({ where: { id: f.solo.id } })).status, 'APPROVED');
  const resolved = (await get(people.sysadmin, '/notifications')).json.data.find(n => n.id === adminNotice.id);
  assert.equal(resolved.actionResolved, true, 'after the fallback approval nothing is left to do');
  const after = (await get(people.hrmo1, `/transactions/${f.solo.id}`)).json.data.review;
  assert.equal(after.approvedBy, 'SYSTEM_ADMIN', 'a fallback approval is attributed to the System Administrator, not to HRMO');
  assert.match(after.summary, /Approved by the System Administrator \(fallback\)/);
  const audit = await db.validationLog.findFirst({ where: { entityId: f.solo.id, action: 'TRANSACTION_APPROVED' } });
  assert.equal(audit.userId, people.sysadmin.userId, 'the audit history names who approved');
});

test('7. the fallback needs a validator who is the only HRMO, never merely a busy one', async () => {
  f.busy = await transaction(people.moralesStaff, 'PENDING_VALIDATION');
  await setStatus('hrmo2', 'ACTIVE');
  await post(people.hrmo1, `/transactions/${f.busy.id}/validate`, validateBody(f.busy));
  const denied = await post(people.sysadmin, `/transactions/${f.busy.id}/approve`, { isApproved: true, notes: 'ok' });
  assert.equal(denied.status, 403, 'with hrmo2 active again the fallback is closed');
  assert.deepEqual((await get(people.sysadmin, '/transactions?queue=fallback')).json.data, []);
  assert.equal((await get(people.hrmo2, `/transactions/${f.busy.id}`)).json.data.review.canApprove, true);
  // The System Administrator's earlier fallback notice, if any, stops asking once an HRMO can act.
  await setStatus('hrmo2', 'INACTIVE');
  const re = await get(people.sysadmin, '/transactions?queue=fallback');
  assert.deepEqual(re.json.data.map(r => r.id), [f.busy.id], 'and reopens if the other HRMO goes away again');
  await setStatus('hrmo2', 'ACTIVE');
});

// ── 2. Cross-school denial and unauthorised attempts ─────────────────────────────────────────────

test('8. an AO II cannot see, validate or approve outside their station and lane', async () => {
  f.matulasTeach = await transaction(people.matulasTeacher, 'PENDING_VALIDATION');
  f.moralesTeach = await transaction(people.moralesTeacher, 'PENDING_VALIDATION');
  const cross = await post(people.moralesAo, `/transactions/${f.matulasTeach.id}/validate`, validateBody(f.matulasTeach));
  assert.ok([403, 404].includes(cross.status), `cross-station validation refused (${cross.status})`);
  assert.equal((await get(people.moralesAo, `/transactions/${f.matulasTeach.id}`)).status, 404, 'the other station file is indistinguishable from a missing one');
  assert.equal((await post(people.moralesAo, `/transactions/${f.staff.id}/approve`, { isApproved: true, notes: 'x' })).status, 403, 'an AO II never approves');
  assert.equal((await post(people.moralesAo, `/transactions/${f.busy.id}/validate`, validateBody(f.busy))).status, 403, 'non-teaching files are HRMO work');
  const mine = (await get(people.moralesAo, '/transactions?limit=100&queue=awaiting')).json.data.map(r => r.id);
  assert.ok(mine.includes(f.moralesTeach.id) && !mine.includes(f.matulasTeach.id));
  // The other station has no AO II, so HRMO covers it, and the row says so.
  const covered = await get(people.hrmo1, `/transactions/${f.matulasTeach.id}`);
  assert.equal(covered.json.data.review.validator, 'HRMO');
  assert.match(covered.json.data.review.summary, /this station has no AO II, so HRMO covers it/);
  assert.equal(covered.json.data.review.canValidate, true);
  const withAo = await get(people.hrmo1, `/transactions/${f.moralesTeach.id}`);
  assert.equal(withAo.json.data.review.validator, 'AO_II');
  assert.equal(withAo.json.data.review.canValidate, false, 'HRMO does not validate a station that has its own AO II');
  assert.equal((await post(people.hrmo1, `/transactions/${f.moralesTeach.id}/validate`, validateBody(f.moralesTeach))).status, 403);
  // Wording: an AO II validation is reported as an AO II validation.
  const aoDone = await post(people.moralesAo, `/transactions/${f.moralesTeach.id}/validate`, validateBody(f.moralesTeach));
  assert.equal(aoDone.status, 200, aoDone.text);
  const teacherNotice = (await notices(people.moralesTeacher.userId, { relatedEntityId: f.moralesTeach.id })).map(n => n.message).join('\n');
  assert.match(teacherNotice, /AO II validated all documents/);
  // A returned file's notice opens the checklist on the exact requirement to replace.
  const back = await transaction(people.moralesTeacher, 'PENDING_VALIDATION');
  assert.equal((await post(people.moralesAo, `/transactions/${back.id}/validate`, returnBody(back))).status, 200);
  const returnedNotice = (await get(people.moralesTeacher, '/notifications')).json.data.find(n => n.relatedEntityId === back.id);
  assert.equal(returnedNotice.actionResolved, false);
  assert.equal(returnedNotice.actionTarget.path, `/personnel/checklist?txId=${back.id}&requirement=${recordsTemplate.id}`);
});

// ── 3. AO II and HRMO submitting as personnel; correction loop for transactions ──────────────────

test('9. teaching and non-teaching resubmissions notify the reviewer who can act', async () => {
  const resubmit = async (owner, expectedRecipients, forbiddenRecipients) => {
    const tx = await transaction(owner, 'PENDING_VALIDATION');
    const returned = await post(people[owner.reviewer], `/transactions/${tx.id}/validate`, returnBody(tx));
    assert.equal(returned.status, 200, returned.text);
    // Replacing the returned file is what makes it submittable again.
    const doc = await db.uploadedDocument.findUnique({ where: { id: tx.docId } });
    assert.equal(doc.status, 'REJECTED');
    const blocked = await submit(owner, tx);
    assert.equal(blocked.status, 409, 'the returned file, unchanged, cannot be resubmitted');
    await db.uploadedDocument.update({ where: { id: tx.docId }, data: { status: 'REQUIRES_MANUAL_REVIEW', fileName: 'replacement.pdf' } });
    const before = await db.notification.count();
    const ok = await submit(owner, tx);
    assert.equal(ok.status, 200, ok.text);
    const fresh = (await db.notification.findMany({ where: { id: { gt: before - 1 }, relatedEntityId: tx.id } })).map(n => n.userId);
    for (const key of expectedRecipients) assert.ok(fresh.includes(people[key].userId), `${key} is told about the resubmission`);
    for (const key of forbiddenRecipients) assert.ok(!fresh.includes(people[key].userId), `${key} is not told`);
    return ok;
  };
  const teaching = await resubmit(Object.assign({}, people.moralesTeacher, { reviewer: 'moralesAo' }), ['moralesAo'], ['hrmo1', 'hrmo2', 'sysadmin']);
  assert.match(teaching.json.message, /Your AO II will validate/);
  const noAo = await resubmit(Object.assign({}, people.matulasTeacher, { reviewer: 'hrmo1' }), ['hrmo1', 'hrmo2'], ['moralesAo']);
  assert.match(noAo.json.message, /HRMO will validate/);
  const staff = await resubmit(Object.assign({}, people.moralesStaff, { reviewer: 'hrmo1' }), ['hrmo1', 'hrmo2'], ['moralesAo']);
  assert.match(staff.json.message, /HRMO will validate/);
});

test('10. an AO II or HRMO applying as personnel goes to HRMO, and never to themselves', async () => {
  const aoTx = await transaction(people.moralesAo);
  const aoSent = await submit(people.moralesAo, aoTx, PERSONNEL_VIEW);
  assert.equal(aoSent.status, 200, aoSent.text);
  const aoRecipients = (await db.notification.findMany({ where: { relatedEntityId: aoTx.id, relatedEntityType: 'Transaction' } })).map(n => n.userId);
  assert.ok(aoRecipients.includes(people.hrmo1.userId) && aoRecipients.includes(people.hrmo2.userId));
  assert.ok(!aoRecipients.includes(people.moralesAo.userId), 'the AO II is not their own reviewer');
  assert.equal((await get(people.moralesAo, `/transactions/${aoTx.id}`, PERSONNEL_VIEW)).json.data.review.validator, 'HRMO');
  assert.equal((await post(people.moralesAo, `/transactions/${aoTx.id}/validate`, validateBody(aoTx))).status, 403, 'and cannot validate it as an officer either');

  const hrTx = await transaction(people.hrmo1);
  const hrSent = await submit(people.hrmo1, hrTx, PERSONNEL_VIEW);
  assert.equal(hrSent.status, 200, hrSent.text);
  const hrRecipients = (await db.notification.findMany({ where: { relatedEntityId: hrTx.id, relatedEntityType: 'Transaction' } })).map(n => n.userId);
  assert.deepEqual(hrRecipients, [people.hrmo2.userId], 'one other HRMO exists, so exactly that HRMO is told');
  assert.equal((await post(people.hrmo1, `/transactions/${hrTx.id}/validate`, validateBody(hrTx))).status, 403);
  assert.equal((await post(people.hrmo2, `/transactions/${hrTx.id}/validate`, validateBody(hrTx))).status, 200);
  assert.equal((await post(people.hrmo1, `/transactions/${hrTx.id}/approve`, { isApproved: true, notes: 'self' })).status, 403, 'nobody approves their own');
  // Validated by the only other HRMO, and the subject is the first: the fallback is the only route left.
  const gap = await get(people.sysadmin, '/transactions?queue=fallback');
  assert.ok(gap.json.data.some(r => r.id === hrTx.id), 'when the only other HRMO validated it, the System Administrator can give the final approval');
});

test('11. one HRMO only: nobody can validate their own submission, and the System Administrator is told', async () => {
  await setStatus('hrmo2', 'INACTIVE');
  const tx = await transaction(people.hrmo1);
  const sent = await submit(people.hrmo1, tx, PERSONNEL_VIEW);
  assert.equal(sent.status, 200, sent.text);
  assert.match(sent.json.message, /No other HRMO is available to validate it yet/);
  const gap = (await notices(people.sysadmin.userId, { relatedEntityId: tx.id }))[0];
  assert.ok(gap && gap.relatedEntityType === 'ReviewerGap', 'the gap is reported instead of the file silently stalling');
  assert.equal((await post(people.sysadmin, `/transactions/${tx.id}/validate`, validateBody(tx))).status, 403, 'and the System Administrator still cannot validate');
  await setStatus('hrmo2', 'ACTIVE');
});

// ── 4. Promotion requirements: the correction loop ───────────────────────────────────────────────

test('12. a returned promotion requirement must be replaced; unaffected items are not touched; history is kept', async () => {
  const { ANNEX_C_REQUIREMENTS, MANDATORY_ANNEX_C_CODES } = require('../../src/utils/annex-c.util');
  const cycle = await db.promotionCycle.create({ data: {
    name: 'Handoff cycle', type: 'NATURAL_VACANCY', status: 'ACTIVE', startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 30 * 86400000),
    rulesConfigurationJson: { district: 'District 1', targetPosition: 'Teacher II', maxApplicants: 50 },
  } });
  const file = async (owner, label) => {
    const storagePath = `synthetic-object:${++objectSequence}`;
    objects.set(storagePath, Buffer.from('%PDF-1.4\n'));
    return (await db.personnelFile.create({ data: {
      personnelId: owner.personnelId, documentTypeId: 'OTHER', documentTypeName: label, originalFileName: `${label}.pdf`,
      storagePath, mimeType: 'application/pdf', fileSize: 9, status: 'SUBMITTED',
    } })).id;
  };
  const items = [];
  for (const req of ANNEX_C_REQUIREMENTS) {
    if (!MANDATORY_ANNEX_C_CODES.includes(req.code)) { items.push({ code: req.code, submitted: false }); continue; }
    items.push({ code: req.code, submitted: true, personnelDocumentId: await file(people.moralesTeacher, `annex-${req.code}`) });
  }
  const applied = await post(people.moralesTeacher, `/promotions/cycles/${cycle.id}/apply`, { checklist: { items } });
  assert.equal(applied.status, 201, applied.text);
  const appId = applied.json.data.id;
  const returnedCode = MANDATORY_ANNEX_C_CODES[0];
  const other = MANDATORY_ANNEX_C_CODES[1];
  const returned = await post(people.moralesAo, `/promotions/cycles/${cycle.id}/applications/${appId}/verify-requirements`, {
    status: 'INCOMPLETE', remarks: 'Page 2 unreadable', itemVerifications: [{ code: returnedCode, status: 'INCOMPLETE', remarks: 'Blurred scan' }],
  });
  assert.equal(returned.status, 200, returned.text);
  assert.match(returned.json.message, /returned by AO II/i);
  const hrmoNote = (await notices(people.hrmo1.userId, { relatedEntityId: appId })).map(n => n.message).join('\n');
  assert.match(hrmoNote, /AO II marked/, 'HRMO is told which role returned it');

  const mine = (await get(people.moralesTeacher, '/promotions/my-applications')).json.data.find(a => a.id === appId);
  assert.equal(mine.checker, 'AO II');
  assert.deepEqual(mine.returnedCodes, [returnedCode]);
  assert.equal(mine.items.find(i => i.code === returnedCode).mustReplace, true);
  assert.equal(mine.items.find(i => i.code === other).mustReplace, false, 'unaffected documents do not have to be replaced');

  const unchanged = await post(people.moralesTeacher, `/promotions/cycles/${cycle.id}/apply`, { checklist: { items } });
  assert.equal(unchanged.status, 409, 'the same file again is refused');
  assert.equal(unchanged.json.code, 'REPLACEMENT_REQUIRED');
  assert.deepEqual(unchanged.json.unchangedRequirementCodes, [returnedCode]);
  assert.match(unchanged.json.message, /Replace the returned document/);
  // Replacing an item that was not returned does not satisfy the correction.
  const wrongOne = items.map(i => (i.code === other ? { ...i, personnelDocumentId: 0 } : i));
  wrongOne.find(i => i.code === other).personnelDocumentId = await file(people.moralesTeacher, 'unrelated-replacement');
  assert.equal((await post(people.moralesTeacher, `/promotions/cycles/${cycle.id}/apply`, { checklist: { items: wrongOne } })).status, 409);

  const before = await db.notification.count();
  const replacement = await file(people.moralesTeacher, 'replacement');
  const fixed = items.map(i => (i.code === returnedCode ? { ...i, personnelDocumentId: replacement } : i));
  const resubmitted = await post(people.moralesTeacher, `/promotions/cycles/${cycle.id}/apply`, { checklist: { items: fixed } });
  assert.equal(resubmitted.status, 200, resubmitted.text);
  assert.match(resubmitted.json.message, /AO II will check them again/);
  const row = await db.promotionApplication.findUnique({ where: { id: appId } });
  assert.equal(row.status, 'SUBMITTED');
  const details = row.scoreDetailsJson;
  assert.equal(details.annexCChecklistHistory.length, 1, 'the files the reviewer saw are kept');
  assert.equal(details.annexCChecklistHistory[0].items.find(i => i.code === returnedCode).personnelDocumentId, items.find(i => i.code === returnedCode).personnelDocumentId);
  assert.equal(details.requirementsCheckHistory[0].remarks, 'Page 2 unreadable', 'the reviewer reason is kept');
  assert.equal(details.annexCChecklist.items.find(i => i.code === other).personnelDocumentId, items.find(i => i.code === other).personnelDocumentId, 'unaffected documents are unchanged');

  // The replaced version is kept: even if the owner removes it later, the reviewer can still open what they were shown.
  const oldId = items.find(i => i.code === returnedCode).personnelDocumentId;
  assert.equal((await call(people.moralesTeacher, 'DELETE', `/personnel/documents/${oldId}`)).status, 200);
  assert.equal((await get(people.moralesAo, `/personnel/documents/${oldId}/file`)).status, 200, 'the superseded file stays viewable to the reviewer');

  // The actual reviewer is told, with a link that opens this application in its cycle.
  const fresh = (await db.notification.findMany({ where: { id: { gt: before }, relatedEntityId: appId } })).map(n => n.userId);
  assert.deepEqual(fresh, [people.moralesAo.userId], 'a teaching applicant resubmits to their own AO II only');
  const inbox = (await get(people.moralesAo, '/notifications')).json.data.find(n => n.relatedEntityId === appId && /resubmitted/.test(n.message));
  assert.equal(inbox.promotionApplicationId, appId);
  assert.equal(inbox.promotionCycleId, cycle.id);
  assert.equal(inbox.actionResolved, false, 'the AO II still has this to check');
  // After the AO II checks it, nothing is left.
  const checked = await post(people.moralesAo, `/promotions/cycles/${cycle.id}/applications/${appId}/verify-requirements`, { status: 'COMPLETE', remarks: 'ok' });
  assert.equal(checked.status, 200, checked.text);
  assert.equal((await get(people.moralesAo, '/notifications')).json.data.find(n => n.id === inbox.id).actionResolved, true);
});

test('13. a non-teaching applicant sends corrected requirements to HRMO, never to an AO II', async () => {
  const { ANNEX_C_REQUIREMENTS, MANDATORY_ANNEX_C_CODES } = require('../../src/utils/annex-c.util');
  const cycle = await db.promotionCycle.create({ data: {
    name: 'Handoff staff cycle', type: 'NATURAL_VACANCY', status: 'ACTIVE', startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 30 * 86400000),
    rulesConfigurationJson: { district: 'District 1', targetPosition: 'Administrative Assistant II', maxApplicants: 50 },
  } });
  const file = async label => (await db.personnelFile.create({ data: {
    personnelId: people.moralesStaff.personnelId, documentTypeId: 'OTHER', documentTypeName: label, originalFileName: `${label}.pdf`,
    storagePath: `synthetic-object:${++objectSequence}`, mimeType: 'application/pdf', fileSize: 9, status: 'SUBMITTED',
  } })).id;
  const items = [];
  for (const req of ANNEX_C_REQUIREMENTS) items.push(MANDATORY_ANNEX_C_CODES.includes(req.code) ? { code: req.code, submitted: true, personnelDocumentId: await file(`s-${req.code}`) } : { code: req.code, submitted: false });
  const applied = await post(people.moralesStaff, `/promotions/cycles/${cycle.id}/apply`, { checklist: { items } });
  assert.equal(applied.status, 201, applied.text);
  const appId = applied.json.data.id;
  // AO II is not told about a non-teaching applicant at all; HRMO is.
  const initial = (await db.notification.findMany({ where: { relatedEntityId: appId } })).map(n => n.userId);
  assert.ok(!initial.includes(people.moralesAo.userId), 'an AO II is not told about a non-teaching application');
  assert.ok(initial.includes(people.hrmo1.userId));
  assert.equal((await post(people.moralesAo, `/promotions/cycles/${cycle.id}/applications/${appId}/verify-requirements`, { status: 'COMPLETE' })).status, 403);
  const code = MANDATORY_ANNEX_C_CODES[0];
  const returned = await post(people.hrmo1, `/promotions/cycles/${cycle.id}/applications/${appId}/verify-requirements`, {
    status: 'INCOMPLETE', remarks: 'Unsigned', itemVerifications: [{ code, status: 'INCOMPLETE', remarks: 'Unsigned' }],
  });
  assert.equal(returned.status, 200, returned.text);
  assert.match(returned.json.message, /returned by HRMO/i);
  const mine = (await get(people.moralesStaff, '/promotions/my-applications')).json.data.find(a => a.id === appId);
  assert.equal(mine.checker, 'HRMO');
  const before = await db.notification.count();
  const fixed = items.map(i => (i.code === code ? { ...i, personnelDocumentId: 0 } : i));
  fixed.find(i => i.code === code).personnelDocumentId = await file('s-replacement');
  const re = await post(people.moralesStaff, `/promotions/cycles/${cycle.id}/apply`, { checklist: { items: fixed } });
  assert.equal(re.status, 200, re.text);
  assert.match(re.json.message, /HRMO will check them again/);
  const fresh = (await db.notification.findMany({ where: { id: { gt: before }, relatedEntityId: appId } })).map(n => n.userId).sort();
  assert.deepEqual(fresh, [people.hrmo1.userId, people.hrmo2.userId].sort(), 'both HRMOs are told');
  assert.ok(!fresh.includes(people.moralesAo.userId));
});
