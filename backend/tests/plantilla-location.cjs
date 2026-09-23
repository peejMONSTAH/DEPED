require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { validPlantillaLocation } = require('../src/utils/plantilla-location.util');

test('plantilla district and school must agree', () => {
  assert.equal(validPlantillaLocation('Morales Elementary School', 'SDO Koronadal City - District 1'), true);
  assert.equal(validPlantillaLocation('Morales Elementary School', 'SDO Koronadal City - District 6'), false);
  assert.equal(validPlantillaLocation('Matulas Elementary School', 'SDO Koronadal City - District 1'), true);
  assert.equal(validPlantillaLocation('All Schools in District', 'SDO Koronadal City - District 6'), true);
  assert.equal(validPlantillaLocation('Schools Division Office', 'SDO Koronadal City'), true);
  assert.equal(validPlantillaLocation('', 'SDO Koronadal City - District 1'), false);
});
