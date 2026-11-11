import test from 'node:test';
import assert from 'node:assert/strict';
import {ZRCE,defaults,validateConfig} from '../lib/strategy.mjs';
const start=Date.parse('2024-04-08T17:48:00Z')/1000;
function run(specs,{dir=1,enabled=true,fill=false}={}){
 const s=new ZRCE({...defaults,targetMode:'fixedRR',minRR:0,ignoreSingleDoji:enabled}),zone={t:start-600,side:dir===1?'demand':'supply',bottom:dir===1?100:99.95,top:dir===1?100.05:100};s.zones.push(zone);s.zoneRuns.set(zone,{phase:0,run:null,target:dir===1?102:98});
 const signals=[],states=[];for(let i=0;i<specs.length;i++){let b={t:start+i*60,o:100.1,c:100.1,h:100.5,l:99.9,v:10,...specs[i]};if(dir===-1)b={...b,o:200-b.o,c:200-b.c,h:200-b.l,l:200-b.h};const signal=s.onOpen({t:b.t,o:b.o},768+i);if(signal){signals.push(signal);if(fill)s.markZoneTraded(signal.zone);}s.onClose(b);states.push(s.state);}
 return {s,signals,states,zone};
}
const z={o:100.2,c:100.02},r={o:100.02,c:100.15},c={o:100.15,c:100.3},e={o:100.3,c:100.4},doji={o:100.1,c:100.1};
test('doji option defaults off and validates boolean',()=>{assert.equal(defaults.ignoreSingleDoji,false);assert.equal(validateConfig({ignoreSingleDoji:true}).ignoreSingleDoji,true);for(const v of [null,1,'true'])assert.throws(()=>validateConfig({ignoreSingleDoji:v}));});
for(const dir of [1,-1]){
 test('single doji after Z preserves original Z comparison '+dir,()=>{
  const result=run([z,{o:100.2,c:100.2},{o:100.15,c:100.16},c,e],{dir});assert.deepEqual(result.s.events.map(e=>e.label),['Z','R','C']);assert.equal(result.signals.length,1);
 });
 test('single doji after R permits C on next candle '+dir,()=>{
  const result=run([z,r,doji,c,e],{dir});assert.deepEqual(result.s.events.map(e=>e.label),['Z','R','C']);assert.equal(result.signals.length,1);assert.equal(result.signals[0].t,start+240);assert.equal(result.signals[0].retestAt,start);
  assert.equal(run([z,r,doji,c,e],{dir,enabled:false}).signals.length,0);
 });
 test('unfilled doji entry minute allows one fresh window with original C trigger '+dir,()=>{
  const result=run([z,r,c,{o:100.2,c:100.2},e],{dir});assert.equal(result.signals.length,2);assert.equal(result.signals[0].triggerPrice,result.signals[1].triggerPrice);assert.equal(result.signals[1].confirmationTime,start+120);assert.equal(result.signals[1].signalTime,start+240);assert.equal(result.signals[1].expiresAt,start+250);
 });
 test('two consecutive dojis are not both ignored '+dir,()=>{
  const result=run([z,r,c,doji,doji,e],{dir});assert.equal(result.signals.length,2);assert.equal(result.states[4],0);
 });
 test('filled entry candle is never skipped or reentered '+dir,()=>{
  const result=run([z,r,c,doji,e],{dir,fill:true});assert.equal(result.signals.length,1);assert.equal(result.states[3],0);
 });
 test('doji cannot override zone invalidation '+dir,()=>{
  const result=run([z,{o:99.94,c:99.94},r,c,e],{dir});assert.ok(result.zone.invalidatedAt);assert.equal(result.signals.length,0);assert.equal(result.states[1],0);
 });
}
for(const dir of [1,-1])test('Z wick stays in stop calculation across an ignored doji '+dir,()=>{
 const result=run([{...z,h:100.7,l:99.7},{...r,h:100.4,l:99.9},doji,{...c,h:100.5,l:99.9},e],{dir});
 assert.equal(result.signals.length,1);assert.equal(result.signals[0].stop,dir===1?99.7:100.3);assert.equal(dir===1?result.signals[0].zoneCandleRange.l:result.signals[0].zoneCandleRange.h,dir===1?99.7:100.3);
});
for(const dir of [1,-1])test('stop preserves extreme across multiple Z candles outside rolling lookback '+dir,()=>{
 const result=run([{...z,h:100.8,l:99.6},{...z,o:100.2,c:100.01,h:100.4,l:99.9},r,doji,c,e],{dir});assert.equal(result.signals.length,1);assert.equal(result.signals[0].stop,dir===1?99.6:100.4);
});
