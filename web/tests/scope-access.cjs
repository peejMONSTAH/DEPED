const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, name);

const { isAccessDenied, accessDeniedMessage, refusalMessage } = require('../src/api/access.ts');
const { queryClient, resetClientCaches } = require('../src/api/queryClient.ts');

const refused = (status, message) => ({ response: { status, data: message === undefined ? {} : { message } } });

test('a 403 or 404 means the record is not available to this account', () => {
  assert.equal(isAccessDenied(refused(404)), true);
  assert.equal(isAccessDenied(refused(403)), true);
  for (const other of [refused(401), refused(409), refused(500), new Error('Network Error'), null, undefined, {}]) {
    assert.equal(isAccessDenied(other), false);
  }
});

test('a 404 always reads as the generic no-access message, whatever the server said', () => {
  // The server answers another station's record exactly like a missing one; the
  // client must not add detail the server withheld.
  assert.equal(refusalMessage(refused(404, 'Transaction not found.'), 'transaction'), 'You do not have access to this transaction.');
  assert.equal(accessDeniedMessage('applicant'), 'You do not have access to this applicant.');
});

test('a 403 keeps the server\'s reason, since it concerns the officer\'s own permissions', () => {
  assert.equal(refusalMessage(refused(403, 'You cannot validate your own transaction.'), 'transaction'), 'You cannot validate your own transaction.');
  assert.equal(refusalMessage(refused(403, '   '), 'transaction'), 'You do not have access to this transaction.');
  assert.equal(refusalMessage(refused(403), 'applicant'), 'You do not have access to this applicant.');
});

test('changing the signed-in account leaves nothing cached from the previous one', () => {
  // Query keys carry no account or station, so the cache itself must be emptied.
  queryClient.setQueryData(['notifications'], [{ message: 'New Promotion Application Received: Lorna Villanueva' }]);
  queryClient.setQueryData(['transactions', {}], [{ id: 102, personnel: { lastName: 'Villanueva' } }]);
  resetClientCaches();
  assert.equal(queryClient.getQueryData(['notifications']), undefined);
  assert.equal(queryClient.getQueryData(['transactions', {}]), undefined);
  assert.equal(queryClient.getQueryCache().getAll().length, 0);
});

test('every change of identity resets the cache', () => {
  const auth = fs.readFileSync(path.join(__dirname, '../src/contexts/AuthContext.tsx'), 'utf8');
  for (const handler of ['const login', 'const loginWithTokens', 'const logout']) {
    const body = auth.slice(auth.indexOf(handler), auth.indexOf('}, [', auth.indexOf(handler)));
    assert.match(body, /resetClientCaches\(\)/, `${handler} must reset cached records`);
  }
  const client = fs.readFileSync(path.join(__dirname, '../src/api/client.ts'), 'utf8');
  const clearSession = client.slice(client.indexOf('function clearSession'), client.indexOf('}', client.indexOf('function clearSession')));
  assert.match(clearSession, /resetClientCaches\(\)/, 'an ended session must reset cached records');
});

test('no page decides station or district access from displayed text', () => {
  // Jurisdiction used to be guessed from the officer's name, email and address.
  const pages = path.join(__dirname, '../src/pages');
  const offenders = [];
  for (const dir of ['admin', 'personnel']) {
    for (const file of fs.readdirSync(path.join(pages, dir)).filter(name => name.endsWith('.tsx'))) {
      const source = fs.readFileSync(path.join(pages, dir, file), 'utf8');
      if (/currentUserDistrict|isAoDistrictAllowed|\['matulas',\s*'morales'/.test(source)) offenders.push(`${dir}/${file}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('personnel station display uses school field and never relies solely on address', () => {
  const pmSource = fs.readFileSync(path.join(__dirname, '../src/pages/admin/PersonnelManagement.tsx'), 'utf8');
  assert.match(pmSource, /p\.school\s*\|\|\s*p\.plantillaItem\?\.department/, 'PersonnelManagement table must prioritize p.school and p.plantillaItem.department');
  assert.match(pmSource, /selected\.school\s*\|\|\s*selected\.plantillaItem\?\.department/, 'PersonnelManagement modal must prioritize selected.school and selected.plantillaItem.department');

  const cdSource = fs.readFileSync(path.join(__dirname, '../src/pages/admin/CredentialDistribution.tsx'), 'utf8');
  assert.match(cdSource, /u\.personnel\.school/, 'CredentialDistribution must display u.personnel.school');
});

test('PersonnelManagement has district and school filters and no division-wide text', () => {
  const pmSource = fs.readFileSync(path.join(__dirname, '../src/pages/admin/PersonnelManagement.tsx'), 'utf8');
  assert.match(pmSource, /aria-label="Filter by district"/, 'PersonnelManagement must have district filter select');
  assert.match(pmSource, /aria-label="Filter by school"/, 'PersonnelManagement must have school filter select');
  assert.equal(/division-wide/i.test(pmSource), false, 'PersonnelManagement must not contain division-wide');

  const cdSource = fs.readFileSync(path.join(__dirname, '../src/pages/admin/CredentialDistribution.tsx'), 'utf8');
  assert.equal(/division-wide/i.test(cdSource), false, 'CredentialDistribution must not contain division-wide');

  const plSource = fs.readFileSync(path.join(__dirname, '../src/pages/admin/PlantillaManagement.tsx'), 'utf8');
  assert.equal(/division-wide/i.test(plSource), false, 'PlantillaManagement must not contain division-wide');
});


