const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText, name);

const src = rel => fs.readFileSync(path.join(__dirname, '../src', rel), 'utf8');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);

test('the audit trail shows only real records and says so when it cannot load', () => {
  const page = src('pages/admin/AuditLog.tsx');
  assert.doesNotMatch(page, /MOCK_AUDIT_LOGS|Approved Transaction #103|ao2_clara/);
  assert.match(page, /useState<AuditItem\[\]>\(\[\]\)/);
  assert.doesNotMatch(page, /'system@deped\.gov\.ph'|l\.status \|\| 'SUCCESS'|l\.userRole \|\| l\.role \|\| 'SYSTEM_ADMIN'/, 'missing fields are not filled with plausible values');
  assert.match(page, /Audit trail unavailable/);
});

test('System Administrator is kept out of HR transaction decisions in the web app', () => {
  const queue = src('pages/admin/TransactionQueue.tsx');
  assert.match(queue, /const canValidate = user\?\.role === 'AO_II';/);
  assert.match(queue, /const canApprove = user\?\.role === 'HRMO';/);
  assert.match(src('App.tsx'), /path="transactions" element=\{<RequireAuth allowedRoles=\{\['AO_II', 'HRMO'\]\}>/);
});

test('both account creation forms use one vacant-plantilla rule', () => {
  const { assignableVacantPlantillas, isTeachingPosition } = require('../src/utils/plantillaFilters.ts');
  const items = [
    { positionTitle: 'Teacher III' }, { positionTitle: 'Master Teacher I' }, { positionTitle: 'Administrative Officer II' },
    { positionTitle: 'Teacher I', isOpenForRanking: true }, { positionTitle: 'Teacher II', promotionCycle: { id: 1 } },
  ];
  assert.deepEqual(assignableVacantPlantillas(items, 'TEACHING').map(i => i.positionTitle), ['Teacher III', 'Master Teacher I']);
  assert.deepEqual(assignableVacantPlantillas(items, 'NON_TEACHING').map(i => i.positionTitle), ['Administrative Officer II']);
  assert.equal(isTeachingPosition('School Principal I'), true);
  for (const page of ['pages/admin/PersonnelManagement.tsx', 'pages/admin/CredentialDistribution.tsx']) {
    const s = src(page);
    assert.match(s, /assignableVacantPlantillas\(vacantPlantillas,/, page);
    assert.doesNotMatch(s, /const isTeacherTitle = /, `${page} no longer keeps its own copy`);
  }
});

test('every promotion tab uses the same selected / appointed definitions', () => {
  const { isAppointed, isSelectedPendingAppointment } = require('../src/promotions/stageGate.ts');
  assert.equal(isAppointed({ status: 'APPROVED' }), false, 'APPROVED means selected, never appointed');
  assert.equal(isSelectedPendingAppointment({ status: 'APPROVED' }), true);
  assert.equal(isAppointed({ isPromoted: true }), true);
  assert.equal(isAppointed({ status: 'OFFICIALLY_PROMOTED' }), true);
  assert.equal(isAppointed({ scoreDetailsJson: { appointmentApproved: true } }), true);
  assert.equal(isSelectedPendingAppointment({ isPromoted: true, isSelectedForPromotion: true }), false, 'appointed is not also pending');
  const page = src('pages/admin/PromotionManagement.tsx');
  assert.equal((page.match(/const isPromoted = isAppointed\(item\);/g) || []).length, 2, 'Leaderboard and CAR tab');
  assert.match(page, /const isOfficiallyApproved = isAppointed\(item\);/, 'HR Selection');
  assert.doesNotMatch(page, /item\.status === 'PROMOTED' \|\| item\.status === 'APPROVED'\)/);
});

test('Annex C wording has one web source that matches the server exactly', () => {
  const { ANNEX_C_FALLBACK } = require('../src/promotions/annexCRequirements.ts');
  const server = fs.readFileSync(path.join(__dirname, '../../backend/src/utils/annex-c.util.ts'), 'utf8');
  const serverItems = [...server.matchAll(/code: '([a-k])',\s*title: '([^']+)',\s*description: '([^']+)',\s*isMandatory: (true|false)/g)]
    .map(m => ({ code: m[1], title: m[2], description: m[3], isMandatory: m[4] === 'true' }));
  assert.equal(serverItems.length, 11);
  assert.deepEqual(ANNEX_C_FALLBACK.map(({ code, title, description, isMandatory }) => ({ code, title, description, isMandatory })), serverItems);
  const pm = src('pages/admin/PromotionManagement.tsx');
  assert.doesNotMatch(pm, /DEFAULT_ANNEX_C_ITEMS/, 'the verification modal no longer keeps its own list');
  assert.match(pm, /loadAnnexCRequirements\(apiClient\)/);
  assert.match(src('pages/personnel/Home.tsx'), /loadAnnexCRequirements\(apiClient\)/);
});

test('status labels come from one table', () => {
  const { transactionStatusLabel } = require('../src/constants/transactionStatus.ts');
  assert.equal(transactionStatusLabel('PENDING_VALIDATION'), 'Under AO II Review');
  const badge = src('components/shared/StatusBadge.tsx');
  assert.match(badge, /label: transactionStatusLabel\(status\)/);
  assert.doesNotMatch(badge, /label: 'Under AO II Review'/, 'no second copy of the label');
  assert.match(src('pages/admin/TransactionQueue.tsx'), /label: transactionStatusLabel\('PENDING_VALIDATION'\)/);
});

test('the Sidebar and Command Palette share one role-filtered navigation list', () => {
  const nav = src('navigation/navItems.ts');
  assert.match(nav, /label: 'System Security'/);
  assert.doesNotMatch(nav, /Settings & Roles/);
  assert.match(src('components/admin/Sidebar.tsx'), /from '\.\.\/\.\.\/navigation\/navItems'/);
  const palette = src('components/common/CommandPalette.tsx');
  assert.match(palette, /navSectionsFor\(userRole\)/);
  assert.doesNotMatch(palette, /user\?\.role \|\| 'SYSTEM_ADMIN'/, 'no role is assumed for a missing user');
  assert.doesNotMatch(palette, /'Credential Distribution'|'My Submissions'/);
  const guard = src('routes/RequireAuth.tsx');
  assert.match(guard, /return <DeniedRedirect to=\{homePathFor\(user\)\} \/>;/, 'a refused page explains the redirect');
});

test('applicant numbers are assigned by the server, never invented on the client', () => {
  const home = src('pages/personnel/Home.tsx');
  assert.doesNotMatch(home, /APP-2026-\$\{String\(Math\.floor/);
  assert.match(home, /value=\{checklistApplicationCode \|\| 'Assigned when you submit'\}/);
  const mobile = fs.readFileSync(path.join(__dirname, '../../mobile/lib/screens/promotions/promotion_checklist_screen.dart'), 'utf8');
  assert.doesNotMatch(mobile, /'APP-2026-\$rnd'/);
});

test('no screen checks a transaction status the backend never produces', () => {
  const phantom = /SUBMITTED_TO_AO2|RETURNED_BY_AO2|RETURNED_AO2|APPROVED_BY_HRMO|FORWARDED_TO_HRMO|RETURNED_BY_HRMO|status === 'RETURNED'|status === 'PROMOTED'|'RECEIVED'/;
  const offenders = walk(path.join(__dirname, '../src')).filter(f => /\.(tsx?|ts)$/.test(f) && phantom.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(offenders.map(f => path.relative(path.join(__dirname, '../src'), f)), []);
});

test('returned work (DEFICIENCY) reaches the Returned tab and counts; drafts are not offered for validation', () => {
  assert.match(src('pages/admin/TransactionApproval.tsx'), /approvals\.filter\(a => a\.status === 'DEFICIENCY'\)/);
  assert.match(src('pages/admin/ComplianceMonitoring.tsx'), /txList\.filter\(t => t\.status === 'DEFICIENCY'\)\.length/);
  const dv = src('pages/admin/DocumentValidation.tsx');
  assert.match(dv, /const pending = transactions\.filter\(tx => tx\.status === 'PENDING_VALIDATION'\);/);
});

test('leftover demo files are gone and the preview stays out of git', () => {
  assert.equal(fs.existsSync(path.join(__dirname, '../src/components/common/QuickRoleSwitcher.tsx')), false);
  assert.equal(fs.existsSync(path.join(__dirname, '../../backend/deficiency_email_preview.html')), false);
  assert.match(fs.readFileSync(path.join(__dirname, '../../backend/.gitignore'), 'utf8'), /^deficiency_email_preview\.html$/m);
  assert.doesNotMatch(src('pages/admin/PersonnelManagement.tsx'), /\+ Add Personnel/);
  assert.match(src('pages/personnel/Checklist.tsx'), /Upload &amp; read form/, 'the extra upload path is labelled, not an unexplained arrow');
});

test('the emailed setup link opens a password page that signs the user in', () => {
  assert.match(src('App.tsx'), /<Route path="\/auth\/setup-account" element=\{<SetupAccount \/>\} \/>/);
  const page = src('pages/auth/SetupAccount.tsx');
  assert.match(page, /authApi\.completeSetup\(token, password\)/);
  assert.match(page, /loginWithTokens\(data\.accessToken, data\.refreshToken, data\.user\)/);
  assert.match(page, /autoComplete="new-password"/);
  assert.match(page, /Go to sign in/, 'an expired or used link falls back to the temporary-password sign-in');
  const client = src('api/client.ts');
  assert.match(client, /requestUrl\.includes\('\/auth\/complete-setup'\)/, 'a 401 from the link is shown, not treated as an expired session');
});
