// A local test bench for the HR-direct review workflow, seat handover and personnel view.
//
// Boots the REAL app and API on a throwaway local database with HR_DIRECT_REVIEW switched on,
// seeds synthetic people, and serves the built website plus a landing page from one port, so
// you can click through the actual screens. Nothing here touches your dev or production data:
// the database must be local and end in _test, files live in memory, and no email is sent.
//
//   npm --prefix web run build          (once, so web/dist is current)
//   QA_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55442/d201_playground_test \
//     node backend/tests/qa/hr-direct-playground.cjs
//   then open http://127.0.0.1:5097/playground
const path = require('path'), fs = require('fs'), os = require('os');
const BACKEND = path.resolve(__dirname, '../..');
const WEB_DIST = path.resolve(BACKEND, '../web/dist');
const DB = process.env.QA_DATABASE_URL || 'postgresql://postgres:test@127.0.0.1:55442/d201_playground_test';
const dbUrl = new URL(DB);
if (!['localhost', '127.0.0.1'].includes(dbUrl.hostname) || !/_test$/.test(dbUrl.pathname)) {
  console.error('Refusing to run: QA_DATABASE_URL must be a local database whose name ends in _test.'); process.exit(2);
}
if (process.env.NODE_ENV === 'production') { console.error('Refusing to run: NODE_ENV=production.'); process.exit(2); }
if (!fs.existsSync(path.join(WEB_DIST, 'index.html'))) { console.error('web/dist is missing. Run: npm --prefix web run build'); process.exit(2); }
const DB_NAME = dbUrl.pathname.slice(1);
const ROOT_DB = Object.assign(new URL(DB), { pathname: '/postgres' }).href;
const PORT = Number(process.env.QA_PORT || 5097);
const PASSWORD = 'Qa#Readiness2026!';
const CODE = '424242';

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'd201-playground-'))); // no .env here
Object.assign(process.env, {
  DATABASE_URL: DB, DIRECT_URL: DB, NODE_ENV: 'test', HR_DIRECT_REVIEW: 'on',
  JWT_ACCESS_SECRET: 'playground-access-only-0123456789', JWT_REFRESH_SECRET: 'playground-refresh-only-0123456789',
  RATE_LIMIT_MAX_REQUESTS: '100000', LOGIN_RATE_LIMIT_MAX: '1000', CLIENT_URL: `http://127.0.0.1:${PORT}`, CORS_ORIGIN: `http://127.0.0.1:${PORT}`,
  DEVICE_CODE_FOR_TESTS: CODE,
  SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', SMTP_PORT: '', MAILTRAP_API_TOKEN: '', EMAIL_FROM: '',
  SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', DOCUMENT_STORAGE: 'local', OCR_PROVIDER: '', BACKUP_REPORT_TOKEN: '',
});
require(BACKEND + '/node_modules/ts-node').register({ transpileOnly: true, project: BACKEND + '/tsconfig.json' });
const { execFileSync } = require('child_process');
const req = m => require(require.resolve(m, { paths: [BACKEND] }));
const client = req('@prisma/client');
const { PDFDocument, StandardFonts } = require(require.resolve('pdf-lib', { paths: [path.resolve(BACKEND, '../web'), BACKEND] }));
const stub = (rel, exports) => { const f = require.resolve(BACKEND + '/src/' + rel); require.cache[f] = { id: f, filename: f, loaded: true, exports }; };
const objects = new Map(); let seq = 0;
stub('services/document-storage.service', {
  MISSING_FILE_MESSAGE: 'missing',
  async storeDocument(b) { const k = `mem:${++seq}`; objects.set(k, Buffer.from(b)); return k; },
  async readDocument(k) { if (!objects.has(k)) throw Object.assign(new Error('missing'), { statusCode: 404 }); return objects.get(k); },
  async discardUncommittedDocument(k) { objects.delete(k); },
  async checkStorageHealth() { return { name: 'Document storage', status: 'OPERATIONAL', detail: 'Playground in-memory store.' }; },
});
stub('services/tesseract-ocr.service', { extractWithTesseract: async () => { throw new Error('OCR unavailable in the playground'); }, parseOcrLabeledFields: () => [], mapOcrFormFields: () => ({}) });

const MORALES = 'Morales Elementary School', MATULAS = 'Matulas Elementary School';
async function samplePdf(title) {
  const d = await PDFDocument.create(); const p = d.addPage([612, 792]); const f = await d.embedFont(StandardFonts.Helvetica);
  p.drawText(title, { x: 60, y: 720, size: 18, font: f });
  p.drawText('Synthetic test document - not a real record.', { x: 60, y: 690, size: 12, font: f });
  return Buffer.from(await d.save());
}

async function main() {
  const root = new client.PrismaClient({ datasources: { db: { url: ROOT_DB } } });
  await root.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
  await root.$executeRawUnsafe(`CREATE DATABASE "${DB_NAME}"`);
  await root.$disconnect();
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js', { paths: [BACKEND] }), 'migrate', 'deploy', '--schema', BACKEND + '/prisma/schema.prisma'], { cwd: BACKEND, env: process.env, stdio: 'pipe' });
  const db = new client.PrismaClient({ datasources: { db: { url: DB } } });
  stub('config/prisma', { __esModule: true, default: db });
  const { hashPassword } = require(BACKEND + '/src/utils/hash.util');
  const passwordHash = await hashPassword(PASSWORD);
  const roles = {};
  for (const r of ['SYSTEM_ADMIN', 'HRMO', 'AO_II', 'TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL']) roles[r] = await db.role.upsert({ where: { name: r }, create: { name: r }, update: {} });

  const people = [
    ['sysadmin', 'SYSTEM_ADMIN', 'Sam', 'Admin', 'System Administrator', 'SDO Koronadal City'],
    ['hrmo1', 'HRMO', 'Helen', 'Ramos', 'Administrative Officer V (HRMO)', 'SDO Koronadal City'],
    ['hrmo2', 'HRMO', 'Hugo', 'Reyes', 'Administrative Officer V (HRMO)', 'SDO Koronadal City'],
    ['ao.morales', 'AO_II', 'Alma', 'Aquino', 'Administrative Officer II', MORALES],
    ['teacher.morales', 'TEACHING_PERSONNEL', 'Rosa', 'Delacruz', 'Teacher I', MORALES],
    ['staff.morales', 'NON_TEACHING_PERSONNEL', 'Ben', 'Santos', 'Administrative Assistant II', MORALES],
    ['successor.morales', 'NON_TEACHING_PERSONNEL', 'Sofia', 'Lim', 'Administrative Assistant III', MORALES],
    ['teacher.matulas', 'TEACHING_PERSONNEL', 'Lorna', 'Villanueva', 'Teacher I', MATULAS],
  ];
  const made = {};
  for (const [key, role, first, last, designation, school] of people) {
    made[key] = await db.user.create({
      data: {
        email: `${key}@qa.test`, passwordHash, roleId: roles[role].id, accountStatus: 'ACTIVE', mustChangePassword: false,
        personnel: { create: {
          employeeId: `PLAY-${key}`, firstName: first, lastName: last, designation, school, district: 'District 1', status: 'ACTIVE', profileComplete: true,
          birthDate: new Date('1988-04-12'), gender: 'FEMALE', civilStatus: 'SINGLE', contactNumber: '09170000000', dateHired: new Date('2016-06-01'),
          address: 'Koronadal City',
        } },
      },
      include: { personnel: true },
    });
  }

  // Submitted transactions waiting for review: one teaching, two non-teaching, one teaching at a station with no AO II.
  const txType = await db.transactionType.create({ data: { name: 'Records Update' } });
  const template = await db.requirementTemplate.create({ data: { transactionTypeId: txType.id, name: 'Supporting file', isMandatory: true, expectedDataType: 'PDF' } });
  for (const key of ['teacher.morales', 'staff.morales', 'successor.morales', 'teacher.matulas']) {
    const owner = made[key];
    const tx = await db.transaction.create({ data: { personnelId: owner.personnel.id, transactionTypeId: txType.id, status: 'PENDING_VALIDATION', submissionDate: new Date() } });
    const storage = `mem:${++seq}`; objects.set(storage, await samplePdf(`Supporting file: ${owner.personnel.firstName} ${owner.personnel.lastName}`));
    await db.uploadedDocument.create({ data: {
      transactionId: tx.id, requirementTemplateId: template.id, storagePath: storage, fileName: 'supporting-file.pdf', mimeType: 'application/pdf',
      fileSize: 1200, uploadedByUserId: owner.id, status: 'REQUIRES_MANUAL_REVIEW',
    } });
  }
  // Open vacancies so the "apply for promotion" flow can be tried in personnel view.
  const cycle = (name, target) => db.promotionCycle.create({ data: {
    name, type: 'NATURAL_VACANCY', status: 'ACTIVE', startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 30 * 86400000),
    rulesConfigurationJson: { district: 'District 1', targetPosition: target, maxApplicants: 50 },
  } });
  await cycle('Teacher II', 'Teacher II');
  await cycle('Administrative Assistant III', 'Administrative Assistant III');
  await cycle('Administrative Officer IV', 'Administrative Officer IV');

  const app = require(BACKEND + '/src/app').default;
  const express = req('express');
  const outer = express();
  outer.get('/playground', (q, r) => r.sendFile(path.join(__dirname, 'hr-direct-playground.html')));
  outer.use((q, r, n) => (q.path.startsWith('/api') ? app(q, r, n) : n()));
  outer.use(express.static(WEB_DIST));
  outer.get(/.*/, (q, r) => r.sendFile(path.join(WEB_DIST, 'index.html')));
  await new Promise(r => outer.listen(PORT, '127.0.0.1', r));
  console.log(`\nHR-direct test bench is running.\n  Landing page: http://127.0.0.1:${PORT}/playground\n  The app:      http://127.0.0.1:${PORT}/login\n  Password for every account: ${PASSWORD}   (new-device code: ${CODE})\n\nPress Ctrl+C to stop. The database ${DB_NAME} is recreated on the next start.`);
}
main().catch(e => { console.error(e); process.exit(1); });
