require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { upperName, upperNameFields, nameCaseMiddleware } = require('../src/utils/name-case.util');

test('names are trimmed, single-spaced and uppercased, keeping Ñ', () => {
  assert.equal(upperName('  juan   de la cruz '), 'JUAN DE LA CRUZ');
  assert.equal(upperName('ñandú'), 'ÑANDÚ');
  assert.equal(upperName('jr.'), 'JR.');
});

test('only name fields change, including the { set } update form', () => {
  const data = { firstName: 'ana', lastName: { set: 'reyes' }, middleName: null, suffix: 'iii', email: 'Ana@Deped.gov.ph', address: 'purok 1' };
  upperNameFields(data);
  assert.deepEqual(data, { firstName: 'ANA', lastName: { set: 'REYES' }, middleName: null, suffix: 'III', email: 'Ana@Deped.gov.ph', address: 'purok 1' });
});

test('middleware covers create, update, upsert and createMany on name models only', async () => {
  const run = async (model, action, args) => { await nameCaseMiddleware({ model, action, args }, async p => p); return args; };
  assert.equal((await run('Personnel', 'create', { data: { firstName: 'a' } })).data.firstName, 'A');
  assert.equal((await run('Personnel', 'update', { data: { lastName: 'b' } })).data.lastName, 'B');
  const up = await run('AccountCreationRequest', 'upsert', { create: { firstName: 'c' }, update: { firstName: 'd' } });
  assert.deepEqual([up.create.firstName, up.update.firstName], ['C', 'D']);
  assert.equal((await run('Personnel', 'createMany', { data: [{ firstName: 'e' }, { firstName: 'f' }] })).data[1].firstName, 'F');
  assert.equal((await run('User', 'update', { data: { firstName: 'keep' } })).data.firstName, 'keep');
});
