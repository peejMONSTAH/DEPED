const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, name);

const src = rel => fs.readFileSync(path.join(__dirname, '../src', rel), 'utf8');
const { groupByAnnex, requirementState, REQUIREMENT_STATE_LABEL } = require('../src/promotions/annexGroups.ts');
const { accountActionsFor, ACCOUNT_STATUS_LABEL } = require('../src/api/accountActions.ts');
const { TRANSACTION_STATUSES, transactionEmptyTitle, transactionStatusLabel, humanizeEnum } = require('../src/constants/transactionStatus.ts');
const { matchesLocation, schoolOptionsFor, schoolAfterDistrictChange, districtOfDivision } = require('../src/utils/plantillaFilters.ts');
const { isDocxSignature, carErrorMessage, filenameFromDisposition } = require('../src/promotions/carDownload.ts');

// 1. Annex grouping
const item = (code, extra = {}) => ({ code, isMandatory: true, submitted: true, status: 'VERIFIED', ...extra });

test('Annex requirements render under their section with labels taken from the official code', () => {
  const items = ['a', 'b', 'c', 'd'].map(code => item(code));
  const [group] = groupByAnnex(items);
  assert.equal(group.heading, 'ANNEX C');
  assert.deepEqual(group.entries.map(e => e.label), ['A.', 'B.', 'C.', 'D.']);
  // A filtered subset keeps each requirement's own letter: no relabelling by position.
  const subset = groupByAnnex([items[1], items[3]]);
  assert.deepEqual(subset[0].entries.map(e => e.label), ['B.', 'D.']);
  assert.deepEqual(subset[0].entries.map(e => e.index), [0, 1], 'index points into the list passed in, for in-place updates');
});

test('items from different annexes are grouped separately, in the order received', () => {
  const groups = groupByAnnex([item('a'), item('b', { annex: 'D' }), item('c')]);
  assert.deepEqual(groups.map(g => g.heading), ['ANNEX C', 'ANNEX D']);
  assert.deepEqual(groups[0].entries.map(e => e.label), ['A.', 'C.']);
});

test('verified, deficient, missing, optional and pending are distinct states with visible text', () => {
  assert.equal(requirementState(item('a')), 'verified');
  assert.equal(requirementState(item('a', { status: 'INCOMPLETE' })), 'deficient');
  assert.equal(requirementState(item('a', { status: 'NOT_APPLICABLE', submitted: false })), 'missing');
  assert.equal(requirementState(item('a', { status: 'NOT_APPLICABLE', submitted: false, isMandatory: false })), 'optional');
  assert.equal(requirementState(item('a', { status: 'NOT_APPLICABLE' })), 'pending');
  const labels = Object.values(REQUIREMENT_STATE_LABEL);
  assert.equal(new Set(labels).size, labels.length, 'every state reads differently, not only by color');
  const modal = src('pages/admin/AnnexCVerificationModal.tsx');
  assert.match(modal, /REQUIREMENT_STATE_LABEL\[state\]/, 'state text is rendered');
  assert.match(modal, /state === 'verified' \? <CheckCircle2/, 'verified carries a check icon');
  assert.match(modal, /Deficiency Remarks for Item/, 'deficient rows show the reason field');
});

// 3. Details close control
test('the details dossier has a visible, labelled 44px close control that does not trigger the row', () => {
  const dossier = src('pages/admin/CandidateDossierModal.tsx');
  assert.match(dossier, /className="panel-close-button"[\s\S]{0,200}aria-label="Close details"/);
  assert.match(dossier, /event\.stopPropagation\(\); onClose\(\);/);
  assert.match(dossier, /<ModalOverlay onDismiss=\{onClose\}/, 'Escape dismisses');
  const css = src('index.css');
  assert.match(css, /\.panel-close-button \{\s*width: 44px !important;\s*height: 44px !important;/);
  assert.match(css, /:not\(\.sidebar-theme-toggle-btn, \.theme-toggle-btn, \.form-entry, \.panel-close-button\)/, 'exempt from the global button padding');
});

// 5. Account actions
test('account actions follow the role permission matrix', () => {
  const pending = { id: 10, accountStatus: 'PENDING', role: 'TEACHING_PERSONNEL' };
  const active = { id: 10, accountStatus: 'ACTIVE', role: 'TEACHING_PERSONNEL' };
  const inactive = { id: 10, accountStatus: 'INACTIVE', role: 'TEACHING_PERSONNEL' };
  assert.deepEqual(accountActionsFor({ role: 'AO_II', userId: 1 }, pending), ['view', 'distribute']);
  assert.deepEqual(accountActionsFor({ role: 'AO_II', userId: 1 }, active), ['view'], 'AO II cannot edit, deactivate or reset');
  assert.deepEqual(accountActionsFor({ role: 'HRMO', userId: 1 }, active), ['view', 'edit', 'resetPassword', 'deactivate']);
  assert.deepEqual(accountActionsFor({ role: 'SYSTEM_ADMIN', userId: 1 }, inactive), ['view', 'edit', 'resetPassword', 'reactivate']);
  assert.ok(!accountActionsFor({ role: 'HRMO', userId: 10 }, active).includes('deactivate'), 'nobody deactivates themselves');
  assert.deepEqual(accountActionsFor({ role: 'TEACHING_PERSONNEL', userId: 1 }, active), []);
  assert.deepEqual(accountActionsFor(null, active), []);
  for (const label of Object.values(ACCOUNT_STATUS_LABEL)) assert.doesNotMatch(label, /_/);
});

test('HRMO and System Administrator accounts offer HRMO nothing beyond View', () => {
  for (const targetRole of ['HRMO', 'SYSTEM_ADMIN']) {
    for (const accountStatus of ['PENDING', 'ACTIVE', 'INACTIVE']) {
      assert.deepEqual(accountActionsFor({ role: 'HRMO', userId: 1 }, { id: 10, accountStatus, role: targetRole }), ['view'], `${targetRole} ${accountStatus}`);
    }
  }
  assert.deepEqual(accountActionsFor({ role: 'SYSTEM_ADMIN', userId: 1 }, { id: 10, accountStatus: 'ACTIVE', role: 'HRMO' }), ['view', 'edit', 'resetPassword', 'deactivate']);
  assert.deepEqual(accountActionsFor({ role: 'HRMO', userId: 1 }, { id: 10, accountStatus: 'ACTIVE', role: 'AO_II' }), ['view', 'edit', 'resetPassword', 'deactivate'], 'HRMO still manages AO II accounts');
  assert.deepEqual(accountActionsFor({ role: 'AO_II', userId: 1 }, { id: 10, accountStatus: 'PENDING', role: 'AO_II' }), ['view'], 'AO II distributes to personnel only');
  const page = src('pages/admin/CredentialDistribution.tsx');
  assert.match(page, /\{user\?\.role === 'SYSTEM_ADMIN' && \(\s*<>\s*<option value="HRMO">/, 'only System Admin sees the HRMO and System Admin role options');
});

test('the account directory uses a menu with confirmation and patches the changed row only', () => {
  const page = src('pages/admin/CredentialDistribution.tsx');
  assert.doesNotMatch(page, />\s*View Info\s*</);
  assert.match(page, /<RowActionMenu label=\{`Actions for \$\{name\}`\}/);
  assert.match(page, /const \{ confirmed \} = await confirm\(\{\s*title: deactivating \? 'Deactivate account'/);
  assert.match(page, /patchAccount\(u\.id, \{ accountStatus:/);
});

// 6. Document Validation
test('Document Validation no longer shows the DepEd Order badge or a CAR action', () => {
  const page = src('pages/admin/DocumentValidation.tsx');
  assert.doesNotMatch(page, /DepEd Order No\. 7, s\. 2023 & DO 19\/24, s\. 2025/);
  assert.doesNotMatch(page, /car-document|Comparative Assessment|Generate CAR/i);
  assert.match(src('pages/admin/PromotionManagement.tsx'), /fetchCarDocument\(apiClient, id,/, 'the official HRMO CAR action remains');
});

// 7. CAR download
test('the CAR download accepts only a real .docx and surfaces the server reason', async () => {
  assert.equal(isDocxSignature(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), true);
  assert.equal(isDocxSignature(new Uint8Array([0x7b, 0x22])), false, 'a JSON error body is not a document');
  assert.equal(isDocxSignature(new Uint8Array([])), false);
  const body = new Blob([JSON.stringify({ message: 'Still unrated: Ben Cruz.' })], { type: 'application/json' });
  assert.equal(await carErrorMessage({ response: { data: body } }), 'Still unrated: Ben Cruz.');
  assert.equal(filenameFromDisposition('attachment; filename="CAR-Teaching-X-cycle-7.docx"', 'x'), 'CAR-Teaching-X-cycle-7.docx');
  const page = src('pages/admin/PromotionManagement.tsx');
  assert.match(page, /if \(carRequestInFlight\.current\) return;/, 'no duplicate downloads');
});

// 8. Transaction queue empty states
test('every transaction status has readable text and empty states never show an enum', () => {
  for (const status of TRANSACTION_STATUSES) {
    assert.doesNotMatch(transactionStatusLabel(status), /_/, status);
    assert.notEqual(transactionStatusLabel(status), status);
    assert.doesNotMatch(transactionEmptyTitle(status), new RegExp(`_|\\b${status}\\b`), status);
  }
  assert.equal(transactionEmptyTitle('PENDING_VALIDATION'), 'No transactions are pending validation.');
  assert.equal(humanizeEnum('SOME_NEW_STATUS'), 'Some new status');
  const queue = src('pages/admin/TransactionQueue.tsx');
  assert.doesNotMatch(queue, /category=\{statusFilter\}/);
  assert.match(queue, /title=\{transactionEmptyTitle\(statusFilter\)\}/);
  assert.match(queue, /label: 'Show All Transactions'/, 'a reset action remains');
  assert.match(src('components/common/SmartEmptyState.tsx'), /humanizeEnum\(category\)/);
});

// 9. Plantilla registry
const districts = [
  { name: 'District 1', schools: ['Koronadal Central Elementary School 1', 'Matulas Elementary School'] },
  { name: 'District 10', schools: ['Far Away Elementary School'] },
];

test('district and school filters match exactly and work together', () => {
  const d1 = { division: 'SDO Koronadal City - District 1', department: 'Matulas Elementary School' };
  const d10 = { division: 'SDO Koronadal City - District 10', department: 'Far Away Elementary School' };
  assert.equal(districtOfDivision(d10.division, districts), 'District 10');
  assert.equal(matchesLocation(d1, { district: 'District 1', school: 'ALL' }, districts), true);
  assert.equal(matchesLocation(d10, { district: 'District 1', school: 'ALL' }, districts), false, '"District 1" must not match "District 10"');
  assert.equal(matchesLocation(d1, { district: 'District 1', school: 'Matulas Elementary School' }, districts), true);
  assert.equal(matchesLocation(d1, { district: 'District 1', school: 'Matulas' }, districts), false, 'no partial school match');
  assert.deepEqual(schoolOptionsFor('District 10', districts), ['Far Away Elementary School'], 'district restricts school options');
  assert.equal(schoolAfterDistrictChange('Matulas Elementary School', 'District 10', districts), 'ALL', 'a school outside the new district is cleared');
  assert.equal(schoolAfterDistrictChange('Matulas Elementary School', 'District 1', districts), 'Matulas Elementary School');
});

test('the registry shows one Add label, a school filter, active filters and one reset', () => {
  const page = src('pages/admin/PlantillaManagement.tsx');
  assert.doesNotMatch(page, /\+ Add Plantilla Item/);
  assert.match(page, /aria-label="Filter by school"/);
  assert.match(page, /aria-label="Active filters"/);
  assert.match(page, /matchesLocation\(item, \{ district: districtFilter, school: schoolFilter \}/);
  assert.doesNotMatch(page, /includes\(districtFilter\.toLowerCase\(\)\)/);
});

// 10. Compliance
test('Compliance Monitoring keeps both views without Step 4 / Step 5 numbering', () => {
  const page = src('pages/admin/ComplianceMonitoring.tsx');
  assert.doesNotMatch(page, /Step [45]/);
  assert.match(page, /<span>Compliance Monitoring<\/span>/);
  assert.match(page, /<span>Years of Service<\/span>/);
});

// 11. Select for Promotion
test('the Select for Promotion dialog is height-capped with a scrolling body and fixed actions', () => {
  const page = src('pages/admin/PromotionManagement.tsx');
  const start = page.indexOf('MODAL 6: PROMOTION SELECTION CONFIRMATION');
  const modal = page.slice(start, start + 16000);
  assert.match(modal, /maxHeight: 'calc\(100dvh - 32px\)'/);
  assert.match(modal, /className="promo-select-body" style=\{\{[^}]*overflowY: 'auto'/);
  assert.match(modal, /minHeight: 0/, 'flex child can shrink so it scrolls instead of overflowing');
  assert.match(modal, /flexShrink: 0,\s*display: 'flex',\s*alignItems: 'center',\s*justifyContent: 'flex-end'/, 'actions never shrink away');
  assert.match(src('components/common/ModalOverlay.tsx'), /document\.body\.style\.overflow = 'hidden'/, 'page behind does not scroll');
});
