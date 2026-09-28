require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { documentTypesFor } = require('../src/services/auto-attach.service');

test('appointment requirements map to the matching 201 document types', () => {
  assert.deepEqual(documentTypesFor('CS Form 212 - Personal Data Sheet (PDS)'), ['PDS']);
  assert.deepEqual(documentTypesFor('Oath of Office (CS Form No. 32)'), ['OATH_OF_OFFICE']);
  assert.deepEqual(documentTypesFor('Position Description Form (PDF / DBM-CSC Form No. 1)'), ['POSITION_DESCRIPTION']);
  assert.deepEqual(documentTypesFor('Plantilla Allocation / Appointment Form'), ['APPOINTMENT']);
  assert.deepEqual(documentTypesFor('Medical Certificate (CS Form No. 211)'), ['MED_CERT']);
  assert.deepEqual(documentTypesFor('Photocopy of PRC License'), ['LICENSE']);
  assert.deepEqual(documentTypesFor('Something unrelated'), []);
});

test('auto-attach only fills empty requirements of an editable transaction, as reviewable uploads', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/services/auto-attach.service.ts'), 'utf8');
  assert.match(src, /\['DRAFT', 'DEFICIENCY'\]\.includes\(tx\.status\)/);
  assert.match(src, /r => !filled\.has\(r\.id\)/, 'only empty requirements');
  assert.match(src, /status: 'REQUIRES_MANUAL_REVIEW'/, 'AO II still reviews it');
  assert.match(src, /expirationDate: \{ gt: now \}/, 'no expired files');
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/transactions.routes.ts'), 'utf8');
  assert.match(routes, /auto-attach', authorize\('TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'\)/);
});
