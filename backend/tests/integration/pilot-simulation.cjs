// Synthetic pilot rehearsal. Run only against a fresh disposable local *_test database.
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');

const dbUrl = new URL(process.env.DATABASE_URL || 'http://missing');
assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(dbUrl.hostname) && dbUrl.pathname.endsWith('_test'),
  'Pilot simulation requires an explicitly configured local *_test database.');
Object.assign(process.env, {
  NODE_ENV: 'test', JWT_ACCESS_SECRET: 'pilot-simulation-access-secret-only',
  JWT_REFRESH_SECRET: 'pilot-simulation-refresh-secret-only',
  SMTP_HOST: '', SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', DOCUMENT_STORAGE: 'local',
});
const db = new PrismaClient();
const stub = (request, exports) => { const id = require.resolve(request); require.cache[id] = { id, filename: id, loaded: true, exports }; };
stub('../../src/config/prisma', { __esModule: true, default: db });
stub('../../src/services/workflow-outbox.service', {
  queueTransactionalEmail: async () => {}, queueDeficiencyEmail: async () => {},
  processWorkflowOutbox: async () => {}, startWorkflowOutboxWorker: () => {},
});
stub('../../src/services/tesseract-ocr.service', { extractWithTesseract: async () => { throw new Error('Synthetic OCR disabled'); } });
const objects = new Map();
let objectId = 0;
stub('../../src/services/document-storage.service', {
  async storeDocument(bytes) { const key = `pilot-object:${++objectId}`; objects.set(key, Buffer.from(bytes)); return key; },
  async readDocument(key) { if (!objects.has(key)) throw new Error('Missing synthetic object'); return objects.get(key); },
  async discardUncommittedDocument(key) { objects.delete(key); },
});

const promotion = require('../../src/controllers/promotions.controller');
const transaction = require('../../src/controllers/transactions.controller');
const documents = require('../../src/controllers/documents.controller');
const { ANNEX_C_REQUIREMENTS, MANDATORY_ANNEX_C_CODES } = require('../../src/utils/annex-c.util');
const respond = () => ({ locals: {}, statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } });
const call = async (handler, user, params = {}, body = {}, file) => {
  const res = respond();
  try { await handler({ user, params, body, file }, res, error => { throw error; }); }
  catch (error) { res.statusCode = error.statusCode || 500; res.body = { message: error.message, code: error.code }; }
  return res;
};
const expectStatus = (result, status, label) => assert.equal(result.statusCode, status, `${label}: ${JSON.stringify(result.body)}`);
const pdf = label => Buffer.from(`%PDF-1.4\n% synthetic ${label}\n`);
const users = {};

test.before(async () => {
  assert.equal(await db.user.count(), 0, 'Pilot simulation never reuses a populated database.');
  for (const [key, role, school] of [
    ['teacher', 'TEACHING_PERSONNEL', 'Morales Elementary School'],
    ['moralesAo', 'AO_II', 'Morales Elementary School'],
    ['matulasAo', 'AO_II', 'Matulas Elementary School'],
    ['hr', 'HRMO', 'Division Office'],
  ]) {
    const roleRow = await db.role.upsert({ where: { name: role }, create: { name: role }, update: {} });
    const row = await db.user.create({ data: {
      email: `${key}@pilot.invalid`, passwordHash: `synthetic-${key}`, roleId: roleRow.id, accountStatus: 'ACTIVE',
      personnel: { create: { employeeId: `PILOT-${key}`, firstName: key, lastName: 'Fixture',
        designation: role === 'TEACHING_PERSONNEL' ? 'Teacher I' : 'Administrative Officer II',
        school, district: 'District 1', status: 'ACTIVE', profileComplete: true } },
    }, include: { personnel: true } });
    users[key] = { userId: row.id, role, personnelId: row.personnel.id, email: row.email };
  }
});
test.after(async () => { await db.$disconnect(); });

test('teacher promotion completes from HR cycle to official appointment', async () => {
  const plantilla = await db.plantillaItem.create({ data: {
    itemNumber: 'PILOT-TEACHER-II-001', positionTitle: 'Teacher II', salaryGrade: 12,
    department: 'Morales Elementary School', division: 'District 1',
  } });
  const cycleResult = await call(promotion.createPromotionCycle, users.hr, {}, {
    name: 'Synthetic Teacher II pilot', type: 'NATURAL_VACANCY',
    startDate: new Date(Date.now() - 86400000).toISOString(),
    endDate: new Date(Date.now() + 86400000).toISOString(), status: 'ACTIVE',
    rulesConfigurationJson: { track: 'TEACHING', targetPosition: 'Teacher II', district: 'District 1',
      school: 'Morales Elementary School', plantillaItemNumbers: [plantilla.itemNumber], vacantPositions: 1 },
  });
  expectStatus(cycleResult, 201, 'HR creates cycle');
  const cycleId = cycleResult.body.data.id;
  assert.equal((await db.promotionCycle.findUnique({ where: { id: cycleId } })).status, 'ACTIVE');

  const applicationDocs = new Map();
  for (const code of MANDATORY_ANNEX_C_CODES) {
    const bytes = pdf(`annex-${code}`);
    const key = `pilot-source:${code}`;
    objects.set(key, bytes);
    const source = await db.personnelFile.create({ data: {
      personnelId: users.teacher.personnelId, documentTypeId: `ANNEX_${code.toUpperCase()}`,
      documentTypeName: `Annex C ${code}`, originalFileName: `annex-${code}.pdf`,
      mimeType: 'application/pdf', fileSize: bytes.length, storagePath: key, status: 'SUBMITTED',
    } });
    applicationDocs.set(code, source.id);
  }
  const checklist = { items: ANNEX_C_REQUIREMENTS.map(item => ({
    code: item.code, personnelDocumentId: applicationDocs.get(item.code) || undefined,
    submitted: applicationDocs.has(item.code),
  })) };
  const missing = await call(promotion.applyForPromotion, users.teacher, { id: String(cycleId) },
    { checklist: { items: checklist.items.filter(item => item.code !== MANDATORY_ANNEX_C_CODES[0]) } });
  expectStatus(missing, 400, 'missing mandatory Annex C file');
  const applied = await call(promotion.applyForPromotion, users.teacher, { id: String(cycleId) }, { checklist });
  expectStatus(applied, 201, 'teacher applies with My Documents');
  const appId = applied.body.data.id;
  assert.equal((await db.promotionApplication.findUnique({ where: { id: appId } })).status, 'SUBMITTED');
  // Application notices link to the application itself (deep link), not the cycle.
  const scopedNotifications = await db.notification.findMany({ where: { relatedEntityId: appId, relatedEntityType: 'PromotionApplication' } });
  assert.ok(scopedNotifications.some(row => row.userId === users.moralesAo.userId && row.message.includes('Application')));
  assert.ok(!scopedNotifications.some(row => row.userId === users.matulasAo.userId && row.message.includes('Application')));

  const params = { id: String(cycleId), appId: String(appId) };
  expectStatus(await call(promotion.verifyApplicationRequirements, users.matulasAo, params, { status: 'COMPLETE' }), 404,
    'wrong-school AO is denied');
  expectStatus(await call(promotion.submitFinalRating, users.hr, params, { track: 'TEACHING' }), 400,
    'HR cannot deliberate before AO verification');
  expectStatus(await call(promotion.verifyApplicationRequirements, users.moralesAo, params,
    { status: 'INCOMPLETE', remarks: 'Synthetic unreadable page' }), 200, 'AO returns deficiency');
  expectStatus(await call(promotion.verifyApplicationRequirements, users.moralesAo, params,
    { status: 'COMPLETE', remarks: 'Synthetic resubmission verified' }), 200, 'AO verifies corrected application');
  expectStatus(await call(promotion.selectPromotionCandidate, users.hr, params, { isPromoted: true }), 400,
    'HR cannot select before deliberation');
  expectStatus(await call(promotion.submitFinalRating, users.hr, params,
    { track: 'TEACHING', educationScore: 10, trainingScore: 9, experienceScore: 9,
      performanceScore: 28, ppstCoiScore: 23, ppstNcoiScore: 14, remarks: 'Synthetic CAR' }), 200, 'HR deliberates');
  expectStatus(await call(promotion.generateRanking, users.hr, { id: String(cycleId) }), 200, 'HR ranks');
  expectStatus(await call(promotion.selectPromotionCandidate, users.hr, params,
    { isPromoted: true, plantillaItemNumber: plantilla.itemNumber }), 200, 'HR selects candidate');
  const selected = await db.promotionApplication.findUnique({ where: { id: appId } });
  const txId = selected.scoreDetailsJson.transactionId;
  assert.ok(Number.isInteger(txId));
  assert.equal(await db.transaction.count({ where: { id: txId, personnelId: users.teacher.personnelId } }), 1);
  assert.ok(await db.notification.findFirst({ where: { userId: users.teacher.userId, relatedEntityId: txId,
    message: { contains: 'selected for Promotion' } } }));

  const templates = await db.requirementTemplate.findMany({ where: { transactionType: { name: 'Promotion' }, isMandatory: true } });
  assert.ok(templates.length >= 4);
  let firstDocumentId;
  for (const [index, template] of templates.entries()) {
    let result;
    if (index === 0) {
      const bytes = pdf('camera-scan');
      result = await call(documents.uploadDocument, users.teacher, { transactionId: String(txId) },
        { requirementId: template.id }, { originalname: 'camera-scanned.pdf', mimetype: 'application/pdf', size: bytes.length, buffer: bytes });
    } else {
      const sourceId = applicationDocs.get(MANDATORY_ANNEX_C_CODES[(index - 1) % MANDATORY_ANNEX_C_CODES.length]);
      result = await call(documents.attachExistingPersonnelDocument, users.teacher, { id: String(txId) },
        { personnelDocumentId: sourceId, requirementId: template.id });
    }
    expectStatus(result, 201, `appointment requirement ${template.name}`);
    if (!firstDocumentId) firstDocumentId = result.body.data.id;
  }
  expectStatus(await call(transaction.submitTransaction, users.teacher, { id: String(txId) }), 200,
    'teacher submits appointment pack');
  assert.equal((await db.transaction.findUnique({ where: { id: txId } })).status, 'PENDING_VALIDATION');
  const docs = await db.uploadedDocument.findMany({ where: { transactionId: txId } });
  expectStatus(await call(transaction.validateTransaction, users.matulasAo, { id: String(txId) },
    { documentValidations: docs.map(doc => ({ documentId: doc.id, isValid: true })), targetStatus: 'FOR_APPROVAL' }), 404,
    'wrong-school AO cannot validate appointment');
  expectStatus(await call(transaction.validateTransaction, users.moralesAo, { id: String(txId) },
    { documentValidations: docs.map(doc => ({ documentId: doc.id, isValid: true })), targetStatus: 'FOR_APPROVAL' }), 200,
    'in-scope AO validates appointment');
  expectStatus(await call(transaction.approveTransaction, users.hr, { id: String(txId) },
    { isApproved: true, notes: 'Synthetic final approval' }), 200, 'HR approves appointment');
  const finalTx = await db.transaction.findUnique({ where: { id: txId } });
  const finalPerson = await db.personnel.findUnique({ where: { id: users.teacher.personnelId } });
  const finalApplication = await db.promotionApplication.findUnique({ where: { id: appId } });
  assert.equal(finalTx.status, 'APPROVED');
  assert.equal(finalPerson.designation, 'Teacher II');
  assert.equal(finalPerson.plantillaItemId, plantilla.id);
  assert.equal(finalApplication.scoreDetailsJson.appointmentApproved, true);
  assert.equal(await db.careerHistoryEntry.count({ where: { personnelId: users.teacher.personnelId,
    detailsJson: { path: ['transactionId'], equals: txId } } }), 1);
  assert.ok(await db.notification.findFirst({ where: { userId: users.teacher.userId, relatedEntityId: txId,
    message: { contains: 'Approved' } } }));
  expectStatus(await call(transaction.approveTransaction, users.hr, { id: String(txId) }, { isApproved: true }), 400,
    'repeat HR approval does not duplicate the career entry');
  assert.equal(await db.careerHistoryEntry.count({ where: { personnelId: users.teacher.personnelId,
    detailsJson: { path: ['transactionId'], equals: txId } } }), 1);
});
