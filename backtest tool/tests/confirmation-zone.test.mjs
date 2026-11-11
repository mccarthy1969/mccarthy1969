import test from 'node:test';
import assert from 'node:assert/strict';
import {ZRCE,defaults,validateConfig} from '../lib/strategy.mjs';
test('confirmation no-touch defaults off and requires boolean',()=>{assert.equal(validateConfig().confirmationMustNotTouchZone,false);assert.throws(()=>validateConfig({confirmationMustNotTouchZone:1}));});
for(const dir of [1,-1])for(const enabled of [false,true])for(const low of [100.04,100.05,100.06])test('confirmation wick zone boundary '+[dir,enabled,low],()=>{
 const t=1000,s=new ZRCE({...defaults,confirmationMustNotTouchZone:enabled,cooldownMinutes:0});
 const mirror=b=>dir===1?b:{...b,o:200-b.o,c:200-b.c,h:200-b.l,l:200-b.h};
 s.setupBounds={side:dir===1?'demand':'supply',bottom:dir===1?100:99.95,top:dir===1?100.05:100};s.state=2*dir;s.reversal=mirror({t,o:100.02,c:100.15,h:100.2,l:100});s.history=[s.reversal];s.current={};
 s.onClose(mirror({t:t+60,o:100.15,c:100.3,h:100.35,l:low}));
 assert.equal(s.state,enabled&&low<=100.05?10:3*dir);assert.equal(s.rejections['confirmation touches zone']||0,enabled&&low<=100.05?1:0);
});
