// Digital 201 readiness run: the real app on a disposable local Postgres, synthetic
// people only, no email sent. Records PASS / FAIL / BLOCKED / NOT TESTED per check with
// evidence and never stops on a failure. See README.md in this folder.
//
// Safeguards: refuses to run unless QA_DATABASE_URL points at localhost and a database
// whose name ends in _test; refuses NODE_ENV=production; blanks every email provider;
// runs from a temporary directory so no .env file is loaded.
const path = require('path'), fs = require('fs'), os = require('os');
const BACKEND = path.resolve(__dirname, '../..');
const WEB_DIST = path.resolve(BACKEND, '../web/dist');
const QA = process.env.QA_OUT_DIR || path.join(__dirname, 'out');
fs.mkdirSync(QA, { recursive: true });
if (process.env.NODE_ENV === 'production') { console.error('Refusing to run: NODE_ENV=production.'); process.exit(2); }
const DB = process.env.QA_DATABASE_URL || 'postgresql://postgres:test@127.0.0.1:55440/d201_qa_readiness_test';
const dbUrl = new URL(DB);
if (!['localhost', '127.0.0.1'].includes(dbUrl.hostname) || !/_test$/.test(dbUrl.pathname)) {
  console.error('Refusing to run: QA_DATABASE_URL must be a local database whose name ends in _test.'); process.exit(2);
}
const DB_NAME = dbUrl.pathname.slice(1);
const ROOT_DB = Object.assign(new URL(DB), { pathname: '/postgres' }).href;
const PORT = Number(process.env.QA_PORT || 5095);
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'd201-qa-'))); // no .env here
Object.assign(process.env, {
  DATABASE_URL: DB, DIRECT_URL: DB, NODE_ENV: 'test', JWT_ACCESS_SECRET: 'qa-access-only-0123456789', JWT_REFRESH_SECRET: 'qa-refresh-only-0123456789',
  RATE_LIMIT_MAX_REQUESTS: '100000', CLIENT_URL: `http://127.0.0.1:${PORT}`, CORS_ORIGIN: `http://127.0.0.1:${PORT}`, DEVICE_CODE_FOR_TESTS: '424242',
  SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', SMTP_PORT: '', MAILTRAP_API_TOKEN: '', EMAIL_FROM: '',
  SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', DOCUMENT_STORAGE: 'local', OCR_PROVIDER: '', BACKUP_REPORT_TOKEN: '',
});
require(BACKEND + '/node_modules/ts-node').register({ transpileOnly: true, project: BACKEND + '/tsconfig.json' });
const { execFileSync } = require('child_process');
const req = m => require(require.resolve(m, { paths: [BACKEND] }));
const client = req('@prisma/client');
const { PDFDocument, StandardFonts } = require(require.resolve('pdf-lib', { paths: [path.resolve(BACKEND, '../web'), BACKEND] }));
const stub = (rel, exports) => { const f = require.resolve(BACKEND + '/src/' + rel); require.cache[f] = { id: f, filename: f, loaded: true, exports }; };
// Files live in memory (no real storage); OCR is unavailable (the check must degrade, not fail).
const objects = new Map(); let seq = 0;
stub('services/document-storage.service', {
  MISSING_FILE_MESSAGE: 'missing',
  async storeDocument(b) { const k = `mem:${++seq}`; objects.set(k, Buffer.from(b)); return k; },
  async readDocument(k) { if (!objects.has(k)) throw Object.assign(new Error('missing'), { statusCode: 404 }); return objects.get(k); },
  async discardUncommittedDocument(k) { objects.delete(k); },
  async checkStorageHealth() { return { name: 'Document storage', status: 'OPERATIONAL', detail: 'QA in-memory store.' }; },
});
stub('services/tesseract-ocr.service', { extractWithTesseract: async () => { throw new Error('OCR unavailable in QA'); }, parseOcrLabeledFields: () => [], mapOcrFormFields: () => ({}), parseTesseractTsv: () => ({ lines: [], lineScores: [], confidence: 0 }) });

const results = [];
const rec = (id, step, ok, detail, status) => { const s = status || (ok ? 'PASS' : 'FAIL'); results.push({ id, step, status: s, detail }); console.log(`${s.padEnd(7)} ${id} ${step}${detail ? ' :: ' + String(detail).slice(0, 220) : ''}`); };
const blocked = (id, step, why) => rec(id, step, false, why, 'BLOCKED');
let baseUrl, db;
const PASSWORD = 'Qa#Readiness2026!';
const SCHOOL_A = 'Morales Elementary School', SCHOOL_B = 'Matulas Elementary School';

async function pdf(title, lines = []) {
  const d = await PDFDocument.create(); const p = d.addPage([612, 792]); const f = await d.embedFont(StandardFonts.Helvetica);
  p.drawText(title, { x: 60, y: 720, size: 18, font: f }); lines.forEach((l, i) => p.drawText(l, { x: 60, y: 690 - i * 20, size: 12, font: f }));
  p.drawText('Synthetic QA document - not a real record.', { x: 60, y: 60, size: 9, font: f });
  return Buffer.from(await d.save());
}
async function http(token, method, url, { body, form, raw } = {}) {
  const headers = { 'user-agent': 'qa-readiness' };
  if (token) headers.authorization = `Bearer ${token}`;
  let payload; if (form) payload = form; else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${baseUrl}/api/v1${url}`, { method, headers, body: payload });
  const buf = Buffer.from(await res.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { /* binary */ }
  return { status: res.status, json, text: buf.toString('utf8'), headers: res.headers };
}
const devices = new Map();
async function login(email, password = PASSWORD) {
  const r = await http(null, 'POST', '/auth/login', { body: { email, password, deviceToken: devices.get(email) } });
  if (r.status !== 200 || !r.json?.data?.requiresVerification) return r;
  const v = await http(null, 'POST', '/auth/verify-device', { body: { challengeToken: r.json.data.challengeToken, code: '424242' } });
  if (v.status === 200) devices.set(email, v.json.data.deviceToken);
  return v;
}
const tok = r => r?.json?.data?.accessToken;
/** The setup link and temporary password are read from the real outbox row (never emailed). */
async function outboxInvite(email) {
  const rows = await db.workflowOutbox.findMany({ orderBy: { createdAt: 'desc' } });
  const row = rows.find(r => r.payload?.recipientEmail === email && r.payload?.actionUrl?.includes('setup-account'));
  return row ? { token: decodeURIComponent(new URL(row.payload.actionUrl).searchParams.get('token')), temp: row.payload.credentials?.initialPassword, row } : null;
}
async function completeSetup(email) {
  const inv = await outboxInvite(email); if (!inv) return null;
  const r = await http(null, 'POST', '/auth/complete-setup', { body: { token: inv.token, newPassword: PASSWORD } });
  if (r.status !== 200) return null;
  devices.set(email, r.json.data.deviceToken);
  return tok(await login(email));
}
const T = {};

async function main() {
  // Check the port before touching the database: a second run that fails to start must
  // not drop the database out from under a run that is still going.
  await new Promise((resolve, reject) => {
    const probe = require('net').createServer().once('error', () => reject(new Error(`Port ${PORT} is busy: another readiness run may be going. Set QA_PORT or wait.`)))
      .once('listening', () => probe.close(resolve)).listen(PORT, '127.0.0.1');
  });
  const root = new client.PrismaClient({ datasources: { db: { url: ROOT_DB } } });
  await root.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
  await root.$executeRawUnsafe(`CREATE DATABASE "${DB_NAME}"`);
  await root.$disconnect();
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js', { paths: [BACKEND] }), 'migrate', 'deploy', '--schema', BACKEND + '/prisma/schema.prisma'], { cwd: BACKEND, env: process.env, stdio: 'pipe' });
  db = new client.PrismaClient({ datasources: { db: { url: DB } } });
  stub('config/prisma', { __esModule: true, default: db });
  const { hashPassword } = require(BACKEND + '/src/utils/hash.util');
  for (const r of ['SYSTEM_ADMIN', 'HRMO', 'AO_II', 'TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL']) await db.role.upsert({ where: { name: r }, create: { name: r }, update: {} });
  const saRole = await db.role.findUnique({ where: { name: 'SYSTEM_ADMIN' } });
  await db.user.create({ data: { email: 'sysadmin@qa.test', passwordHash: await hashPassword(PASSWORD), roleId: saRole.id, accountStatus: 'ACTIVE', mustChangePassword: false,
    personnel: { create: { employeeId: 'QA-SA', firstName: 'Sam', lastName: 'Admin', designation: 'System Administrator', status: 'ACTIVE', profileComplete: true } } } });
  const app = require(BACKEND + '/src/app').default;
  const express = req('express');
  const outer = express();
  outer.use((q, r, n) => (q.path.startsWith('/api') ? app(q, r, n) : n()));
  outer.use(express.static(WEB_DIST));
  outer.get(/.*/, (q, r) => r.sendFile(path.join(WEB_DIST, 'index.html')));
  await new Promise(r => outer.listen(PORT, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${PORT}`;

  // ── 1–2 Accounts, invitation, activation, first login ──────────────────────
  T.sa = tok(await login('sysadmin@qa.test'));
  rec('E2E-01', 'System Administrator signs in', Boolean(T.sa));
  const mk = (email, role, first, last, extra) => http(T.sa, 'POST', '/users', { body: { email, password: 'Temp#Pass2026!', role, firstName: first, lastName: last, birthDate: '1985-01-01',
    gender: 'FEMALE', civilStatus: 'SINGLE', contactNumber: '09170000000', dateHired: '2012-06-01', designation: role === 'HRMO' ? 'HRMO' : 'Administrative Officer II', ...extra } });
  const made = {
    hr: await mk('hrmo@qa.test', 'HRMO', 'Helen', 'Ramos', {}),
    aoA: await mk('ao.a@qa.test', 'AO_II', 'Alma', 'Aquino', { schoolAssignment: SCHOOL_A, district: 'District 1' }),
    aoB: await mk('ao.b@qa.test', 'AO_II', 'Bert', 'Bautista', { schoolAssignment: SCHOOL_B, district: 'District 2' }),
  };
  rec('E2E-01b', 'SA creates HRMO and two AO II accounts', Object.values(made).every(r => r.status === 201), Object.values(made).map(r => r.status).join(','));
  const uid = r => r.json?.data?.user?.id ?? r.json?.data?.id;
  const pend = await login('hrmo@qa.test', 'Temp#Pass2026!');
  rec('AUTH-01', 'A PENDING (not yet invited) account cannot sign in', pend.status !== 200, `status ${pend.status}`);
  await invitationRegression(mk, uid);
  for (const k of ['hr', 'aoA', 'aoB']) await http(T.sa, 'POST', `/users/${uid(made[k])}/distribute-credentials`);
  const onb = await http(T.sa, 'GET', `/users/${uid(made.hr)}/onboarding`);
  rec('E2E-02', 'Onboarding shows invitation not falsely "sent" (no email provider configured)', onb.status === 200 && onb.json.data.invitation.state !== 'SENT', JSON.stringify(onb.json?.data?.invitation));
  rec('OPS-01', 'Onboarding view carries no credential or link', !/initialPassword|setup-account\?token/.test(onb.text));
  const inv = await outboxInvite('hrmo@qa.test');
  const tempLogin = inv && await login('hrmo@qa.test', inv.temp);
  const limited = tempLogin && await http(tok(tempLogin), 'GET', '/promotions/cycles');
  rec('E2E-02b', 'Temporary password signs in but only to change the password', tempLogin?.status === 200 && limited?.status === 403, `login ${tempLogin?.status}, other page ${limited?.status}`);
  T.hr = await completeSetup('hrmo@qa.test'); T.aoA = await completeSetup('ao.a@qa.test'); T.aoB = await completeSetup('ao.b@qa.test');
  rec('E2E-02c', 'Setup link sets a password and signs in (HRMO, AO II A, AO II B)', Boolean(T.hr && T.aoA && T.aoB));
  const reuse = inv && await http(null, 'POST', '/auth/complete-setup', { body: { token: inv.token, newPassword: 'Other#Pass2026!' } });
  rec('AUTH-02', 'A setup link works only once', reuse && reuse.status !== 200, `status ${reuse?.status}`);
  const onb2 = await http(T.sa, 'GET', `/users/${uid(made.hr)}/onboarding`);
  rec('E2E-02d', 'Onboarding records password set and first sign-in', onb2.json?.data?.setupCompleted === true && Boolean(onb2.json?.data?.firstSignInAt), JSON.stringify({ s: onb2.json?.data?.setupCompleted, f: onb2.json?.data?.firstSignInAt }));

  // Personnel A and B through the AO II request -> SA approval path.
  const item = (n, title, sg, school, district) => db.plantillaItem.create({ data: { itemNumber: n, positionTitle: title, salaryGrade: sg, department: school, division: district } });
  async function requestPerson(ao, first, last, email, school, district, itemNo) {
    const it = await item(itemNo, 'Teacher I', 11, school, district);
    const form = new FormData(); form.append('plantillaItemId', String(it.id));
    for (const [k, v] of Object.entries({ firstName: first, lastName: last, email, birthDate: '1990-03-03', gender: 'FEMALE', civilStatus: 'SINGLE', contactNumber: '09171111111',
      address: 'Koronadal City', role: 'TEACHING_PERSONNEL', designation: 'Teacher I', school, initialPassword: 'Temp#Pass2026!', dateHired: '2016-06-01' })) form.append(k, v);
    return http(ao, 'POST', '/users/requests', { form });
  }
  const rqA = await requestPerson(T.aoA, 'Paula', 'Andres', 'personnel.a@qa.test', SCHOOL_A, 'District 1', 'QA-TCH1-A');
  const rqB = await requestPerson(T.aoB, 'Pedro', 'Bernal', 'personnel.b@qa.test', SCHOOL_B, 'District 2', 'QA-TCH1-B');
  rec('E2E-01c', 'Each AO II requests a personnel account for their own school', rqA.status === 201 && rqB.status === 201, `${rqA.status},${rqB.status}`);
  const crossReq = await http(T.aoB, 'GET', '/users/requests');
  rec('AUTH-03', "AO II B's request list excludes School A's request", !(crossReq.json?.data || []).some(r => r.email === 'personnel.a@qa.test'), `rows ${(crossReq.json?.data || []).length}`);
  const [ap1, ap2] = await Promise.all([1, 2].map(() => http(T.sa, 'POST', `/users/requests/${rqA.json.data.id}/approve`)));
  rec('REC-02', 'Double-click approve of an account request creates one account', [ap1.status, ap2.status].filter(s => s === 200).length === 1 && await db.user.count({ where: { email: 'personnel.a@qa.test' } }) === 1, `${ap1.status},${ap2.status}`);
  await http(T.sa, 'POST', `/users/requests/${rqB.json.data.id}/approve`);
  T.pA = await completeSetup('personnel.a@qa.test'); T.pB = await completeSetup('personnel.b@qa.test');
  rec('E2E-02e', 'Personnel A and B complete setup and sign in', Boolean(T.pA && T.pB));
  T.pAid = (await db.personnel.findFirst({ where: { user: { email: 'personnel.a@qa.test' } } })).id;
  T.pBid = (await db.personnel.findFirst({ where: { user: { email: 'personnel.b@qa.test' } } })).id;

  // ── 3–7 Application: 201 files, attach, submit exactly once ─────────────────
  const upload201 = async (token, type, title) => { const f = new FormData(); f.append('file', new Blob([await pdf(title, ['Name: Paula Andres'])], { type: 'application/pdf' }), `${type.toLowerCase()}.pdf`); f.append('documentTypeId', type); return http(token, 'POST', '/personnel/documents', { form: f }); };
  const { ANNEX_C_REQUIREMENTS, MANDATORY_ANNEX_C_CODES } = require(BACKEND + '/src/utils/annex-c.util');
  const byType = {};
  for (const r of ANNEX_C_REQUIREMENTS) { const t = r.suggestedDocumentTypeIds[0]; if (MANDATORY_ANNEX_C_CODES.includes(r.code) && t && t !== 'OTHER' && !byType[t]) { const u = await upload201(T.pA, t, `${t} of Paula Andres`); byType[t] = u.json?.data?.id; } }
  rec('E2E-04', 'Personnel A uploads required 201 files', Object.values(byType).every(Boolean), JSON.stringify(Object.keys(byType)));
  rec('E2E-05', 'Uploading 201 files creates no application', await db.promotionApplication.count() === 0);
  const itA = await item('QA-TCH2-A', 'Teacher II', 12, SCHOOL_A, 'District 1');
  const cyc = (name, it, school, district, extra = {}) => http(T.hr, 'POST', '/promotions/cycles', { body: { name, type: 'NATURAL_VACANCY', startDate: new Date(Date.now() - 864e5).toISOString(), endDate: new Date(Date.now() + 7 * 864e5).toISOString(), status: 'ACTIVE',
    rulesConfigurationJson: { track: 'TEACHING', targetPosition: 'Teacher II', salaryGrade: 12, school, district, plantillaItemNumbers: [it.itemNumber], vacantPositions: 1 }, ...extra } });
  const cA = await cyc('QA Teacher II School A', itA, SCHOOL_A, 'District 1');
  rec('E2E-03', 'HRMO opens a promotion cycle', cA.status === 201, `status ${cA.status}`); T.cA = cA.json?.data?.id;
  const items = ANNEX_C_REQUIREMENTS.map(r => { const t = r.suggestedDocumentTypeIds[0]; return byType[t] ? { code: r.code, personnelDocumentId: byType[t], submitted: true } : { code: r.code, submitted: false }; });
  const [s1, s2] = await Promise.all([1, 2].map(() => http(T.pA, 'POST', `/promotions/cycles/${T.cA}/apply`, { body: { checklist: { items } } })));
  const appRows = await db.promotionApplication.findMany({ where: { promotionCycleId: T.cA } });
  rec('E2E-07', 'Double-click Apply stores exactly one application', appRows.length === 1 && [s1.status, s2.status].includes(201), `statuses ${s1.status},${s2.status} rows ${appRows.length}`);
  T.appA = appRows[0]?.id;
  const aoANote = await db.notification.findFirst({ where: { user: { email: 'ao.a@qa.test' }, relatedEntityType: 'PromotionApplication', relatedEntityId: T.appA } });
  const aoBNote = await db.notification.findFirst({ where: { user: { email: 'ao.b@qa.test' }, relatedEntityType: 'PromotionApplication', relatedEntityId: T.appA } });
  rec('DIAG-04', 'AO notifications after apply', true, JSON.stringify((await db.notification.findMany({ where: { user: { role: { name: 'AO_II' } } }, select: { relatedEntityType: true, relatedEntityId: true, user: { select: { email: true } } } })).map(n => [n.user.email, n.relatedEntityType, n.relatedEntityId])), 'INFO');
  await browserApplications('submitted');
  rec('E2E-07b', 'Application routed to School A AO II only', Boolean(aoANote) && !aoBNote);
  const appPath = `/promotions/cycles/${T.cA}/applications/${T.appA}`;
  const bVerify = await http(T.aoB, 'POST', `${appPath}/verify-requirements`, { body: { status: 'COMPLETE' } });
  rec('AUTH-04', 'AO II B cannot verify School A application', bVerify.status === 404 || bVerify.status === 403, `status ${bVerify.status}`);
  const bList = await http(T.aoB, 'GET', `/promotions/cycles/${T.cA}/applications`);
  rec('AUTH-05', "AO II B's applicant list excludes School A applicant", !(bList.json?.data || []).some(a => a.personnelId === T.pAid), `status ${bList.status}, rows ${(bList.json?.data || []).length}`);
  // ── 8 AO II checks requirements; HRMO rates, ranks, selects → appointment transaction
  const v = await http(T.aoA, 'POST', `${appPath}/verify-requirements`, { body: { status: 'COMPLETE', remarks: 'Complete' } });
  rec('E2E-08', 'AO II A verifies the application requirements', v.status === 200, `status ${v.status}`);
  const rating = { track: 'TEACHING', educationScore: 10, trainingScore: 9, experienceScore: 9, performanceScore: 28, ppstCoiScore: 23, ppstNcoiScore: 14, remarks: 'QA' };
  const fr = await http(T.hr, 'POST', `${appPath}/final-rating`, { body: rating });
  const rk = await http(T.hr, 'POST', `/promotions/cycles/${T.cA}/generate-ranking`);
  const [sel1, sel2] = await Promise.all([1, 2].map(() => http(T.hr, 'POST', `${appPath}/select-promotion`, { body: { isPromoted: true, plantillaItemNumber: itA.itemNumber } })));
  const selApp = T.appA ? await db.promotionApplication.findUnique({ where: { id: T.appA } }) : null;
  T.txA = Number(selApp?.scoreDetailsJson?.transactionId);
  const txCount = await db.transaction.count({ where: { personnelId: T.pAid } });
  rec('E2E-08b', 'HRMO rates, ranks and selects; double-click select opens one appointment transaction', fr.status === 200 && rk.status === 200 && Number.isInteger(T.txA) && txCount === 1, `rate ${fr.status} rank ${rk.status} select ${sel1.status},${sel2.status} tx ${txCount}`);
  const pDesig = (await db.personnel.findUnique({ where: { id: T.pAid } })).designation;
  rec('BIZ-01', 'Selection alone does not change the official position', pDesig === 'Teacher I', pDesig);

  // Appointment transaction: attach from 201, upload the rest.
  const tpl = await db.requirementTemplate.findMany({ where: { transactionType: { name: 'Promotion' } } });
  const mandatory = tpl.filter(t => t.isMandatory);
  const earlySubmit = await http(T.pA, 'PUT', `/transactions/${T.txA}/submit`);
  rec('REC-03', 'Submitting with requirements missing is refused with a reason', earlySubmit.status === 400 && /missing|required|without any supporting documents/i.test(earlySubmit.json?.message || ''), earlySubmit.json?.message);
  const auto = await http(T.pA, 'POST', `/transactions/${T.txA}/documents/auto-attach`);
  rec('E2E-04b', 'Existing 201 files are attached automatically where they match', auto.status === 200, `status ${auto.status} added ${(auto.json?.data?.attached || auto.json?.data || []).length ?? '?'}`);
  let have = new Set((await db.uploadedDocument.findMany({ where: { transactionId: T.txA } })).map(d => d.requirementTemplateId));
  for (const t of mandatory.filter(t => !have.has(t.id))) {
    const f = new FormData(); f.append('file', new Blob([await pdf(t.name, ['Paula Andres'])], { type: 'application/pdf' }), `req-${t.id}.pdf`); f.append('requirementId', String(t.id)); f.append('requirementName', t.name);
    await http(T.pA, 'POST', `/transactions/${T.txA}/documents`, { form: f });
  }
  const afterUpload = await db.transaction.findUnique({ where: { id: T.txA } });
  rec('E2E-05b', 'Uploading all requirements does not submit the transaction', ['DRAFT'].includes(afterUpload.status), afterUpload.status);
  const subs = await Promise.all([1, 2].map(() => http(T.pA, 'PUT', `/transactions/${T.txA}/submit`)));
  const subLogs = await db.validationLog.count({ where: { entityType: 'Transaction', entityId: T.txA, action: 'TRANSACTION_SUBMITTED' } });
  const txNow = await db.transaction.findUnique({ where: { id: T.txA } });
  rec('E2E-07c', 'Double-click submit persists one submission, routed to AO II', subLogs === 1 && txNow.status === 'PENDING_VALIDATION', `logs ${subLogs}, status ${txNow.status}, responses ${subs.map(s => s.status)}`);
  const qA = await http(T.aoA, 'GET', '/transactions?queue=awaiting'); const qB = await http(T.aoB, 'GET', '/transactions?queue=awaiting');
  rec('E2E-07d', "Transaction appears in AO II A's queue and not AO II B's", qA.json?.data?.some(t => t.id === T.txA) && !qB.json?.data?.some(t => t.id === T.txA), `A:${qA.json?.pagination?.totalItems} B:${qB.json?.pagination?.totalItems}`);
  const docs = await db.uploadedDocument.findMany({ where: { transactionId: T.txA } });
  const val = await http(T.aoA, 'POST', `/transactions/${T.txA}/validate`, { body: { documentValidations: docs.map(d => ({ documentId: d.id, isValid: true })), targetStatus: 'FOR_APPROVAL', remarks: 'All verified' } });
  rec('E2E-08c', 'AO II A validates the documents; transaction goes to HRMO', val.status === 200 && (await db.transaction.findUnique({ where: { id: T.txA } })).status === 'FOR_APPROVAL', `status ${val.status}`);

  // ── 9–10 HRMO returns ONE document ──────────────────────────────────────────
  const flawed = docs[docs.length - 1];
  const flawedName = (await db.requirementTemplate.findUnique({ where: { id: flawed.requirementTemplateId } })).name;
  const rets = await Promise.all([1, 2].map(() => http(T.hr, 'POST', `/transactions/${T.txA}/approve`, { body: { isApproved: false, decision: 'RETURN_FOR_CORRECTION', deficientDocumentIds: [flawed.id], notes: 'Page 2 is unsigned. Upload the signed copy.' } })));
  const retLogs = await db.validationLog.count({ where: { entityType: 'Transaction', entityId: T.txA, action: 'HRMO_RETURNED_FOR_CORRECTION' } });
  rec('E2E-09', 'HRMO returns one document (double-click records one return)', retLogs === 1 && rets.some(r => r.status === 200), `responses ${rets.map(r => r.status)}, logs ${retLogs}`);
  const others = await db.uploadedDocument.findMany({ where: { transactionId: T.txA, NOT: { id: flawed.id } } });
  rec('E2E-13a', 'Other documents stay validated after the return', others.every(d => d.status === 'VALIDATED'));
  const pNotes = await http(T.pA, 'GET', '/notifications?limit=50');
  const retNote = (pNotes.json?.data || []).find(n => n.relatedEntityType === 'Transaction' && n.relatedEntityId === T.txA && /return/i.test(n.message));
  rec('E2E-10', 'Personnel notification names the transaction and the returned document', Boolean(retNote) && retNote.message.includes(flawedName) && retNote.message.includes(`#${T.txA}`), retNote?.message);
  const retMail = (await db.workflowOutbox.findMany()).map(r => r.payload).find(p => p?.recipientEmail === 'personnel.a@qa.test' && /correction/i.test(p?.subject || ''));
  rec('E2E-10b', 'Return email links to the exact requirement', Boolean(retMail?.actionUrl?.includes(`requirement=${flawed.requirementTemplateId}`)), retMail?.actionUrl?.replace(/token=[^&]+/, 'token=…'));

  // ── 11–15 Browser: follow notice → requirement → replace → preview → resubmit
  await browserCorrection(flawed, flawedName);

  // ── 13 & 16–18 Evidence, routing, reviewer sees what changed, approval ──────
  const rev = await db.documentRevision.findFirst({ where: { documentId: flawed.id, snapshot: { path: ['status'], equals: 'REJECTED' } } });
  rec('E2E-13b', 'The returned file version and its reason are preserved', Boolean(rev) && rev.snapshot.validationNotes?.includes('unsigned'));
  const txAfter = await db.transaction.findUnique({ where: { id: T.txA } });
  rec('E2E-16', 'Corrected transaction returns to AO II (established policy)', txAfter.status === 'PENDING_VALIDATION', txAfter.status);
  const aoView = await http(T.aoA, 'GET', `/transactions/${T.txA}`);
  const changed = aoView.json?.data?.uploadedDocuments?.find(d => d.id === flawed.id);
  rec('E2E-17', 'Reviewer sees which file changed and the previous decision', changed?.replacedAfterReturn === true && /unsigned/i.test(changed?.previousVersion?.reviewNotes || ''), JSON.stringify(changed?.previousVersion || {}).slice(0, 160));
  // Stale review: validate with the document list as it was before (still valid ids) — must still work or conflict clearly.
  const redocs = await db.uploadedDocument.findMany({ where: { transactionId: T.txA } });
  const val2 = await http(T.aoA, 'POST', `/transactions/${T.txA}/validate`, { body: { documentValidations: redocs.map(d => ({ documentId: d.id, isValid: true })), targetStatus: 'FOR_APPROVAL', remarks: 'Correction verified' } });
  rec('E2E-17b', 'AO II validates the correction', val2.status === 200, `status ${val2.status} ${val2.json?.message || ''}`);
  const apps2 = await Promise.all([1, 2].map(() => http(T.hr, 'POST', `/transactions/${T.txA}/approve`, { body: { isApproved: true, notes: 'Approved' } })));
  const apprLogs = await db.validationLog.count({ where: { entityType: 'Transaction', entityId: T.txA, action: 'TRANSACTION_APPROVED' } });
  rec('E2E-18', 'HRMO final approval; double-click records one approval', apprLogs === 1 && apps2.some(r => r.status === 200), `responses ${apps2.map(r => r.status)}`);
  const loser = apps2.find(r => r.status !== 200);
  rec('UX-01', 'The losing duplicate click gets a clear, non-alarming message', !loser || /already|processed|changed/i.test(loser.json?.message || ''), loser?.json?.message);

  // ── 19 Final state across screens ───────────────────────────────────────────
  // The browser checks signed Personnel A in several times; the session limit (a security
  // feature) ends the oldest session, which is this script's API token. Sign in again.
  T.pA = tok(await login('personnel.a@qa.test'));
  const person = await db.personnel.findUnique({ where: { id: T.pAid } });
  rec('E2E-19a', 'Official position updated to Teacher II and plantilla item occupied', person.designation === 'Teacher II' && person.plantillaItemId === itA.id, person.designation);
  const sr = await http(T.pA, 'GET', '/personnel/me/service-record');
  const tl = sr.json?.data?.careerTimeline || [];
  rec('E2E-19b', 'Service Record shows the promotion and no pending entry', tl.some(e => e.type === 'Promotion' && e.status === 'APPROVED') && !tl.some(e => e.status === 'PENDING'), `${tl.length} entries`);
  const my = await http(T.pA, 'GET', '/transactions/my-transactions');
  rec('E2E-19c', 'Applications/transactions list shows Approved', (my.json?.data || []).find(t => t.id === T.txA)?.status === 'APPROVED');
  const myApps = await http(T.pA, 'GET', '/promotions/my-applications');
  rec('E2E-19d', 'Promotion application shows approved', (myApps.json?.data || []).find(a => a.id === T.appA)?.status === 'APPROVED', (myApps.json?.data || []).find(a => a.id === T.appA)?.status);
  const n2 = (await http(T.pA, 'GET', '/notifications?limit=50')).json?.data || [];
  rec('E2E-19e', 'Old return notice kept but marked handled; approval notice present', n2.find(n => n.id === retNote?.id)?.actionResolved === true && n2.some(n => n.relatedEntityId === T.txA && /approved/i.test(n.message)));
  const qA2 = await http(T.aoA, 'GET', '/transactions?queue=awaiting'); const qH2 = await http(T.hr, 'GET', '/transactions?queue=awaiting');
  rec('E2E-19f', 'AO II and HRMO queues no longer hold it; counts match lists', !qA2.json.data.some(t => t.id === T.txA) && !qH2.json.data.some(t => t.id === T.txA) && qH2.json.counts.awaitingMyReview === qH2.json.pagination.totalItems);
  const hrNotes = (await http(T.hr, 'GET', '/notifications?limit=50')).json?.data || [];
  const staleHr = hrNotes.filter(n => n.relatedEntityType === 'Transaction' && n.relatedEntityId === T.txA && n.actionResolved === false);
  rec('E2E-19g', "HRMO's notices about the finished transaction no longer ask for action", staleHr.length === 0, `${staleHr.length} still open`);
  const files = await http(T.pA, 'GET', '/personnel/documents');
  rec('E2E-19h', '201 Files still lists the person\'s files', (files.json?.data || []).filter(d => d.hasFile || d.storagePath || d.originalFileName).length >= Object.keys(byType).length);
  const audit = await http(T.sa, 'GET', `/audit-logs?limit=100`);
  const acts = (audit.json?.data || []).map(e => e.action);
  rec('AUD-01', 'Audit trail has submit, validate, return, resubmit, approve (as seen by SA)', ['TRANSACTION_SUBMITTED', 'HRMO_RETURNED_FOR_CORRECTION', 'TRANSACTION_RESUBMITTED', 'TRANSACTION_APPROVED'].every(a => acts.includes(a)), `seen: ${[...new Set(acts)].slice(0, 25).join(',')}`);
  const sample = (audit.json?.data || []).find(e => e.action === 'TRANSACTION_APPROVED');
  rec('AUD-02', 'Audit entry identifies actor, action, target, outcome, time', Boolean(sample && (sample.actorEmail || sample.actor || sample.userEmail || sample.user) && (sample.targetId || sample.entityId) && sample.timestamp && (sample.outcome || sample.status)), JSON.stringify(sample ? Object.keys(sample) : []));
  rec('AUD-03', 'Audit list and CSV export contain no secret values', !/Temp#Pass|Qa#Readiness|"accessToken":"ey|tokenHash":"[0-9a-f]{20}|passwordHash":"$/.test(audit.text + (await http(T.sa, 'GET', '/audit-logs/export/csv')).text));
  const sum = await http(T.sa, 'GET', '/audit-logs/summary');
  const crit = await db.validationLog.count({ where: { severity: 'CRITICAL', timestamp: { gte: new Date(Date.now() - 864e5) } } });
  rec('AUD-04', 'Critical count equals records with CRITICAL severity', sum.json?.data?.criticalCount === crit, `summary ${sum.json?.data?.criticalCount} vs db ${crit}`);
  const f1 = await http(T.sa, 'GET', '/audit-logs?limit=5&outcome=SUCCESS'); const csv = await http(T.sa, 'GET', '/audit-logs/export/csv?outcome=SUCCESS');
  const csvRows = csv.text.trim().split('\n').length - 1;
  rec('AUD-05', 'Audit filter total and CSV export agree', f1.json?.pagination?.totalItems === csvRows || false, `list ${f1.json?.pagination?.totalItems} csv≈${csvRows}${csv.text.length >= 3999 ? ' (csv truncated in capture)' : ''}`, f1.json?.pagination?.totalItems === csvRows ? undefined : (undefined));
  const integ = await http(T.sa, 'GET', '/audit-logs/verify-integrity');
  rec('AUD-06', 'Integrity check states its range and does not over-claim', Boolean(integ.json?.data?.checkedRange) && ['VERIFIED', 'PARTIALLY_VERIFIED', 'NO_VERIFIABLE_RECORDS'].includes(integ.json?.data?.status), `${integ.json?.data?.status} verifiable ${integ.json?.data?.verifiableRecords}/${integ.json?.data?.checkedRecords} legacy ${integ.json?.data?.legacyUnhashedRecords}`);

  await authorizationProbes(flawed);
  await cycleWindowProbes();
  await escalationPath();
  await recoveryProbes();
  await browserApplications('final');
  await roleSmoke();
  await browserSessions();
  await sessionProbes();
  fs.writeFileSync(path.join(QA, 'results.json'), JSON.stringify({ commit: process.env.QA_COMMIT, at: new Date().toISOString(), results }, null, 2));
  const tally = results.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
  console.log('TALLY', JSON.stringify(tally));
  process.exit(0);
}

async function browserCorrection(flawed, flawedName) {
  if (!process.env.CHROME_PATH) { rec('E2E-11', 'Browser correction steps', false, 'CHROME_PATH not set', 'NOT TESTED'); return apiCorrection(flawed); }
  let puppeteer; try { puppeteer = require(process.env.QA_PUPPETEER || 'puppeteer-core'); } catch { rec('E2E-11', 'Browser correction steps', false, 'puppeteer-core not installed; set QA_PUPPETEER and CHROME_PATH', 'NOT TESTED'); return; }
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: 'new', defaultViewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  try {
    const page = await browser.newPage();
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
    page.on('response', r => { if (r.status() >= 400) consoleErrors.push(`${r.status()} ${r.url().replace(baseUrl, '').split('?')[0]}`); });
    page.on('dialog', d => d.accept().catch(() => {}));
    const uploads = [];
    page.on('response', async r => { if (/\/documents(\?|$)/.test(r.url()) && r.request().method() === 'POST') uploads.push(`${r.status()} ${(await r.text().catch(() => '')).slice(0, 160)}`); });
    await page.goto(baseUrl + '/login', { waitUntil: 'domcontentloaded' });
    await page.type('input[type=email]', 'personnel.a@qa.test'); await page.type('input[type=password]', PASSWORD); await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 2500));
    const code = await page.$('input[autocomplete="one-time-code"], input[inputmode="numeric"]');
    if (code) { await code.type('424242'); await page.keyboard.press('Enter'); await new Promise(r => setTimeout(r, 2500)); }
    await page.goto(baseUrl + '/personnel/home', { waitUntil: 'domcontentloaded' }); await new Promise(r => setTimeout(r, 3000));
    const homeText = await page.evaluate(() => document.body.innerText);
    rec('UX-02', 'Home lists the returned transaction under "What you need to do"', /What you need to do[\s\S]*Returned for correction/i.test(homeText), homeText.match(/What you need to do[\s\S]{0,200}/)?.[0]?.replace(/\s+/g, ' '));
    await page.screenshot({ path: path.join(QA, 'b1-home.png') });
    await page.goto(baseUrl + '/personnel/notifications', { waitUntil: 'domcontentloaded' }); await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(QA, 'b2-notifications.png') });
    // Click the action on the return notice.
    const clicked = await page.evaluate(tx => {
      const btn = [...document.querySelectorAll('button, a')].find(b => /replace|fix|resubmit|correct/i.test(b.innerText) && (() => { let e = b; for (let i = 0; i < 6 && e; i++, e = e.parentElement) if (e.innerText.includes(`#${tx}`) && /return/i.test(e.innerText)) return true; return false; })());
      if (btn) { btn.click(); return btn.innerText.trim(); } return null;
    }, T.txA);
    await new Promise(r => setTimeout(r, 3500));
    const url = page.url();
    rec('E2E-11', 'Following the notice opens this transaction\'s checklist', Boolean(clicked) && url.includes(`txId=${T.txA}`), `button "${clicked}" -> ${url.replace(baseUrl, '')}`);
    if (!url.includes('/personnel/checklist')) await page.goto(`${baseUrl}/personnel/checklist?txId=${T.txA}`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 3000));
    const focusId = await page.evaluate(() => document.activeElement?.id || '');
    rec('E2E-11b', 'The returned requirement is focused on arrival', focusId === `req-${flawed.requirementTemplateId}`, `focused "${focusId}"`);
    await page.screenshot({ path: path.join(QA, 'b3-checklist-returned.png') });
    const rowText = await page.evaluate(id => document.getElementById(`req-${id}`)?.innerText || '', flawed.requirementTemplateId);
    rec('E2E-11c', 'Reviewer reason is shown beside the returned file', /unsigned/i.test(rowText) && /HRMO/i.test(rowText), rowText.replace(/\s+/g, ' ').slice(0, 200));
    const pageText = await bodyText(page);
    rec('WORD-01', 'Checklist says "Validated by AO II", never "Approved by AO II"', /Validated by AO II/.test(pageText) && !/approved by ao ii/i.test(pageText));
    const pick = async file => {
      const [c] = await Promise.all([
        page.waitForFileChooser({ timeout: 8000 }),
        (async () => { const h = await page.evaluateHandle(id => [...document.getElementById(`req-${id}`).querySelectorAll('button')].find(x => /replace file|upload file/i.test(x.innerText)), flawed.requirementTemplateId); await h.asElement().click(); })(),
      ]);
      await c.accept([file]); await new Promise(r => setTimeout(r, 3500));
    };
    // Too large: refused in the browser before sending; the requirement is still waiting.
    const big = path.join(QA, 'too-big.pdf'); fs.writeFileSync(big, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11 * 1024 * 1024, 32)]));
    await pick(big);
    const t1 = await bodyText(page);
    rec('UP-01', 'Oversized file in the browser: clear limit message, requirement still waiting', /10 MB/.test(t1) && (await db.uploadedDocument.findUnique({ where: { id: flawed.id } })).status === 'REJECTED', oneLine(t1, /[^\n]*10 MB[^\n]*/));
    // Interrupted: the network drops during the upload; nothing changes and the error says so.
    const okFile = path.join(QA, 'retry.pdf'); fs.writeFileSync(okFile, await pdf(`${flawedName} (signed)`, ['Paula Andres']));
    await page.setOfflineMode(true);
    await pick(okFile);
    const t2 = await bodyText(page);
    const still = await db.uploadedDocument.findUnique({ where: { id: flawed.id } });
    await page.setOfflineMode(false);
    const offlineShot = path.join(QA, 'up-offline.png'); await page.screenshot({ path: offlineShot });
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /^s*Retrys*$/i.test(b.innerText))?.click());
    await new Promise(r => setTimeout(r, 3500));
    rec('UP-02', 'Interrupted upload (offline) shows an error and changes nothing', still.status === 'REJECTED' && /fail|could not|network|connection|try again/i.test(t2), oneLine(t2, /[^\n]*(fail|could not|network|connection)[^\n]*/i));
    // Replace the file through the page's own control (this is the retry).
    const [chooser] = await Promise.all([
      page.waitForFileChooser({ timeout: 8000 }),
      (async () => { const h = await page.evaluateHandle(id => [...document.getElementById(`req-${id}`).querySelectorAll('button')].find(x => /replace file|upload file/i.test(x.innerText)), flawed.requirementTemplateId); await h.asElement().click(); })(),
    ]);
    const tmp = path.join(QA, 'replacement.pdf'); fs.writeFileSync(tmp, await pdf(`${flawedName} (signed)`, ['Paula Andres', 'Signed copy']));
    await chooser.accept([tmp]);
    await new Promise(r => setTimeout(r, 4500));
    const toasts = await page.evaluate(() => [...document.querySelectorAll('[role=alert], [role=status], .toast, [class*=toast]')].map(e => e.innerText).join(' | ').slice(0, 300));
    rec('DIAG-01', 'Browser replacement upload response', true, `uploads: ${uploads.join(' || ') || 'none'}; toasts: ${toasts}`, 'INFO');
    await page.screenshot({ path: path.join(QA, 'b3b-after-replace.png') });
    const st = await db.transaction.findUnique({ where: { id: T.txA } });
    rec('E2E-14', 'Replacing the file does not resubmit the transaction', st.status === 'DEFICIENCY', st.status);
    const row2 = await page.evaluate(id => document.getElementById(`req-${id}`)?.innerText || '', flawed.requirementTemplateId);
    rec('E2E-12', 'Replacement is shown as saved but not sent', /Replacement saved, not sent yet/i.test(row2), row2.replace(/\s+/g, ' ').slice(0, 200));
    rec('UP-03', 'Retrying the upload after coming back online succeeds', /Replacement saved, not sent yet/i.test(row2));
    // Preview the replacement.
    await page.evaluate(id => { const row = document.getElementById(`req-${id}`); [...row.querySelectorAll('button')].find(x => /^\s*view\s*$/i.test(x.innerText))?.click(); }, flawed.requirementTemplateId);
    await new Promise(r => setTimeout(r, 4000));
    const hasPreview = await page.evaluate(() => Boolean(document.querySelector('[role=dialog] canvas, [role=dialog] img, [role=dialog] iframe, .modal canvas, .modal iframe')));
    await page.screenshot({ path: path.join(QA, 'b4-preview.png') });
    rec('E2E-12b', 'Replacement preview opens and renders', hasPreview);
    await page.keyboard.press('Escape'); await new Promise(r => setTimeout(r, 800));
    // Resubmit with a double click.
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Resubmit corrections/i.test(x.innerText)); b?.click(); b?.click(); });
    await new Promise(r => setTimeout(r, 4000));
    const resubLogs = await db.validationLog.count({ where: { entityType: 'Transaction', entityId: T.txA, action: 'TRANSACTION_RESUBMITTED' } });
    const txs = await db.transaction.findUnique({ where: { id: T.txA } });
    rec('E2E-15', 'Explicit resubmit (double click) records one resubmission', resubLogs === 1 && txs.status === 'PENDING_VALIDATION', `logs ${resubLogs} status ${txs.status}`);
    const after = await page.evaluate(() => document.body.innerText);
    rec('E2E-15b', 'Page confirms who has it and when', /Waiting for AO II/i.test(after) && /received/i.test(after), after.match(/Waiting for [^\n]{0,80}/)?.[0]);
    await page.screenshot({ path: path.join(QA, 'b5-after-resubmit.png') });
    // Narrow screen check of the checklist.
    await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
    await page.reload({ waitUntil: 'domcontentloaded' }); await new Promise(r => setTimeout(r, 3000));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.screenshot({ path: path.join(QA, 'b6-checklist-390.png') });
    rec('UX-03', 'Checklist has no sideways page scroll at 390 px', overflow <= 1, `overflow ${overflow}px`);
    rec('UX-04', 'No console errors during the correction flow', consoleErrors.filter(e => !/favicon|fonts\.g|net::ERR_(INTERNET_DISCONNECTED|FAILED)|Network Error/.test(e)).length === 0, consoleErrors.slice(0, 3).join(' | '));
  } catch (e) {
    blocked('E2E-11', 'Browser correction flow', e.message.slice(0, 200));
    // Complete the flow over the API so later checks can run.
    const tx = await db.transaction.findUnique({ where: { id: T.txA } });
    if (tx.status === 'DEFICIENCY') {
      const f = new FormData(); f.append('file', new Blob([await pdf('signed')], { type: 'application/pdf' }), 'signed.pdf'); f.append('requirementId', String(flawed.requirementTemplateId));
      await http(T.pA, 'POST', `/transactions/${T.txA}/documents`, { form: f }); await http(T.pA, 'PUT', `/transactions/${T.txA}/submit`);
    }
  } finally { await browser.close(); }
}

/** Same correction over the API, used when no browser is available. */
async function apiCorrection(flawed) {
  const f = new FormData(); f.append('file', new Blob([await pdf('signed')], { type: 'application/pdf' }), 'signed.pdf'); f.append('requirementId', String(flawed.requirementTemplateId));
  await http(T.pA, 'POST', `/transactions/${T.txA}/documents`, { form: f });
  rec('E2E-14', 'Replacing the file does not resubmit the transaction (API)', (await db.transaction.findUnique({ where: { id: T.txA } })).status === 'DEFICIENCY');
  await http(T.pA, 'PUT', `/transactions/${T.txA}/submit`);
}

async function authorizationProbes(flawed) {
  const aDoc = await db.personnelFile.findFirst({ where: { personnelId: T.pAid, storagePath: { not: null } } });
  const aTxDoc = await db.uploadedDocument.findFirst({ where: { transactionId: T.txA } });
  const leak = r => /Paula|Andres|personnel\.a@|pds\.pdf|\.pdf"/i.test(r.text);
  const probes = [
    ['AUTH-10', 'Personnel B reads A\'s 201 file', () => http(T.pB, 'GET', `/personnel/documents/${aDoc.id}/file`)],
    ['AUTH-11', 'Personnel B gets a view token for A\'s 201 file', () => http(T.pB, 'GET', `/personnel/documents/${aDoc.id}/view-token`)],
    ['AUTH-12', 'Personnel B deletes A\'s 201 file', () => http(T.pB, 'DELETE', `/personnel/documents/${aDoc.id}`)],
    ['AUTH-13', 'Personnel B opens A\'s transaction', () => http(T.pB, 'GET', `/transactions/${T.txA}`)],
    ['AUTH-14', 'Personnel B submits A\'s transaction', () => http(T.pB, 'PUT', `/transactions/${T.txA}/submit`)],
    ['AUTH-15', 'Personnel B downloads a document on A\'s transaction', () => http(T.pB, 'GET', `/documents/${aTxDoc.id}/file`)],
    ['AUTH-16', 'AO II B opens School A transaction', () => http(T.aoB, 'GET', `/transactions/${T.txA}`)],
    ['AUTH-17', 'AO II B downloads School A transaction document', () => http(T.aoB, 'GET', `/documents/${aTxDoc.id}/file`)],
    ['AUTH-18', 'AO II B runs the document check on School A document', () => http(T.aoB, 'GET', `/documents/${aTxDoc.id}/precheck`)],
    ['AUTH-19', 'AO II B reads School A 201 file', () => http(T.aoB, 'GET', `/personnel/documents/${aDoc.id}/file`)],
    ['AUTH-20', 'AO II B reads School A personnel record', () => http(T.aoB, 'GET', `/personnel/${T.pAid}`)],
    ['AUTH-21', 'AO II B reads School A service record', () => http(T.aoB, 'GET', `/personnel/${T.pAid}/service-record`)],
    ['AUTH-22', 'Personnel lists all accounts', () => http(T.pB, 'GET', '/users')],
    ['AUTH-23', 'Personnel reads the audit trail', () => http(T.pB, 'GET', '/audit-logs')],
    ['AUTH-24', 'HRMO opens System Administrator pages', () => http(T.hr, 'GET', '/admin/sessions')],
    ['AUTH-25', 'System Administrator makes an HR approval', () => http(T.sa, 'POST', `/transactions/${T.txA}/approve`, { body: { isApproved: true, notes: 'x' } })],
    ['AUTH-26', 'AO II gives final HR approval', () => http(T.aoA, 'POST', `/transactions/${T.txA}/approve`, { body: { isApproved: true, notes: 'x' } })],
    ['AUTH-27', 'Personnel B runs the reviewer document check on own-school file', () => http(T.pB, 'GET', `/personnel/documents/${aDoc.id}/precheck`)],
  ];
  for (const [id, label, fn] of probes) {
    const r = await fn();
    const refused = [401, 403, 404].includes(r.status) || (id === 'AUTH-25' || id === 'AUTH-26' ? r.status >= 400 : false);
    rec(id, `${label} is refused without leaking details`, refused && !leak(r), `status ${r.status}${leak(r) ? ' LEAK' : ''}`);
  }
  // Widening attempts through filters and search.
  const s1 = await http(T.aoB, 'GET', `/transactions?school=${encodeURIComponent(SCHOOL_A)}`);
  const s2 = await http(T.aoB, 'GET', '/transactions?search=Andres');
  const s3 = await http(T.aoB, 'GET', `/personnel?school=${encodeURIComponent(SCHOOL_A)}`);
  const s4 = await http(T.aoB, 'GET', '/transactions?queue=oldest&status=ALL&district=ALL');
  const hasA = r => JSON.stringify(r.json?.data || '').includes('Andres');
  rec('AUTH-30', 'AO II B cannot widen scope with school filter, search, personnel list or queue params', ![s1, s2, s3, s4].some(hasA), [s1, s2, s3, s4].map(r => `${r.status}:${(r.json?.data || []).length}`).join(' '));
  const cnt = s1.json?.counts || {};
  rec('AUTH-31', "AO II B's counts do not include School A work", (cnt.all ?? 0) === 0 || !hasA(s1), JSON.stringify(cnt));
  const pbList = await http(T.pB, 'GET', '/transactions');
  rec('AUTH-32', 'Personnel transaction list is limited to their own', !hasA(pbList), `status ${pbList.status}`);
  const pbNotes = await http(T.pB, 'GET', '/notifications?limit=100');
  rec('AUTH-33', "Personnel B's notifications contain nothing about A", !JSON.stringify(pbNotes.json?.data || []).includes('Andres'));
  const exp = await http(T.aoB, 'GET', '/audit-logs/export/csv');
  rec('AUTH-34', 'AO II B audit export does not include School A person', exp.status >= 400 || !/Andres|personnel\.a@/.test(exp.text), `status ${exp.status}`);
  // Direct link to a record that no longer exists.
  const gone = await http(T.pA, 'GET', '/transactions/999999');
  rec('REC-10', 'Direct link to a missing record gives a plain not-found', gone.status === 404 && /not found/i.test(gone.json?.message || ''), gone.json?.message);
}

/** Deadline and cancellation rules, run while Personnel B is still a Teacher I. */
async function cycleWindowProbes() {
  // Closed and cancelled cycles.
  const itC = await db.plantillaItem.create({ data: { itemNumber: 'QA-TCH2-C', positionTitle: 'Teacher II', salaryGrade: 12, department: SCHOOL_B, division: 'District 2' } });
  const rules = { track: 'TEACHING', targetPosition: 'Teacher II', salaryGrade: 12, school: SCHOOL_B, district: 'District 2', plantillaItemNumbers: [itC.itemNumber], vacantPositions: 1 };
  const past = await db.promotionCycle.create({ data: { name: 'QA closed', type: 'NATURAL_VACANCY', status: 'ACTIVE', startDate: new Date(Date.now() - 10 * 864e5), endDate: new Date(Date.now() - 3 * 864e5), rulesConfigurationJson: rules } });
  const late = await http(T.pB, 'POST', `/promotions/cycles/${past.id}/apply`, { body: { checklist: { items: [] } } });
  rec('REC-30', 'Applying after the deadline is refused with the closing date', late.status === 400 && /closed on/i.test(late.json?.message || ''), late.json?.message);
  const canc = await db.promotionCycle.create({ data: { name: 'QA cancelled', type: 'NATURAL_VACANCY', status: 'CANCELLED', startDate: new Date(Date.now() - 864e5), endDate: new Date(Date.now() + 5 * 864e5), rulesConfigurationJson: rules } });
  const cr = await http(T.pB, 'POST', `/promotions/cycles/${canc.id}/apply`, { body: { checklist: { items: [] } } });
  rec('REC-31', 'Applying to a cancelled cycle is refused', cr.status >= 400, `${cr.status} ${cr.json?.message}`);
}

async function recoveryProbes() {
  const big = Buffer.alloc(11 * 1024 * 1024, 0x25); big.write('%PDF-1.4', 0);
  const up = async (buf, name, type) => { const f = new FormData(); f.append('file', new Blob([buf], { type }), name); f.append('documentTypeId', 'TRAINING_CERT'); return http(T.pB, 'POST', '/personnel/documents', { form: f }); };
  const r1 = await up(big, 'big.pdf', 'application/pdf');
  rec('REC-20', 'Oversized 201 upload: 413 UPLOAD_TOO_LARGE with the real limit', r1.status === 413 && r1.json?.code === 'UPLOAD_TOO_LARGE' && /10 MB/.test(r1.json?.message || ''), `${r1.status} ${r1.json?.code} ${r1.json?.message}`);
  const r2 = await up(Buffer.from('hello'), 'notes.txt', 'text/plain');
  rec('REC-21', 'Unsupported 201 upload: 415 UPLOAD_UNSUPPORTED_TYPE naming accepted formats', r2.status === 415 && r2.json?.code === 'UPLOAD_UNSUPPORTED_TYPE' && /PDF, PNG or JPEG/.test(r2.json?.message || ''), `${r2.status} ${r2.json?.code} ${r2.json?.message}`);
  rec('REC-21b', 'Upload errors expose no stack trace or storage path', ![r1, r2].some(r => /\bat \w+ \(|node_modules|mem:\d|uploads\/|[A-Z]:\\/i.test(r.text)));
  // The same limits on the appointment transaction upload.
  const tx = await db.transaction.findFirst({ where: { personnelId: T.pBid } });
  if (tx) {
    const tpl = await db.requirementTemplate.findFirst({ where: { transactionTypeId: tx.transactionTypeId } });
    const upT = async (buf, name, type) => { const f = new FormData(); f.append('file', new Blob([buf], { type }), name); f.append('requirementId', String(tpl.id)); return http(T.pB, 'POST', `/transactions/${tx.id}/documents`, { form: f }); };
    const t1 = await upT(big, 'big.pdf', 'application/pdf'); const t2 = await upT(Buffer.from('hi'), 'a.txt', 'text/plain');
    rec('REC-25', 'Appointment upload gives the same 413 / 415 codes', t1.status === 413 && t2.status === 415, `${t1.status} ${t1.json?.code}; ${t2.status} ${t2.json?.code}`);
  } else rec('REC-25', 'Appointment upload error codes', false, 'no transaction for Personnel B yet', 'NOT TESTED');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const okPng = await up(png, 'seminar.png', 'image/png');
  rec('REC-26', 'A valid PNG uploads', okPng.status === 201, `${okPng.status}`);
  const r3 = await up(Buffer.from('this is not a pdf at all'), 'fake.pdf', 'application/pdf');
  rec('REC-22', 'A corrupted/fake PDF is refused', r3.status >= 400 && r3.status < 500, `${r3.status} ${r3.json?.message}`);
  const r4 = await up(Buffer.alloc(0), 'empty.pdf', 'application/pdf');
  rec('REC-23', 'An empty file is refused', r4.status >= 400 && r4.status < 500, `${r4.status} ${r4.json?.message}`);
  const orphans = await db.personnelFile.count({ where: { personnelId: T.pBid, originalFileName: { in: ['big.pdf', 'notes.txt', 'fake.pdf', 'empty.pdf'] } } });
  rec('REC-24', 'Refused uploads leave no database rows', orphans === 0, `${orphans} rows`);
  // Email failure is visible to the administrator and did not block the work.
  const { processWorkflowOutbox } = require(BACKEND + '/src/services/workflow-outbox.service');
  await processWorkflowOutbox().catch(() => {});
  const emailList = await http(T.sa, 'GET', '/admin/operations/email?limit=100');
  const states = [...new Set((emailList.json?.data || []).map(e => e.state))];
  rec('DIAG-02', 'Email list response', true, `status ${emailList.status} rows ${(emailList.json?.data || []).length} total ${emailList.json?.pagination?.totalItems} outboxRows ${await db.workflowOutbox.count()} processed ${await db.workflowOutbox.count({ where: { processedAt: { not: null } } })} msg ${emailList.json?.message || ''}`, 'INFO');
  const allEmail = await http(T.sa, 'GET', '/admin/operations/email?state=ALL&limit=100');
  const allStates = [...new Set((allEmail.json?.data || []).map(e => e.state))];
  rec('OPS-02', 'Queued email is listed as PENDING, never SENT, when delivery has not run', !allStates.includes('SENT') && allStates.includes('PENDING'), `ALL view states ${allStates.join(',')}; default view rows ${(emailList.json?.data || []).length}`);
  rec('OPS-02b', 'Delivery failure and exhausted retries (delivery disabled outside production)', false, 'Outbox delivery only runs in production; covered by seeded rows in system-admin-http.cjs', 'NOT TESTED');
  rec('OPS-03', 'Email list masks recipients and shows no payload', !/personnel\.a@qa\.test|initialPassword|setup-account\?token/.test(emailList.text));
  const health = await http(T.sa, 'GET', '/admin/operations/health');
  const hc = (health.json?.data?.checks || []).map(c => `${c.key}:${c.status}`);
  rec('DIAG-03', 'Health response', true, `status ${health.status} ${hc.join(' ')} ${health.json?.message || ''}`, 'INFO');
  rec('OPS-04', 'Service health reports unconfigured email and missing backup evidence honestly', hc.some(c => /^email:(NOT_CONFIGURED|DEGRADED|UNAVAILABLE)/.test(c)) && hc.some(c => /^backup:(UNKNOWN|UNAVAILABLE)/.test(c)), hc.join(' '));
}

async function escalationPath() {
  // Personnel B, School B: AO II B returns the same transaction three times; the fourth
  // resubmission escalates to HRMO under the established policy. Can HRMO finish it?
  const it = await db.plantillaItem.create({ data: { itemNumber: 'QA-TCH2-B', positionTitle: 'Teacher II', salaryGrade: 12, department: SCHOOL_B, division: 'District 2' } });
  const cB = await http(T.hr, 'POST', '/promotions/cycles', { body: { name: 'QA Teacher II School B', type: 'NATURAL_VACANCY', startDate: new Date(Date.now() - 864e5).toISOString(), endDate: new Date(Date.now() + 7 * 864e5).toISOString(), status: 'ACTIVE',
    rulesConfigurationJson: { track: 'TEACHING', targetPosition: 'Teacher II', salaryGrade: 12, school: SCHOOL_B, district: 'District 2', plantillaItemNumbers: [it.itemNumber], vacantPositions: 1 } } });
  const { ANNEX_C_REQUIREMENTS, MANDATORY_ANNEX_C_CODES } = require(BACKEND + '/src/utils/annex-c.util');
  const ids = {}; const items = [];
  for (const r of ANNEX_C_REQUIREMENTS) {
    const t = r.suggestedDocumentTypeIds[0];
    if (MANDATORY_ANNEX_C_CODES.includes(r.code) && t && t !== 'OTHER') {
      if (!ids[t]) { const f = new FormData(); f.append('file', new Blob([await pdf(t)], { type: 'application/pdf' }), `${t}.pdf`); f.append('documentTypeId', t); ids[t] = (await http(T.pB, 'POST', '/personnel/documents', { form: f })).json?.data?.id; }
      items.push({ code: r.code, personnelDocumentId: ids[t], submitted: true });
    } else items.push({ code: r.code, submitted: false });
  }
  const ap = await http(T.pB, 'POST', `/promotions/cycles/${cB.json.data.id}/apply`, { body: { checklist: { items } } });
  const appId = ap.json?.data?.id; const base = `/promotions/cycles/${cB.json.data.id}/applications/${appId}`;
  // Replace a 201 file that the application references: the application must keep its evidence.
  const refId = items.find(i => i.submitted).personnelDocumentId;
  const f = new FormData(); f.append('file', new Blob([await pdf('newer version')], { type: 'application/pdf' }), 'newer.pdf');
  const rep = await http(T.pB, 'PUT', `/personnel/documents/${refId}`, { form: f });
  const old = await http(T.aoB, 'GET', `/personnel/documents/${refId}/file`);
  rec('DATA-01', 'After the person replaces a 201 file, the reviewer can still open the version the application referenced', rep.status < 300 && old.status === 200, `replace ${rep.status}, reviewer opens old ${old.status}`);
  await http(T.aoB, 'POST', `${base}/verify-requirements`, { body: { status: 'COMPLETE' } });
  await http(T.hr, 'POST', `${base}/final-rating`, { body: { track: 'TEACHING', educationScore: 10, trainingScore: 9, experienceScore: 9, performanceScore: 28, ppstCoiScore: 23, ppstNcoiScore: 14, remarks: 'QA' } });
  await http(T.hr, 'POST', `/promotions/cycles/${cB.json.data.id}/generate-ranking`);
  await http(T.hr, 'POST', `${base}/select-promotion`, { body: { isPromoted: true, plantillaItemNumber: it.itemNumber } });
  const tx = Number((await db.promotionApplication.findUnique({ where: { id: appId } }))?.scoreDetailsJson?.transactionId);
  if (!Number.isInteger(tx)) { blocked('BIZ-10', 'Escalation path', 'could not reach an appointment transaction for Personnel B'); return; }
  const tpl = await db.requirementTemplate.findMany({ where: { transactionType: { name: 'Promotion' }, isMandatory: true } });
  await http(T.pB, 'POST', `/transactions/${tx}/documents/auto-attach`);
  const have = new Set((await db.uploadedDocument.findMany({ where: { transactionId: tx } })).map(d => d.requirementTemplateId));
  for (const t of tpl.filter(t => !have.has(t.id))) { const g = new FormData(); g.append('file', new Blob([await pdf(t.name)], { type: 'application/pdf' }), 'r.pdf'); g.append('requirementId', String(t.id)); await http(T.pB, 'POST', `/transactions/${tx}/documents`, { form: g }); }
  await http(T.pB, 'PUT', `/transactions/${tx}/submit`);
  let lastStatus = '';
  for (let round = 1; round <= 4; round++) {
    const docs = await db.uploadedDocument.findMany({ where: { transactionId: tx } });
    const bad = docs[0];
    const r = await http(T.aoB, 'POST', `/transactions/${tx}/validate`, { body: { targetStatus: 'DEFICIENCY', remarks: `Round ${round}: blurred`, documentValidations: docs.map(d => ({ documentId: d.id, isValid: d.id !== bad.id, feedback: d.id === bad.id ? 'Blurred' : 'ok' })) } });
    if (r.status !== 200) { lastStatus = `AO return round ${round} -> ${r.status} ${r.json?.message}`; break; }
    const g = new FormData(); g.append('file', new Blob([await pdf(`fix ${round}`)], { type: 'application/pdf' }), 'fix.pdf'); g.append('requirementId', String(bad.requirementTemplateId));
    await http(T.pB, 'POST', `/transactions/${tx}/documents`, { form: g });
    const s = await http(T.pB, 'PUT', `/transactions/${tx}/submit`);
    lastStatus = `round ${round}: ${s.json?.data?.status}`;
    if (s.json?.data?.status === 'FOR_APPROVAL') break;
  }
  const esc = await db.transaction.findUnique({ where: { id: tx }, include: { uploadedDocuments: true } });
  rec('BIZ-10', 'Repeated returns escalate to HRMO as documented (BR-27)', esc.status === 'FOR_APPROVAL', `${lastStatus}; now ${esc.status}`);
  if (esc.status !== 'FOR_APPROVAL') return;
  // Policy (confirmed): HRMO reviews and returns with instructions; corrected files go
  // to AO II for validation; HRMO approves after that. Nothing skips AO II.
  const hrView = await http(T.hr, 'GET', `/transactions/${tx}`);
  rec('ESC-01', 'Escalated item is marked and tells HRMO the next step', Boolean(hrView.json?.data?.escalatedAt) && /return the files that need fixing/i.test(hrView.json?.data?.remarks || ''), hrView.json?.data?.remarks);
  const pView = await http(T.pB, 'GET', `/transactions/${tx}`);
  rec('ESC-01b', 'Personnel can see it is escalated (drives "With HRMO after repeated corrections")', Boolean(pView.json?.data?.escalatedAt) && !pView.json?.data?.escalationReviewedAt);
  const unvalidated = esc.uploadedDocuments.filter(d => d.status !== 'VALIDATED');
  const early = await http(T.hr, 'POST', `/transactions/${tx}/approve`, { body: { isApproved: true, notes: 'Escalated review' } });
  rec('ESC-02', 'HRMO cannot approve unvalidated files; the refusal names the next step', early.status === 409 && /Return the files that need fixing/i.test(early.json?.message || ''), `${early.status}: ${early.json?.message}`);
  const ret = await http(T.hr, 'POST', `/transactions/${tx}/approve`, { body: { isApproved: false, decision: 'RETURN_FOR_CORRECTION', deficientDocumentIds: unvalidated.map(d => d.id), notes: 'Scan the original at 300 dpi; the seal must be readable.' } });
  const afterRet = await db.transaction.findUnique({ where: { id: tx } });
  rec('ESC-03', 'HRMO returns the problem file with instructions; the review is recorded', ret.status === 200 && afterRet.status === 'DEFICIENCY' && Boolean(afterRet.escalationReviewedAt), `${ret.status}, ${afterRet.status}`);
  const note = await db.notification.findFirst({ where: { user: { email: 'personnel.b@qa.test' }, relatedEntityId: tx, message: { contains: '300 dpi' } } });
  rec('ESC-04', "Personnel is told HRMO's instructions", Boolean(note), note?.message?.slice(0, 160));
  for (const d of unvalidated) { const g = new FormData(); g.append('file', new Blob([await pdf('clear scan')], { type: 'application/pdf' }), 'clear.pdf'); g.append('requirementId', String(d.requirementTemplateId)); await http(T.pB, 'POST', `/transactions/${tx}/documents`, { form: g }); }
  const rs = await http(T.pB, 'PUT', `/transactions/${tx}/submit`);
  const qB = await http(T.aoB, 'GET', '/transactions?queue=awaiting');
  rec('ESC-05', 'The correction goes to AO II (not straight back to HRMO) and is in AO II B\'s queue', rs.json?.data?.status === 'PENDING_VALIDATION' && qB.json?.data?.some(t => t.id === tx), `resubmit -> ${rs.json?.data?.status}`);
  const docs2 = await db.uploadedDocument.findMany({ where: { transactionId: tx } });
  const stale = await http(T.aoB, 'POST', `/transactions/${tx}/validate`, { body: { targetStatus: 'FOR_APPROVAL', remarks: 'x', documentValidations: docs2.slice(1).map(d => ({ documentId: d.id, isValid: true })) } });
  rec('REC-40', 'A validation that leaves out a document (stale screen) is refused', stale.status >= 400 && stale.status < 500, `${stale.status} ${stale.json?.message}`);
  const v2 = await http(T.aoB, 'POST', `/transactions/${tx}/validate`, { body: { targetStatus: 'FOR_APPROVAL', remarks: 'Validated after HRMO review', documentValidations: docs2.map(d => ({ documentId: d.id, isValid: true })) } });
  const again = await http(T.aoB, 'POST', `/transactions/${tx}/validate`, { body: { targetStatus: 'FOR_APPROVAL', remarks: 'late', documentValidations: docs2.map(d => ({ documentId: d.id, isValid: true })) } });
  rec('REC-41', 'A second validation after the item moved on is refused, not re-applied', again.status >= 400 && again.status < 500, `${again.status} ${again.json?.message}`);
  const fin = await http(T.hr, 'POST', `/transactions/${tx}/approve`, { body: { isApproved: true, notes: 'Approved after escalation' } });
  const finalTx = await db.transaction.findUnique({ where: { id: tx } });
  rec('ESC-06', 'AO II validates the correction and HRMO gives final approval', v2.status === 200 && fin.status === 200 && finalTx.status === 'APPROVED', `validate ${v2.status}, approve ${fin.status}: ${fin.json?.message || ''}`);
  const revs = await db.documentRevision.count({ where: { document: { transactionId: tx } } });
  const returns = await db.validationLog.count({ where: { entityType: 'Transaction', entityId: tx, action: { in: ['TRANSACTION_VALIDATED', 'HRMO_RETURNED_FOR_CORRECTION', 'TRANSACTION_RESUBMITTED', 'TRANSACTION_ESCALATED_TO_HRMO'] } } });
  rec('ESC-07', 'Correction history and every earlier file version are kept', revs >= 4 && returns >= 6, `${revs} earlier versions, ${returns} review/resubmission entries`);
}

async function roleSmoke() {
  if (!process.env.CHROME_PATH) { rec('SMOKE', 'Page checks per role', false, 'CHROME_PATH not set', 'NOT TESTED'); return; }
  let puppeteer; try { puppeteer = require(process.env.QA_PUPPETEER || 'puppeteer-core'); } catch { rec('SMOKE', 'Page checks per role', false, 'puppeteer-core not installed', 'NOT TESTED'); return; }
  const plan = [
    ['personnel.a@qa.test', 'Personnel', ['/personnel/home', '/personnel/documents', '/personnel/transactions', '/personnel/notifications', '/personnel/service-record', '/personnel/profile']],
    ['ao.a@qa.test', 'AO II', ['/admin/dashboard', '/admin/transactions', '/admin/documents', '/admin/personnel', '/admin/credentials', '/admin/promotions', '/admin/notifications']],
    ['hrmo@qa.test', 'HRMO', ['/admin/dashboard', '/admin/transactions', '/admin/approvals', '/admin/personnel', '/admin/plantilla', '/admin/compliance', '/admin/promotions', '/admin/notifications']],
    ['sysadmin@qa.test', 'System Administrator', ['/admin/dashboard', '/admin/credentials', '/admin/access', '/admin/settings', '/admin/health', '/admin/email', '/admin/audit', '/admin/reports']],
  ];
  for (const width of [1440, 390]) {
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: 'new', defaultViewport: width < 500 ? { width, height: 844, isMobile: true, deviceScaleFactor: 2 } : { width, height: 900 } });
    for (const [email, role, pages] of plan) {
      const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
      const bad = []; const errs = [];
      page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) bad.push(`${r.status()} ${r.url().replace(baseUrl, '').split('?')[0]}`); });
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 120)); });
      page.on('dialog', d => d.accept().catch(() => {}));
      await page.goto(baseUrl + '/login', { waitUntil: 'domcontentloaded' });
      await page.type('input[type=email]', email); await page.type('input[type=password]', PASSWORD); await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 2500));
      const code = await page.$('input[autocomplete="one-time-code"], input[inputmode="numeric"]');
      if (code) { await code.type('424242'); await page.keyboard.press('Enter'); await new Promise(r => setTimeout(r, 2500)); }
      const overflow = []; const allBad = []; const allErrs = [];
      for (const p of pages) {
        await page.goto(baseUrl + p, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        // Requests cancelled by leaving the previous page log errors as this one starts; ignore those.
        await new Promise(r => setTimeout(r, 1500)); errs.length = 0; // cancelled requests have no API status, so bad[] is kept
        await new Promise(r => setTimeout(r, 4500));
        await page.keyboard.press('Escape').catch(() => {});
        const ow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 0);
        if (ow > 1) overflow.push(`${p} +${ow}px`);
        allBad.push(...bad.map(b => `${b} (${p})`)); allErrs.push(...errs.map(e => `${e} (${p})`));
        if (width < 500) await page.screenshot({ path: path.join(QA, `m-${role.replace(/\W/g, '')}-${p.split('/').pop()}.png`) }).catch(() => {});
      }
      const uniq = [...new Set(allBad)];
      rec(`SMOKE-${role}-${width}`, `${role}: every menu page loads at ${width}px without failed API calls, script errors or sideways scroll`, uniq.length === 0 && allErrs.length === 0 && overflow.length === 0, `api: ${uniq.join(', ') || 'ok'}; errors: ${allErrs.slice(0, 3).join(' | ') || 'none'}; overflow: ${overflow.join(', ') || 'none'}`);
      await ctx.close();
    }
    await browser.close();
  }
}

async function sessionProbes() {
  // Deactivated account loses access with an existing token.
  const bUser = await db.user.findFirst({ where: { email: 'personnel.b@qa.test' } });
  const before = await http(T.pB, 'GET', '/personnel/me');
  const deact = await http(T.sa, 'PUT', `/users/${bUser.id}`, { body: { accountStatus: 'INACTIVE' } });
  await new Promise(r => setTimeout(r, 300));
  const after = await http(T.pB, 'GET', '/personnel/me');
  rec('AUTH-40', 'A deactivated account loses access with its existing token', before.status === 200 && deact.status === 200 && after.status === 401, `before ${before.status}, deactivate ${deact.status}, after ${after.status}`);
  const relog = await login('personnel.b@qa.test');
  rec('AUTH-41', 'A deactivated account cannot sign in again', relog.status !== 200, `status ${relog.status}`);
  // Revoked sessions.
  const aUser = await db.user.findFirst({ where: { email: 'personnel.a@qa.test' } });
  const rv = await http(T.sa, 'DELETE', `/admin/accounts/${aUser.id}/sessions`, { body: { reason: 'QA sign-out check', confirmOwn: false } });
  await new Promise(r => setTimeout(r, 11000)); // the session cache is 10 s
  const aAfter = await http(T.pA, 'GET', '/personnel/me');
  rec('AUTH-42', 'Signing a person out everywhere ends their current session', rv.status === 200 && aAfter.status === 401, `revoke ${rv.status}, after ${aAfter.status} ${aAfter.json?.code || ''}`);
}

main().catch(e => { console.error('QA RUN CRASHED', e); fs.writeFileSync(path.join(QA, 'results.json'), JSON.stringify({ crashed: String(e.stack), results }, null, 2)); process.exit(1); });

// ── Blocker 1: setup-email invitations under concurrency, retry and resend ───
async function invitationRegression(mk, uid) {
  const inviteRows = async email => (await db.workflowOutbox.findMany({ orderBy: { createdAt: 'desc' } }))
    .filter(r => r.payload?.recipientEmail === email && r.payload?.actionUrl?.includes('setup-account'));
  // a) Two simultaneous requests: one invitation, and it works (link) — second account proves the temp password.
  const u1 = await mk('inv1@qa.test', 'HRMO', 'Ivy', 'One', {});
  const r1 = await Promise.all([1, 2].map(() => http(T.sa, 'POST', `/users/${uid(u1)}/distribute-credentials`)));
  const codes = r1.map(r => r.status).sort();
  const inv1 = await outboxInvite('inv1@qa.test');
  // b) Retry after a response timeout: the account is already invited.
  const retry = await http(T.sa, 'POST', `/users/${uid(u1)}/distribute-credentials`);
  const invAfterRetry = await outboxInvite('inv1@qa.test');
  rec('INV-01', 'Two simultaneous setup-email requests: one 200, one 409, one queued email, no 500', codes[0] === 200 && codes[1] === 409 && (await inviteRows('inv1@qa.test')).length === 1, `statuses ${codes}; ${r1.find(r => r.status === 409)?.json?.code}`);
  rec('INV-02', 'Retry after a timeout says it was already sent and keeps the invitation valid', retry.status === 409 && retry.json?.code === 'INVITATION_ALREADY_SENT' && invAfterRetry?.token === inv1?.token, `${retry.status} ${retry.json?.message}`);
  const link1 = await http(null, 'POST', '/auth/complete-setup', { body: { token: inv1.token, newPassword: PASSWORD } });
  rec('INV-03', 'The resulting setup link sets a password and signs in', link1.status === 200 && Boolean(link1.json?.data?.accessToken), `status ${link1.status}`);
  const u2 = await mk('inv2@qa.test', 'HRMO', 'Ivan', 'Two', {});
  await Promise.all([1, 2].map(() => http(T.sa, 'POST', `/users/${uid(u2)}/distribute-credentials`)));
  const inv2 = await outboxInvite('inv2@qa.test');
  const temp2 = await login('inv2@qa.test', inv2.temp);
  rec('INV-04', 'After simultaneous requests the emailed temporary password still works (forced change only)', temp2.status === 200 && (await http(tok(temp2), 'GET', '/promotions/cycles')).status === 403, `login ${temp2.status}`);
  // c) Resend while the first email is still waiting to be delivered.
  const u3 = await mk('inv3@qa.test', 'HRMO', 'Iris', 'Three', {});
  await http(T.sa, 'POST', `/users/${uid(u3)}/distribute-credentials`);
  const old3 = await outboxInvite('inv3@qa.test');
  const tooSoon = await http(T.sa, 'POST', `/users/${uid(u3)}/resend-invitation`);
  rec('INV-05', 'Resend within two minutes of a pending email is refused and the pending one stays valid', tooSoon.status === 409 && (await outboxInvite('inv3@qa.test'))?.token === old3.token, `${tooSoon.status} ${tooSoon.json?.code}`);
  await db.workflowOutbox.updateMany({ where: { id: old3.row.id }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } }); // fixture: the email has waited 5 minutes
  const rs3 = await http(T.sa, 'POST', `/users/${uid(u3)}/resend-invitation`);
  const rows3 = await inviteRows('inv3@qa.test');
  const new3 = await outboxInvite('inv3@qa.test');
  const oldLink = await http(null, 'POST', '/auth/complete-setup', { body: { token: old3.token, newPassword: PASSWORD } });
  const newLink = await http(null, 'POST', '/auth/complete-setup', { body: { token: new3.token, newPassword: PASSWORD } });
  rec('INV-06', 'Resend while pending replaces the undelivered email (only the new one can be sent)', rs3.status === 200 && rows3.length === 1 && rows3[0].id !== old3.row.id, `resend ${rs3.status}; queued invitations ${rows3.length}`);
  rec('INV-07', 'After an intentional resend the old link is invalid and the new link works', oldLink.status !== 200 && newLink.status === 200, `old ${oldLink.status}, new ${newLink.status}`);
  // d) Resend after delivery failed (retries exhausted) is allowed at once.
  const u4 = await mk('inv4@qa.test', 'HRMO', 'Iggy', 'Four', {});
  await http(T.sa, 'POST', `/users/${uid(u4)}/distribute-credentials`);
  const old4 = await outboxInvite('inv4@qa.test');
  await db.workflowOutbox.update({ where: { id: old4.row.id }, data: { attempts: 8, lastError: 'QA fixture: provider rejected' } });
  const onbF = await http(T.sa, 'GET', `/users/${uid(u4)}/onboarding`);
  const rs4 = await http(T.sa, 'POST', `/users/${uid(u4)}/resend-invitation`);
  const new4 = await outboxInvite('inv4@qa.test');
  const link4 = await http(null, 'POST', '/auth/complete-setup', { body: { token: new4.token, newPassword: PASSWORD } });
  rec('INV-08', 'After a failed delivery: shown as could-not-be-sent, resend allowed at once, new link works', onbF.json?.data?.invitation?.state === 'FAILED' && rs4.status === 200 && link4.status === 200, `state ${onbF.json?.data?.invitation?.state}; resend ${rs4.status}; link ${link4.status}`);
  const leaked = [...r1, retry, tooSoon, rs3, rs4, onbF].some(r => /initialPassword|setup-account\?token|Temp#|"password"/.test(r.text));
  rec('INV-09', 'No response carries a password or setup link', !leaked);
}

// ── Browser helpers for the regression checks ────────────────────────────────
async function withBrowser(fn, viewport = { width: 1440, height: 900 }) {
  let puppeteer; try { puppeteer = require(process.env.QA_PUPPETEER || 'puppeteer-core'); } catch { return 'no-browser'; }
  if (!process.env.CHROME_PATH) return 'no-browser';
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: 'new', defaultViewport: viewport });
  try { return await fn(browser); } catch (e) { return e; } finally { await browser.close(); }
}
async function browserLogin(page, email) {
  await page.goto(baseUrl + '/login', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.type('input[type=email]', email); await page.type('input[type=password]', PASSWORD); await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 2500));
  const code = await page.$('input[autocomplete="one-time-code"], input[inputmode="numeric"]');
  if (code) { await code.type('424242'); await page.keyboard.press('Enter'); await new Promise(r => setTimeout(r, 2500)); }
}
const bodyText = page => page.evaluate(() => document.body.innerText);
// Full loads of this single-page app occasionally stall in headless Chrome; fall back to
// in-app navigation (what a click on a link does) so a stalled load is not a false failure.
const visit = async (page, p, ms = 3500) => {
  try { await page.goto(baseUrl + p, { waitUntil: 'domcontentloaded', timeout: 15000 }); }
  catch { await page.evaluate(to => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, p).catch(() => {}); }
  await new Promise(r => setTimeout(r, ms)); return bodyText(page);
};
const oneLine = (t, re) => (t.match(re)?.[0] || '').replace(/\s+/g, ' ');

/** Blockers 3 and 4: the Applications page and Home show promotion applications with their stage. */
async function browserApplications(phase) {
  const r = await withBrowser(async browser => {
    const page = await browser.newPage();
    page.on('dialog', d => d.accept().catch(() => {}));
    await browserLogin(page, 'personnel.a@qa.test');
    const apps = await visit(page, '/personnel/transactions');
    await page.screenshot({ path: path.join(QA, `app-${phase}.png`) });
    if (phase === 'submitted') {
      rec('APP-01', 'Applications page lists the promotion application while it waits for AO II',
        /Waiting for review/i.test(apps) && /Promotion application/i.test(apps) && /Waiting for AO II to check requirements/.test(apps) && /Teacher II/.test(apps), oneLine(apps, /Waiting for review[\s\S]{0,220}/));
      await page.evaluate(() => [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/personnel/home')?.click());
      await new Promise(r => setTimeout(r, 7000));
      const home = await bodyText(page);
      await page.screenshot({ path: path.join(QA, 'app-home.png') });
      rec('APP-02', 'Home says the application is under review instead of "No active transactions"',
        /Your applications/.test(home) && /Waiting for AO II to check requirements/.test(home) && !/No Active Transactions/i.test(home), oneLine(home, /Your applications[\s\S]{0,200}/));
      rec('APP-03', 'Home lists it under "With a reviewer" with who has it', /With a reviewer[\s\S]{0,400}AO II/.test(home));
      const phone = await browser.newPage();
      await phone.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
      await browserLogin(phone, 'personnel.a@qa.test');
      await visit(phone, '/personnel/transactions', 5000);
      const ow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await phone.screenshot({ path: path.join(QA, `app-${phase}-390.png`) });
      rec('APP-04', 'Applications page has no sideways scroll at 390 px', ow <= 1, `overflow ${ow}px`);
    } else {
      const entries = (apps.match(/Promotion to Teacher II/g) || []).length;
      rec('APP-05', 'After appointment: one History entry (not duplicated) that says Approved by HRMO',
        /History/i.test(apps) && entries === 1 && /Approved by HRMO/.test(apps) && /TRX-/.test(apps), `${entries} entries; ${oneLine(apps, /History[\s\S]{0,200}/)}`);
      rec('APP-06', 'Nothing left under "You need to act"', !/You need to act\s*[1-9]/i.test(apps), oneLine(apps, /You need to act[\s\S]{0,40}/));
    }
    return 'ok';
  });
  if (r === 'no-browser') rec(`APP-${phase}`, 'Applications page in the browser', false, 'no browser available', 'NOT TESTED');
  if (r instanceof Error) blocked(`APP-${phase}`, 'Applications page in the browser', r.message.slice(0, 160));
}

/** Account switching and a session that ends mid-task. */
async function browserSessions() {
  // Page checks signed the administrator in several times; the session limit ended the
  // script's own session. Sign in again so the sign-out and deactivation calls take effect.
  T.sa = tok(await login('sysadmin@qa.test'));
  const r = await withBrowser(async browser => {
    const page = await browser.newPage();
    page.on('dialog', d => d.accept().catch(() => {}));
    await browserLogin(page, 'personnel.a@qa.test');
    const aText = await visit(page, '/personnel/transactions');
    // Sign out through the sidebar user menu (and its confirmation, if shown).
    const card = await page.$('.shell-user-card'); if (card) await card.click();
    await new Promise(r => setTimeout(r, 800));
    await page.evaluate(() => { [...document.querySelectorAll('button, a, [role=menuitem]')].find(x => /^\s*Sign Out\s*$/i.test(x.innerText))?.click(); });
    await new Promise(r => setTimeout(r, 1200));
    await page.evaluate(() => { [...document.querySelectorAll('[role=dialog] button, .modal button')].find(x => /sign out|log out|yes/i.test(x.innerText))?.click(); });
    await new Promise(r => setTimeout(r, 2500));
    const signedOut = page.url().includes('/login');
    await browserLogin(page, 'personnel.b@qa.test');
    const texts = [await visit(page, '/personnel/home'), await visit(page, '/personnel/transactions'), await visit(page, '/personnel/notifications')].join('\n');
    const store = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    rec('SES-01', "Switching accounts in one browser shows none of the previous person's data",
      signedOut && /Teacher II/.test(aText) && !/Andres|Paula/.test(texts) && !/Andres|Paula/.test(store), `signed out ${signedOut}; in page ${/Andres|Paula/.test(texts)}; in storage ${/Andres|Paula/.test(store)}`);
    // The session ends (an administrator signs the person out) while they are on a page.
    await visit(page, '/personnel/documents');
    const bUser = await db.user.findFirst({ where: { email: 'personnel.b@qa.test' } });
    await http(T.sa, 'DELETE', `/admin/accounts/${bUser.id}/sessions`, { body: { reason: 'QA session-expiry check', confirmOwn: false } });
    await new Promise(r => setTimeout(r, 11500));
    await page.evaluate(() => { [...document.querySelectorAll('a')].find(x => x.getAttribute('href') === '/personnel/transactions')?.click(); });
    await new Promise(r => setTimeout(r, 5000));
    const url = page.url(); const t = await bodyText(page);
    await page.screenshot({ path: path.join(QA, 'ses-expired.png') });
    rec('SES-02', 'An ended session sends the person to sign in, not to a broken page', url.includes('/login'), `${url.replace(baseUrl, '')} :: ${t.slice(0, 160).replace(/\s+/g, ' ')}`);
    await browserLogin(page, 'personnel.b@qa.test');
    const back = await visit(page, '/personnel/transactions');
    rec('SES-03', 'After signing in again the page works', /Applications/.test(back) && !page.url().includes('/login'));
    return 'ok';
  });
  if (r === 'no-browser') rec('SES', 'Account switching and session expiry', false, 'no browser available', 'NOT TESTED');
  if (r instanceof Error) blocked('SES', 'Account switching and session expiry', r.message.slice(0, 160));
  T.pB = tok(await login('personnel.b@qa.test')); // later API checks need a live token
}
