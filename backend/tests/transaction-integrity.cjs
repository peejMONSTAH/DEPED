require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { transactionCompliance } = require('../src/utils/transaction-compliance.util');
const mandatory = [{id:1,isMandatory:true,name:'Diploma'},{id:2,isMandatory:true,name:'Birth certificate'},{id:3,isMandatory:false,name:'Optional'}];

test('mandatory completeness is independent of optional uploads and duplicate rows', () => {
  const result = transactionCompliance(mandatory,[{requirementTemplateId:1,status:'VALIDATED'},{requirementTemplateId:1,status:'VALIDATED'},{requirementTemplateId:3,status:'REQUIRES_MANUAL_REVIEW'}]);
  assert.equal(result.complianceScore,50); assert.equal(result.isComplete,false);
  assert.deepEqual(result.missing.map(r=>r.id),[2]);
});
test('a rejected mandatory document cannot be resubmitted unchanged', () => {
  const result=transactionCompliance(mandatory,[{requirementTemplateId:1,status:'VALIDATED'},{requirementTemplateId:2,status:'REJECTED'}]);
  assert.equal(result.complianceScore,50); assert.equal(result.isComplete,false);
});
test('all mandatory documents, with no optional upload, are complete', () => {
  const result=transactionCompliance(mandatory,[{requirementTemplateId:1,status:'VALIDATED'},{requirementTemplateId:2,status:'REQUIRES_MANUAL_REVIEW'}]);
  assert.equal(result.complianceScore,100); assert.equal(result.isComplete,true);
  assert.equal(transactionCompliance([],[]).isComplete,false);
});
test('extracted PDS information requires personnel confirmation', () => {
  const result=transactionCompliance([{id:1,isMandatory:true,name:'Personal Data Sheet'}],[{requirementTemplateId:1,status:'OCR_PROCESSED',ocrExtractedDataJson:{templateId:'pds-2025',fields:{firstName:'Test'}}}]);
  assert.equal(result.unconfirmedPds,true); assert.equal(result.isComplete,false);
});

const fixture={id:12,personnelId:42,transactionType:{name:'Promotion',requirementTemplates:mandatory},personnel:{promotionApplications:[]},uploadedDocuments:[]};
let databaseFailure=false;
let lastWhere;
const mock={
  user:{findUnique:async()=>({personnel:{id:99,school:'Station A',district:'District 1'}})},
  transaction:{findFirst:async({where})=>{ lastWhere=where; if(databaseFailure)throw new Error('synthetic database unavailable'); return fixture; }},
  validationLog:{findMany:async()=>[]},
};
require.cache[require.resolve('../src/config/prisma')]={exports:{__esModule:true,default:mock}};
const {transactionAccessFilter}=require('../src/utils/transaction-access.util');
const {getTransactionById,getTransactionRequirements}=require('../src/controllers/transactions.controller');
const response=()=>({statusCode:200,status(s){this.statusCode=s;return this},json(body){this.body=body;return this}});
test('personnel and unknown roles cannot get an unscoped transaction predicate', async()=>{
  assert.deepEqual(await transactionAccessFilter({userId:1,role:'TEACHING_PERSONNEL',personnelId:42}),{personnelId:42});
  assert.deepEqual(await transactionAccessFilter({userId:1,role:'TEACHING_PERSONNEL'}),{id:-1});
  assert.deepEqual(await transactionAccessFilter({userId:1,role:'RECORDS_PERSONNEL'}),{id:-1});
  assert.deepEqual(await transactionAccessFilter(),{id:-1});
});
test('AO read policy has both station and subject-role restrictions, division reviewers have access',async()=>{
  const filter=await transactionAccessFilter({userId:2,role:'AO_II'});
  assert.match(JSON.stringify(filter),/Station A/);
  assert.match(JSON.stringify(filter),/TEACHING_PERSONNEL/);
  assert.deepEqual(await transactionAccessFilter({userId:3,role:'HRMO'}),{});
  assert.deepEqual(await transactionAccessFilter({userId:4,role:'SYSTEM_ADMIN'}),{});
});
test('detail and requirements execute the same scoped predicate',async()=>{
  const req={params:{id:'12'},user:{userId:1,role:'TEACHING_PERSONNEL',personnelId:42}};
  await getTransactionById(req,response(),e=>{throw e});
  assert.deepEqual(lastWhere,{AND:[{id:12},{personnelId:42}]});
  await getTransactionRequirements(req,response());
  assert.deepEqual(lastWhere,{AND:[{id:12},{personnelId:42}]});
});
test('database failure propagates as a server failure, never a false 404',async()=>{
  databaseFailure=true;
  const res=response();let failure;
  await getTransactionById({params:{id:'12'},user:{userId:1,role:'HRMO'}},res,e=>{failure=e});
  assert.match(failure.message,/database unavailable/);assert.notEqual(res.statusCode,404);databaseFailure=false;
});
