import test from 'node:test';
import assert from 'node:assert/strict';
import {ZRCE,defaults,validateConfig} from '../lib/strategy.mjs';
const start=Date.parse('2025-12-18T15:18:00Z')/1000;
function setup(dir=1,enabled=true){const s=new ZRCE({...defaults,targetMode:'fixedRR',minRR:0,allowWickZoneCandles:enabled}),zone={t:start-600,side:dir===1?'demand':'supply',bottom:dir===1?100:99.95,top:dir===1?100.05:100};s.zones.push(zone);s.zoneRuns.set(zone,{phase:0,run:null,target:dir===1?102:98});return {s,zone};}
function feed(s,dir,b,i=0){b={t:start+i*60,o:100.2,c:100.3,h:100.35,l:100.05,v:10,...b};if(dir===-1)b={...b,o:200-b.o,c:200-b.c,h:200-b.l,l:200-b.h};const signal=s.onOpen({t:b.t,o:b.o},618+i);s.onClose(b);return signal;}
test('wick-touch setting defaults on and validates boolean',()=>{assert.equal(defaults.allowWickZoneCandles,true);assert.equal(validateConfig({}).allowWickZoneCandles,true);assert.equal(validateConfig({allowWickZoneCandles:false}).allowWickZoneCandles,false);for(const v of [null,1,'true'])assert.throws(()=>validateConfig({allowWickZoneCandles:v}));});
for(const dir of [1,-1]){
 for(const enabled of [false,true])test('wick touching actual zone qualifies outside close band '+dir+' '+enabled,()=>{const {s}=setup(dir,enabled);feed(s,dir,{});assert.equal(s.events.some(e=>e.label==='Z'),enabled);});
 test('wick must reach actual edge, and may extend through zone '+dir,()=>{
  for(const [low,expected] of [[100.05,true],[100.0501,false],[99.9,true]]){const {s}=setup(dir);feed(s,dir,{l:low});assert.equal(s.events.length>0,expected);}
 });
 test('close band remains valid with wick option disabled '+dir,()=>{const {s}=setup(dir,false);feed(s,dir,{c:100.08,l:100.06});assert.equal(s.events[0].label,'Z');});
 test('invalidating close wins over wick touch '+dir,()=>{const {s,zone}=setup(dir);feed(s,dir,{c:99.9499,l:99.9});assert.equal(s.events.length,0);assert.equal(zone.invalidatedAt,start+60);});
 test('R and directional C retain priority over wick overlap '+dir,()=>{const {s}=setup(dir);feed(s,dir,{c:100.3,l:100.02});feed(s,dir,{o:100.4,c:100.35,l:100.02},1);feed(s,dir,{o:100.35,c:100.4,l:100.02},2);assert.deepEqual(s.events.map(e=>e.label),['Z','R','C']);});
}
test('December 18 09:18 wick retest becomes Z',()=>{const s=new ZRCE({...defaults,targetMode:'fixedRR',minRR:0}),zone={t:start-1380,side:'demand',bottom:676.2,top:676.25};s.zones.push(zone);s.zoneRuns.set(zone,{phase:0,run:null,target:680});const b={t:start,o:676.35,c:676.51,h:676.66,l:676.14,v:60};s.onOpen({t:start,o:b.o},618);s.onClose(b);assert.equal(s.events[0].label,'Z');assert.equal(zone.invalidatedAt,undefined);});
