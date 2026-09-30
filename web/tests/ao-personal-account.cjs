const fs = require('node:fs');
const assert = require('node:assert/strict');
const test = require('node:test');
const form = fs.readFileSync(require.resolve('../src/pages/admin/PersonnelManagement.tsx'), 'utf8');
const dashboard = fs.readFileSync(require.resolve('../src/pages/admin/Dashboard.tsx'), 'utf8');

test('AO creation keeps personal fields and sends actual identity', () => {
  assert.doesNotMatch(form, /newCategory !== 'AO_II' && <div>/);
  for (const field of ['First Name', 'Last Name', 'Date of Birth', 'Sex / Gender', 'Civil Status']) {
    assert.ok(form.includes(`aria-label="${field}"`));
  }
  assert.match(form, /firstName: newFirstName\.trim\(\)/);
  assert.match(form, /lastName: newLastName\.trim\(\)/);
  assert.match(form, /birthDate: newBirthDate/);
  assert.doesNotMatch(form, /setNewFirstName\('AO II'\)|setNewLastName\(sch\)|setNewLastName\(newSchool\)/);
});

test('AO dashboard prominently identifies role, position and assignment', () => {
  assert.match(dashboard, /aria-label="Your AO assignment"/);
  assert.match(dashboard, /Account role: Administrative Officer II \(AO II\)/);
  assert.match(dashboard, /Position: \{user.designation \|\| user.personnel\?\.designation/);
  assert.match(dashboard, /Assigned school:/);
});
