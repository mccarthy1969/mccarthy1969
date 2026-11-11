import test from 'node:test';
import assert from 'node:assert/strict';
import {applyZoneTarget} from '../lib/engine.mjs';
import {exitReward} from '../lib/exits.mjs';
for(const dir of [1,-1])test('nearest intervening confirmed zone caps targets '+dir,()=>{
 const zone=(distance,t=10,side='supply')=>({t,side,bottom:dir===1?100+distance:100-distance-.05,top:dir===1?100+distance+.05:100-distance});
 const zones=[zone(.8),zone(.5),zone(.1,21),zone(-1),zone(.9,10,'demand')];
 const result=applyZoneTarget(zones,20,dir,100,100+dir*2);
 assert.equal(result.target,100+dir*.5);assert.equal(result.targetZone,zones[1]);
 assert.equal(applyZoneTarget(zones,20,dir,100,100+dir*.2).target,100+dir*.2);
 const plan=[{index:1,target:100+dir*2,percent:80},{index:2,target:null,type:'noLimit',percent:20}];
 const adjusted=applyZoneTarget(zones,20,dir,100,100+dir*2,plan);
 assert.equal(exitReward(adjusted.plan,dir,100),.5);assert.equal(adjusted.plan[1],plan[1]);assert.equal(plan[0].target,100+dir*2);
 assert.equal(applyZoneTarget([zone(.5,21)],20,dir,100,100+dir*2).target,100+dir*2);
});
