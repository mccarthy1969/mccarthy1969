import test from 'node:test';
import assert from 'node:assert/strict';
import {majorZones} from '../public/zones.mjs';
import {ZRCE,defaults,validateConfig} from '../lib/strategy.mjs';
const start=Date.parse('2025-01-06T14:31:00Z')/1000;
test('major-only flag is opt-in and strictly boolean',()=>{
 assert.equal(defaults.majorZonesOnly,false);assert.equal(validateConfig({}).majorZonesOnly,false);assert.equal(validateConfig({majorZonesOnly:true}).majorZonesOnly,true);
 for(const value of [null,1,'true'])assert.throws(()=>validateConfig({majorZonesOnly:value}));
});
test('major selection uses current lowest demand / highest supply, without future information',()=>{
 const a={t:1,side:'demand',bottom:100,top:100.05},b={t:2,side:'demand',bottom:101,top:101.05},c={t:3,side:'supply',bottom:104.95,top:105},d={t:4,side:'supply',bottom:103.95,top:104},future={t:20,side:'demand',bottom:99,top:99.05};
 assert.deepEqual(majorZones([b,future,d,c,a],10),[a,c]);assert.deepEqual(majorZones([a,b,c,d,future],20),[future,c]);assert.deepEqual(majorZones([a,{...a,t:5}],10),[a]);
});
for(const dir of [1,-1])for(const only of [false,true])for(const isMajor of [false,true])test('zone entry direction '+dir+' major-only '+only+' major '+isMajor,()=>{
 const s=new ZRCE({...defaults,majorZonesOnly:only,targetMode:'fixedRR',minRR:0});
 const zone=(base,t)=>dir===1?{t,side:'demand',bottom:base,top:base+.05}:{t,side:'supply',bottom:200-base-.05,top:200-base};
 const target=zone(100,start-600),other=zone(isMajor?101:99,start-300);for(const z of [target,other]){s.zones.push(z);s.zoneRuns.set(z,{phase:0,run:null,target:dir===1?102:98});}
 const bars=[{o:100.3,h:100.35,l:100.02,c:100.08},{o:100.08,h:100.3,l:100.01,c:100.2},{o:100.2,h:100.4,l:100.1,c:100.3},{o:100.3,h:100.4,l:100.2,c:100.35}];let signal=null;
 bars.forEach((b,i)=>{b={...b,t:start+i*60,v:10};if(dir===-1)b={...b,o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c};signal=s.onOpen({t:b.t,o:b.o},571+i)||signal;s.onClose(b);});
 const allowed=!only||isMajor;assert.equal(!!signal,allowed);assert.equal(s.events.some(e=>e.label==='Z'),allowed);
});
for(const dir of [1,-1])for(const phase of [1,2,3])test('setup cancels when its zone retains an active role but loses major role '+dir+' phase '+phase,()=>{
 const s=new ZRCE({...defaults,majorZonesOnly:true,targetMode:'fixedRR',minRR:0});const zone=(base,t)=>dir===1?{t,side:'demand',bottom:base,top:base+.05}:{t,side:'supply',bottom:200-base-.05,top:200-base};
 const add=z=>{s.zones.push(z);s.zoneRuns.set(z,{phase:0,run:null,target:dir===1?102:98});};add(zone(100,start-600));
 const bars=[{o:100.3,h:100.35,l:100.02,c:100.08},{o:100.08,h:100.3,l:100.01,c:100.2},{o:100.2,h:100.4,l:100.1,c:100.3},{o:100.3,h:100.4,l:100.2,c:100.35}];let signal=null;
 bars.forEach((b,i)=>{if(i===phase)add(zone(99,start+i*60));b={...b,t:start+i*60,v:10};if(dir===-1)b={...b,o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c};signal=s.onOpen({t:b.t,o:b.o},571+i)||signal;s.onClose(b);});
 assert.equal(signal,null);assert.equal(s.events.length,phase);assert.equal(s.rejections['setup zone replaced'],1);
});
