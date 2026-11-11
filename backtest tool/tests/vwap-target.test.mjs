import test from 'node:test';
import assert from 'node:assert/strict';
import {applyVwapTarget} from '../lib/engine.mjs';
import {validateConfig,defaults} from '../lib/strategy.mjs';
import {exitReward} from '../lib/exits.mjs';
test('VWAP target mode defaults and validation',()=>{
 assert.equal(defaults.vwapTargetMode,'ignore');
 for(const mode of ['ignore','skip','target'])assert.equal(validateConfig({vwapTargetMode:mode}).vwapTargetMode,mode);
 for(const mode of [null,'bad',true])assert.throws(()=>validateConfig({vwapTargetMode:mode}));
});
for(const dir of [1,-1]){
 const entry=100,target=entry+dir*2,vwap=entry+dir;
 test('VWAP policies mirrored '+dir,()=>{
  assert.equal(applyVwapTarget('ignore',dir,entry,vwap,target).target,target);
  assert.throws(()=>applyVwapTarget('skip',dir,entry,vwap,target),/VWAP between/);
  assert.equal(applyVwapTarget('target',dir,entry,vwap,target).target,vwap);
  for(const level of [entry,target,entry-dir,entry+dir*3,null,NaN])assert.equal(applyVwapTarget('skip',dir,entry,level,target).target,target);
 });
 test('VWAP caps fixed exits, retains runner, and reduces first-target reward '+dir,()=>{
  const plan=[{index:1,target,percent:80},{index:2,type:'noLimit',target:null,percent:20}];
  const result=applyVwapTarget('target',dir,entry,vwap,target,plan);
  assert.equal(exitReward(result.plan,dir,entry),1);assert.equal(result.plan[0].target,vwap);assert.equal(plan[0].target,target);
  assert.equal(result.plan[1],plan[1]);assert.equal(result.target,vwap);
  const runner=[plan[1]];assert.deepEqual(applyVwapTarget('skip',dir,entry,vwap,null,runner),{target:null,plan:runner});
 });
}
