require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { isValidPersonnelDocumentFile } = require('../src/middleware/personnel-document-upload.middleware');

const file = (originalname, mimetype, buffer) => ({
  originalname,
  mimetype,
  buffer,
  size: buffer.length,
});

test('account-request PDS validation checks extension, MIME type, and file signature', () => {
  assert.equal(isValidPersonnelDocumentFile(file('personnel.pdf', 'application/pdf', Buffer.from('%PDF-1.7\n'))), true);
  assert.equal(isValidPersonnelDocumentFile(file('personnel.pdf', 'application/pdf', Buffer.from('not a pdf'))), false);
  assert.equal(isValidPersonnelDocumentFile(file('personnel.exe', 'application/pdf', Buffer.from('%PDF-1.7\n'))), false);
  assert.equal(isValidPersonnelDocumentFile(file('personnel.pdf', 'text/plain', Buffer.from('%PDF-1.7\n'))), false);
});

test('account-request PDS is optional, validated when attached, and promoted into the Digital 201 file on approval', () => {
  const controller = fs.readFileSync(path.join(__dirname, '../src/controllers/users.controller.ts'), 'utf8');
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/users.routes.ts'), 'utf8');
  assert.match(routes, /requests\/extract-pds/);
  assert.match(routes, /personnelDocumentUpload\.single\('pdsFile'\), submitAccountRequest/);
  assert.doesNotMatch(controller, /req\.user\?\.role === 'AO_II' && !isValidPersonnelDocumentFile/);
  assert.match(controller, /req\.file && !isValidPersonnelDocumentFile\(req\.file\)/);
  assert.match(controller, /documentTypeId: 'PDS'[\s\S]*status: PersonnelDocumentStatus\.SUBMITTED/);
  assert.match(controller, /pdsStoragePath: _storage/);
});

test('plantilla assignment view applies station scope without narrowing the promotion vacancy view', () => {
  const controller = fs.readFileSync(path.join(__dirname, '../src/controllers/plantilla.controller.ts'), 'utf8');
  assert.match(controller, /const forAssignment = req\.query\.forAssignment === 'true'/);
  assert.match(controller, /\.\.\.\(forAssignment \? \[plantillaAssignmentScopeFilter\(scope\)\] : \[\]\)/);
});
