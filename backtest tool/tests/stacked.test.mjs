import test from 'node:test';
import assert from 'node:assert/strict';
import {ZRCE,defaults,validateConfig} from '../lib/strategy.mjs';
import {simulateDay} from '../lib/engine.mjs';
const start=Date.parse('2025-01-06T15:30:00Z')/1000;
test('stacked defaults and validation',()=>{
 assert.equal(validateConfig().stackedCandles,false);assert.equal(validateConfig().stackedCandleMarginCents,1);
 for(const v of [-1,NaN,'1',1.1])assert.throws(()=>validateConfig({stackedCandleMarginCents:v}));
 assert.throws(()=>validateConfig({stackedCandles:1}));
});
for(const dir of [1,-1])for(const enabled of [false,true])for(const overlap of [.01,.011])test('confirmation stack '+[dir,enabled,overlap],()=>{
 const s=new ZRCE({...defaults,stackedCandles:enabled,cooldownMinutes:0});
 const mirror=b=>dir===1?b:{...b,o:200-b.o,c:200-b.c,h:200-b.l,l:200-b.h};
 const z={side:dir===1?'demand':'supply',bottom:dir===1?100:99.95,top:dir===1?100.05:100};
 s.setupBounds=z;s.state=2*dir;s.reversal=mirror({t:start,o:100.02,c:100.15,h:100.2,l:100});s.history=[s.reversal];s.current={};
 s.onClose(mirror({t:start+60,o:100.15,c:100.3,h:100.35,l:100.15-overlap}));
 assert.equal(s.state,enabled&&overlap>.01?10:3*dir);
});
for(const dir of [1,-1])for(const overlap of [.01,.011])test('entry stack causal check '+[dir,overlap],()=>{
 const original=ZRCE.prototype.onOpen;
 ZRCE.prototype.onOpen=function(b){if(b.t!==start)return null;return {dir,stop:dir===1?99:101,target:dir===1?102:98,triggerPrice:100+dir*.02,confirmationClose:100,confirmationTime:b.t-60,signalTime:b.t,t:b.t,expiresAt:b.t+10,entryWindowSeconds:10};};
 try{
 const mirror=b=>dir===1?b:{...b,o:200-b.o,c:200-b.c,h:200-b.l,l:200-b.h};
 const rows=[mirror({t:start,minute:630,o:100,h:100.01,l:100-overlap,c:100}),mirror({t:start+1,minute:630,o:100,h:100.03,l:100,c:100.03}),mirror({t:start+60,minute:631,o:100.03,h:102,l:100.03,c:102})];
 const c={...defaults,stackedCandles:true,tradeBothDirections:true,spread:0,slippage:0,minRR:0};
 const result=simulateDay(rows,c,'2025-01-06');
 assert.equal(result.rejections['stacked entry overlap']||0,overlap>.01?1:0);
 assert.equal(result.trades.length,overlap>.01?0:1);
 }finally{ZRCE.prototype.onOpen=original;}
});
