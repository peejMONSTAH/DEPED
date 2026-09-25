// Pilot rehearsal over real HTTP: the actual app, routes, authentication,
// role checks, station scope and PostgreSQL. Accounts are created and set up
// the way pilot users will do it; everyone signs in with a real password.
// Only email delivery, OCR and file storage are replaced (kept in memory).
//
// Creates, migrates and drops its own database on the server DATABASE_URL
// points at. Run only against a disposable local server whose database name
// ends in _test.
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const base = new URL(process.env.DATABASE_URL || 'http://missing');
assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(base.hostname) && base.pathname.endsWith('_test'),
  'Requires a local database ending in _test. Never production.');
const dbName = `digital201_pilot_http_${process.pid}_test`;
const isolated = new URL(base.href);
isolated.pathname = `/${dbName}`;
Object.assign(process.env, {
  DATABASE_URL: isolated.href, DIRECT_URL: isolated.href, NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'pilot-http-access-secret-only', JWT_REFRESH_SECRET: 'pilot-http-refresh-secret-only',
  RATE_LIMIT_MAX_REQUESTS: '100000', CLIENT_URL: 'http://pilot.invalid', CORS_ORIGIN: 'http://pilot.invalid',
  SMTP_HOST: '', SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', DOCUMENT_STORAGE: 'local', OCR_PROVIDER: '',
});

const client = require('@prisma/client');
const admin = new client.PrismaClient({ datasources: { db: { url: base.href } } });
let db;
const stub = (request, exports) => {
  const file = require.resolve(request);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
const emails = [];
stub('../../src/services/workflow-outbox.service', {
  queueTransactionalEmail: async (key, payload) => { emails.push({ key, ...payload }); },
  queueDeficiencyEmail: async (key, payload) => { emails.push({ key, ...payload }); },
  processWorkflowOutbox: async () => {}, startWorkflowOutboxWorker: () => {},
});
stub('../../src/services/tesseract-ocr.service', { extractWithTesseract: async () => { throw new Error('OCR disabled in tests'); } });
const objects = new Map();
let seq = 0;
stub('../../src/services/document-storage.service', {
  MISSING_FILE_MESSAGE: 'missing',
  async storeDocument(buffer) { const key = `mem:${++seq}`; objects.set(key, Buffer.from(buffer)); return key; },
  async readDocument(key) { if (!objects.has(key)) throw Object.assign(new Error('missing'), { statusCode: 404 }); return objects.get(key); },
  async discardUncommittedDocument(key) { objects.delete(key); },
});
stub('morgan', Object.assign(() => (req, res, next) => next(), { token() {} }));

const MORALES = 'Morales Elementary School';
const MATULAS = 'Matulas Elementary School';
const PASSWORD = 'Pilot#Setup2026!';
let server, baseUrl;

async function http(token, method, url, { body, form } = {}) {
  const headers = { 'user-agent': 'pilot-e2e' };
  if (token) headers.authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${baseUrl}/api/v1${url}`, { method, headers, body: payload });
  const buffer = Buffer.from(await res.arrayBuffer());
  let json = null;
  try { json = JSON.parse(buffer.toString('utf8')); } catch { /* binary */ }
  return { status: res.status, json, buffer };
}
const ok = (res, status, label) => assert.equal(res.status, status, `${label}: ${res.status} ${JSON.stringify(res.json)?.slice(0, 400)}`);
const pdfFile = (name) => new Blob([Buffer.from(`%PDF-1.4\n% ${name}\n`)], { type: 'application/pdf' });

async function login(email, password) {
  const res = await http(null, 'POST', '/auth/login', { body: { email, password } });
  return res;
}
/** Distribution emails a single-use setup link; the user sets a password and is signed in. */
async function setUpAccount(email) {
  const mail = [...emails].reverse().find(e => e.recipientEmail === email && e.actionUrl?.includes('setup-account'));
  assert.ok(mail, `setup email for ${email}`);
  assert.ok(mail.credentials?.initialPassword, `setup email for ${email} carries a temporary password`);
  const token = decodeURIComponent(new URL(mail.actionUrl).searchParams.get('token'));
  const res = await http(null, 'POST', '/auth/complete-setup', { body: { token, newPassword: PASSWORD } });
  ok(res, 200, `complete setup ${email}`);
  const again = await http(null, 'POST', '/auth/complete-setup', { body: { token, newPassword: 'Another#Pass2026!' } });
  assert.notEqual(again.status, 200, 'a setup link works only once');
  const signedIn = await login(email, PASSWORD);
  ok(signedIn, 200, `login ${email}`);
  return signedIn.json.data.accessToken;
}

const T = {};
test.before(async () => {
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    { cwd: path.resolve(__dirname, '../..'), env: process.env, stdio: 'pipe' });
  db = new client.PrismaClient({ datasources: { db: { url: isolated.href } } });
  stub('../../src/config/prisma', { __esModule: true, default: db });
  const { hashPassword } = require('../../src/utils/hash.util');
  for (const r of ['SYSTEM_ADMIN', 'HRMO', 'AO_II', 'TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL']) {
    await db.role.upsert({ where: { name: r }, create: { name: r }, update: {} });
  }
  // The one account that exists before the pilot: the system administrator.
  const sa = await db.role.findUnique({ where: { name: 'SYSTEM_ADMIN' } });
  await db.user.create({ data: { email: 'sysadmin@pilot.invalid', passwordHash: await hashPassword(PASSWORD), roleId: sa.id,
    accountStatus: 'ACTIVE', mustChangePassword: false,
    personnel: { create: { employeeId: 'PILOT-SA', firstName: 'System', lastName: 'Admin', designation: 'System Administrator', status: 'ACTIVE', profileComplete: true } } } });
  const app = require('../../src/app').default;
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  server?.close();
  await db?.$disconnect();
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.$disconnect();
});

test('1. accounts: creation, distribution, setup link, temporary password and role limits', async () => {
  const sa = await login('sysadmin@pilot.invalid', PASSWORD);
  ok(sa, 200, 'system admin signs in');
  T.sa = sa.json.data.accessToken;

  // System admin creates the HRMO and the two AO II accounts; they start PENDING.
  const make = (email, role, extra) => http(T.sa, 'POST', '/users', { body: {
    email, password: 'Temp#Pass2026!', role, firstName: 'Pilot', lastName: role, birthDate: '1985-01-01',
    gender: 'FEMALE', civilStatus: 'SINGLE', contactNumber: '09170000000', dateHired: '2015-06-01', designation: role === 'HRMO' ? 'HRMO' : 'Administrative Officer II', ...extra } });
  const hr = await make('hr@pilot.invalid', 'HRMO', {});
  ok(hr, 201, 'create HRMO');
  const morAo = await make('ao.morales@pilot.invalid', 'AO_II', { schoolAssignment: MORALES, district: 'District 1' });
  ok(morAo, 201, 'create Morales AO II');
  const matAo = await make('ao.matulas@pilot.invalid', 'AO_II', { schoolAssignment: MATULAS, district: 'District 1' });
  ok(matAo, 201, 'create Matulas AO II');
  const ids = { hr: hr.json.data.user?.id ?? hr.json.data.id, morAo: morAo.json.data.user?.id ?? morAo.json.data.id, matAo: matAo.json.data.user?.id ?? matAo.json.data.id };

  const pending = await login('hr@pilot.invalid', 'Temp#Pass2026!');
  assert.notEqual(pending.status, 200, 'a PENDING account cannot sign in before distribution');

  for (const [key, email] of [['hr', 'hr@pilot.invalid'], ['morAo', 'ao.morales@pilot.invalid'], ['matAo', 'ao.matulas@pilot.invalid']]) {
    ok(await http(T.sa, 'POST', `/users/${ids[key]}/distribute-credentials`), 200, `distribute ${email}`);
    // The emailed temporary password signs in, but only to change it.
    const mail = [...emails].reverse().find(e => e.recipientEmail === email && e.credentials);
    const temp = await login(email, mail.credentials.initialPassword);
    ok(temp, 200, `${email} signs in with the emailed temporary password`);
    const blocked = await http(temp.json.data.accessToken, 'GET', '/promotions/cycles');
    assert.equal(blocked.status, 403, `${email} with a temporary password is limited to changing it`);
    T[key] = await setUpAccount(email);
  }

  // AO II requests a teacher account on a vacant Teacher I item; only the system admin approves it.
  const teacherItem = await db.plantillaItem.create({ data: { itemNumber: 'PILOT-TCH1-0001', positionTitle: 'Teacher I', salaryGrade: 11,
    department: MORALES, division: 'District 1' } });
  const form = new FormData();
  form.append('plantillaItemId', String(teacherItem.id));
  for (const [k, v] of Object.entries({ firstName: 'Rosa', lastName: 'Delacruz', email: 'teacher@pilot.invalid', birthDate: '1990-03-03',
    gender: 'FEMALE', civilStatus: 'SINGLE', contactNumber: '09171111111', address: 'Morales', role: 'TEACHING_PERSONNEL',
    designation: 'Teacher I', school: MORALES, initialPassword: 'Temp#Pass2026!', dateHired: '2016-06-01' })) form.append(k, v);
  const request = await http(T.morAo, 'POST', '/users/requests', { form });
  ok(request, 201, 'Morales AO II requests a teacher account');
  const requestId = request.json.data.id;
  ok(await http(T.morAo, 'POST', `/users/requests/${requestId}/approve`), 403, 'AO II cannot approve account requests');
  ok(await http(T.hr, 'POST', `/users/requests/${requestId}/approve`), 403, 'HRMO cannot approve account requests');
  const approved = await http(T.sa, 'POST', `/users/requests/${requestId}/approve`);
  ok(approved, 200, 'system admin approves the request');
  const teacherUserId = approved.json.data.user.id;
  ok(await http(T.matAo, 'POST', `/users/${teacherUserId}/distribute-credentials`), 404, 'another station\'s AO II cannot distribute');
  ok(await http(T.morAo, 'POST', `/users/${teacherUserId}/distribute-credentials`), 200, 'own AO II distributes');
  T.teacher = await setUpAccount('teacher@pilot.invalid');
  T.teacherUserId = teacherUserId;
  T.teacherPersonnelId = (await db.personnel.findFirst({ where: { userId: teacherUserId } })).id;

  // Role limits on account management.
  ok(await http(T.morAo, 'POST', '/users', { body: { email: 'x@pilot.invalid', password: 'Temp#Pass2026!', role: 'HRMO' } }), 403, 'AO II cannot create accounts directly');
  ok(await http(T.teacher, 'GET', '/users'), 403, 'personnel cannot list accounts');
  const escalate = await http(T.hr, 'POST', '/users', { body: { email: 'y@pilot.invalid', password: 'Temp#Pass2026!', role: 'SYSTEM_ADMIN',
    firstName: 'Y', lastName: 'Y', birthDate: '1985-01-01', gender: 'MALE', civilStatus: 'SINGLE' } });
  assert.notEqual(escalate.status, 201, 'HRMO cannot create a system administrator');
});

test('2. promotion: HR cycle, application, AO completeness, HR deliberation and selection', async () => {
  assert.ok(T.teacher, 'accounts stage passed');
  const item = await db.plantillaItem.create({ data: { itemNumber: 'PILOT-TCH2-0001', positionTitle: 'Teacher II', salaryGrade: 12,
    department: MORALES, division: 'District 1' } });
  T.item = item;
  const cycleBody = { name: 'Ranking for Vacancy: Teacher II (PILOT-TCH2-0001)', type: 'NATURAL_VACANCY',
    startDate: new Date(Date.now() - 86400000).toISOString(), endDate: new Date(Date.now() + 7 * 86400000).toISOString(), status: 'ACTIVE',
    rulesConfigurationJson: { track: 'TEACHING', targetPosition: 'Teacher II', salaryGrade: 12, school: MORALES, district: 'District 1',
      plantillaItemNumbers: [item.itemNumber], vacantPositions: 1 } };
  ok(await http(T.morAo, 'POST', '/promotions/cycles', { body: cycleBody }), 403, 'AO II cannot create a cycle');
  ok(await http(T.teacher, 'POST', '/promotions/cycles', { body: cycleBody }), 403, 'personnel cannot create a cycle');
  const cycle = await http(T.hr, 'POST', '/promotions/cycles', { body: cycleBody });
  ok(cycle, 201, 'HR creates the cycle');
  T.cycleId = cycle.json.data.id;
  const cycleNotice = async email => db.notification.findFirst({ where: { relatedEntityType: 'PromotionCycle', relatedEntityId: T.cycleId,
    user: { email } } });
  assert.ok(await cycleNotice('teacher@pilot.invalid'), "personnel at the cycle's school are told it opened");
  assert.ok(await cycleNotice('ao.morales@pilot.invalid'), "the AO II at the cycle's school is told it opened");
  assert.ok(await cycleNotice('ao.matulas@pilot.invalid'), 'a division-wide vacancy is announced to every station');

  // "Open to": a district-only cycle is hidden from, and closed to, other districts.
  const original = (await db.promotionCycle.findUnique({ where: { id: T.cycleId } })).rulesConfigurationJson;
  await db.promotionCycle.update({ where: { id: T.cycleId }, data: { rulesConfigurationJson: { ...original, openTo: 'DISTRICT', district: 'District 9' } } });
  const hidden = await http(T.teacher, 'GET', '/promotions/cycles');
  assert.ok(!(hidden.json.data || []).some(c => c.id === T.cycleId), 'a district-only cycle is hidden from other districts');
  ok(await http(T.teacher, 'POST', `/promotions/cycles/${T.cycleId}/apply`, { body: { checklist: { items: [] } } }), 403, 'applying outside the district is refused');
  await db.promotionCycle.update({ where: { id: T.cycleId }, data: { rulesConfigurationJson: { ...original, openTo: 'DISTRICT', district: 'District 1' } } });
  const shown = await http(T.teacher, 'GET', '/promotions/cycles');
  assert.ok((shown.json.data || []).some(c => c.id === T.cycleId), 'a district-only cycle is shown to its own district');
  await db.promotionCycle.update({ where: { id: T.cycleId }, data: { rulesConfigurationJson: original } });

  const ecp = await http(T.hr, 'POST', '/promotions/cycles', { body: { ...cycleBody, name: 'ECP reclassification pilot', type: 'ECP' } });
  ok(ecp, 201, 'HR can create an ECP cycle');
  await db.promotionCycle.update({ where: { id: ecp.json.data.id }, data: { status: 'CANCELLED' } });
  const visible = await http(T.teacher, 'GET', '/promotions/cycles');
  ok(visible, 200, 'teacher lists cycles');
  assert.ok((visible.json.data || []).some(c => c.id === T.cycleId), 'teacher sees the open cycle');

  // The teacher builds the 201 file, then applies by attaching from it.
  const { ANNEX_C_REQUIREMENTS, MANDATORY_ANNEX_C_CODES } = require('../../src/utils/annex-c.util');
  const byType = new Map();
  const items = [];
  for (const req of ANNEX_C_REQUIREMENTS) {
    if (!MANDATORY_ANNEX_C_CODES.includes(req.code)) { items.push({ code: req.code, submitted: false }); continue; }
    const type = req.suggestedDocumentTypeIds[0] || 'OTHER';
    let id = type !== 'OTHER' ? byType.get(type) : undefined;
    if (!id) {
      const form = new FormData();
      form.append('file', pdfFile(`annex-${req.code}`), `annex-${req.code}.pdf`);
      form.append('documentTypeId', type);
      if (type === 'OTHER') form.append('customDocumentName', `Annex C ${req.code}`);
      const up = await http(T.teacher, 'POST', '/personnel/documents', { form });
      ok(up, 201, `teacher uploads ${type} to My 201 File`);
      id = up.json.data.id;
      if (type !== 'OTHER') byType.set(type, id);
    }
    items.push({ code: req.code, personnelDocumentId: id, submitted: true });
  }
  T.fileIds = [...byType.values()];
  const incomplete = await http(T.teacher, 'POST', `/promotions/cycles/${T.cycleId}/apply`,
    { body: { checklist: { items: items.filter(i => i.code !== MANDATORY_ANNEX_C_CODES[0]) } } });
  ok(incomplete, 400, 'applying without a mandatory Annex C document is refused');
  const applied = await http(T.teacher, 'POST', `/promotions/cycles/${T.cycleId}/apply`, { body: { checklist: { items } } });
  ok(applied, 201, 'teacher applies');
  T.appId = applied.json.data.id;
  const again = await http(T.teacher, 'POST', `/promotions/cycles/${T.cycleId}/apply`, { body: { checklist: { items } } });
  assert.notEqual(again.status, 201, 'a second application to the same cycle is refused');
  assert.ok(await db.notification.findFirst({ where: { userId: (await db.user.findUnique({ where: { email: 'ao.morales@pilot.invalid' } })).id,
    relatedEntityId: T.appId } }), 'the applicant\'s own AO II is notified');

  const app = `/promotions/cycles/${T.cycleId}/applications/${T.appId}`;
  const rating = { track: 'TEACHING', educationScore: 10, trainingScore: 9, experienceScore: 9, performanceScore: 28,
    ppstCoiScore: 23, ppstNcoiScore: 14, remarks: 'Pilot deliberation' };
  ok(await http(T.matAo, 'POST', `${app}/verify-requirements`, { body: { status: 'COMPLETE' } }), 404, 'another station\'s AO II cannot see the application');
  ok(await http(T.teacher, 'POST', `${app}/verify-requirements`, { body: { status: 'COMPLETE' } }), 403, 'the applicant cannot verify');
  ok(await http(T.hr, 'POST', `${app}/final-rating`, { body: rating }), 400, 'HR cannot deliberate before AO completeness check');
  ok(await http(T.morAo, 'POST', `${app}/verify-requirements`, { body: { status: 'INCOMPLETE', remarks: 'Page 2 unreadable',
    itemVerifications: [{ code: items.find(i => i.submitted).code, status: 'INCOMPLETE', remarks: 'Blurred scan' }] } }), 200, 'AO returns a deficiency');
  // The applicant sees what was returned, is emailed, and resubmits.
  const mine = await http(T.teacher, 'GET', '/promotions/my-applications');
  ok(mine, 200, 'teacher lists own applications');
  const listed = mine.json.data.find(a => a.id === T.appId);
  assert.ok(listed?.canResubmit, 'a deficient application can be resubmitted');
  assert.ok(listed.items.some(i => i.verificationStatus === 'INCOMPLETE' && i.verificationRemarks === 'Blurred scan'), 'the returned document and its remark are shown');
  assert.ok(emails.some(e => e.recipientEmail === 'teacher@pilot.invalid' && /returned/i.test(e.subject)), 'the applicant is emailed about the deficiency');
  ok(await http(T.matAo, 'GET', '/promotions/my-applications'), 403, 'my-applications is for personnel only');
  const resubmit = await http(T.teacher, 'POST', `/promotions/cycles/${T.cycleId}/apply`, { body: { checklist: { items } } });
  ok(resubmit, 200, 'teacher resubmits corrected requirements');
  assert.equal((await db.promotionApplication.findUnique({ where: { id: T.appId } })).status, 'SUBMITTED', 'resubmission returns it to AO II');
  assert.ok(await db.notification.findFirst({ where: { user: { email: 'ao.morales@pilot.invalid' }, relatedEntityId: T.appId,
    message: { contains: 'Resubmitted' } } }), 'the AO II is told about the resubmission');
  ok(await http(T.hr, 'POST', `${app}/final-rating`, { body: rating }), 400, 'HR still cannot deliberate until AO re-checks');
  ok(await http(T.morAo, 'POST', `${app}/verify-requirements`, { body: { status: 'COMPLETE', remarks: 'Verified' } }), 200, 'AO confirms completeness');
  ok(await http(T.morAo, 'POST', `${app}/final-rating`, { body: rating }), 403, 'AO II cannot deliberate');
  ok(await http(T.hr, 'POST', `${app}/select-promotion`, { body: { isPromoted: true } }), 400, 'HR cannot select before deliberation');
  ok(await http(T.hr, 'POST', `${app}/final-rating`, { body: rating }), 200, 'HR deliberates');
  ok(await http(T.morAo, 'POST', `/promotions/cycles/${T.cycleId}/generate-ranking`), 403, 'AO II cannot rank');
  ok(await http(T.hr, 'POST', `/promotions/cycles/${T.cycleId}/generate-ranking`), 200, 'HR ranks');
  const car = await http(T.hr, 'GET', `/promotions/cycles/${T.cycleId}/car-document`);
  ok(car, 200, 'HR exports the CAR');
  ok(await http(T.morAo, 'POST', `${app}/select-promotion`, { body: { isPromoted: true, plantillaItemNumber: item.itemNumber } }), 403, 'AO II cannot promote');
  ok(await http(T.hr, 'POST', `${app}/select-promotion`, { body: { isPromoted: true, plantillaItemNumber: item.itemNumber } }), 200, 'HR promotes the candidate');

  const selected = await db.promotionApplication.findUnique({ where: { id: T.appId } });
  T.txId = selected.scoreDetailsJson.transactionId;
  assert.ok(Number.isInteger(T.txId), 'selection opens an appointment transaction');
  const note = await db.notification.findFirst({ where: { userId: T.teacherUserId, relatedEntityId: T.txId } });
  assert.ok(note, 'the applicant is notified of the promotion');
  const record = await http(T.teacher, 'GET', '/personnel/me/service-record');
  ok(record, 200, 'teacher opens the service record');
  const pendingEntry = (record.json.data.careerTimeline || []).find(e => e.status === 'PENDING');
  assert.ok(pendingEntry && /Teacher II/.test(pendingEntry.event), 'service record shows the pending appointment to the applied position');
  assert.equal((await db.personnel.findUnique({ where: { id: T.teacherPersonnelId } })).designation, 'Teacher I',
    'the position does not change before the appointment is approved');
});

test('3. appointment: requirements, AO check, HR approval, official appointment', async () => {
  assert.ok(T.txId, 'selection stage passed');
  const reqs = await http(T.teacher, 'GET', `/transactions/${T.txId}/requirements`);
  ok(reqs, 200, 'teacher opens the appointment checklist');
  const templates = await db.requirementTemplate.findMany({ where: { transactionType: { name: 'Promotion' } } });
  const mandatory = templates.filter(t => t.isMandatory);
  assert.ok(mandatory.length >= 4, 'appointment requirements are defined');

  ok(await http(T.teacher, 'POST', `/transactions/${T.txId}/submit`), 400, 'cannot submit with requirements missing');
  for (const [i, t] of mandatory.entries()) {
    let res;
    if (i === 0) {
      res = await http(T.teacher, 'POST', `/transactions/${T.txId}/documents/attach-existing`,
        { body: { personnelDocumentId: T.fileIds[0], requirementId: t.id } });
      ok(res, 201, `attach "${t.name}" from My 201 File`);
    } else {
      const form = new FormData();
      form.append('file', pdfFile(`appointment-${t.id}`), `appointment-${t.id}.pdf`);
      form.append('requirementId', String(t.id));
      form.append('requirementName', t.name);
      res = await http(T.teacher, 'POST', `/transactions/${T.txId}/documents`, { form });
      ok(res, 201, `upload "${t.name}"`);
    }
  }
  const matOther = await http(T.matAo, 'GET', `/transactions/${T.txId}`);
  assert.equal(matOther.status, 404, 'another station\'s AO II cannot open the transaction');
  ok(await http(T.teacher, 'POST', `/transactions/${T.txId}/submit`), 200, 'teacher submits the appointment requirements');

  const docs = await db.uploadedDocument.findMany({ where: { transactionId: T.txId } });
  const validation = { documentValidations: docs.map(d => ({ documentId: d.id, isValid: true })), targetStatus: 'FOR_APPROVAL' };
  ok(await http(T.hr, 'POST', `/transactions/${T.txId}/approve`, { body: { isApproved: true } }), 400, 'HR cannot approve before AO validation');
  ok(await http(T.teacher, 'POST', `/transactions/${T.txId}/validate`, { body: validation }), 403, 'the applicant cannot validate');
  ok(await http(T.matAo, 'POST', `/transactions/${T.txId}/validate`, { body: validation }), 404, 'another station\'s AO II cannot validate');
  ok(await http(T.morAo, 'POST', `/transactions/${T.txId}/validate`, { body: validation }), 200, 'own AO II validates');
  ok(await http(T.morAo, 'POST', `/transactions/${T.txId}/approve`, { body: { isApproved: true } }), 403, 'AO II cannot give final approval');

  // HR finds a flaw after AO II validated: return one document for correction.
  const flawed = docs[docs.length - 1];
  ok(await http(T.hr, 'POST', `/transactions/${T.txId}/approve`, { body: { isApproved: false, decision: 'RETURN_FOR_CORRECTION', deficientDocumentIds: [], notes: 'x' } }), 400, 'HR must pick the flawed document');
  ok(await http(T.hr, 'POST', `/transactions/${T.txId}/approve`, { body: { isApproved: false, decision: 'RETURN_FOR_CORRECTION',
    deficientDocumentIds: [flawed.id], notes: 'Unsigned page 2' } }), 200, 'HR returns one document for correction');
  const returnedTx = await db.transaction.findUnique({ where: { id: T.txId }, include: { uploadedDocuments: true } });
  assert.equal(returnedTx.status, 'DEFICIENCY', 'an HR return reopens the transaction, it is not a final rejection');
  assert.equal(returnedTx.uploadedDocuments.find(d => d.id === flawed.id).status, 'REJECTED', 'the flawed document is returned');
  assert.ok(returnedTx.uploadedDocuments.filter(d => d.id !== flawed.id).every(d => d.status === 'VALIDATED'), 'the other documents stay validated');
  assert.ok(emails.some(e => e.recipientEmail === 'teacher@pilot.invalid' && /correction/i.test(e.subject || '')), 'the personnel is emailed');
  // The personnel replaces only the flawed document and resubmits.
  const redo = new FormData();
  redo.append('file', pdfFile('corrected'), 'corrected.pdf');
  redo.append('requirementId', String(flawed.requirementTemplateId));
  ok(await http(T.teacher, 'POST', `/transactions/${T.txId}/documents`, { form: redo }), 201, 'the personnel re-uploads the returned document');
  ok(await http(T.teacher, 'POST', `/transactions/${T.txId}/submit`), 200, 'the personnel resubmits');
  const redocs = await db.uploadedDocument.findMany({ where: { transactionId: T.txId } });
  ok(await http(T.morAo, 'POST', `/transactions/${T.txId}/validate`, { body: { documentValidations: redocs.map(d => ({ documentId: d.id, isValid: true })), targetStatus: 'FOR_APPROVAL' } }), 200, 'AO II validates the correction');
  ok(await http(T.hr, 'POST', `/transactions/${T.txId}/approve`, { body: { isApproved: true, notes: 'Pilot approval' } }), 200, 'HR approves');

  const person = await db.personnel.findUnique({ where: { id: T.teacherPersonnelId } });
  assert.equal(person.designation, 'Teacher II', 'the teacher is officially Teacher II');
  assert.equal(person.plantillaItemId, T.item.id, 'the teacher occupies the promoted plantilla item');
  assert.equal((await db.transaction.findUnique({ where: { id: T.txId } })).status, 'APPROVED');
  const record = await http(T.teacher, 'GET', '/personnel/me/service-record');
  const timeline = record.json.data.careerTimeline || [];
  assert.ok(!timeline.some(e => e.status === 'PENDING'), 'no pending entry remains once appointed');
  assert.ok(timeline.some(e => e.type === 'Promotion' && e.status === 'APPROVED'), 'the service record shows the promotion');
  assert.ok(await db.notification.findFirst({ where: { userId: T.teacherUserId, relatedEntityId: T.txId, message: { contains: 'Approved' } } }),
    'the teacher is notified of the approval');
  ok(await http(T.hr, 'POST', `/transactions/${T.txId}/approve`, { body: { isApproved: true } }), 400, 'a repeat approval is refused');
});
