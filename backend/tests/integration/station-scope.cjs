// Station-scope authorization, end to end: the real app, routes, middleware,
// controllers, signed JWTs and PostgreSQL. Nothing about authorization is mocked.
//
// Creates, migrates and drops its own database on the server DATABASE_URL points
// at, so it runs beside workflow.cjs (which needs an empty database) without
// interfering. Run only against a disposable local server.
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const base = new URL(process.env.DATABASE_URL || 'http://missing');
assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(base.hostname) && base.pathname.endsWith('_test'),
  'Integration tests require an explicitly configured local database ending in _test. Never use production.');

const dbName = `digital201_scope_${process.pid}_test`;
const isolated = new URL(base.href);
isolated.pathname = `/${dbName}`;
Object.assign(process.env, {
  DATABASE_URL: isolated.href,
  DIRECT_URL: isolated.href,
  NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'integration-only-access-key-no-real-sessions',
  JWT_REFRESH_SECRET: 'integration-only-refresh-key-no-real-sessions',
  RATE_LIMIT_MAX_REQUESTS: '100000',
  // Set explicitly so dotenv cannot fill them in from a developer's .env.
  SMTP_HOST: '', SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', DOCUMENT_STORAGE: 'local', OCR_PROVIDER: '',
});

const client = require(process.env.GAP_PRISMA_CLIENT_PATH
  ? path.resolve(process.env.GAP_PRISMA_CLIENT_PATH) : '@prisma/client');
require.cache[require.resolve('@prisma/client')] = { exports: client };
const admin = new client.PrismaClient({ datasources: { db: { url: base.href } } });
let db;

const stub = (request, exports) => {
  const file = require.resolve(request);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
// Email and OCR must never leave a test process; objects live in memory.
stub('../../src/services/workflow-outbox.service', {
  queueTransactionalEmail: async () => {}, queueDeficiencyEmail: async () => {},
  processWorkflowOutbox: async () => {}, startWorkflowOutboxWorker: () => {},
});
stub('../../src/services/document-ai.service', {
  documentAiConfigured: () => false,
  extractPdsWithDocumentAi: async () => { throw new Error('OCR is disabled in tests'); },
});
const objects = new Map();
let objectSequence = 0;
stub('../../src/services/document-storage.service', {
  async storeDocument(buffer) { const key = `synthetic-object:${++objectSequence}`; objects.set(key, buffer); return key; },
  async readDocument(key) { if (!objects.has(key)) throw new Error('missing object'); return objects.get(key); },
  async discardUncommittedDocument(key) { objects.delete(key); },
});
// Request logging only; keeps the test output readable.
stub('morgan', Object.assign(() => (req, res, next) => next(), { token() {} }));

const pdf = marker => Buffer.from(`%PDF-1.4\n% ${marker}\n`);
const storedObject = marker => {
  const key = `synthetic-object:${++objectSequence}`;
  objects.set(key, pdf(marker));
  return key;
};
const settle = () => new Promise(resolve => setTimeout(resolve, 250));
const waitFor = async (predicate, label, timeoutMs = 5000) => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};

const MORALES = 'Morales Elementary School';
const MATULAS = 'Matulas Elementary School';
// Anything that identifies a Matulas person or file. None may reach a Morales officer.
const MATULAS_MARKERS = ['Villanueva', 'Lorna', 'EMP-MAT-0001', 'APP-MAT-0001', 'Espiritu', 'matulas-tx-doc', 'matulas-201-file'];
const assertNoLeak = (res, label, markers = MATULAS_MARKERS) => {
  for (const marker of markers) assert.ok(!res.text.includes(marker), `${label} disclosed "${marker}"`);
};

const people = {};
const f = {};
let server, baseUrl, generateAccessToken, passwordTokenVersion;

async function account(key, role, school, extra = {}) {
  const roleRow = await db.role.upsert({ where: { name: role }, create: { name: role }, update: {} });
  const passwordHash = `synthetic-hash-${key}`;
  const user = await db.user.create({
    data: {
      email: `${key}@scope.invalid`, passwordHash, roleId: roleRow.id, accountStatus: extra.accountStatus || 'ACTIVE',
      ...(extra.noPersonnel ? {} : {
        personnel: { create: {
          employeeId: extra.employeeId || `SCOPE-${key}`, firstName: extra.firstName || key, lastName: extra.lastName || 'Fixture',
          designation: extra.designation || 'Teacher I', school, district: 'district' in extra ? extra.district : 'District 1',
          status: 'ACTIVE', profileComplete: true,
        } },
      }),
    },
    include: { personnel: true },
  });
  people[key] = {
    key, role, userId: user.id, email: user.email, personnelId: user.personnel?.id ?? null, station: extra.station,
    token: generateAccessToken({ userId: user.id, email: user.email, role, pwdv: passwordTokenVersion(passwordHash) }),
  };
  return people[key];
}

async function call(actor, method, url, { body, form, headers = {} } = {}) {
  const allHeaders = { 'user-agent': 'station-scope-integration', ...headers };
  if (actor) allHeaders.authorization = `Bearer ${actor.token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { allHeaders['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${baseUrl}/api/v1${url}`, { method, headers: allHeaders, body: payload });
  const buffer = Buffer.from(await res.arrayBuffer());
  const text = buffer.toString('utf8');
  let json = null;
  try { json = JSON.parse(text); } catch { /* binary body */ }
  return { status: res.status, json, text, buffer, headers: res.headers };
}
const get = (actor, url) => call(actor, 'GET', url);
const post = (actor, url, body) => call(actor, 'POST', url, { body });
const put = (actor, url, body) => call(actor, 'PUT', url, { body });
const ids = res => (res.json?.data || []).map(row => row.id);

/** Everything a denied mutation might have touched. */
const snapshot = async () => JSON.stringify(await Promise.all([
  db.transaction.findMany({ orderBy: { id: 'asc' }, select: { id: true, status: true, remarks: true, updatedAt: true, currentAssigneeId: true } }),
  db.uploadedDocument.findMany({ orderBy: { id: 'asc' }, select: { id: true, status: true, validationNotes: true, validatedByUserId: true, updatedAt: true } }),
  db.promotionApplication.findMany({ orderBy: { id: 'asc' }, select: { id: true, status: true, scoreDetailsJson: true, updatedAt: true } }),
  db.personnel.count(),
  db.user.findMany({ orderBy: { id: 'asc' }, select: { id: true, accountStatus: true } }),
  db.notification.count(),
  db.validationLog.count({ where: { status: 'SUCCESS' } }),
]));

test.before(async () => {
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '../..'), env: process.env, stdio: 'pipe',
  });
  db = new client.PrismaClient({ datasources: { db: { url: isolated.href } } });
  stub('../../src/config/prisma', { __esModule: true, default: db });
  ({ generateAccessToken, passwordTokenVersion } = require('../../src/utils/jwt.util'));

  await account('moralesAo', 'AO_II', MORALES, { station: 'morales', firstName: 'AO II', lastName: MORALES });
  await account('matulasAo', 'AO_II', MATULAS, { station: 'matulas', firstName: 'AO II', lastName: MATULAS });
  await account('annexAo', 'AO_II', `${MORALES} Annex`, { station: 'annex' });
  await account('districtOnlyAo', 'AO_II', null, { district: 'District 1' });
  await account('blankAo', 'AO_II', '   ', { district: 'District 1' });
  await account('wildcardAo', 'AO_II', 'M%', { district: 'District 1' });
  await account('unknownStationAo', 'AO_II', 'Nonexistent Elementary School', { district: 'District 1' });
  await account('orphanAo', 'AO_II', null, { noPersonnel: true });
  await account('hrmo', 'HRMO', null, { district: null });
  await account('admin', 'SYSTEM_ADMIN', null, { district: null });
  await account('moralesApplicant', 'TEACHING_PERSONNEL', MORALES, { station: 'morales', firstName: 'Rosa', lastName: 'Delacruz', employeeId: 'EMP-MOR-0001' });
  // Same station, stored with other capitalisation and stray whitespace.
  await account('moralesCase', 'NON_TEACHING_PERSONNEL', '  morales   elementary school ', { station: 'morales', firstName: 'Ben', lastName: 'Santos', designation: 'Administrative Assistant II' });
  await account('moralesPending', 'TEACHING_PERSONNEL', MORALES, { station: 'morales', accountStatus: 'PENDING', firstName: 'Pia', lastName: 'Reyes' });
  await account('matulasApplicant', 'TEACHING_PERSONNEL', MATULAS, { station: 'matulas', firstName: 'Lorna', lastName: 'Villanueva', employeeId: 'EMP-MAT-0001' });
  await account('matulasApplicant2', 'TEACHING_PERSONNEL', MATULAS, { station: 'matulas', firstName: 'Carlo', lastName: 'Espiritu' });
  await account('matulasPending', 'TEACHING_PERSONNEL', MATULAS, { station: 'matulas', accountStatus: 'PENDING', firstName: 'Nina', lastName: 'Espiritu' });
  await account('annexTeacher', 'TEACHING_PERSONNEL', `${MORALES} Annex`, { station: 'annex', firstName: 'Ivy', lastName: 'Annexo' });
  await account('noStationTeacher', 'TEACHING_PERSONNEL', null, { district: null, firstName: 'Omar', lastName: 'Walang' });

  const txType = await db.transactionType.create({ data: { name: 'Promotion' } });
  f.diploma = await db.requirementTemplate.create({ data: { transactionTypeId: txType.id, name: 'Diploma', isMandatory: true, expectedDataType: 'PDF' } });
  const transaction = async (owner, status, marker) => {
    const tx = await db.transaction.create({ data: { personnelId: owner.personnelId, transactionTypeId: txType.id, status, submissionDate: new Date() } });
    const doc = await db.uploadedDocument.create({ data: {
      transactionId: tx.id, requirementTemplateId: f.diploma.id, storagePath: storedObject(marker), fileName: `${marker}.pdf`,
      mimeType: 'application/pdf', fileSize: 24, uploadedByUserId: owner.userId, status: 'REQUIRES_MANUAL_REVIEW',
    } });
    return { id: tx.id, docId: doc.id };
  };
  f.moralesTx = await transaction(people.moralesApplicant, 'PENDING_VALIDATION', 'morales-tx-doc');
  f.matulasTx = await transaction(people.matulasApplicant, 'PENDING_VALIDATION', 'matulas-tx-doc');
  f.matulasTx2 = await transaction(people.matulasApplicant, 'PENDING_VALIDATION', 'matulas-tx-doc-2');
  f.moralesAoOwnTx = await transaction(people.moralesAo, 'PENDING_VALIDATION', 'morales-ao-own-doc');
  f.annexTx = await transaction(people.annexTeacher, 'PENDING_VALIDATION', 'annex-tx-doc');
  f.matulasDraftTx = await transaction(people.matulasApplicant2, 'DRAFT', 'matulas-tx-doc-draft');
  f.noStationDraftTx = await transaction(people.noStationTeacher, 'DRAFT', 'no-station-doc');

  const personnelFile = async (owner, marker) => (await db.personnelFile.create({ data: {
    personnelId: owner.personnelId, documentTypeId: 'TOR', documentTypeName: 'Transcript of Records',
    originalFileName: `${marker}.pdf`, storedFileName: marker, storagePath: storedObject(marker),
    mimeType: 'application/pdf', fileSize: 24, status: 'SUBMITTED',
  } })).id;
  f.moralesFile = await personnelFile(people.moralesApplicant, 'morales-201-file');
  f.matulasFile = await personnelFile(people.matulasApplicant, 'matulas-201-file');

  const cycle = (name, rulesConfigurationJson) => db.promotionCycle.create({ data: {
    name, type: 'NATURAL_VACANCY', status: 'ACTIVE', startDate: new Date(), endDate: new Date(Date.now() + 30 * 86400000), rulesConfigurationJson,
  } });
  f.cycle = await cycle('District 1 Teacher II', { district: 'District 1', targetPosition: 'Teacher II', maxApplicants: 50 });
  f.matulasCycle = await cycle('Teacher I at a designated station', { district: 'District 1', targetPosition: 'Teacher I', designatedSchool: MATULAS, maxApplicants: 50 });
  const application = (owner, applicantNumber, fileId) => db.promotionApplication.create({ data: {
    personnelId: owner.personnelId, promotionCycleId: f.cycle.id, applicantNumber, status: 'SUBMITTED',
    scoreDetailsJson: { applicantNumber, annexCChecklist: { items: [{ code: 'e', submitted: true, personnelDocumentId: fileId, fileName: `${applicantNumber}.pdf` }] } },
  } });
  f.moralesApp = await application(people.moralesApplicant, 'APP-MOR-0001', f.moralesFile);
  f.matulasApp = await application(people.matulasApplicant, 'APP-MAT-0001', f.matulasFile);

  await db.refreshToken.create({ data: { userId: people.moralesAo.userId, token: 'synthetic-refresh-morales-ao', expiresAt: new Date(Date.now() + 86400000) } });

  const app = require('../../src/app').default;
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (db) await db.$disconnect();
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.$disconnect();
});

// ── Lists, search, counts ──────────────────────────────────────────────────

test('1-2. a Morales AO II lists Morales applicants and records, and no Matulas one appears anywhere', async () => {
  const { moralesAo } = people;
  const applications = await get(moralesAo, `/promotions/cycles/${f.cycle.id}/applications`);
  assert.equal(applications.status, 200);
  assert.deepEqual(ids(applications), [f.moralesApp.id]);

  const leaderboard = await get(moralesAo, `/promotions/cycles/${f.cycle.id}/leaderboard`);
  assert.deepEqual(ids(leaderboard), [f.moralesApp.id]);
  const ranking = await get(moralesAo, `/promotions/cycles/${f.cycle.id}/ranking-results`);
  assert.deepEqual(ranking.json.data.map(r => r.applicationId), [f.moralesApp.id]);

  const queue = await get(moralesAo, '/transactions?limit=100');
  assert.deepEqual(ids(queue).sort(), [f.moralesTx.id, f.moralesAoOwnTx.id].sort());

  const personnel = await get(moralesAo, '/personnel?limit=100');
  assert.deepEqual(ids(personnel).sort(),
    [people.moralesApplicant, people.moralesCase, people.moralesPending].map(p => p.personnelId).sort(),
    'station subjects, matched case-insensitively, and nobody else');

  const users = await get(moralesAo, '/users?limit=100');
  assert.deepEqual(ids(users).sort(), [people.moralesApplicant, people.moralesCase, people.moralesPending].map(p => p.userId).sort());

  for (const [label, res] of Object.entries({ applications, leaderboard, ranking, queue, personnel, users })) {
    assertNoLeak(res, label);
    assert.ok(!res.text.includes(MATULAS), `${label} named the other station`);
  }
});

test('3. search never reaches a Matulas applicant by name, employee id, applicant number or reference', async () => {
  const { moralesAo } = people;
  for (const q of ['Villanueva', 'Lorna', 'EMP-MAT-0001', 'APP-MAT-0001', `TRX-${f.matulasTx.id}`, String(f.matulasTx.id)]) {
    for (const url of [`/transactions?search=${encodeURIComponent(q)}`, `/personnel?search=${encodeURIComponent(q)}`, `/users?search=${encodeURIComponent(q)}`]) {
      const res = await get(moralesAo, url);
      assert.equal(res.status, 200, url);
      assert.deepEqual(ids(res), [], `${url} found an out-of-scope record`);
      assert.equal(res.json.pagination.totalItems, 0, `${url} counted an out-of-scope record`);
    }
  }
  // Client-supplied station filters narrow; they never widen.
  const byOtherStation = await get(moralesAo, `/transactions?school=${encodeURIComponent(MATULAS)}`);
  assert.deepEqual(ids(byOtherStation), []);
  const byDistrict = await get(moralesAo, '/transactions?district=District%201&limit=100');
  assert.deepEqual(ids(byDistrict).sort(), [f.moralesTx.id, f.moralesAoOwnTx.id].sort());
});

test('4. pagination totals, status counts and filter options exclude Matulas', async () => {
  const { moralesAo } = people;
  const queue = await get(moralesAo, '/transactions?limit=1');
  assert.equal(queue.json.pagination.totalItems, 2);
  assert.equal(queue.json.counts.all, 2);
  const { sameStation } = require('../../src/utils/scope.util');
  assert.ok(queue.json.filterOptions.allSchools.length > 0);
  assert.ok(queue.json.filterOptions.allSchools.every(school => sameStation(school, MORALES)), 'filter options named another station');
  assert.ok(!JSON.stringify(queue.json.filterOptions).includes('Matulas'));

  const personnel = await get(moralesAo, '/personnel?limit=1');
  assert.equal(personnel.json.pagination.totalItems, 3);
  const users = await get(moralesAo, '/users?limit=1');
  assert.equal(users.json.pagination.totalItems, 3);
});

test('5. dashboard and cycle applicant counts exclude Matulas activity', async () => {
  const dashboard = await get(people.moralesAo, '/dashboard');
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.json.data.totalTransactions, 2);
  assert.equal(dashboard.json.data.totalPersonnel, 3);
  assert.equal(dashboard.json.data.teachingCount, 2);
  assert.equal(dashboard.json.data.nonTeachingCount, 1);

  const moralesCycles = await get(people.moralesAo, '/promotions/cycles?status=ALL');
  assert.equal(moralesCycles.json.data.find(c => c.id === f.cycle.id).applicantCount, 1);
  const hrmoCycles = await get(people.hrmo, '/promotions/cycles?status=ALL');
  assert.equal(hrmoCycles.json.data.find(c => c.id === f.cycle.id).applicantCount, 2);
  const vacancies = await get(people.moralesAo, '/plantilla/available');
  assert.equal(vacancies.status, 200);
});

// ── Direct object references ──────────────────────────────────────────────

test('6-7, 9, 15. a Morales AO II opens Morales records, and every Matulas id reads exactly like a missing one', async () => {
  const { moralesAo } = people;
  assert.equal((await get(moralesAo, `/transactions/${f.moralesTx.id}`)).status, 200);
  assert.equal((await get(moralesAo, `/transactions/${f.moralesTx.id}/requirements`)).status, 200);
  assert.equal((await get(moralesAo, `/personnel/${people.moralesApplicant.personnelId}`)).status, 200);

  const pairs = [
    [`/transactions/${f.matulasTx.id}`, '/transactions/999999'],
    [`/transactions/${f.matulasTx.id}/requirements`, '/transactions/999999/requirements'],
    [`/documents/${f.matulasTx.docId}`, '/documents/999999'],
    [`/documents/${f.matulasTx.docId}/extraction-review`, '/documents/999999/extraction-review'],
    [`/personnel/${people.matulasApplicant.personnelId}`, '/personnel/999999'],
    [`/personnel/${people.matulasApplicant.personnelId}/service-record`, '/personnel/999999/service-record'],
    [`/promotions/personnel/${people.matulasApplicant.personnelId}/career-history`, '/promotions/personnel/999999/career-history'],
    [`/users/${people.matulasApplicant.userId}`, '/users/999999'],
    [`/personnel/documents/${f.matulasFile}/view-token`, '/personnel/documents/999999/view-token'],
  ];
  for (const [outOfScope, missing] of pairs) {
    const denied = await get(moralesAo, outOfScope);
    const absent = await get(moralesAo, missing);
    assert.equal(denied.status, 404, outOfScope);
    assert.deepEqual(denied.json, absent.json, `${outOfScope} must be indistinguishable from a missing record`);
    assertNoLeak(denied, outOfScope);
  }
});

test('8, 10-11, 28. every Matulas mutation is refused and changes nothing', async () => {
  const { moralesAo } = people;
  await settle();
  const before = await snapshot();
  const objectCount = objects.size;

  const attempts = [
    post(moralesAo, `/transactions/${f.matulasTx.id}/validate`, { documentValidations: [{ documentId: f.matulasTx.docId, isValid: true }], targetStatus: 'FOR_APPROVAL' }),
    post(moralesAo, `/transactions/${f.matulasTx.id}/validate`, { documentValidations: [{ documentId: f.matulasTx.docId, isValid: false, feedback: 'blurred' }], remarks: 'Return for correction' }),
    post(moralesAo, `/transactions/${f.matulasTx.id}/validate`, { documentValidations: [{ documentId: f.matulasTx.docId, isValid: false }], targetStatus: 'REJECTED', remarks: 'Disqualified' }),
    post(moralesAo, `/promotions/cycles/${f.cycle.id}/applications/${f.matulasApp.id}/verify-requirements`, { status: 'COMPLETE', remarks: 'forged', itemVerifications: [{ code: 'e', status: 'VERIFIED' }] }),
    post(moralesAo, `/promotions/cycles/${f.cycle.id}/applications/${f.matulasApp.id}/verify-requirements`, { status: 'INCOMPLETE', remarks: 'forged deficiency' }),
    post(moralesAo, `/users/${people.matulasPending.userId}/distribute-credentials`),
    put(moralesAo, `/personnel/${people.matulasApplicant.personnelId}`, { designation: 'Teacher III' }),
    post(moralesAo, `/promotions/cycles/${f.cycle.id}/manual-application`, { employeeId: 'EMP-MAT-0001' }),
    post(moralesAo, `/promotions/cycles/${f.cycle.id}/manual-application`, { personnelId: people.matulasApplicant2.personnelId }),
  ];
  const form = new FormData();
  form.append('requirementTemplateId', String(f.diploma.id));
  form.append('file', new Blob([pdf('forged-upload')], { type: 'application/pdf' }), 'forged.pdf');
  attempts.push(call(moralesAo, 'POST', `/transactions/${f.matulasTx.id}/upload`, { form }));

  for (const res of await Promise.all(attempts)) {
    assert.equal(res.status, 404, res.text);
    // A code lookup echoes back only the code the caller sent, checked below.
    assertNoLeak(res, 'refusal', MATULAS_MARKERS.filter(marker => marker !== 'EMP-MAT-0001'));
  }
  // The code lookup must read exactly like an unknown code.
  const unknownCode = await post(moralesAo, `/promotions/cycles/${f.cycle.id}/manual-application`, { employeeId: 'EMP-NOBODY' });
  const matulasCode = await post(moralesAo, `/promotions/cycles/${f.cycle.id}/manual-application`, { employeeId: 'EMP-MAT-0001' });
  assert.equal(matulasCode.json.message, unknownCode.json.message.replace('EMP-NOBODY', 'EMP-MAT-0001'));

  await settle();
  assert.equal(await snapshot(), before, 'a refused request must not change any record, notification or success audit entry');
  assert.equal(objects.size, objectCount, 'a refused upload must not store a file');
});

test('generate-ranking is HRMO work; a station officer cannot re-rank the division', async () => {
  const res = await post(people.moralesAo, `/promotions/cycles/${f.cycle.id}/generate-ranking`);
  assert.equal(res.status, 403);
});

// ── Documents and view tokens ──────────────────────────────────────────────

test('12-14. no Matulas view token is issued and no Matulas file or metadata is returned', async () => {
  const { moralesAo } = people;
  for (const url of [`/documents/${f.matulasTx.docId}/view-token`, `/personnel/documents/${f.matulasFile}/view-token`]) {
    const res = await get(moralesAo, url);
    assert.equal(res.status, 404, url);
    assert.equal(res.json.data, undefined, `${url} returned a token`);
  }
  for (const url of [`/documents/${f.matulasTx.docId}/file`, `/documents/${f.matulasTx.docId}/download`, `/personnel/documents/${f.matulasFile}/file`]) {
    const res = await get(moralesAo, url);
    assert.equal(res.status, 404, url);
    assert.equal(res.headers.get('content-disposition'), null, `${url} sent a filename`);
    assert.ok(!res.buffer.includes(Buffer.from('%PDF')), `${url} sent file bytes`);
    assertNoLeak(res, url);
  }
});

test('16. a valid token for one document opens that document only', async () => {
  const { moralesAo } = people;
  const issued = await get(moralesAo, `/documents/${f.moralesTx.docId}/view-token`);
  assert.equal(issued.status, 200);
  const token = encodeURIComponent(issued.json.data.token);

  const own = await get(null, `/documents/${f.moralesTx.docId}/file?token=${token}`);
  assert.equal(own.status, 200);
  assert.ok(own.text.includes('morales-tx-doc'));

  // Swapping the id: refused before any lookup, so existence is not revealed either.
  const swapped = await get(null, `/documents/${f.matulasTx.docId}/file?token=${token}`);
  const nonexistent = await get(null, `/documents/999999/file?token=${token}`);
  assert.equal(swapped.status, 403);
  assert.deepEqual(swapped.json, nonexistent.json);
  assertNoLeak(swapped, 'swapped token');
  // Nor can a transaction-document token open a 201 file with the same id.
  const crossType = await get(null, `/personnel/documents/${f.moralesTx.docId}/file?token=${token}`);
  assert.equal(crossType.status, 403);
  // A token never authenticates anything but a GET.
  const mutation = await call(null, 'POST', `/transactions/${f.moralesTx.id}/validate?token=${token}`, { body: {} });
  assert.equal(mutation.status, 401);
});

test('29. a denied document request is audited as a failed access, never as an access', async () => {
  const { moralesAo } = people;
  await get(moralesAo, `/documents/${f.matulasTx.docId}/file`);
  await get(moralesAo, `/personnel/documents/${f.matulasFile}/file`);
  await settle();

  const denial = await db.validationLog.findFirst({
    where: { userId: moralesAo.userId, action: 'ACCESS_DENIED', entityType: 'Document', entityId: f.matulasTx.docId },
    orderBy: { id: 'desc' },
  });
  assert.ok(denial, 'the denied download was not audited');
  assert.equal(denial.status, 'FAILED');
  assert.deepEqual(denial.detailsJson, { attemptedAction: 'DOCUMENT_DOWNLOAD', reason: 'OUT_OF_STATION_SCOPE', role: 'AO_II' });
  assert.equal(denial.userAgent, 'station-scope-integration');
  assert.ok(denial.ipAddress);

  const fileDenial = await db.validationLog.findFirst({
    where: {
      userId: moralesAo.userId, action: 'ACCESS_DENIED', entityType: 'PersonnelDocument', entityId: f.matulasFile,
      detailsJson: { path: ['attemptedAction'], equals: 'PERSONNEL_DOCUMENT_DOWNLOAD' },
    },
  });
  assert.equal(fileDenial?.status, 'FAILED', 'the denied 201 file download was not audited');

  const recordedAsAccess = await db.validationLog.count({
    where: { userId: moralesAo.userId, status: 'SUCCESS', entityType: { in: ['Document', 'PersonnelDocument'] }, entityId: { in: [f.matulasTx.docId, f.matulasFile] } },
  });
  assert.equal(recordedAsAccess, 0);
});

// ── Fail closed ────────────────────────────────────────────────────────────

test('17-19. a missing, empty, unknown or wildcard station sees nothing and reaches nothing', async () => {
  const stored = await db.personnel.findUnique({ where: { id: people.blankAo.personnelId }, select: { school: true } });
  assert.equal(stored.school, null, 'a blank station is stored as no station');

  for (const key of ['districtOnlyAo', 'blankAo', 'orphanAo', 'wildcardAo', 'unknownStationAo']) {
    const officer = people[key];
    for (const url of ['/transactions?limit=100', `/promotions/cycles/${f.cycle.id}/applications`, `/promotions/cycles/${f.cycle.id}/leaderboard`, '/users?limit=100']) {
      const res = await get(officer, url);
      assert.equal(res.status, 200, `${key} ${url}`);
      assert.deepEqual(ids(res), [], `${key} ${url} returned records`);
    }
    const dashboard = await get(officer, '/dashboard');
    assert.equal(dashboard.json.data.totalTransactions, 0, key);
    assert.equal(dashboard.json.data.totalPersonnel, 0, key);
    for (const url of [`/transactions/${f.moralesTx.id}`, `/transactions/${f.matulasTx.id}`, `/personnel/documents/${f.moralesFile}/file`, `/documents/${f.matulasTx.docId}/view-token`]) {
      assert.equal((await get(officer, url)).status, 404, `${key} ${url}`);
    }
    const verify = await post(officer, `/promotions/cycles/${f.cycle.id}/applications/${f.moralesApp.id}/verify-requirements`, { status: 'COMPLETE' });
    assert.equal(verify.status, 404, `${key} verified an application`);
  }
  // Officers without a school get the explicit configuration error on the personnel list.
  for (const key of ['districtOnlyAo', 'blankAo', 'orphanAo']) {
    assert.equal((await get(people[key], '/personnel')).status, 403, key);
  }
});

test('20. similar station names never match through prefixes or substrings', async () => {
  const annexQueue = await get(people.annexAo, '/transactions?limit=100');
  assert.deepEqual(ids(annexQueue), [f.annexTx.id]);
  const annexPersonnel = await get(people.annexAo, '/personnel?limit=100');
  assert.deepEqual(ids(annexPersonnel), [people.annexTeacher.personnelId]);
  assert.equal((await get(people.annexAo, `/transactions/${f.moralesTx.id}`)).status, 404);

  const moralesQueue = await get(people.moralesAo, '/transactions?limit=100');
  assert.ok(!ids(moralesQueue).includes(f.annexTx.id));
  assert.equal((await get(people.moralesAo, `/transactions/${f.annexTx.id}`)).status, 404);
});

// ── Other roles keep their intended reach ──────────────────────────────────

test('21. the Matulas AO II gets the mirror image', async () => {
  const { matulasAo } = people;
  const queue = await get(matulasAo, '/transactions?limit=100');
  assert.deepEqual(ids(queue).sort(), [f.matulasTx.id, f.matulasTx2.id, f.matulasDraftTx.id].sort());
  assert.deepEqual(ids(await get(matulasAo, `/promotions/cycles/${f.cycle.id}/leaderboard`)), [f.matulasApp.id]);
  assert.equal((await get(matulasAo, `/transactions/${f.matulasTx.id}`)).status, 200);
  assert.equal((await get(matulasAo, `/personnel/documents/${f.matulasFile}/file`)).status, 200);
  assert.equal((await get(matulasAo, `/transactions/${f.moralesTx.id}`)).status, 404);
  assert.equal((await get(matulasAo, `/documents/${f.moralesTx.docId}/file`)).status, 404);
  assert.equal((await post(matulasAo, `/promotions/cycles/${f.cycle.id}/applications/${f.moralesApp.id}/verify-requirements`, { status: 'COMPLETE' })).status, 404);

  const verified = await post(matulasAo, `/promotions/cycles/${f.cycle.id}/applications/${f.matulasApp.id}/verify-requirements`, {
    status: 'COMPLETE', itemVerifications: [{ code: 'e', status: 'VERIFIED' }],
  });
  assert.equal(verified.status, 200, verified.text);
  const stored = await db.promotionApplication.findUnique({ where: { id: f.matulasApp.id } });
  assert.equal(stored.scoreDetailsJson.stageStatus, 'REQUIREMENTS_VERIFIED');
});

test('22. HRMO keeps division-wide access', async () => {
  const { hrmo } = people;
  const queue = await get(hrmo, '/transactions?limit=100');
  for (const tx of [f.moralesTx, f.matulasTx, f.annexTx, f.noStationDraftTx]) assert.ok(ids(queue).includes(tx.id));
  assert.deepEqual(ids(await get(hrmo, `/promotions/cycles/${f.cycle.id}/leaderboard`)).sort(), [f.moralesApp.id, f.matulasApp.id].sort());
  for (const url of [`/transactions/${f.matulasTx.id}`, `/transactions/${f.moralesTx.id}`, `/documents/${f.matulasTx.docId}/file`,
    `/personnel/documents/${f.moralesFile}/file`, `/personnel/${people.noStationTeacher.personnelId}`]) {
    assert.equal((await get(hrmo, url)).status, 200, url);
  }
});

test('23. the system administrator keeps system-wide access', async () => {
  const { admin: sysadmin } = people;
  const queue = await get(sysadmin, '/transactions?limit=100');
  for (const tx of [f.moralesTx, f.matulasTx, f.annexTx]) assert.ok(ids(queue).includes(tx.id));
  assert.ok(ids(await get(sysadmin, '/personnel?limit=100')).includes(people.matulasApplicant.personnelId));
  assert.equal((await get(sysadmin, `/documents/${f.matulasTx.docId}/file`)).status, 200);
  assert.equal((await get(sysadmin, `/users/${people.matulasApplicant.userId}`)).status, 200);
});

test('24. personnel reach only their own records', async () => {
  const { moralesApplicant } = people;
  assert.equal((await get(moralesApplicant, `/transactions/${f.moralesTx.id}`)).status, 200);
  assert.equal((await get(moralesApplicant, `/personnel/documents/${f.moralesFile}/file`)).status, 200);
  assert.equal((await get(moralesApplicant, `/promotions/personnel/${moralesApplicant.personnelId}/career-history`)).status, 200);
  for (const url of [`/transactions/${f.matulasTx.id}`, `/documents/${f.matulasTx.docId}/file`, `/documents/${f.matulasTx.docId}/view-token`,
    `/personnel/documents/${f.matulasFile}/file`, `/promotions/personnel/${people.matulasApplicant.personnelId}/career-history`]) {
    assert.equal((await get(moralesApplicant, url)).status, 404, url);
  }
  assert.deepEqual(ids(await get(moralesApplicant, '/transactions?limit=100')), [f.moralesTx.id]);
});

// ── Exports, notifications, realtime, audit ────────────────────────────────

test('25. the CAR export applies the same station scope', async () => {
  const PizZip = require('pizzip');
  const documentText = res => new PizZip(res.buffer).file('word/document.xml').asText();

  const moralesExport = await get(people.moralesAo, `/promotions/cycles/${f.cycle.id}/car-document`);
  assert.equal(moralesExport.status, 200);
  const moralesXml = documentText(moralesExport);
  assert.ok(moralesXml.includes('Delacruz'), 'the officer\'s own applicant is exported');
  for (const marker of ['Villanueva', 'APP-MAT-0001']) assert.ok(!moralesXml.includes(marker), `export disclosed ${marker}`);

  const hrmoXml = documentText(await get(people.hrmo, `/promotions/cycles/${f.cycle.id}/car-document`));
  assert.ok(hrmoXml.includes('Delacruz') && hrmoXml.includes('Villanueva'), 'HRMO exports the whole cycle');
});

async function openStream(actor, url) {
  const controller = new AbortController();
  const res = await fetch(`${baseUrl}/api/v1${url}?token=${encodeURIComponent(actor.token)}`, {
    signal: controller.signal, headers: { accept: 'text/event-stream' },
  });
  assert.equal(res.status, 200);
  const events = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const pump = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const data = buffer.slice(0, end).split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
          buffer = buffer.slice(end + 2);
          if (data) events.push({ raw: data, json: JSON.parse(data) });
        }
      }
    } catch { /* aborted */ }
  })();
  await waitFor(() => events.some(e => e.json.type === 'CONNECTED'), `${url} to connect`);
  return { events, close: async () => { controller.abort(); await pump; } };
}

test('26. realtime events carry no record data and notifications reach only the station concerned', async () => {
  const moralesTransactions = await openStream(people.moralesAo, '/transactions/stream');
  const moralesNotifications = await openStream(people.moralesAo, '/notifications/stream');
  const matulasNotifications = await openStream(people.matulasAo, '/notifications/stream');
  const moralesInboxBefore = await db.notification.count({ where: { userId: people.moralesAo.userId } });
  try {
    // A Matulas-only change: its own AO II validates, and a Matulas teacher applies.
    const validated = await post(people.matulasAo, `/transactions/${f.matulasTx2.id}/validate`, {
      documentValidations: [{ documentId: f.matulasTx2.docId, isValid: true }], targetStatus: 'FOR_APPROVAL',
    });
    assert.equal(validated.status, 200, validated.text);
    const applied = await post(people.matulasApplicant2, `/promotions/cycles/${f.cycle.id}/apply`, {});
    assert.equal(applied.status, 201, applied.text);

    await waitFor(() => matulasNotifications.events.some(e => e.json.type === 'NOTIFICATION'), 'the Matulas AO II notification');
    await waitFor(() => moralesTransactions.events.some(e => e.json.type === 'TRANSACTIONS_CHANGED'), 'the change broadcast');
    await settle();

    assert.ok(!moralesNotifications.events.some(e => e.json.type === 'NOTIFICATION'), 'the Morales AO II was notified of Matulas activity');
    // Invalidation only: a type and a timestamp, never an id, a status or a name.
    for (const event of moralesTransactions.events) {
      assert.deepEqual(Object.keys(event.json).sort(), ['timestamp', 'type'], `broadcast carried data: ${event.raw}`);
      for (const marker of MATULAS_MARKERS) assert.ok(!event.raw.includes(marker), `broadcast carried ${marker}`);
    }
  } finally {
    await Promise.all([moralesTransactions.close(), moralesNotifications.close(), matulasNotifications.close()]);
  }
  assert.equal(await db.notification.count({ where: { userId: people.moralesAo.userId } }), moralesInboxBefore);
  const matulasInbox = await db.notification.findMany({ where: { userId: people.matulasAo.userId } });
  assert.ok(matulasInbox.some(n => n.message.includes('Espiritu')), 'the applicant\'s own AO II is notified');
  const hrmoInbox = await db.notification.findMany({ where: { userId: people.hrmo.userId } });
  assert.ok(hrmoInbox.some(n => n.message.includes('Espiritu')), 'HRMO is notified');
});

test('submissions notify the applicant\'s own AO II, and a record with no station goes to HRMO', async () => {
  const count = userId => db.notification.count({ where: { userId } });
  const [moralesBefore, matulasBefore, hrmoBefore] = await Promise.all([people.moralesAo, people.matulasAo, people.hrmo].map(p => count(p.userId)));

  assert.equal((await put(people.matulasApplicant2, `/transactions/${f.matulasDraftTx.id}/submit`)).status, 200);
  assert.equal(await count(people.matulasAo.userId), matulasBefore + 1);
  assert.equal(await count(people.moralesAo.userId), moralesBefore);
  assert.equal(await count(people.hrmo.userId), hrmoBefore);

  assert.equal((await put(people.noStationTeacher, `/transactions/${f.noStationDraftTx.id}/submit`)).status, 200);
  const routed = await db.notification.findFirst({ where: { userId: people.hrmo.userId }, orderBy: { id: 'desc' } });
  assert.match(routed.message, /no AO II for its station/);
  for (const officer of ['moralesAo', 'matulasAo', 'districtOnlyAo', 'annexAo']) {
    const inbox = await db.notification.findMany({ where: { userId: people[officer].userId, relatedEntityId: f.noStationDraftTx.id, relatedEntityType: 'Transaction' } });
    assert.equal(inbox.length, 0, `${officer} was notified of a record with no station`);
  }
  // Still invisible to every AO II, including the district-only one.
  assert.equal((await get(people.districtOnlyAo, `/transactions/${f.noStationDraftTx.id}`)).status, 404);
});

test('audit logs shown to an AO II hold no Matulas activity', async () => {
  const logs = await get(people.moralesAo, '/audit-logs?limit=500');
  assert.equal(logs.status, 200);
  const outsiders = new Set([people.matulasAo, people.matulasApplicant, people.matulasApplicant2].map(p => p.userId));
  assert.ok(!logs.json.data.some(entry => outsiders.has(entry.userId)), 'another station\'s activity was listed');
});

// ── Valid workflows, self-review, reassignment ─────────────────────────────

test('30. the Morales AO II\'s own workflow still works end to end', async () => {
  const { moralesAo } = people;
  const token = await get(moralesAo, `/personnel/documents/${f.moralesFile}/view-token`);
  assert.equal(token.status, 200);
  const file = await get(null, `/personnel/documents/${f.moralesFile}/file?token=${encodeURIComponent(token.json.data.token)}`);
  assert.equal(file.status, 200);
  assert.ok(file.text.includes('morales-201-file'));

  const verified = await post(moralesAo, `/promotions/cycles/${f.cycle.id}/applications/${f.moralesApp.id}/verify-requirements`, {
    status: 'INCOMPLETE', remarks: 'Diploma is unreadable', itemVerifications: [{ code: 'e', status: 'INCOMPLETE', remarks: 'unreadable' }],
  });
  assert.equal(verified.status, 200, verified.text);
  assert.equal((await db.promotionApplication.findUnique({ where: { id: f.moralesApp.id } })).scoreDetailsJson.stageStatus, 'REQUIREMENTS_DEFICIENT');

  const validated = await post(moralesAo, `/transactions/${f.moralesTx.id}/validate`, {
    documentValidations: [{ documentId: f.moralesTx.docId, isValid: true }], targetStatus: 'FOR_APPROVAL',
  });
  assert.equal(validated.status, 200, validated.text);
  assert.equal((await db.transaction.findUnique({ where: { id: f.moralesTx.id } })).status, 'FOR_APPROVAL');

  const distributed = await post(moralesAo, `/users/${people.moralesPending.userId}/distribute-credentials`);
  assert.equal(distributed.status, 200, distributed.text);

  // A new external applicant registered by the officer lands in the officer's station.
  const registered = await post(moralesAo, `/promotions/cycles/${f.cycle.id}/manual-application`, {
    firstName: 'Nora', lastName: 'Bagong', email: 'nora.bagong@scope.invalid', password: 'Temporary-Pass-2026',
    birthDate: '1995-02-03', gender: 'FEMALE', civilStatus: 'SINGLE',
  });
  assert.equal(registered.status, 201, registered.text);
  const created = await db.personnel.findFirst({ where: { lastName: 'Bagong' } });
  assert.equal(created.school, MORALES);
  assert.ok(ids(await get(moralesAo, `/promotions/cycles/${f.cycle.id}/applications`)).includes(registered.json.data.id));
  assert.ok(!ids(await get(people.matulasAo, `/promotions/cycles/${f.cycle.id}/applications`)).includes(registered.json.data.id));

  // ...and cannot be placed into a cycle designated for another station.
  const elsewhere = await post(moralesAo, `/promotions/cycles/${f.matulasCycle.id}/manual-application`, {
    firstName: 'Tess', lastName: 'Ibangistasyon', email: 'tess@scope.invalid', password: 'Temporary-Pass-2026',
    birthDate: '1995-02-03', gender: 'FEMALE', civilStatus: 'SINGLE',
  });
  assert.equal(elsewhere.status, 403);
  assert.equal(await db.personnel.count({ where: { lastName: 'Ibangistasyon' } }), 0);
});

test('nobody validates their own transaction', async () => {
  const res = await post(people.moralesAo, `/transactions/${f.moralesAoOwnTx.id}/validate`, {
    documentValidations: [{ documentId: f.moralesAoOwnTx.docId, isValid: true }], targetStatus: 'FOR_APPROVAL',
  });
  assert.equal(res.status, 403);
  assert.equal((await db.transaction.findUnique({ where: { id: f.moralesAoOwnTx.id } })).status, 'PENDING_VALIDATION');
});

test('moving an AO II to another station moves their scope at once and ends their sessions', async () => {
  const { moralesAo, hrmo } = people;
  const moved = await put(hrmo, `/personnel/${moralesAo.personnelId}`, { school: MATULAS });
  assert.equal(moved.status, 200, moved.text);
  const refresh = await db.refreshToken.findUnique({ where: { token: 'synthetic-refresh-morales-ao' } });
  assert.equal(refresh.revoked, true, 'sessions issued under the old station must end');

  // Even the still-unexpired access token is scoped by the new station, immediately.
  assert.equal((await get(moralesAo, `/transactions/${f.moralesTx.id}`)).status, 404);
  assert.equal((await get(moralesAo, `/transactions/${f.matulasTx.id}`)).status, 200);

  // An AO II cannot move their own station, or anyone's.
  const selfMove = await put(people.matulasAo, `/personnel/${people.matulasApplicant.personnelId}`, { school: MORALES });
  assert.equal(selfMove.status, 200);
  assert.equal((await db.personnel.findUnique({ where: { id: people.matulasApplicant.personnelId } })).school, MATULAS);

  assert.equal((await put(hrmo, `/personnel/${moralesAo.personnelId}`, { school: MORALES })).status, 200);
});
