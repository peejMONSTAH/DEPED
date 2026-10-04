require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseCsv, readRows, parseImportDate, validateImportRows, templateCsv, TEMPLATE_COLUMNS } = require('../src/utils/personnel-import.util');

const ctx = (over = {}) => ({
  existingEmails: new Set(), existingEmployeeIds: new Set(), knownStations: new Set(['morales elementary school']),
  plantilla: new Map(), today: new Date('2026-10-05'), ...over,
});
const rows = (csv) => readRows(parseCsv(csv)).rows;
const HEAD = 'First Name,Surname,Date of Birth,Sex,E-mail,Position,Station\n';

test('CSV reading handles quotes, commas inside cells, CRLF, a BOM and semicolons', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
  assert.deepEqual(parseCsv('a;b\n1;2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\n\n1,2\n'), [['a', 'b'], ['1', '2']]);
});

test('headings are matched by common names and missing required ones are reported', () => {
  const { rows: r, missing, unknown } = readRows(parseCsv(HEAD + 'ana,reyes,15/03/1985,F,ana@deped.gov.ph,Teacher I,Morales Elementary School\n'));
  assert.deepEqual(missing, []);
  assert.deepEqual(unknown, []);
  assert.equal(r[0].values.lastName, 'reyes');
  assert.equal(r[0].line, 2);
  assert.deepEqual(readRows(parseCsv('Name,Email\nx,y\n')).missing.sort(), ['birthDate', 'designation', 'firstName', 'lastName', 'school']);
});

test('dates: dd/mm/yyyy, ISO, month names and Excel numbers; impossible dates are refused', () => {
  assert.equal(parseImportDate('15/03/1985'), '1985-03-15');
  assert.equal(parseImportDate('03/11/1972'), '1972-11-03');
  assert.equal(parseImportDate('1985-3-5'), '1985-03-05');
  assert.equal(parseImportDate('March 15, 1985'), '1985-03-15');
  assert.equal(parseImportDate('15 Mar 1985'), '1985-03-15');
  assert.equal(parseImportDate('31121'), '1985-03-15');
  assert.equal(parseImportDate('31/02/1985'), null);
  assert.equal(parseImportDate('soon'), null);
});

test('a good row is accepted, uppercased, and given the right role', () => {
  const [a, b] = validateImportRows(rows(HEAD +
    'ana,reyes,15/03/1985,F,Ana@Deped.gov.ph,Teacher I,Morales Elementary School\n' +
    'ben,cruz,01/01/1980,M,ben@deped.gov.ph,Administrative Assistant II,Morales Elementary School\n'), ctx());
  assert.equal(a.status, 'OK');
  assert.equal(a.record.firstName, 'ANA');
  assert.equal(a.record.email, 'ana@deped.gov.ph');
  assert.equal(a.record.gender, 'FEMALE');
  assert.equal(a.record.role, 'TEACHING_PERSONNEL');
  assert.equal(b.record.role, 'NON_TEACHING_PERSONNEL');
  assert.deepEqual(a.warnings, []);
});

test('problems are reported per row and block only that row', () => {
  const out = validateImportRows(rows(HEAD +
    'ana,reyes,15/03/1985,F,ana@deped.gov.ph,Teacher I,Morales Elementary School\n' +
    'ana2,reyes,15/03/1985,F,ANA@deped.gov.ph,Teacher I,Morales Elementary School\n' +
    'taken,x,15/03/1985,F,used@deped.gov.ph,Teacher I,Morales Elementary School\n' +
    'bad,date,31/02/1985,F,bad@deped.gov.ph,Teacher I,Morales Elementary School\n' +
    ',,15/03/1985,F,noname@deped.gov.ph,Teacher I,Morales Elementary School\n' +
    'young,kid,15/03/2020,F,kid@deped.gov.ph,Teacher I,Morales Elementary School\n' +
    'no,mail,15/03/1985,F,notanemail,Teacher I,Morales Elementary School\n'), ctx({ existingEmails: new Set(['used@deped.gov.ph']) }));
  assert.deepEqual(out.map(r => r.status), ['OK', 'ERROR', 'ERROR', 'ERROR', 'ERROR', 'ERROR', 'ERROR']);
  assert.match(out[1].errors.join(' '), /repeated from line 2/);
  assert.match(out[2].errors.join(' '), /already has an account/);
  assert.match(out[3].errors.join(' '), /not a valid date/);
  assert.match(out[4].errors.join(' '), /First name is missing/);
  assert.match(out[5].errors.join(' '), /age of/);
  assert.match(out[6].errors.join(' '), /not a valid email/);
});

test('an unfamiliar school is a warning, not an error, and unreadable optional values are left blank with a note', () => {
  const [r] = validateImportRows(rows('First Name,Surname,Date of Birth,Sex,E-mail,Position,Station,Civil Status,Mobile\n' +
    'ana,reyes,15/03/1985,??,ana@deped.gov.ph,Teacher I,Santo Nino ES,widdowed,12345\n'), ctx());
  assert.equal(r.status, 'OK');
  assert.equal(r.record.gender, null);
  assert.equal(r.record.civilStatus, null);
  assert.equal(r.warnings.length, 4);
});

test('plantilla links: must exist, be vacant, and be used once', () => {
  const plantilla = new Map([['ITEM-1', { id: 1, department: 'Morales Elementary School', division: 'District 1', positionTitle: 'Teacher I', occupied: false }],
    ['ITEM-2', { id: 2, department: 'Morales Elementary School', division: 'District 1', positionTitle: 'Teacher I', occupied: true }]]);
  const out = validateImportRows(rows('First Name,Surname,Date of Birth,E-mail,Position,Station,Plantilla Item\n' +
    'a,a,15/03/1985,a@x.ph,Teacher I,Morales Elementary School,ITEM-1\n' +
    'b,b,15/03/1985,b@x.ph,Teacher I,Morales Elementary School,item-1\n' +
    'c,c,15/03/1985,c@x.ph,Teacher I,Morales Elementary School,ITEM-2\n' +
    'd,d,15/03/1985,d@x.ph,Teacher I,Morales Elementary School,ITEM-9\n'), ctx({ plantilla }));
  assert.equal(out[0].record.plantillaItemId, 1);
  assert.equal(out[0].record.district, 'District 1');
  assert.match(out[1].errors.join(' '), /repeated from line 2/);
  assert.match(out[2].errors.join(' '), /already occupied/);
  assert.match(out[3].errors.join(' '), /does not exist/);
});

test('the downloadable template reads back and validates as a good row', () => {
  const { rows: r, missing } = readRows(parseCsv(templateCsv()));
  assert.deepEqual(missing, []);
  assert.equal(Object.keys(r[0].values).length, TEMPLATE_COLUMNS.length);
  const [result] = validateImportRows(r, ctx());
  assert.equal(result.status, 'OK');
  assert.equal(result.record.birthDate, '1985-03-15');
});

test('the import routes are limited to HRMO and System Administrator and sit before /:id', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/users.routes.ts'), 'utf8');
  for (const line of ["router.get('/import/template', authorize('SYSTEM_ADMIN', 'HRMO')", "router.post('/import/preview', authorize('SYSTEM_ADMIN', 'HRMO')", "router.post('/import', authorize('SYSTEM_ADMIN', 'HRMO')"]) {
    assert.ok(routes.includes(line), line);
  }
  assert.ok(routes.indexOf("'/import'") < routes.indexOf("router.get('/:id'"));
});
