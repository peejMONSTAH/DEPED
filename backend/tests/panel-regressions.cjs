require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAccountInput, validatePersonnelInput, isValidDateOnly } = require('../src/utils/personnel-validation.util');

test('dates reject impossible dates, future dates and inverted employment dates', () => {
  assert.equal(isValidDateOnly('2024-02-29'), true);
  for (const date of ['2025-02-29', '2025-04-31', '09/16/2025', 'garbage']) assert.equal(isValidDateOnly(date), false);
  assert.ok(validatePersonnelInput({birthDate:'2999-01-01'}));
  assert.ok(validatePersonnelInput({birthDate:'2000-01-01',dateHired:'1999-01-01'}));
});
test('mobile, suffix, email and plantilla validation cannot be bypassed through API', () => {
  for (const mobile of ['09171234567', '+639171234567', '']) assert.equal(validatePersonnelInput({contactNumber:mobile}), null);
  for (const mobile of ['123', '091712345678', '+6309171234567']) assert.ok(validatePersonnelInput({contactNumber:mobile}));
  assert.ok(validatePersonnelInput({email:'bad@'}));
  assert.ok(validatePersonnelInput({suffix:'free text'}));
  assert.ok(validatePersonnelInput({plantillaItemId:'12garbage'}));
  assert.equal(validatePersonnelInput({suffix:'VIII',plantillaItemId:12}), null);
});
test('AO station accounts need a school and do not need invented demographics', () => {
  assert.equal(validateAccountInput({role:'AO_II',schoolAssignment:'Test School'}), null);
  assert.ok(validateAccountInput({role:'AO_II'}));
});
test('personnel creation needs real identity plus explicit appointment allocation', () => {
  const person = {role:'TEACHING_PERSONNEL',firstName:'Test',lastName:'Person',birthDate:'1990-01-01',gender:'FEMALE',civilStatus:'SINGLE',designation:'Teacher I'};
  assert.ok(validateAccountInput(person));
  assert.equal(validateAccountInput({...person,plantillaItemId:1}), null);
  assert.equal(validateAccountInput({...person,nonPlantilla:true}), null);
  assert.ok(validateAccountInput({...person,nonPlantilla:'true'}));
  assert.ok(validateAccountInput({...person,birthDate:'',plantillaItemId:1}));
});

// Execute the actual route guards for every supported role; no database writes.
const roles = ['SYSTEM_ADMIN','HRMO','AO_II','TEACHING_PERSONNEL','NON_TEACHING_PERSONNEL'];
const cases = [
  ['users','post','/',['SYSTEM_ADMIN','HRMO']],
  ['users','put','/:id',['SYSTEM_ADMIN','HRMO']],
  ['users','post','/:id/reset-password',['SYSTEM_ADMIN','HRMO']],
  ['users','post','/requests',['SYSTEM_ADMIN','HRMO','AO_II']],
  ['users','post','/requests/:id/approve',['SYSTEM_ADMIN','HRMO']],
  ['personnel','get','/',['SYSTEM_ADMIN','HRMO','AO_II']],
  ['transactions','post','/:id/validate',['AO_II','SYSTEM_ADMIN']],
  ['transactions','post','/:id/approve',['HRMO','SYSTEM_ADMIN']],
  ['promotions','post','/cycles',['HRMO']],
  ['promotions','post','/cycles/:id/applications/:appId/final-rating',['HRMO']],
  ['promotions','post','/cycles/:id/apply',['TEACHING_PERSONNEL','NON_TEACHING_PERSONNEL']],
  ['audit','get','/reports/compliance-summary',['SYSTEM_ADMIN']],
  ['audit','get','/reports/personnel-demographics',['SYSTEM_ADMIN']],
];
test('salary lookup distinguishes complete titles and never invents a grade', () => {
  const {getAutoSalaryGrade} = require('../src/utils/deped.util');
  assert.equal(getAutoSalaryGrade('Master Teacher V'),22);
  assert.equal(getAutoSalaryGrade('Head Teacher III - Test School'),16);
  assert.equal(getAutoSalaryGrade('Assistant School Principal I - Test School'),18);
  assert.equal(getAutoSalaryGrade('Teacher VII (Test School)'),17);
  assert.equal(getAutoSalaryGrade('Unknown Position'),0);
  assert.equal(getAutoSalaryGrade('Teacher IX'),0);
});
test('service history does not substitute account creation for appointment date', () => {
  const {buildServiceRecordPayload} = require('../src/controllers/personnel.controller');
  const result = buildServiceRecordPayload({createdAt:'2020-01-01',firstName:'Test',lastName:'Person'});
  assert.equal(result.serviceRecordDetails.find(r=>r.label==='Years in Service').value,'Not recorded');
  assert.equal(result.serviceRecordDetails.find(r=>r.label==='First Appointment Date').value,'Not recorded');
});
for (const [moduleName, method, path, allowed] of cases) {
  test(`role matrix: ${method.toUpperCase()} /${moduleName}${path}`, () => {
    const router = require(`../src/routes/${moduleName}.routes`).default;
    const route = router.stack.find(s=>s.route?.path===path && s.route.methods[method]).route;
    const guard = route.stack[0].handle;
    for (const role of [...roles, null]) {
      let next = false;
      const res = {statusCode:200,status(code){this.statusCode=code;return this},json(){return this}};
      guard({user:role?{role}:undefined},res,()=>{next=true});
      assert.equal(next, allowed.includes(role), role || 'anonymous');
      if (!next) assert.equal(res.statusCode, role?403:401);
    }
  });
}
