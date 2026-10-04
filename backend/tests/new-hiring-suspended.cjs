require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { newHiringEnabled, isNewHiringPosition, newHiringBlocked, NEW_HIRING_SUSPENDED_MESSAGE } = require('../src/utils/new-hiring.util');

test('new hiring is off unless NEW_HIRING_ENABLED is set', () => {
  const was = process.env.NEW_HIRING_ENABLED;
  try {
    delete process.env.NEW_HIRING_ENABLED;
    assert.equal(newHiringEnabled(), false);
    assert.equal(newHiringBlocked('Teacher I'), true);
    process.env.NEW_HIRING_ENABLED = 'true';
    assert.equal(newHiringEnabled(), true);
    assert.equal(newHiringBlocked('Teacher I'), false);
  } finally { if (was === undefined) delete process.env.NEW_HIRING_ENABLED; else process.env.NEW_HIRING_ENABLED = was; }
});

test('only the Teacher I entry rank is a hiring position; promotion ranks are not', () => {
  for (const title of ['Teacher I', ' teacher  1 ', 'TEACHER I']) assert.equal(isNewHiringPosition(title), true);
  for (const title of ['Teacher II', 'Teacher III', 'Master Teacher I', 'Administrative Officer II', '', null]) assert.equal(isNewHiringPosition(title), false);
});

test('every new-hire entry point checks the switch', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/controllers/promotions.controller.ts'), 'utf8');
  assert.equal((src.match(/NEW_HIRING_SUSPENDED_MESSAGE, 'NEW_HIRING_SUSPENDED'/g) || []).length >= 5, true);
  assert.match(src, /isPromoted && isTeacherOne && !newHiringEnabled\(\)/);
  assert.match(src, /!req\.body\.personnelId && req\.body\.firstName && req\.body\.lastName/);
  assert.match(NEW_HIRING_SUSPENDED_MESSAGE, /temporarily suspended/);
});
