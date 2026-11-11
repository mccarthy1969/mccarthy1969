import test from 'node:test';
import assert from 'node:assert/strict';
import {ZRCE,defaults,validateConfig} from '../lib/strategy.mjs';
const start=Date.parse('2025-01-06T14:31:00Z')/1000;
const z={o:100.3,h:100.35,l:100.02,c:100.08},r={o:100.08,h:100.3,l:100.01,c:100.2},c={o:100.2,h:100.4,l:100.1,c:100.3},e={o:100.3,h:100.4,l:100.2,c:100.35},away={o:100.3,h:100.4,l:100.2,c:100.35};
for(const dir of [1,-1]){
 function fixture(){const strategy=new ZRCE({...defaults,targetMode:'fixedRR',cooldownMinutes:0,minRR:0});let i=0;const zone=dir===1?{t:start-300,side:'demand',bottom:100,top:100.05}:{t:start-300,side:'supply',bottom:99.95,top:100};strategy.zones.push(zone);strategy.zoneRuns.set(zone,{phase:0,run:null,target:dir===1?102:98});const signals=[];
 const feed=rows=>{for(let b of rows){b={...b,t:start+i*60,v:10};if(dir===-1)b={...b,o:200-b.o,c:200-b.c,h:200-b.l,l:200-b.h};const signal=strategy.onOpen({t:b.t,o:b.o},571+i);if(signal){signals.push(signal);strategy.markZoneTraded(signal.zone);}strategy.onClose(b);i++;}};
 return {strategy,zone,signals,feed};}

 for(const [name,first,valid] of [['failed C',[z,r,{...c,o:100.3,c:100.2}],false],['valid first attempt',[z,r,c,e],true],['any-color Z',[{...z,o:99.9},r,c,e],true],['deep-wick Z',[{...z,l:99.8},r,c,e],true]])test(name+' permits retries until an executed trade direction '+dir,()=>{
  const {strategy,zone,signals,feed}=fixture();feed(first);feed(Array(25).fill(away));const prior=signals.length;feed([z,r,c,e]);assert.equal(signals.length,valid?prior:prior+1);assert.equal(strategy.events.filter(x=>x.label==='Z').length,valid?1:2);assert.ok(strategy.retestedZones.has(zone));assert.equal(prior,valid?1:0);
 });
 test('cooldown touch does not consume a later attempt '+dir,()=>{const {strategy,zone,signals,feed}=fixture();strategy.state=12;feed([z]);assert.ok(strategy.retestedZones.has(zone));feed(Array(5).fill(away));feed([z,r,c,e]);assert.equal(signals.length,1);assert.equal(strategy.events.length,3);});
 for(const [name,first] of [['failed first attempt',[z,{...r,c:100.04}]],['completed first attempt',[z,r,c,e]]])test('reuse enabled after '+name+' direction '+dir,()=>{
  const {strategy,signals,feed}=fixture();strategy.c.allowZoneReuse=true;feed(first);feed(Array(25).fill(away));const before=signals.length;feed([z,r,c,e]);assert.equal(signals.length,before+1);if(name==='completed first attempt')assert.equal(signals.length,2);
 });
 test('reuse does not bypass cooldown '+dir,()=>{const {strategy,signals,feed}=fixture();strategy.c.allowZoneReuse=true;strategy.state=12;feed([z,r,c,e]);assert.equal(signals.length,0);});
 test('untouched zone remains eligible and allows first ZRC '+dir,()=>{const {strategy,zone,signals,feed}=fixture();feed([away,away]);assert.ok(!strategy.retestedZones.has(zone));feed([z,r,c,e]);assert.equal(signals.length,1);assert.deepEqual(strategy.events.map(x=>x.label),['Z','R','C']);});
 test('new overlapping formation has its own first-touch opportunity '+dir,()=>{const {strategy,zone,signals,feed}=fixture();feed([z,r,{...c,o:100.3,c:100.2}]);feed(Array(25).fill(away));const duplicate={...zone,t:start+1200};strategy.zones.push(duplicate);strategy.zoneRuns.set(duplicate,{phase:0,run:null,target:dir===1?102:98});feed([z,r,c,e]);assert.equal(signals.length,1);});
}

test('zone reuse is opt-in and strictly boolean',()=>{assert.equal(defaults.allowZoneReuse,false);assert.equal(validateConfig({}).allowZoneReuse,false);assert.equal(validateConfig({allowZoneReuse:true}).allowZoneReuse,true);for(const value of [null,1,'true'])assert.throws(()=>validateConfig({allowZoneReuse:value}));});
