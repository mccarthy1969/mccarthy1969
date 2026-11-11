import test from 'node:test';
import assert from 'node:assert/strict';
import {ZRCE,defaults} from '../lib/strategy.mjs';
const start=Date.parse('2025-01-06T14:30:00Z')/1000;
// Demand [100, 100.05] and its supply mirror [99.95, 100].
function sequence({dir=1,z={},r={},confirmation={},width=.05,moveZone=false,nonMajor=false,wrongSide=false}={}){
 const strategy=new ZRCE({...defaults,zoneSize:width,allowWickZoneCandles:false,targetMode:'fixedRR',minRR:0});
 if(dir===1)strategy.demand=100;else strategy.supply=100;
 if(nonMajor){
  const major={t:start-600,side:dir===1?'demand':'supply',bottom:dir===1?90:110,top:dir===1?90.05:110.05,major:true};
  const zone={t:start-300,side:(dir===1)!==wrongSide?'demand':'supply',bottom:dir===1?100:99.95,top:dir===1?100.05:100,major:false};
  strategy.zones.push(major,zone);for(const z of strategy.zones)strategy.zoneRuns.set(z,{phase:0,run:null,target:dir===1?102:98});
 }
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
 for(const [close,allowed] of [[99.95,true],[99.9499,false],[100,true],[100.05,true],[100.1,true],[100.1001,false]])test(side+': Z uses close tolerance '+close,()=>{
  const result=sequence({dir,z:{c:close}});assert.equal(result.states[0]===dir,allowed);assert.equal(!!result.signal,allowed);
 });
 for(const low of [99.8,99.95,100.01])test(side+': wicks do not disqualify Z or R '+low,()=>assert.ok(sequence({dir,z:{l:low},r:{l:low}}).signal));
 test(side+': green red and doji near-zone candles all count as Z',()=>{
  for(const o of [99.9,100.08,100.3])assert.ok(sequence({dir,z:{o,c:100.08}}).signal);
 });
 test(side+': a near-zone R candidate becomes another Z',()=>{
  const result=sequence({dir,r:{o:100.2,c:100.08}});assert.deepEqual(result.strategy.events.map(e=>e.label),['Z','Z','R','C']);assert.equal(result.signal,null);
 });
 for(const [open,close,allowed] of [[100.15,100.15,false],[100.2,100.15,false],[100.14,100.15,true]])test(side+': C remains directional '+open+' '+close,()=>{
  const result=sequence({dir,confirmation:{o:open,c:close}});assert.equal(!!result.signal,allowed);
 });
 test(side+': near-zone C restarts the Z sequence',()=>{
  const result=sequence({dir,confirmation:{o:100.03,c:100.06}});assert.equal(result.signal,null);assert.deepEqual(result.strategy.events.map(e=>e.label),['Z','R','Z','R']);
 });
 test(side+': original zone survives updates to other levels',()=>assert.ok(sequence({dir,moveZone:true}).signal));
 test(side+': wider zones use both edges of close band',()=>{
  assert.ok(sequence({dir,width:.1,z:{c:100.15}}).signal);assert.equal(sequence({dir,width:.1,z:{c:100.1501}}).signal,null);
 });
}

for(const dir of [1,-1]){
 test('non-major retest produces a signal on the correct side '+dir,()=>{
  const {signal}=sequence({dir,nonMajor:true});assert.ok(signal);assert.equal(signal.dir,dir);assert.equal(signal.zone.major,false);assert.equal(signal.zone.side,dir===1?'demand':'supply');
 });
 test('wrong zone side cannot authorize a trade '+dir,()=>assert.equal(sequence({dir,nonMajor:true,wrongSide:true}).signal,null));
 test('non-major retest preserves original confirmation edge '+dir,()=>assert.equal(sequence({dir,nonMajor:true,confirmation:{c:100.04,l:100.03}}).signal,null));
}
for(const dir of [1,-1])test('records non-major five-minute zones only after confirmation '+dir,()=>{
 const strategy=new ZRCE({...defaults,targetMode:'fixedRR'});
 const candles=[[101,100],[100,101],[102,101],[101,102]];
 for(let i=0;i<=20;i++){
  const [o,c]=candles[Math.min(3,Math.floor(i/5))];let b={t:start+i*60,o,h:Math.max(o,c)+.1,l:Math.min(o,c)-.1,c,v:10};
  if(dir===-1)b={...b,o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c};
  strategy.onOpen({t:b.t,o:b.o},570+i);
  if(i===9)assert.equal(strategy.zones.length,0);
  if(i===19)assert.equal(strategy.zones.filter(z=>z.side===(dir===1?'demand':'supply')).length,1);
  strategy.onClose(b);
 }
 const zones=strategy.zones.filter(z=>z.side===(dir===1?'demand':'supply'));
 assert.equal(zones.length,2);assert.deepEqual(zones.map(z=>z.major),[true,false]);assert.equal(zones[1].t,start+1200);
 assert.equal(dir===1?strategy.demand:strategy.supply,100);
});

for(const dir of [1,-1])for(const gap of [0,.03,.04,.05,.0501,-.04,-.05,-.0501])test('five-minute meeting tolerance direction '+dir+' gap '+gap,()=>{
 const strategy=new ZRCE({...defaults});
 for(let i=0;i<=10;i++){
  const o=i<5?101:100+gap,c=i<5?100:101;let b={t:start+i*60,o,c,h:Math.max(o,c)+.1,l:Math.min(o,c)-.1,v:10};
  if(dir===-1)b={...b,o:200-b.o,c:200-b.c,h:200-b.l,l:200-b.h};
  strategy.onOpen({t:b.t,o:b.o},570+i);if(i<10)assert.equal(strategy.zones.length,0);strategy.onClose(b);
 }
 assert.equal(strategy.zones.length,Math.abs(gap)<=.05?1:0);if(strategy.zones.length)assert.equal(strategy.zones[0].side,dir===1?'demand':'supply');
});
