import test from 'node:test';
import assert from 'node:assert/strict';
import {ZRCE,defaults} from '../lib/strategy.mjs';
import {activeZones,displayZones,rateZonePower} from '../public/zones.mjs';
import {applyZoneTarget} from '../lib/engine.mjs';
const start=Date.parse('2026-03-11T15:53:00Z')/1000;
for(const dir of [1,-1]){
 function fixture(){
  const s=new ZRCE({...defaults,targetMode:'fixedRR',minRR:0,cooldownMinutes:0});
  const zone={t:start-600,side:dir===1?'demand':'supply',bottom:dir===1?100:99.95,top:dir===1?100.05:100};
  s.zones.push(zone);s.zoneRuns.set(zone,{phase:0,run:null,target:dir===1?102:98});let i=0;const signals=[];
  const feed=items=>{for(const item of items){let b={t:start+i*60,o:100.2,h:100.4,l:99.8,c:100.08,v:60,...item};if(dir===-1)b={...b,o:200-b.o,c:200-b.c,h:200-b.l,l:200-b.h};const signal=s.onOpen({t:b.t,o:b.o},713+i);if(signal)signals.push(signal);s.onClose(b);i++;}};
  return {s,zone,feed,signals};
 }
 test('consecutive any-color closes support Z Z Z R C E '+dir,()=>{
  const {s,zone,feed,signals}=fixture();feed([{c:100.08},{o:100.03,c:100.03},{o:100.01,c:100.02},{o:100.1,c:100.2},{o:100.2,c:100.3},{o:100.3,c:100.35}]);
  assert.deepEqual(s.events.map(e=>e.label),['Z','Z','Z','R','C']);assert.equal(signals.length,1);assert.equal(signals[0].retestAt,start);assert.equal(zone.invalidatedAt,undefined);assert.equal(signals[0].triggerPrice,dir===1?100.32:99.68);
 });
 test('5-cent close boundary survives and first beyond-side close invalidates permanently '+dir,()=>{
  const {s,zone,feed,signals}=fixture();feed([{c:99.95}]);assert.equal(zone.invalidatedAt,undefined);assert.equal(s.events[0].label,'Z');
  feed([{c:99.9499}]);const end=start+120;assert.equal(zone.invalidatedAt,end);assert.equal(s.state,0);assert.equal(s.rejections['zone invalidated'],1);
  assert.deepEqual(activeZones([zone],end-1),[zone]);assert.deepEqual(activeZones([zone],end),[]);assert.equal(displayZones([zone],end-1)[0].end,null);assert.equal(displayZones([zone],end)[0].end,end);
  s.c.allowZoneReuse=true;feed([{c:100.08},{o:100.08,c:100.2},{o:100.2,c:100.3},{c:100.35}]);assert.equal(signals.length,0);assert.equal(s.events.length,1);
 });
 test('breaking close cancels a pending confirmation '+dir,()=>{
  const {s,zone,feed,signals}=fixture();feed([{c:100.08},{o:100.08,c:100.2}]);assert.equal(s.state,2*dir);feed([{c:99.94}]);assert.equal(s.state,0);assert.ok(zone.invalidatedAt);assert.equal(signals.length,0);
 });
 test('invalidated zones stop capping future targets '+dir,()=>{
  const z={t:0,side:'supply',bottom:dir===1?101:98.95,top:dir===1?101.05:99,invalidatedAt:100};
  assert.equal(applyZoneTarget([z],99,dir,100,100+dir*2).target,100+dir);assert.equal(applyZoneTarget([z],100,dir,100,100+dir*2).target,100+dir*2);
 });
 test('saved-chart lifetime can be reconstructed from completed closes '+dir,()=>{
  const z={t:600,side:dir===1?'demand':'supply',bottom:dir===1?100:99.95,top:dir===1?100.05:100};
  let rows=[{t:600,o:100,c:99.94},{t:660,o:99.94,c:100.2}];if(dir===-1)rows=rows.map(b=>({...b,o:200-b.o,c:200-b.c}));
  assert.equal(rateZonePower(z,rows,659).invalidatedAt,null);assert.equal(rateZonePower(z,rows,660).invalidatedAt,660);
 });
}
test('March 11 price sequence supports 11:54 and 11:55 consecutive supply Z candles',()=>{
 const s=new ZRCE({...defaults,targetMode:'fixedRR',minRR:0,cooldownMinutes:0});const zone={t:Date.parse('2026-03-11T15:40:00Z')/1000,side:'supply',bottom:674.87,top:674.92};s.zones.push(zone);s.zoneRuns.set(zone,{phase:0,run:null,target:673});
 const first=Date.parse('2026-03-11T15:52:00Z')/1000;
 const prices=[[674.8,674.85],[674.83,674.81],[674.81,674.97],[674.92,674.94],[674.9,674.7],[674.78,674.65],[674.64,674.27]];
 const signals=[];for(let i=0;i<prices.length;i++){const [o,c]=prices[i],b={t:first+i*60,o,c,h:Math.max(o,c)+.1,l:Math.min(o,c)-.1,v:10};const signal=s.onOpen({t:b.t,o:b.o},712+i);if(signal)signals.push(signal);s.onClose(b);}
 assert.deepEqual(s.events.map(e=>[new Date(e.t*1000).toISOString().slice(11,16),e.label]),[['15:52','Z'],['15:53','R'],['15:54','Z'],['15:55','R'],['15:56','C']]);
 assert.equal(signals.length,1);assert.equal(zone.invalidatedAt,undefined);
});
for(const dir of [1,-1])for(const [open,close,reversal] of [[100.1,100.09,true],[100.09,100.09,true],[100.05,100.09,true],[100.1,100.08,false],[100.1,100.07,false]])test('R compares close against latest Z, not candle color or zone band '+dir+' '+open+' '+close,()=>{
 const s=new ZRCE({...defaults,targetMode:'fixedRR',minRR:0}),zone={t:start-300,side:dir===1?'demand':'supply',bottom:dir===1?100:99.95,top:dir===1?100.05:100};s.zones.push(zone);s.zoneRuns.set(zone,{phase:0,run:null,target:dir===1?102:98});
 const specs=[{o:100.2,c:100.08},{o:open,c:close}];for(let i=0;i<specs.length;i++){let b={...specs[i],t:start+i*60,h:100.3,l:99.9,v:10};if(dir===-1)b={...b,o:200-b.o,c:200-b.c,h:200-b.l,l:200-b.h};s.onOpen({t:b.t,o:b.o},570+i);s.onClose(b);}
 assert.equal(s.state,(reversal?2:1)*dir);assert.deepEqual(s.events.map(e=>e.label),['Z',reversal?'R':'Z']);
});
for(const dir of [1,-1])test('invalidating one zone can start Z on another zone on the same candle '+dir,()=>{
 const s=new ZRCE({...defaults,targetMode:'fixedRR',minRR:0});
 const zone=(bottom,t)=>dir===1?{t,side:'demand',bottom,top:bottom+.05}:{t,side:'supply',bottom:200-bottom-.05,top:200-bottom};
 const lower=zone(100,start-600),higher=zone(100.08,start-300);s.zones.push(lower,higher);for(const z of s.zones)s.zoneRuns.set(z,{phase:0,run:null,target:dir===1?102:98});
 const specs=[[100.2,100.1],[100.1,100.02],[100.02,100.08],[100.08,100.2],[100.2,100.3]],signals=[];
 for(let i=0;i<specs.length;i++){const [o,c]=specs[i];let b={t:start+i*60,o,c,h:Math.max(o,c)+.02,l:Math.min(o,c)-.02,v:60};if(dir===-1)b={...b,o:200-b.o,c:200-b.c,h:200-b.l,l:200-b.h};const signal=s.onOpen({t:b.t,o:b.o},713+i);if(signal)signals.push(signal);s.onClose(b);if(i===1){assert.equal(s.setupZone,lower);assert.equal(s.state,dir);}}
 assert.equal(higher.invalidatedAt,start+120);assert.equal(lower.invalidatedAt,undefined);assert.deepEqual(s.events.map(e=>e.label),['Z','Z','R','C']);assert.equal(s.events[1].zone.t,lower.t);assert.equal(signals.length,1);assert.equal(signals[0].zone.t,lower.t);
});
