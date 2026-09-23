// Run only against a fresh disposable database after `prisma migrate deploy`.
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const url = new URL(process.env.DATABASE_URL || 'http://missing');
assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) && url.pathname.endsWith('_test'),
  'Integration tests require an explicitly configured local database ending in _test. Never use production.');
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'integration-only-access-key-no-real-sessions';
process.env.JWT_REFRESH_SECRET = 'integration-only-refresh-key-no-real-sessions';
const client = require(process.env.GAP_PRISMA_CLIENT_PATH
  ? path.resolve(process.env.GAP_PRISMA_CLIENT_PATH) : '@prisma/client');
require.cache[require.resolve('@prisma/client')] = { exports: client };
const db = new client.PrismaClient();
require.cache[require.resolve('../../src/config/prisma')] = { exports: { __esModule: true, default: db } };
// Notification delivery must never leave an integration test process.
require.cache[require.resolve('../../src/services/workflow-outbox.service')] = { exports: {
  queueTransactionalEmail: async () => {}, queueDeficiencyEmail: async () => {}, processWorkflowOutbox: async () => {},
} };
const { transactionAccessFilter } = require('../../src/utils/transaction-access.util');
const { lockTransaction } = require('../../src/utils/transaction-lock.util');
const { getTransactionById, getTransactionRequirements, submitTransaction } = require('../../src/controllers/transactions.controller');
const { getDashboardSummary } = require('../../src/controllers/dashboard.controller');
const { selectPromotionCandidate } = require('../../src/controllers/promotions.controller');
let objectSequence = 0;
const objects = new Map();
require.cache[require.resolve('../../src/services/document-storage.service')] = { exports: {
  async storeDocument(buffer) { const key = `synthetic-object:${++objectSequence}`; objects.set(key, buffer); return key; },
  async readDocument(key) { return objects.get(key); },
  async discardUncommittedDocument(key) { objects.delete(key); },
} };
require.cache[require.resolve('../../src/services/document-ai.service')] = { exports: { documentAiConfigured: () => false } };
const { uploadDocument, getExtractionReview, confirmExtractionReview } = require('../../src/controllers/documents.controller');
const response = () => ({ locals: {}, statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const invoke = async (handler, req) => {
  const res = response();
  try { await handler(req, res, error => { throw error; }); }
  catch (error) { res.statusCode = error.statusCode || 500; res.body = { message: error.message }; }
  return res;
};
const people = {};
let txType, tx, otherTx, requirement, server, baseUrl;

test.before(async () => {
  assert.equal(await db.user.count(), 0, 'Use a fresh disposable database; tests never delete existing user records.');
  for (const [name, role, school] of [
    ['owner', 'TEACHING_PERSONNEL', 'Station A'], ['other', 'TEACHING_PERSONNEL', 'Station B'],
    ['ao', 'AO_II', 'Station A'], ['otherAo', 'AO_II', 'Station B'],
    ['hrmo', 'HRMO', 'Division'], ['admin', 'SYSTEM_ADMIN', 'Division'],
  ]) {
    const roleRow = await db.role.upsert({ where: { name: role }, create: { name: role }, update: {} });
    const user = await db.user.create({ data: {
      email: `${name}@integration.invalid`, passwordHash: 'not-a-valid-password-hash', roleId: roleRow.id,
      accountStatus: 'ACTIVE', personnel: { create: { employeeId: `test-${name}`, firstName: name,
        lastName: 'Synthetic', designation: 'Teacher I', school, district: 'District 1', status: 'ACTIVE', profileComplete: true } },
    }, include: { personnel: true } });
    people[name] = { userId: user.id, role, personnelId: user.personnel.id, email: user.email };
  }
  txType = await db.transactionType.create({ data: { name: 'Promotion' } });
  requirement = await db.requirementTemplate.create({ data: { transactionTypeId: txType.id, name: 'Diploma', isMandatory: true, expectedDataType: 'PDF' } });
  tx = await db.transaction.create({ data: { personnelId: people.owner.personnelId, transactionTypeId: txType.id, status: 'DEFICIENCY' } });
  otherTx = await db.transaction.create({ data: { personnelId: people.other.personnelId, transactionTypeId: txType.id, status: 'DRAFT' } });
  // Authenticate fixture identities only; exercise the real draft router and database.
  require.cache[require.resolve('../../src/middleware/auth.middleware')] = { exports: {
    authenticate(req, res, next) { req.user = people[req.headers['x-test-actor']]; next(); },
  } };
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/forms', require('../../src/routes/form-drafts.routes').default);
  app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/forms/transactions/${tx.id}/pds-2025`;
});

test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await db.$disconnect();
});

test('real database enforces owner/station/role access on detail and requirements', async () => {
  for (const [actor, expected] of [['owner', 200], ['other', 404], ['ao', 200], ['otherAo', 404], ['hrmo', 200], ['admin', 200]]) {
    for (const handler of [getTransactionById, getTransactionRequirements]) {
      const result = await invoke(handler, { user: people[actor], params: { id: String(tx.id) } });
      assert.equal(result.statusCode, expected, `${actor}: ${result.body?.message}`);
    }
  }
  const filter = await transactionAccessFilter(people.ao);
  const visible = await db.transaction.findMany({ where: filter });
  assert.ok(visible.some(row => row.id === tx.id));
  assert.ok(!visible.some(row => row.id === otherTx.id));
});

test('rejected documents cannot be resubmitted; duplicate requirement slots are rejected by PostgreSQL', async () => {
  const data = { transactionId: tx.id, requirementTemplateId: requirement.id, storagePath: 'test-only/no-file',
    fileName: 'synthetic.pdf', uploadedByUserId: people.owner.userId, status: 'REJECTED' };
  await db.uploadedDocument.create({ data });
  await assert.rejects(db.uploadedDocument.create({ data }), error => error.code === 'P2002');
  const result = await invoke(submitTransaction, { params: { id: String(tx.id) }, user: people.owner });
  assert.equal(result.statusCode, 409);
  assert.equal((await db.transaction.findUnique({ where: { id: tx.id } })).status, 'DEFICIENCY');
});

test('drafts survive a new client and concurrent stale saves cannot overwrite each other', async () => {
  const body = { version: '0', pages: [0], entries: [] };
  const save = () => fetch(baseUrl, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-test-actor': 'owner' }, body: JSON.stringify(body) });
  const outcomes = await Promise.all([save(), save()]);
  assert.deepEqual(outcomes.map(r => r.status).sort(), [200, 409]);
  const freshClient = new client.PrismaClient();
  try { assert.ok(await freshClient.formDraft.findUnique({ where: { transactionId_templateId: { transactionId: tx.id, templateId: 'pds-2025' } } })); }
  finally { await freshClient.$disconnect(); }
  assert.equal((await fetch(baseUrl, { headers: { 'x-test-actor': 'other' } })).status, 403);
});

test('a draft save queued behind a workflow transition sees the new locked state', async () => {
  let unlock, locked;
  const ready = new Promise(resolve => { locked = resolve; });
  const release = new Promise(resolve => { unlock = resolve; });
  const transition = db.$transaction(async session => {
    await lockTransaction(session, tx.id); locked(); await release;
    await session.transaction.update({ where: { id: tx.id }, data: { status: 'PENDING_VALIDATION' } });
  });
  await ready;
  const current = await (await fetch(baseUrl, { headers: { 'x-test-actor': 'owner' } })).json();
  const queued = fetch(baseUrl, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-test-actor': 'owner' },
    body: JSON.stringify({ version: current.data.version, pages: [0], entries: [] }) });
  unlock(); await transition;
  assert.equal((await queued).status, 409);
});

test('dashboard counts the database, excluding temporary passwords and active lockouts from usable accounts', async () => {
  await db.user.update({ where: { id: people.other.userId }, data: { mustChangePassword: true } });
  await db.user.update({ where: { id: people.ao.userId }, data: { lockedUntil: new Date(Date.now() + 60000) } });
  const result = await invoke(getDashboardSummary, { user: people.admin });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.total, 6);
  assert.equal(result.body.data.active, 4);
  assert.equal(result.body.data.requiringAction, 2);
});

test('candidate selection uses an application-specific transaction and concurrent selections respect vacancy limits', async () => {
  const cycle = await db.promotionCycle.create({ data: { name: 'Synthetic selection cycle', type: 'NATURAL_VACANCY',
    startDate: new Date(), endDate: new Date(Date.now() + 86400000), status: 'RESULTS_READY',
    rulesConfigurationJson: { targetPosition: 'Teacher III', vacantPositions: 1 } } });
  const applications = [];
  for (const actor of ['owner', 'other']) applications.push(await db.promotionApplication.create({ data: {
    personnelId: people[actor].personnelId, promotionCycleId: cycle.id, status: 'RANKED',
    scoreDetailsJson: { requirementsCheck: { status: 'COMPLETE' }, finalRating: { finalTotalScore: 35 } },
  } }));
  const results = await Promise.all(applications.map(app => invoke(selectPromotionCandidate, {
    params: { id: String(cycle.id), appId: String(app.id) }, user: people.hrmo, body: { isPromoted: true },
  })));
  assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409], JSON.stringify(results));
  const winner = await db.promotionApplication.findFirst({ where: { promotionCycleId: cycle.id, status: 'APPROVED' } });
  assert.ok(winner.scoreDetailsJson.transactionId);
  assert.ok(![tx.id, otherTx.id].includes(winner.scoreDetailsJson.transactionId), 'must not reuse an unrelated transaction');
});

test('concurrent document uploads preserve both versions but only one current requirement slot', async () => {
  const upload = name => invoke(uploadDocument, { params: { transactionId: String(otherTx.id) }, user: people.other,
    body: { requirementId: requirement.id }, file: { originalname: `${name}.pdf`, mimetype: 'application/pdf', buffer: Buffer.from(`%PDF-${name}`), size: 10 } });
  const results = await Promise.all([upload('first'), upload('second')]);
  assert.deepEqual(results.map(r => r.statusCode), [201, 201], JSON.stringify(results));
  const current = await db.uploadedDocument.findMany({ where: { transactionId: otherTx.id, requirementTemplateId: requirement.id } });
  assert.equal(current.length, 1);
  const revisions = await db.documentRevision.findMany({ where: { documentId: current[0].id } });
  assert.equal(revisions.length, 1);
  assert.ok(objects.has(current[0].storagePath));
  assert.ok(objects.has(revisions[0].snapshot.storagePath));
  assert.notEqual(current[0].storagePath, revisions[0].snapshot.storagePath);
});

test('OCR confirmation must belong to the owner and the exact file version reviewed', async () => {
  const template = await db.requirementTemplate.create({ data: { transactionTypeId: txType.id, name: 'Personal Data Sheet', expectedDataType: 'PDF' } });
  const upload = await invoke(uploadDocument, { params: { transactionId: String(otherTx.id) }, user: people.other,
    body: { requirementId: template.id, structuredDataJson: JSON.stringify({ templateId: 'pds-2025', fields: { firstName: 'Synthetic' } }) },
    file: { originalname: 'pds.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-synthetic'), size: 14 } });
  assert.equal(upload.statusCode, 201, JSON.stringify(upload.body));
  assert.ok(upload.body.data.updatedAt);
  const params = { documentId: String(upload.body.data.id) };
  const review = await invoke(getExtractionReview, { params, user: people.other });
  const body = { version: review.body.data.version, fields: { firstName: 'Corrected' } };
  // Another station's personnel cannot see this document at all, so the refusal
  // is the same 404 a missing document gets (one policy for out-of-scope records).
  const before = await db.uploadedDocument.findUnique({ where: { id: upload.body.data.id } });
  assert.equal((await invoke(confirmExtractionReview, { params, user: people.owner, body })).statusCode, 404);
  assert.deepEqual(await db.uploadedDocument.findUnique({ where: { id: upload.body.data.id } }), before);
  assert.equal((await invoke(confirmExtractionReview, { params, user: people.other, body: { ...body, version: 'old-version' } })).statusCode, 409);
  assert.equal((await invoke(confirmExtractionReview, { params, user: people.other, body })).statusCode, 200);
});
