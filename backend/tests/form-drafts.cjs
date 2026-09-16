// Run: node --test tests/form-drafts.cjs (no database connection).
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mock = { transaction: {findUnique: async () => ({personnelId:42,status:'DRAFT'})}, uploadedDocument: {findMany: async () => []} };
require.cache[require.resolve('../src/config/prisma')] = {exports:{__esModule:true,default:mock}};
const router = require('../src/routes/form-drafts.routes').default;
const handler = router.stack.find(s => s.route?.path === '/transactions/:txId/:templateId').route.stack[0].handle;
const txId = String(2000000000 + Math.floor(Math.random()*10000000));
const directory = path.resolve(__dirname,'../uploads/form-drafts',txId);
const body = {version:'0',pages:[0],entries:[{id:'test',page:0,x:.2,y:.2,size:9,text:'SYNTHETIC TEST'}]};
async function call(method, overrides={}) {
  const req = {method,params:{txId,templateId:'wes'},user:{personnelId:42},body,...overrides};
  const res = {code:200,status(code){this.code=code;return this},json(value){this.value=value;return this},sendStatus(code){this.code=code}};
  await handler(req,res,e=>{throw e}); return res;
}
test('private drafts, locks, input validation and optimistic conflict protection', async () => {
  try {
    assert.equal((await call('GET',{user:{personnelId:7}})).code,403);
    assert.equal((await call('GET',{params:{txId:'../wrong',templateId:'wes'}})).code,400);
    assert.equal((await call('GET')).value.data,null);
    assert.equal((await call('PUT',{body:{...body,pages:[3]}})).code,400);
    assert.equal((await call('PUT',{body:{...body,entries:[{...body.entries[0],x:2}]}})).code,400);
    mock.transaction.findUnique = async () => ({personnelId:42,status:'FOR_APPROVAL'});
    assert.equal((await call('PUT')).code,409);
    mock.transaction.findUnique = async () => ({personnelId:42,status:'DEFICIENCY'});
    mock.uploadedDocument.findMany = async () => [{requirementTemplate:{name:'Work Experience Sheet'}}];
    assert.equal((await call('PUT')).code,409);
    mock.uploadedDocument.findMany = async () => [];
    const saved = await call('PUT');
    assert.equal(saved.code,200); assert.notEqual(saved.value.data.version,'0');
    assert.equal((await call('GET')).value.data.entries[0].text,'SYNTHETIC TEST');
    assert.equal((await call('PUT')).code,409);
    assert.equal((await call('PUT',{body:{...body,version:saved.value.data.version}})).code,200);
  } finally {
    // Only remove the exact synthetic file/directory allocated by this test.
    const file = path.join(directory,'wes.json');
    if (fs.existsSync(file)) fs.unlinkSync(file);
    if (fs.existsSync(directory)) fs.rmdirSync(directory);
  }
});
