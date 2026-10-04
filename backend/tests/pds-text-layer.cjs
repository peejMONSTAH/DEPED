require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePdftotextBbox, parsePdsTextLayer, pdsCheckboxTargets, readPdsTicks, parsePgm } = require('../src/utils/pds-text-layer.util');

// Synthetic CS Form 212 page: same cell geometry as the official form, invented person.
const word = (x, y, text) => ({ x0: x, y0: y - 4, x1: x + text.length * 5.5, y1: y + 4, text });
const row = (x, y, text) => text.split(' ').reduce((acc, t) => { const x0 = acc.length ? acc[acc.length - 1].x1 + 4 : x; acc.push({ x0, y0: y - 4, x1: x0 + t.length * 5.5, y1: y + 4, text: t }); return acc; }, []);
const form = () => [
  ...row(16, 30, 'CS Form No. 212'), ...row(185, 39, 'PERSONAL DATA SHEET'),
  ...row(17, 129, '1. SURNAME'), ...row(116, 126, 'DELA CRUZ'),
  ...row(456, 141, 'NAME EXTENSION (JR., SR)'),
  ...row(17, 147, '2. FIRST NAME'), ...row(116, 144, 'JUAN'),
  ...row(17, 165, 'MIDDLE NAME'), ...row(116, 162, 'N/A'),
  ...row(19, 177, '3. DATE OF BIRTH'), ...row(117, 180, '03/11/1972'),
  ...row(26, 186, '(dd/mm/yyyy)'), ...row(285, 213, 'If holder of dual citizenship,'),
  ...row(256, 249, '17. RESIDENTIAL ADDRESS'),
  ...row(373, 258, 'House/Block/Lot No.'), ...row(520, 258, 'Street'),
  ...row(359, 267, 'SAMPLE SUBD.'), ...row(507, 267, 'BRGY. UNO'),
  ...row(375, 279, 'Subdivision/Village'), ...row(516, 279, 'Barangay'),
  ...row(372, 285, 'SAMPLE CITY'), ...row(489, 285, 'SAMPLE REGION'),
  ...row(378, 297, 'City/Municipality'), ...row(517, 297, 'Province'),
  ...row(285, 312, 'ZIP CODE'), ...row(461, 309, '9000'),
  ...row(256, 327, '18. PERMANENT ADDRESS'),
  ...row(256, 411, '19. TELEPHONE NO.'), ...row(463, 408, 'N/A'),
  ...row(256, 432, '20. MOBILE NO.'), ...row(413, 429, '0917 123 4567 / 0918 765 4321'),
  ...row(256, 450, '21. E-MAIL ADDRESS (if any)'), ...row(399, 450, 'Juan.Sample@deped.gov.ph'),
  ...row(19, 234, '5. SEX AT BIRTH'), ...row(131, 236, 'Male'), ...row(215, 236, 'Female'),
  ...row(20, 252, '6 CIVIL STATUS'), ...row(131, 253, 'Single'), ...row(215, 253, 'Married'), ...row(131, 265, 'Widowed'), ...row(215, 265, 'Separated'), ...row(131, 277, 'Other/s:'),
];
const page = (words, width = 612, height = 1008) => ({ width, height, words });

test('CS Form 212 text layer yields the identity block exactly', () => {
  assert.deepEqual(parsePdsTextLayer(page(form())), {
    surname: 'DELA CRUZ', firstName: 'JUAN', birthDate: '1972-11-03', mobile: '09171234567', email: 'juan.sample@deped.gov.ph',
    'residential.subdivision': 'SAMPLE SUBD.', 'residential.barangay': 'BRGY. UNO',
    'residential.city': 'SAMPLE CITY', 'residential.province': 'SAMPLE REGION', residentialZip: '9000',
  });
});

test('a different paper size scales instead of breaking the read', () => {
  const a4 = form().map(w => ({ ...w, x0: w.x0 * 595 / 612, x1: w.x1 * 595 / 612, y0: w.y0 * 842 / 1008, y1: w.y1 * 842 / 1008 }));
  assert.equal(parsePdsTextLayer(page(a4, 595, 842)).surname, 'DELA CRUZ');
});

test('pages that are not a CS Form 212, or have no names, fall back to OCR', () => {
  assert.equal(parsePdsTextLayer(page(row(20, 100, 'Certificate of Employment'))), null);
  assert.equal(parsePdsTextLayer(page(form().filter(w => w.text !== 'JUAN'))), null);
});

test('an impossible birth date is dropped rather than guessed', () => {
  const bad = form().map(w => (w.text === '03/11/1972' ? { ...w, text: '31/02/1972' } : w));
  assert.equal(parsePdsTextLayer(page(bad)).birthDate, undefined);
});

test('pdftotext -bbox output is parsed with entities decoded', () => {
  const parsed = parsePdftotextBbox('<page width="612.000000" height="1008.000000"><word xMin="1.5" yMin="2" xMax="10" yMax="12">A&amp;B</word></page>');
  assert.deepEqual(parsed, { width: 612, height: 1008, words: [{ x0: 1.5, y0: 2, x1: 10, y1: 12, text: 'A&B' }] });
});

// A rendered 612 x 1008 page (1 px per pt): white, with a dark tick painted inside chosen boxes.
const gray = ticked => {
  const g = { width: 612, height: 1008, data: new Uint8Array(612 * 1008).fill(255) };
  for (const t of pdsCheckboxTargets(page(form()))) {
    if (!ticked.includes(t.key)) continue;
    for (let y = Math.floor(t.y0); y < Math.ceil(t.y1); y++) for (let x = Math.floor(t.x0); x < Math.ceil(t.x1); x++) g.data[y * 612 + x] = 20;
  }
  return g;
};

test('tick boxes: exactly one ticked option per group is read', () => {
  const targets = pdsCheckboxTargets(page(form()));
  assert.equal(targets.length, 7);
  assert.deepEqual(readPdsTicks(targets, gray(['sex.female', 'civilStatus.married'])), { 'sex.female': 'x', 'civilStatus.married': 'x' });
});

test('tick boxes: none, several, or "Other/s" ticked leaves the field for manual entry', () => {
  const targets = pdsCheckboxTargets(page(form()));
  assert.deepEqual(readPdsTicks(targets, gray([])), {});
  assert.deepEqual(readPdsTicks(targets, gray(['sex.male', 'sex.female', 'civilStatus.other'])), {});
});

test('a PGM from pdftoppm -gray is parsed', () => {
  const pgm = Buffer.concat([Buffer.from('P5\n2 2\n255\n'), Buffer.from([0, 255, 255, 0])]);
  assert.deepEqual(Array.from(parsePgm(pgm).data), [0, 255, 255, 0]);
  assert.equal(parsePgm(Buffer.from('nope')), null);
});
