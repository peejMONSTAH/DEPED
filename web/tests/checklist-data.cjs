const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, name);
const { checklistFromTransaction, checklistReadiness } = require('../src/pages/personnel/checklistData.ts');
const templates = [{ id: 101, name: 'PDS', isMandatory: true }, { id: 202, name: 'Optional file', isMandatory: false }];
test('checklist uses server IDs, never document filename or array position', () => {
  const items = checklistFromTransaction({ transactionType: { requirementTemplates: templates }, uploadedDocuments: [
    { id: 9, requirementTemplateId: 999, fileName: 'PDS.pdf', status: 'VALIDATED' },
    { id: 8, requirementTemplateId: 202, status: 'VALIDATED' },
  ] });
  assert.equal(items[0].documentId, null);
  assert.equal(checklistReadiness(items).complete, false);
});
test('upload is not validation; optional files do not prevent submission, rejected required files do', () => {
  const transaction = { transactionType: { requirementTemplates: templates }, uploadedDocuments: [{ id: 4, requirementTemplateId: 101, status: 'REQUIRES_MANUAL_REVIEW' }] };
  const items = checklistFromTransaction(transaction);
  assert.equal(items[0].status, 'UPLOADED');
  assert.equal(checklistReadiness(items).complete, true);
  transaction.uploadedDocuments[0].status = 'REJECTED';
  assert.equal(checklistReadiness(checklistFromTransaction(transaction)).complete, false);
});
test('unconfirmed OCR fields do not block readiness; reviewing them is optional', () => {
  const transaction = { transactionType: { requirementTemplates: templates }, uploadedDocuments: [{ id: 4, requirementTemplateId: 101, status: 'OCR_PROCESSED', ocrExtractedDataJson: { fields: {} } }] };
  assert.equal(checklistReadiness(checklistFromTransaction(transaction)).complete, true);
  transaction.uploadedDocuments[0].correctedOcrDataJson = { confirmation: { confirmedAt: '2026-09-22' } };
  assert.equal(checklistReadiness(checklistFromTransaction(transaction)).complete, true);
});
test('missing server checklist and empty requirements are never declared complete', () => {
  assert.throws(() => checklistFromTransaction({}), /unavailable/);
  assert.equal(checklistReadiness([]).complete, false);
});
