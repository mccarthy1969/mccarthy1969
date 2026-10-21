import test from 'node:test';
import assert from 'node:assert/strict';
import {ZRCE,defaults} from '../lib/strategy.mjs';
const start=Date.parse('2025-01-06T14:30:00Z')/1000;
// Demand [100, 100.05] and its supply mirror [99.95, 100].
function sequence({dir=1,z={},r={},confirmation={},width=.05,moveZone=false}={}){
 const strategy=new ZRCE({...defaults,zoneSize:width,targetMode:'fixedRR',minRR:0});
 if(dir===1)strategy.demand=100;else strategy.supply=100;
 let bars=[{o:100.3,h:100.35,l:100.02,c:100.08,...z},{o:100.08,h:100.3,l:100.01,c:100.2,...r},{o:100.2,h:100.4,l:100.1,c:100.3,...confirmation},{o:100.3,h:100.4,l:100.2,c:100.35}];
 if(dir===-1)bars=bars.map(b=>({...b,o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}));
 let signal=null;const states=[];
 for(let i=0;i<bars.length;i++){const b={...bars[i],t:start+i*60,v:60};
  if(moveZone&&i===1){if(dir===1)strategy.demand=90;else strategy.supply=110;}
  const next=strategy.onOpen({t:b.t,o:b.o},570+i);if(next)signal=next;strategy.onClose(b);states.push(strategy.state);
 }return {strategy,signal,states};
}
for(const dir of [1,-1]){
 const side=dir===1?'calls':'puts';
 for(const [low,allowed] of [[100.1,true],[100.1001,false],[100.05,true],[100,true],[99.95,true],[99.9499,false]])test(side+': Z tolerance at mirrored low '+low,()=>{
  const result=sequence({dir,z:{l:low,c:100.15}});assert.equal(result.states[0]===dir,allowed);assert.equal(!!result.signal,allowed);
 });
 for(const [low,allowed] of [[99.95,true],[99.9499,false],[100.01,true]])test(side+': R penetration at mirrored low '+low,()=>{
  const result=sequence({dir,r:{l:low}});assert.equal(result.states[1]===2*dir,allowed);assert.equal(!!result.signal,allowed);
 });
 for(const r of [{o:100.2,c:100.1},{o:100.1,c:100.1}])test(side+': R must reverse Z color '+JSON.stringify(r),()=>{
  const result=sequence({dir,r});assert.equal(result.signal,null);assert.ok(result.states[1]>=10);
 });
 test(side+': wrong-color Z cannot start a setup',()=>{assert.equal(sequence({dir,z:{o:100.1,c:100.2}}).signal,null);});
 for(const [close,allowed] of [[100.05,false],[100.049,false],[100.06,true]])test(side+': C must close beyond zone at mirrored close '+close,()=>{
  assert.equal(!!sequence({dir,confirmation:{o:100.2,h:100.3,l:100.03,c:close}}).signal,allowed);
 });
 test(side+': doji C above zone qualifies without exceeding R close',()=>{
  const result=sequence({dir,confirmation:{o:100.15,c:100.15}});assert.ok(result.signal);assert.equal(result.signal.triggerPrice,dir===1?100.17:99.83);
  assert.equal(result.signal.expiresAt,start+190);assert.equal(result.signal.confirmationClose,dir===1?100.15:99.85);
 });
 test(side+': R may move away without retouching',()=>{assert.ok(sequence({dir,r:{o:100.2,l:100.15,c:100.25,h:100.3}}).signal);});
 test(side+': original Z zone survives a zone update',()=>{
  assert.equal(sequence({dir,moveZone:true,r:{l:99.94}}).signal,null);
  assert.equal(sequence({dir,moveZone:true,confirmation:{c:100.04,l:100.03}}).signal,null);
  assert.ok(sequence({dir,moveZone:true}).signal);
 });
 test(side+': extensions use both zone edges, independently of zone width',()=>{
  assert.ok(sequence({dir,width:.1,z:{l:100.15,c:100.2}}).signal);
  assert.equal(sequence({dir,width:.1,z:{l:100.1501,c:100.2}}).signal,null);
  assert.ok(sequence({dir,width:.1,z:{l:99.95},r:{l:99.95}}).signal);
 });
}
