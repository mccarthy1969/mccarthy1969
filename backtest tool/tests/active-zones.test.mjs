import test from 'node:test';
import assert from 'node:assert/strict';
import {ZRCE,defaults} from '../lib/strategy.mjs';
import {activeZones} from '../public/zones.mjs';
const start=Date.parse('2025-01-06T14:30:00Z')/1000;
for(const dir of [1,-1]){
 const mirror=b=>dir===1?b:{...b,o:200-b.o,c:200-b.c,h:200-b.l,l:200-b.h};
 const zone=(bottom,t)=>dir===1?{side:'demand',bottom,top:bottom+.05,t}:{side:'supply',bottom:200-bottom-.05,top:200-bottom,t};
 const bars=[{o:100.3,h:100.35,l:100.02,c:100.08},{o:100.08,h:100.3,l:100.01,c:100.2},{o:100.2,h:100.4,l:100.1,c:100.3},{o:100.3,h:100.4,l:100.2,c:100.35}];
 function setup(){const s=new ZRCE({...defaults,targetMode:'fixedRR',minRR:0});const add=(bottom,t)=>{const z=zone(bottom,t);s.zones.push(z);s.zoneRuns.set(z,{phase:0,run:null,target:dir===1?102:98});return z;};const original=add(100,start-600);add(101,start-300);return {s,add,original};}
 for(const phase of [1,2,3])test('new zone preserves setup at stage '+phase+' direction '+dir,()=>{
  const {s,add,original}=setup();let signal=null;
  for(let i=0;i<4;i++){
   if(i===phase)add(99,start+i*60);
   const b=mirror({...bars[i],t:start+i*60,v:60});
   signal=s.onOpen({t:b.t,o:b.o},570+i)||signal;
   s.onClose(b);
  }
  assert.ok(signal);assert.equal(s.rejections['setup zone replaced'],undefined);assert.equal(s.events.length,3);
  assert.ok(activeZones(s.zones,start+240).includes(original));
 });
 test('new extreme does not cancel a zone that retains its other extreme role '+dir,()=>{
  const {s,original}=setup();s.zones.splice(1); // original is both high and low
  const b=mirror({...bars[0],t:start,v:60});s.onOpen({t:b.t,o:b.o},570);s.onClose(b);
  const next=zone(101,start+60);s.zones.push(next);s.zoneRuns.set(next,{phase:0,run:null,target:null});
  const r=mirror({...bars[1],t:start+60,v:60});s.onOpen({t:r.t,o:r.o},571);s.onClose(r);
  assert.equal(s.state,2*dir);assert.equal(s.setupZone,original);
 });
}
