const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,name);
const {singleFlight} = require('../src/api/session-refresh.ts');

test('simultaneous expired requests share one token refresh',async()=>{
  let calls=0;let release;
  const refresh=singleFlight(async()=>{calls++;return new Promise(resolve=>{release=resolve})});
  const requests=[refresh(),refresh(),refresh()];
  await Promise.resolve(); assert.equal(calls,1);release('fresh-token');
  assert.deepEqual(await Promise.all(requests),['fresh-token','fresh-token','fresh-token']);
});
test('a failed refresh releases the shared promise for a later retry',async()=>{
  let calls=0;
  const refresh=singleFlight(async()=>{if(++calls===1)throw new Error('network');return 'recovered'});
  const failures=await Promise.allSettled([refresh(),refresh()]);
  assert.equal(calls,1); assert.ok(failures.every(r=>r.status==='rejected'));
  assert.equal(await refresh(),'recovered'); assert.equal(calls,2);
});
