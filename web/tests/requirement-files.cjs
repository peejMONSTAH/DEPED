const fs = require('node:fs');
const assert = require('node:assert/strict');
const test = require('node:test');
const ts = require('typescript');
const { PDFDocument } = require('pdf-lib');
global.File ||= require('node:buffer').File;
const mod = { exports: {} };
const source = fs.readFileSync(require.resolve('../src/utils/requirementFiles.ts'), 'utf8');
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(require, mod, mod.exports);
const { prepareRequirementFiles } = mod.exports;

test('combines all PDF pages in selection order without modifying originals', async () => {
  const a = await PDFDocument.create(); a.addPage([200, 300]);
  const b = await PDFDocument.create(); b.addPage([400, 500]); b.addPage([600, 700]);
  const files = [new File([await a.save()], 'a.pdf', { type: 'application/pdf' }), new File([await b.save()], 'b.pdf', { type: 'application/pdf' })];
  const result = await prepareRequirementFiles(files, 'PDS and work experience');
  const merged = await PDFDocument.load(await result.arrayBuffer());
  assert.equal(result.type, 'application/pdf');
  assert.deepEqual(merged.getPages().map(p => p.getWidth()), [200, 400, 600]);
  assert.equal((await PDFDocument.load(await files[0].arrayBuffer())).getPageCount(), 1);
  assert.equal(await prepareRequirementFiles([files[0]], 'Single'), files[0]);
});

test('rejects invalid, empty, oversized and corrupt batches rather than skipping files', async () => {
  await assert.rejects(prepareRequirementFiles([], 'Empty'), /at least one/);
  await assert.rejects(prepareRequirementFiles([new File(['bad'], 'bad.exe')], 'Invalid'), /only PDF/);
  await assert.rejects(prepareRequirementFiles([new File([], 'empty.pdf')], 'Empty'), /non-empty/);
  await assert.rejects(prepareRequirementFiles([new File([new Uint8Array(6 * 1024 * 1024)], 'a.pdf'), new File([new Uint8Array(6 * 1024 * 1024)], 'b.pdf')], 'Large'), /total/);
  await assert.rejects(prepareRequirementFiles([new File(['bad'], 'a.pdf'), new File(['bad'], 'b.pdf')], 'Corrupt'), /Nothing was uploaded/);
});

test('both requirements pickers accept multiple files and use the preparation helper', () => {
  for (const file of ['../src/pages/personnel/Checklist.tsx', '../src/pages/personnel/components/ApplicationChecklist.tsx']) {
    const code = fs.readFileSync(require.resolve(file), 'utf8');
    assert.match(code, /type="file"\s+multiple/);
    assert.match(code, /await prepareRequirementFiles\(files,/);
    assert.match(code, /Multiple files are combined into one PDF/);
  }
});

test('vacancy notifications open details while application links retain their checklist', () => {
  const routes = fs.readFileSync(require.resolve('../src/pages/personnel/notificationRoute.ts'), 'utf8');
  const page = fs.readFileSync(require.resolve('../src/pages/personnel/Vacancies.tsx'), 'utf8');
  assert.match(routes, /view=details`, 'View vacancy'/);
  assert.match(page, /params.get\('view'\) === 'details'\) setDetailCycle\(c\)/);
  assert.match(page, /else setOpenCycle\(c\)/);
  assert.match(page, /Viewing this vacancy does not submit an application/);
  assert.match(page, /view.action && <button/);
});
