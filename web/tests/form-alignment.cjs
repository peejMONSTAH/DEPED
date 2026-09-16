// Run from web: node tests/form-alignment.cjs
// Uses the production layout/export code and writes local QA PDFs only.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { PDFDocument, rgb, degrees } = require('pdf-lib');
const originalTs = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  module._compile(output.outputText, filename);
};
const { fieldsForTemplate, fieldEntryId } = require('../src/components/forms/formFields.ts');
const { mapEntries, getFieldFont, layoutField } = require('../src/components/forms/fieldLayout.ts');
const { exportFilledPdf, pageGeometry } = require('../src/components/forms/pdfExport.ts');

(async () => {
  const directory = path.resolve(__dirname, '../../tmp/form-alignment');
  fs.mkdirSync(directory, { recursive: true });
  const font = await getFieldFont();
  for (const id of ['pds-2025', 'wes', 'medical-2025', 'oath-2025', 'omnibus-2023', 'position-2017', 'saln-2025']) {
    const fields = fieldsForTemplate(id);
    const source = fs.readFileSync(path.resolve(__dirname, '../../backend/assets/forms', `${id}.pdf`));
    const document = await PDFDocument.load(source);
    const pages = Array.from({ length: document.getPageCount() }, (_, i) => i);
    const entries = mapEntries(pages, [], fields);
    assert.equal(new Set(entries.map(e => e.id)).size, entries.length);
    assert(entries.length < 1000);
    for (const field of fields) {
      assert(field.x >= 0 && field.y >= 0 && field.x + field.width <= 1 && field.y + field.height <= 1, field.key);
      assert(field.width > 0 && field.height > 0, field.key);
      const entry = entries.find(e => e.id === fieldEntryId(field, field.page, pages));
      const { width, height } = pageGeometry(document.getPage(field.page));
      let text = field.type === 'checkbox' ? 'X' : field.type === 'multiline' ? 'Sample answer\nSecond line' : 'Sample';
      try { layoutField(text, field, width, height, font); } catch { text = '1'; }
      const layout = layoutField(text, field, width, height, font);
      assert(layout.baseline + (layout.lines.length - 1) * layout.lineHeight <= field.height * height, field.key);
      entry.text = text;
    }
    const blob = await exportFilledPdf(source, pages, entries, fields);
    fs.writeFileSync(path.join(directory, `${id}-filled.pdf`), Buffer.from(await blob.arrayBuffer()));
    // Diagnostic rectangles show that overlay bounds and exported text coincide.
    const marked = await PDFDocument.load(await blob.arrayBuffer());
    for (const field of fields) {
      const page = marked.getPage(field.page), geometry = pageGeometry(page), {width, height} = geometry;
      page.drawRectangle({ ...geometry.point(field.x*width, (field.y+field.height)*height), width:field.width*width, height:field.height*height, rotate:degrees(geometry.rotation), color:rgb(.1,.5,1), opacity:.12, borderColor:rgb(.1,.5,1), borderWidth:.2 });
    }
    fs.writeFileSync(path.join(directory, `${id}-bounds.pdf`), await marked.save());
    const migrated = mapEntries(pages, [{ ...entries[0], x:.01, y:.95, text:'Retained answer' }], fields);
    assert.equal(migrated[0].text, 'Retained answer');
    assert.equal(migrated[0].x, fields[0].x);
    assert.equal(migrated[0].y, fields[0].y);
    const repeatedPages = [...pages, pages[pages.length - 1]];
    const continued = mapEntries(repeatedPages, entries, fields);
    assert(continued.filter(e => e.page === pages.length).every(e => e.text === ''));
    assert.equal(new Set(continued.map(e => e.id)).size, continued.length);
    const first = fields.find(f => f.type !== 'checkbox');
    const size = pageGeometry(document.getPage(first.page));
    assert.throws(() => layoutField('Too long '.repeat(600), first, size.width, size.height, font));
    console.log(`${id}: ${fields.length} measured fields; export, migration, continuation, and overflow checks passed`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (originalTs) require.extensions['.ts'] = originalTs;
  else delete require.extensions['.ts'];
});
