require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const rows = new Map();
const key = where => JSON.stringify(where.transactionId_templateId);
const mock = {
  transaction: { findUnique: async () => ({ personnelId: 42, status: 'DRAFT' }) },
  uploadedDocument: { findMany: async () => [] },
  $queryRaw: async () => [],
  formDraft: {
    findUnique: async ({where}) => rows.get(key(where)) || null,
    upsert: async ({where,create,update}) => {
      const saved = rows.has(key(where)) ? {...rows.get(key(where)),...update} : create;
      rows.set(key(where),saved); return saved;
    },
  },
};
let tail = Promise.resolve();
mock.$transaction = fn => {
  const run = tail.then(() => fn(mock)); tail = run.catch(() => {}); return run;
};
require.cache[require.resolve('../src/config/prisma')] = {exports:{__esModule:true,default:mock}};
const router = require('../src/routes/form-drafts.routes').default;
const handler = router.stack.find(s => s.route?.path === '/transactions/:txId/:templateId').route.stack[0].handle;
const body = {version:'0',pages:[0],entries:[{id:'test',page:0,x:.2,y:.2,size:9,text:'SYNTHETIC TEST'}]};
async function call(method, overrides={}) {
  const req = {method,params:{txId:'2140000123',templateId:'wes'},user:{personnelId:42},body,...overrides};
  const res = {code:200,status(code){this.code=code;return this},json(value){this.value=value;return this},sendStatus(code){this.code=code}};
  await handler(req,res,e=>{res.code=e.statusCode || 500;res.value={message:e.message}}); return res;
}
test('drafts enforce owner, workflow lock, validation and version conflicts in durable storage', async () => {
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
  const results = await Promise.all([call('PUT',{body:{...body,version:saved.value.data.version}}),call('PUT',{body:{...body,version:saved.value.data.version}})]);
  assert.deepEqual(results.map(r=>r.code).sort(),[200,409]);
});
