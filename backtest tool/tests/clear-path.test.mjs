import test from 'node:test';
import assert from 'node:assert/strict';
import {checkClearPath} from '../lib/clear-path.mjs';
import {validateConfig} from '../lib/strategy.mjs';
import {simulateDay} from '../lib/engine.mjs';
import {ZRCE,defaults} from '../lib/strategy.mjs';
test('clear path defaults off and validates boolean',()=>{assert.equal(validateConfig().clearPath,false);assert.throws(()=>validateConfig({clearPath:1}));});
for(const dir of [1,-1]){
 const mirror=b=>dir===1?b:{...b,o:200-b.o,c:200-b.c,h:200-b.l,l:200-b.h};
 const specs=[{t:0,o:103,c:102,h:103,l:101.5},{t:60,o:102,c:102,h:102.2,l:101.4},{t:120,o:102,c:100,h:102,l:100}];
 const opts={dir,entry:100,target:dir===1?103:97,retestAt:180};
 test('opposite-color return with doji passes '+dir,()=>assert.equal(checkClearPath(specs.map(mirror),opts).ok,true));
 test('one same-color candle blocks '+dir,()=>assert.equal(checkClearPath(specs.map((b,i)=>mirror(i===1?{...b,o:101.7,c:102}:b)),opts).ok,false));
 test('later ZRCE and future candles cannot change path '+dir,()=>assert.equal(checkClearPath([...specs,{t:180,o:100,c:104,h:104,l:100}].map(mirror),opts).ok,true));
 test('missing minute and absent target reject '+dir,()=>{assert.equal(checkClearPath(specs.filter(b=>b.t!==60).map(mirror),opts).ok,false);assert.equal(checkClearPath(specs.map(mirror),{...opts,target:null}).ok,false);assert.equal(checkClearPath(specs.map(mirror),{...opts,zoneCreatedAt:60}).ok,false);});
 test('latest target visit replaces older mixed move '+dir,()=>{const old=[{t:-60,o:101,c:102,h:102,l:101}];assert.equal(checkClearPath([...old,...specs].map(mirror),opts).ok,true);});
}
for(const enabled of [false,true])test('engine enforces clear path only when on '+enabled,()=>{
 const t=Date.parse('2025-01-06T15:30:00Z')/1000,original=ZRCE.prototype.onOpen;
 ZRCE.prototype.onOpen=function(b){return b.t===t?{dir:1,stop:99,target:102,triggerPrice:100,confirmationClose:99.98,confirmationTime:t-60,retestAt:t-180,signalTime:t,t,expiresAt:t+10,entryWindowSeconds:10}:null;};
 try{const rows=[{t,minute:630,o:100,h:100.1,l:100,c:100.1,v:1},{t:t+60,minute:631,o:100.1,h:102,l:100.1,c:102,v:1}];const r=simulateDay(rows,{...defaults,clearPath:enabled,tradeBothDirections:true,spread:0,minRR:0},'2025-01-06');assert.equal(r.trades.length,enabled?0:1);if(enabled)assert.equal(r.rejections['clear path: target not visited'],1);}finally{ZRCE.prototype.onOpen=original;}
});

for(const dir of [1,-1])test('clear path continues checking after first entry touch '+dir,()=>{
 const mirror=b=>dir===1?b:{...b,o:200-b.o,c:200-b.c,h:200-b.l,l:200-b.h};
 const bars=[{t:0,o:103,c:102,h:103,l:101},{t:60,o:102,c:100,h:102,l:99.9},{t:120,o:100.5,c:101,h:101.2,l:100.4},{t:180,o:101,c:99,h:101,l:99}].map(mirror);
 const result=checkClearPath(bars,{dir,entry:100,target:dir===1?103:97,retestAt:240});assert.equal(result.ok,false);assert.equal(result.candleTime,120);
});
