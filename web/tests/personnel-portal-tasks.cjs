const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, name);
const test = require('node:test');
const assert = require('node:assert/strict');

const { routeNotification, collapseRepeats, groupNotifications } = require('../src/pages/personnel/notificationRoute.ts');
const { vacancyView, sortVacancies } = require('../src/pages/personnel/vacancyView.ts');
const { filingReturns } = require('../src/pages/personnel/filingReturns.ts');
const { homeTasks } = require('../src/pages/personnel/components/homeTasks.ts');
const src = rel => fs.readFileSync(path.join(__dirname, '../src', rel), 'utf8');

const note = (over) => ({ id: 1, message: '', type: 'INFO', isRead: false, createdAt: '2026-09-29T08:00:00Z', ...over });

// ── Notifications ──────────────────────────────────────────────────────────
test('account-security notices go to the account page and are never labelled or routed as transactions', () => {
  for (const message of [
    'A System Administrator signed you out of every device. Sign in again to continue.',
    'A System Administrator removed "Phone" from your trusted devices. It will need an emailed code at the next sign-in.',
    'Your password was reset by HRMO. Check your email for the setup link and set a new password.',
  ]) {
    const r = routeNotification(note({ message, type: 'WARNING', actionResolved: null }));
    assert.equal(r.kind, 'account', message);
    assert.equal(r.path, '/personnel/profile');
    assert.doesNotMatch(r.label + r.title, /transaction|appointment/i);
    assert.equal(r.needsAction, false);
  }
});

test('the linked record decides the destination, not the wording', () => {
  const tx = routeNotification(note({ message: 'Deficiency Alert on TRX-7: The document "PDS" was returned.', type: 'WARNING', relatedEntityType: 'Transaction', relatedEntityId: 7, actionResolved: false }));
  assert.equal(tx.path, '/personnel/checklist?txId=7');
  assert.equal(tx.needsAction, true);
  assert.equal(tx.cta, 'Fix the returned document');

  const app = routeNotification(note({ message: 'Requirements Incomplete / Deficient: marked INCOMPLETE by AO II.', type: 'WARNING', relatedEntityType: 'PromotionApplication', relatedEntityId: 40, promotionCycleId: 9, actionResolved: false }));
  assert.equal(app.path, '/personnel/vacancies?cycle=9', 'an application return opens that vacancy, not a transaction');
  assert.equal(app.needsAction, true);

  const cycle = routeNotification(note({ message: 'New Promotion Cycle Opened: "MT II" is now active for applications.', relatedEntityType: 'PromotionCycle', relatedEntityId: 9 }));
  assert.equal(cycle.path, '/personnel/vacancies?cycle=9');

  const file = routeNotification(note({ message: 'Your PRC ID expired on May 1, 2026.', type: 'WARNING', relatedEntityType: 'PersonnelDocument', relatedEntityId: 3 }));
  assert.equal(file.path, '/personnel/documents');
  assert.equal(file.needsAction, true);
});

test('a handled return and a final rejection are not shown as requests', () => {
  const handled = routeNotification(note({ message: 'Deficiency Alert on TRX-7: returned.', type: 'WARNING', relatedEntityType: 'Transaction', relatedEntityId: 7, actionResolved: true }));
  assert.equal(handled.needsAction, false);
  const rejected = routeNotification(note({ message: 'Transaction #7 has been rejected by HRMO. Reason: x', type: 'WARNING', relatedEntityType: 'Transaction', relatedEntityId: 7, actionResolved: true }));
  assert.equal(rejected.needsAction, false);
  assert.doesNotMatch(rejected.cta, /replace/i);
  const info = routeNotification(note({ message: 'Verification Complete: verified by AO II and forwarded to HRMO for final approval.', type: 'INFO', relatedEntityType: 'Transaction', relatedEntityId: 7, actionResolved: false }));
  assert.equal(info.needsAction, false, 'an information notice is never a request');
  assert.doesNotMatch(info.title, /approved/i, 'AO II validation is not called an approval');
});

test('a notice with no linked record and no known subject has no misleading button', () => {
  const r = routeNotification(note({ message: 'Welcome to Digital 201.' }));
  assert.equal(r.path, null);
  assert.equal(r.cta, null);
});

test('repeated identical notices are shown once with a count; requests come before updates', () => {
  const rows = [
    note({ id: 1, message: 'Same', relatedEntityType: 'Transaction', relatedEntityId: 2, createdAt: '2026-09-28T08:00:00Z', isRead: true }),
    note({ id: 2, message: 'Same', relatedEntityType: 'Transaction', relatedEntityId: 2, createdAt: '2026-09-29T08:00:00Z', isRead: true }),
    note({ id: 3, message: 'Deficiency Alert on TRX-5: returned', type: 'WARNING', relatedEntityType: 'Transaction', relatedEntityId: 5, actionResolved: false }),
  ];
  const c = collapseRepeats(rows);
  assert.equal(c.length, 2);
  assert.equal(c.find(n => n.message === 'Same').repeats, 2);
  const g = groupNotifications(rows);
  assert.deepEqual(g.action.map(x => x.n.id), [3]);
  assert.deepEqual(g.updates.map(x => x.n.id), [2]);
});

// ── Vacancies ──────────────────────────────────────────────────────────────
const cycle = (over) => ({ id: 1, name: 'Ranking for Vacancy: Master Teacher I', endDate: '2026-10-10T00:00:00Z', targetPosition: 'Master Teacher I', currentPosition: 'Teacher III', isEligible: true, applicationsOpen: true, applicationsState: 'OPEN', applicationsCloseOn: 'October 10, 2026', ...over });
const now = new Date('2026-10-06T00:00:00Z');

test('eligible vacancies say you can apply without promising selection', () => {
  const v = vacancyView(cycle(), now);
  assert.equal(v.state, 'can-apply');
  assert.equal(v.action.label, 'Apply');
  assert.match(v.note, /does not guarantee selection/);
  assert.match(v.deadline, /Apply by October 10, 2026 · 4 days left/);
});

test('an unknown current position is "not checked", never "eligible"', () => {
  const v = vacancyView(cycle({ currentPosition: undefined }), now);
  assert.equal(v.state, 'not-checked');
  assert.match(v.reason, /current position is not on record/);
  assert.doesNotMatch(v.status, /eligible to apply|you can apply/i);
});

test('ineligible vacancies show the server reason, and no invented reason when none is recorded', () => {
  assert.equal(vacancyView(cycle({ isEligible: false, ineligibilityReason: 'Exceeds the 2-step limit.' }), now).reason, 'Exceeds the 2-step limit.');
  const none = vacancyView(cycle({ isEligible: false, ineligibilityReason: null }), now);
  assert.match(none.reason, /did not record a reason/);
  assert.equal(none.action, null);
});

test('an existing application is shown with its stage, and a returned one offers the fix', () => {
  const applied = vacancyView(cycle({ hasApplied: true, myApplication: { status: 'SUBMITTED', applicantNumber: 'APP-1' } }), now);
  assert.equal(applied.state, 'applied');
  assert.match(applied.status, /You applied \(APP-1\) · Waiting for AO II/);
  const returned = vacancyView(cycle({ hasApplied: true, myApplication: { status: 'UNDER_REVIEW', stageStatus: 'REQUIREMENTS_DEFICIENT' } }), now);
  assert.equal(returned.action.kind, 'fix');
});

test('vacancies you can act on come first', () => {
  const rows = [cycle({ id: 1, isEligible: false }), cycle({ id: 2, applicationsState: 'CLOSED', applicationsOpen: false }), cycle({ id: 3 }), cycle({ id: 4, hasApplied: true, myApplication: { status: 'SUBMITTED' } })];
  assert.deepEqual(sortVacancies(rows, now).map(r => r.cycle.id), [4, 3, 1, 2]);
});

// ── 201 Files: returns live in filings ─────────────────────────────────────
test('files returned inside a filing are listed with the reviewer note and a link to fix them there', () => {
  const r = filingReturns(
    [{ id: 12, status: 'DEFICIENCY', remarks: 'Page 2 unsigned', transactionType: { name: 'Promotion Appointment', requirementTemplates: [{ id: 5, name: 'Oath of Office' }] }, uploadedDocuments: [{ id: 1, status: 'REJECTED', requirementTemplateId: 5 }, { id: 2, status: 'VALIDATED', requirementTemplateId: 6 }] },
     { id: 13, status: 'FOR_APPROVAL', uploadedDocuments: [{ id: 3, status: 'REJECTED', requirementTemplateId: 5 }] }],
    [{ id: 40, canResubmit: true, cycle: { id: 9, targetPosition: 'Master Teacher I' }, items: [{ code: 'c', title: 'Performance rating', verificationStatus: 'INCOMPLETE', verificationRemarks: 'Wrong year' }, { code: 'd', verificationStatus: 'VERIFIED' }] }],
  );
  assert.deepEqual(r.map(x => [x.file, x.reason, x.to]), [
    ['Oath of Office', 'Page 2 unsigned', '/personnel/checklist?txId=12'],
    ['Performance rating', 'Wrong year', '/personnel/vacancies?cycle=9'],
  ]);
});

test('the 201 Files page explains uploaded vs checked vs approved and puts attention items first', () => {
  const page = src('pages/personnel/MyDocuments.tsx');
  assert.match(page, /<dt>Uploaded<\/dt>[\s\S]*Nobody has checked it yet/);
  assert.match(page, /<dt>Checked<\/dt>[\s\S]*AO II validated/);
  assert.match(page, /<dt>Approved<\/dt>[\s\S]*HRMO approved the appointment/);
  assert.ok(page.indexOf('Needs attention') < page.indexOf('>All files<'), 'attention list comes before the full list');
  assert.match(page, /Replacing a file keeps the earlier version/);
  assert.match(page, /setFilingsError\(true\)/, 'a failed filings load is reported, not shown as no returns');
});

// ── Home ───────────────────────────────────────────────────────────────────
test('home tasks for a vacancy link to that vacancy', () => {
  const r = homeTasks({ transactions: [], applications: [{ id: 1, canResubmit: true, cycle: { id: 9, name: 'MT' } }], missingRequiredFiles: 0, profileComplete: true, cycles: [] });
  assert.equal(r.tasks[0].to, '/personnel/vacancies?cycle=9');
});

test('home shows tasks and reviewer items, compact links, and no empty appointment card', () => {
  const home = src('pages/personnel/Home.tsx');
  assert.doesNotMatch(home, /No active|No appointment in progress|CurrentTransaction/);
  for (const to of ['/personnel/transactions', '/personnel/documents', '/personnel/vacancies']) assert.ok(home.includes(`to: '${to}'`), to);
  assert.match(home, /How a promotion works/);
  assert.match(home, /PROMOTION_STEPS.map/);
  assert.match(home, /Navigate to=\{`\/personnel\/vacancies\?cycle=/, 'old ?cycle links still work');
});

// ── Responsive rules ───────────────────────────────────────────────────────
/** CSS that can apply on a phone: drops @media (min-width …) blocks and media query text. */
function phoneRules(css) {
  let out = '';
  for (let i = 0; i < css.length;) {
    const at = css.indexOf('@media', i);
    if (at < 0) { out += css.slice(i); break; }
    out += css.slice(i, at);
    const open = css.indexOf('{', at);
    const wideOnly = /min-width/.test(css.slice(at, open)) && !/max-width/.test(css.slice(at, open));
    let depth = 1, j = open + 1;
    for (; j < css.length && depth; j++) depth += css[j] === '{' ? 1 : css[j] === '}' ? -1 : 0;
    if (!wideOnly) out += css.slice(open + 1, j - 1);
    i = j;
  }
  return out;
}
test('personnel page styles have no fixed minimum wider than a 320px phone', () => {
  const dir = path.join(__dirname, '../src/pages/personnel');
  // The service record reproduces the printed CS Form 212 table inside its own
  // horizontal scroller (.svc-table-wrap), so the page itself never scrolls sideways.
  const contained = { 'service-record.css': ['min-width: 860px'] };
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.css'))) {
    const css = phoneRules(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const m of css.matchAll(/min-width:\s*(\d+)px|minmax\((\d+)px/g)) {
      if ((contained[f] || []).includes(m[0])) continue;
      assert.ok(Number(m[1] || m[2]) <= 288, `${f}: ${m[0]}`);
    }
  }
  assert.match(src('pages/personnel/service-record.css'), /\.svc-table-wrap \{ overflow-x: auto;/);
});

test('the phone bar keeps four destinations so labels fit at 320px', () => {
  const nav = src('components/personnel/PersonnelBottomNav.tsx');
  assert.equal((nav.match(/\{ label: '/g) || []).length, 4);
  assert.match(nav, /'\/personnel\/vacancies'/);
});

// ── Annex C checklist dialog ───────────────────────────────────────────────
test('a returned application opens editable and resubmits; other submitted ones are read only', () => {
  const c = src('pages/personnel/components/ApplicationChecklist.tsx');
  assert.match(c, /isReturned = cycle\.myApplication\?\.stageStatus === 'REQUIREMENTS_DEFICIENT' && cycle\.myApplication\?\.status === 'UNDER_REVIEW'/);
  assert.match(c, /status !== 'DRAFT'\) && !isReturned/);
  assert.match(c, /'Resubmit to AO II'/);
  assert.match(c, /Returned by AO II/, 'the AO II note is shown beside the returned item');
});

test('a file picked in the checklist is saved to the 201 record and attached by id, never dropped', () => {
  const c = src('pages/personnel/components/ApplicationChecklist.tsx');
  const pick = c.slice(c.indexOf('const handleFilePicked'), c.indexOf('// Handle removing attachment'));
  assert.match(pick, /apiClient\.post\('\/personnel\/documents', form/);
  assert.match(pick, /personnelDocumentId: doc\.id/);
  assert.doesNotMatch(pick, /\bfile,\n/, 'the raw File is not kept on the item (the submission sends references only)');
  assert.match(pick, /nothing was attached/);
});

test('the checklist dialog has one dismiss control', () => {
  const c = src('pages/personnel/components/ApplicationChecklist.tsx');
  assert.equal((c.match(/onClick=\{onClose\}/g) || []).length, 1);
});

test('the checklist posts its items under `checklist`, the shape the apply endpoint validates', () => {
  const c = src('pages/personnel/components/ApplicationChecklist.tsx');
  assert.match(c, /apiClient\.post\(`\/promotions\/cycles\/\$\{cycle\.id\}\/apply`, \{ checklist: payload/);
  const server = fs.readFileSync(path.join(__dirname, '../../backend/src/controllers/promotions.controller.ts'), 'utf8');
  assert.match(server, /const checklistData = req\.body\?\.checklist/);
});

test('a data refresh never resets what the person attached in the open checklist', () => {
  const c = src('pages/personnel/components/ApplicationChecklist.tsx');
  assert.match(c, /\}, \[cycleId\]\);/, 'items are rebuilt only when a different vacancy opens');
  assert.doesNotMatch(c, /\}, \[cycle, personnel, user\]\);/);
  assert.doesNotMatch(c, /'Division Office'/, 'no invented office when the profile has none');
});

test('keyboard focus is visible on every personnel control', () => {
  assert.match(src('index.css'), /\.personnel-content-container :is\(a, button, summary, input, select, textarea, \[tabindex\]\):focus-visible,\n\.personnel-bottom-nav-item:focus-visible \{\n  outline: 3px solid #2F7D52 !important;/);
});

test('vacancies show no plantilla directory; applicants apply only to opened vacancies', () => {
  assert.doesNotMatch(src('pages/personnel/Vacancies.tsx'), /plantilla/i);
});

// ── Home summaries ─────────────────────────────────────────────────────────
const { promotionProgress, nextExpiry, vacancyLine } = require('../src/pages/personnel/components/homeSummary.ts');

test('the promotion stepper marks the real current step and never the approval early', () => {
  assert.equal(promotionProgress([], []), null);
  assert.equal(promotionProgress([{ id: 1, status: 'SUBMITTED', cycle: { targetPosition: 'MT I' } }], []).step, 1);
  const returned = promotionProgress([{ id: 1, status: 'UNDER_REVIEW', stageStatus: 'REQUIREMENTS_DEFICIENT', canResubmit: true, cycle: {} }], []);
  assert.equal(returned.step, 1); assert.equal(returned.needsYou, true);
  assert.equal(promotionProgress([{ id: 1, status: 'RANKED', cycle: {} }], []).step, 2);
  assert.equal(promotionProgress([{ id: 1, status: 'APPROVED', stageStatus: 'SELECTED_PENDING_DOCS', transactionId: 7, cycle: {} }], [{ id: 7, status: 'PENDING_VALIDATION' }]).step, 3);
  const hrmo = promotionProgress([{ id: 1, transactionId: 7, cycle: {} }], [{ id: 7, status: 'FOR_APPROVAL' }]);
  assert.equal(hrmo.step, 4); assert.match(hrmo.label, /Validated by AO II/);
  assert.equal(promotionProgress([{ id: 1, transactionId: 7, cycle: {} }], [{ id: 7, status: 'APPROVED' }]), null, 'a finished promotion is not shown as in progress');
});

test('tile lines say what is there instead of just "none"', () => {
  assert.equal(vacancyLine(['not-eligible']), '1 open · not eligible yet · see why');
  assert.equal(vacancyLine(['can-apply', 'not-eligible']), '1 you can apply to');
  assert.equal(vacancyLine([]), 'No open vacancies right now');
  const e = nextExpiry([{ id: 1, documentTypeId: 'PRC', documentTypeName: 'PRC ID', status: 'SUBMITTED', hasFile: true, expirationDate: '2027-03-01' },
    { id: 2, documentTypeId: 'X', documentTypeName: 'Old', status: 'SUBMITTED', hasFile: true, expirationDate: '2020-01-01' }], new Date('2026-09-30'));
  assert.equal(e.name, 'PRC ID');
});

test('home side panels hide instead of guessing when they cannot load', () => {
  const home = src('pages/personnel/Home.tsx');
  assert.match(home, /service-record'\)\.then\(r => setRecord\([^)]*\)\)\.catch\(\(\) => setRecord\(null\)\)/);
  assert.match(home, /\{record && facts\.length > 0 &&/);
  assert.match(home, /\{recent && \(/);
});
