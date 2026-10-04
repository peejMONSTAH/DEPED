const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, name);
const test = require('node:test');
const assert = require('node:assert/strict');
const src = rel => fs.readFileSync(path.join(__dirname, '../src', rel), 'utf8');
const { transactionStage, applicationStage, stageSteps } = require('../src/constants/workflowStages.ts');
const { routeNotification, groupNotifications } = require('../src/pages/personnel/notificationRoute.ts');

// ── Wording follows the actual reviewer and stage ────────────────────────────────────────────────

test('stage wording names the reviewer the server reports, never a fixed AO II', () => {
  const hr = { validator: 'HRMO', validatedBy: { role: 'HRMO' }, approver: 'HRMO' };
  assert.match(transactionStage('PENDING_VALIDATION', { review: hr }).label, /Waiting for HRMO validation/);
  assert.equal(transactionStage('PENDING_VALIDATION', { review: hr }).who, 'HRMO');
  assert.match(transactionStage('DRAFT', { review: hr }).next, /submit to HRMO/);
  const validated = transactionStage('FOR_APPROVAL', { review: hr });
  assert.match(validated.label, /Validated by HRMO/);
  assert.doesNotMatch(validated.label, /AO II/, 'an HRMO validation is never reported as an AO II validation');
  assert.match(validated.next, /different HRMO/);
  const ao = { validator: 'AO_II', validatedBy: { role: 'AO_II' }, approver: 'HRMO' };
  assert.match(transactionStage('FOR_APPROVAL', { review: ao }).label, /Validated by AO II/);
  assert.match(transactionStage('PENDING_VALIDATION', { review: ao }).label, /Waiting for AO II validation/);
});

test('a fallback approval names the System Administrator as the next person', () => {
  const stage = transactionStage('FOR_APPROVAL', { review: { validator: 'HRMO', validatedBy: { role: 'HRMO' }, approver: 'SYSTEM_ADMIN' } });
  assert.equal(stage.who, 'System Administrator');
  assert.match(stage.next, /System Administrator/);
});

test('application stages use the requirement checker from the server', () => {
  assert.equal(applicationStage({ status: 'SUBMITTED', checker: 'HRMO' }).who, 'HRMO');
  assert.match(applicationStage({ status: 'SUBMITTED', checker: 'HRMO' }).label, /Waiting for HRMO to check requirements/);
  assert.equal(applicationStage({ status: 'SUBMITTED' }).who, 'AO II');
  const returned = applicationStage({ status: 'UNDER_REVIEW', canResubmit: true, checker: 'HRMO' });
  assert.match(returned.next, /HRMO marked/);
  assert.match(returned.next, /Only those need a new file/);
});

test('the progress track shows only the people a case can pass through', () => {
  assert.deepEqual(stageSteps('AO_II'), ['You', 'AO II', 'HRMO']);
  assert.deepEqual(stageSteps('HRMO'), ['You', 'HRMO'], 'no AO II step for a file HRMO validates directly');
});

// ── Notifications: server-decided targets and action state ───────────────────────────────────────

test('candidate dossier receives the assigned reviewer and preserves the recorded reviewer role', () => {
  const dossier = src('pages/admin/CandidateDossierModal.tsx');
  assert.doesNotMatch(dossier, /Awaiting AO II|AO II · Annex C|<span>AO II remarks/);
  assert.match(dossier, /pending: `Awaiting \$\{checker\}`/);
  assert.match(dossier, /reqCheck\?\.verifiedByRole === 'HRMO'/);
  assert.match(src('pages/admin/PromotionManagement.tsx'), /requirementsReviewer=\{requirementsReviewer\(selectedApplicantInfo\)\}/);
});

const notice = extra => ({ id: 1, message: 'x', type: 'INFO', isRead: false, createdAt: '2026-09-30T00:00:00Z', relatedEntityId: 5, relatedEntityType: 'Transaction', ...extra });

test('a review notice opens the exact review screen the server chose, even in personnel view', () => {
  const r = routeNotification(notice({ actionResolved: false, actionTarget: { path: '/admin/approvals?txId=5', label: 'Review for final approval', badge: 'Final approval needed', kind: 'review' } }));
  assert.equal(r.path, '/admin/approvals?txId=5');
  assert.equal(r.cta, 'Review for final approval');
  assert.equal(r.needsAction, true);
  const done = routeNotification(notice({ actionResolved: true, actionTarget: { path: '/admin/transactions/5', label: 'View transaction', badge: 'Transaction', kind: 'view' } }));
  assert.equal(done.needsAction, false);
});

test('a personnel notice about your own file still opens your checklist', () => {
  const r = routeNotification(notice({ type: 'WARNING', message: 'Deficiency Alert on TRX-5: HRMO returned "Diploma"', actionResolved: false, actionTarget: { path: '/personnel/checklist?txId=5', label: 'Fix and resubmit', badge: 'My application', kind: 'own' } }));
  assert.equal(r.path, '/personnel/checklist?txId=5');
  assert.equal(r.needsAction, true);
});

test('validated-by wording in personnel notices is not tied to AO II', () => {
  assert.match(routeNotification(notice({ message: 'Verification Complete: HRMO validated all documents for TRX-5.' })).title, /Validated · waiting for final approval/);
  assert.match(routeNotification(notice({ message: 'Transaction #5 was validated by HRMO and approved by System Administrator.' })).title, /Approved/);
  const groups = groupNotifications([notice({ id: 1, type: 'WARNING', actionResolved: false }), notice({ id: 2, relatedEntityId: 6, actionResolved: true })]);
  assert.equal(groups.action.length, 1, 'only open work is listed as needing action');
});

test('the admin notification list keeps open work under Needs action after it is read, and follows the server target', () => {
  const s = src('pages/admin/Notifications.tsx');
  assert.match(s, /n\.actionResolved === false\s*\n?\s*\|\|/, 'server says still open: needs action, read or not');
  assert.match(s, /if \(n\.actionTarget\)/, 'the server target decides where the notice opens');
  assert.doesNotMatch(s, /AO II Action Required/, 'no hard-coded reviewer in the badge');
  assert.match(s, /LoadFailure/);
});

// ── A failed request is not an empty list ────────────────────────────────────────────────────────

test('reviewer queues never turn a failed request into an empty queue', () => {
  for (const [file, empties] of [['pages/admin/DocumentValidation.tsx', /setTransactions\(\[\]\)/], ['pages/admin/TransactionApproval.tsx', /setApprovals\(\[\]\)/]]) {
    const s = src(file);
    const failure = s.slice(s.indexOf('catch (err)'), s.indexOf('finally'));
    assert.doesNotMatch(failure, empties, `${file}: the catch must not blank the list`);
    assert.match(s, /LoadFailure/, `${file}: shows an error with Retry`);
    assert.match(s, /StaleNotice/, `${file}: keeps loaded data and marks it stale`);
  }
  const q = src('pages/admin/TransactionQueue.tsx');
  assert.match(q, /LoadFailure/); assert.match(q, /StaleNotice/); assert.match(q, /PartialNotice/);
  assert.doesNotMatch(q, /Transaction Queue Is Clear/, 'no "queue is clear" claim');
  assert.doesNotMatch(src('pages/admin/TransactionApproval.tsx'), /'Queue Cleared'/);
});

test('personnel lists distinguish partial, stale and empty', () => {
  const m = src('pages/personnel/MyTransactions.tsx');
  assert.match(m, /Promise\.allSettled/, 'one list failing does not hide the other or read as "none"');
  assert.match(m, /PartialNotice/); assert.match(m, /StaleNotice/);
  assert.match(src('pages/personnel/Notifications.tsx'), /StaleNotice/);
});

test('the shared load-failure components say it is not an empty list and offer Retry', () => {
  const s = src('components/common/LoadFailure.tsx');
  assert.match(s, /not an empty list/);
  assert.match(s, /May be out of date/);
  assert.match(s, /Some information is missing/);
  assert.equal((s.match(/Retry/g) || []).length >= 3, true);
});

// ── Queues and actions come from the server ──────────────────────────────────────────────────────

test('HRMO validation lists request the whole lane, so Returned and Done are complete', () => {
  const s = src('pages/admin/DocumentValidation.tsx');
  assert.match(s, /lane=validation/);
  assert.doesNotMatch(s, /queue=validation/, 'the pending-only queue is not used for lists that also show Returned and Done');
});

test('review buttons follow the server per row; there is no fallback approval for the System Administrator', () => {
  const a = src('pages/admin/TransactionApproval.tsx');
  assert.match(a, /tx\.review\?\.canApprove/);
  assert.doesNotMatch(a, /queue=fallback|isFallback|Fallback approval/);
  assert.doesNotMatch(src('navigation/navItems.ts'), /Fallback approvals/);
  assert.doesNotMatch(src('components/admin/Sidebar.tsx'), /fallback approval/i);
  const m = src('pages/admin/TransactionReviewModal.tsx');
  assert.match(m, /tx\.review\.canValidate/);
  assert.match(m, /res\.data\?\.message/, 'the toast says where the case went and who owns the next step');
  assert.doesNotMatch(m, /forwarded to HRMO/);
});

// ── Correction loops ─────────────────────────────────────────────────────────────────────────────

test('a returned application cannot be resubmitted with the same file; saved and submitted are different', () => {
  const c = src('pages/personnel/components/ApplicationChecklist.tsx');
  assert.match(c, /stillReturned\.length === 0/, 'resubmission needs every returned item replaced');
  assert.match(c, /baselineDocIds/, 'a replacement is a different file from the one that was returned');
  assert.match(c, /Replacement saved/);
  assert.match(c, /Nothing is sent until you press Resubmit/);
  assert.match(c, /Items that were not returned stay as they are/);
  assert.match(src('pages/personnel/Vacancies.tsx'), /checker=\{/);
});
