import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveExit,simulateDay,summarize} from '../lib/engine.mjs';
import {defaults,validateConfig,ZRCE} from '../lib/strategy.mjs';
import {aggregate,marketTime} from '../lib/market.mjs';
// Execution fixtures explicitly disable the filter; integration cases below enable it.
const c={...defaults,spread:0,slippage:0,trendFilter:false};
const p={dir:1,entry:100,stop:99,target:102};
test('long and short exit ambiguity is excluded',()=>{assert.deepEqual(resolveExit(p,{o:100,h:103,l:98},c),{price:null,reason:'AMBIGUOUS',excluded:true});assert.equal(resolveExit({dir:-1,entry:100,stop:101,target:98},{o:100,h:102,l:97},c).excluded,true);});
test('opening gap resolves before subsequent ambiguous range',()=>{assert.equal(resolveExit(p,{o:98.5,h:103,l:98},c).price,98.5);assert.equal(resolveExit(p,{o:103,h:104,l:98},c).price,102);assert.equal(resolveExit({dir:-1,stop:101,target:98},{o:102,h:103,l:97},c).price,102);});
test('spread changes executable triggers and slippage is adverse',()=>{const cost={...c,spread:.02,slippage:.005};assert.equal(resolveExit(p,{o:100,h:102,l:99.5},cost),null);assert.equal(resolveExit(p,{o:100,h:102.02,l:99.5},cost).price,102);assert.equal(resolveExit(p,{o:100,h:101,l:99},cost).price,98.995);const short={dir:-1,stop:101,target:98};assert.equal(resolveExit(short,{o:100,h:101,l:99},cost).price,101.005);});
test('aggregation preserves OHLC and volume',()=>{const r=aggregate([{t:120,o:1,h:3,l:1,c:2,v:10},{t:121,o:2,h:4,l:.5,c:3,v:20},{t:180,o:3,h:3,l:2,c:2,v:4}]);assert.deepEqual(r[0],{t:120,o:1,h:4,l:.5,c:3,v:30,n:2});assert.equal(r.length,2);});
test('New York session clock handles daylight saving',()=>{assert.equal(marketTime(Date.parse('2025-01-06T14:30:00Z')/1000).minute,570);assert.equal(marketTime(Date.parse('2025-07-07T13:30:00Z')/1000).minute,570);});
test('report excludes ambiguous trades and computes realized drawdown',()=>{const rows=[10,-5,-8,20].map((pnl,i)=>({pnl,gross:pnl+1,fees:1,excluded:false,exitTime:i,dir:1,day:'2025-01-06'}));rows.push({excluded:true,pnl:null});const s=summarize(rows,100);assert.equal(s.net,17);assert.equal(s.maxDrawdown,13);assert.equal(s.trades,4);assert.equal(s.excluded,1);assert.equal(s.fees,4);assert.equal(s.winRate,.5);assert.equal(s.returnPct,.17);});
test('reject invalid execution and session settings',()=>{assert.throws(()=>validateConfig({spread:-1}));assert.throws(()=>validateConfig({shares:1.2}));assert.throws(()=>validateConfig({sessionStart:'25:00'}));assert.throws(()=>validateConfig({sessionOverrides:{'2025-11-28':'09:00'}}));assert.equal(validateConfig({spread:.01}).spread,.01);});
// Independent fixture: two completed 5m candles create a demand zone at 100.
function fixture(){const start=Date.parse('2025-01-06T14:30:00Z')/1000;const specs=[];for(let i=0;i<5;i++)specs.push({o:101,h:101.1,l:99.9,c:100});for(let i=0;i<5;i++)specs.push({o:100,h:102.1,l:99.95,c:102});specs.push({o:102,h:102.1,l:101.4,c:101.5}); // run complete -> target 102
 for(let i=0;i<5;i++)specs.push({o:101.8,h:101.9,l:101.3,c:101.5}); specs.push({o:101,h:101.1,l:100,c:100.01}); // Z
 specs.push({o:100.01,h:100.2,l:100,c:100.15}); // R
 specs.push({o:100.15,h:100.4,l:100.1,c:100.3}); // C
 specs.push({o:100.3,h:102.2,l:100.25,c:102}); // E and target
 return {start,minutes:specs.map((x,i)=>({...x,t:start+i*60,v:60}))};}
test('ZRCE creates zone only after 10 completed minutes and respects ZRC sequence',()=>{const {minutes}=fixture(),s=new ZRCE({...c,shares:1});const signals=[];for(let i=0;i<minutes.length;i++){const b=minutes[i],sig=s.onOpen({t:b.t,o:b.o},570+i);if(i<10)assert.equal(s.demand,0);if(sig)signals.push(sig);s.onClose(b);}assert.equal(s.zones[0].t,minutes[10].t);assert.equal(signals.length,1);assert.equal(signals[0].t,minutes[19].t);assert.equal(signals[0].stop,100);assert.equal(signals[0].target,102);assert.deepEqual(s.events.map(x=>x.label),['Z','R','C']);});
test('same entry second exits and no minute-high lookahead at signal time',()=>{const {minutes}=fixture();const rows=minutes.map((b,i)=>({...b,minute:570+i}));const r=simulateDay(rows,{...c,shares:1},'2025-01-06');assert.equal(r.trades.length,1);assert.equal(r.trades[0].reason,'TARGET');assert.equal(r.trades[0].duration,0);assert.ok(Math.abs(r.trades[0].pnl-1.68)<1e-8);});
test('entry second both touched is retained as excluded ledger record',()=>{const {minutes}=fixture();minutes.at(-1).l=99.9;const r=simulateDay(minutes.map((b,i)=>({...b,minute:570+i})),c,'2025-01-06');assert.equal(r.trades.length,1);assert.equal(r.trades[0].reason,'AMBIGUOUS');assert.equal(r.trades[0].pnl,null);});
test('missing minute prevents using stale confirmation for entry',()=>{const {minutes}=fixture();const s=new ZRCE(c);for(let i=0;i<19;i++){s.onOpen({t:minutes[i].t,o:minutes[i].o},570+i);s.onClose(minutes[i]);}const late={...minutes[19],t:minutes[19].t+60};assert.equal(s.onOpen(late,585),null);});
test('short ZRC mirror creates supply, enters short and hits target',()=>{const {minutes}=fixture();const rows=minutes.map((b,i)=>({...b,o:200-b.o,c:200-b.c,h:200-b.l,l:200-b.h,minute:570+i}));const r=simulateDay(rows,{...c,shares:1},'2025-01-06');assert.equal(r.trades.length,1);assert.equal(r.trades[0].dir,-1);assert.equal(r.trades[0].stop,100);assert.equal(r.trades[0].target,98);assert.equal(r.trades[0].reason,'TARGET');assert.ok(Math.abs(r.trades[0].pnl-1.68)<1e-8);});
test('unfinished session position excluded, early close override permits closing',()=>{const {minutes}=fixture();minutes[19]={...minutes[19],h:100.5,c:100.4};const rows=minutes.map((b,i)=>({...b,minute:570+i}));let r=simulateDay(rows,c,'2025-01-06');assert.equal(r.trades[0].reason,'DATA_END');assert.equal(r.trades[0].excluded,true); // Entry forbidden during configured final minute.
 r=simulateDay(rows,{...c,sessionOverrides:{'2025-01-06':'09:50'}},'2025-01-06');assert.equal(r.trades.length,0);});


// Every entry-window bar below represents exactly one second, not a minute range.
function timedFixture({dir=1,triggerAt=5,patch={}}={}){
 const {minutes}=fixture(),t=minutes[19].t;
 const seconds=Array.from({length:60},(_,i)=>({t:t+i,minute:589,v:1,
  ...(i<triggerAt?{o:100.2,h:100.31,l:100.1,c:100.2}:i===triggerAt?{o:100.2,h:100.35,l:100.1,c:100.34}:{o:100.34,h:100.4,l:100.33,c:100.34}),...(patch[i]||{})}));
 let rows=[...minutes.slice(0,19).map((b,i)=>({...b,minute:570+i})),...seconds,{t:t+60,minute:590,v:1,o:100.34,h:102.2,l:100.33,c:102}];
 if(dir===-1)rows=rows.map(b=>({...b,o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}));
 return {rows,t};
}
for(const dir of [1,-1]){
 for(const second of [0,5,9])test('trigger enters '+(dir===1?'call':'put')+' at second '+second,()=>{
  const {rows,t}=timedFixture({dir,triggerAt:second}),r=simulateDay(rows,{...c,shares:1},'2025-01-06');
  assert.equal(r.trades.length,1);const trade=r.trades[0];
  assert.equal(trade.dir,dir);assert.equal(trade.t,t+second);assert.equal(trade.signalTime,t);
  assert.equal(trade.entry,dir===1?100.32:99.68);assert.equal(trade.triggerPrice,trade.entry);
  assert.equal(trade.confirmationClose,dir===1?100.3:99.7);assert.equal(trade.reason,'TARGET');
  assert.equal(trade.duration,60-second);assert.ok(Math.abs(trade.pnl-1.68)<1e-8);
 });
 for(const second of [10,11,59,Infinity])test('trigger expires before second '+second+' for direction '+dir,()=>{
  const {rows}=timedFixture({dir,triggerAt:second}),r=simulateDay(rows,c,'2025-01-06');
  assert.equal(r.trades.length,0);assert.equal(r.rejections['entry window expired'],1);
 });
 test('gap fill and costs use actual opening price for direction '+dir,()=>{
  const {rows,t}=timedFixture({dir,patch:{5:{o:100.36,h:100.4,l:100.33,c:100.36}}});
  const r=simulateDay(rows,{...c,spread:.02,slippage:.005},'2025-01-06');
  assert.equal(r.trades.length,1);assert.equal(r.trades[0].t,t+5);
  assert.ok(Math.abs(r.trades[0].entry-(dir===1?100.375:99.625))<1e-8);
 });
 test('entry-second stop before or after trigger is ambiguous for direction '+dir,()=>{
  const {rows}=timedFixture({dir,patch:{5:{l:99.9}}}),r=simulateDay(rows,c,'2025-01-06');
  assert.equal(r.trades.length,1);assert.equal(r.trades[0].reason,'AMBIGUOUS');assert.equal(r.trades[0].pnl,null);
 });
 test('stop before the trigger second does not exit an unopened position for direction '+dir,()=>{
  const {rows}=timedFixture({dir,patch:{2:{l:99.9}}}),r=simulateDay(rows,c,'2025-01-06');
  assert.equal(r.trades.length,1);assert.equal(r.trades[0].reason,'TARGET');
 });
 test('entry at second open can stop normally within that second for direction '+dir,()=>{
  const {rows}=timedFixture({dir,patch:{5:{o:100.35,h:100.4,l:99.9,c:100.1}}}),r=simulateDay(rows,c,'2025-01-06');
  assert.equal(r.trades.length,1);assert.equal(r.trades[0].reason,'STOP');assert.equal(r.trades[0].excluded,false);
 });
}
test('a touch at the trigger is enough; spread and slippage apply to the fill',()=>{
 const {rows}=timedFixture({patch:{5:{h:100.32,c:100.32}}}),r=simulateDay(rows,{...c,spread:.02,slippage:.005},'2025-01-06');
 assert.equal(r.trades.length,1);assert.ok(Math.abs(r.trades[0].entry-100.335)<1e-8);
});
test('risk check uses the trigger and rejects an adverse gap without retrying',()=>{
 const {rows}=timedFixture({patch:{5:{o:100.6,h:100.65,l:100.5,c:100.6}}}),r=simulateDay(rows,{...c,minRR:4},'2025-01-06');
 assert.equal(r.trades.length,0);assert.equal(r.rejections['reward/risk after costs'],1);
});
for(const missing of [0,3])test('missing entry-window second '+missing+' prevents a later assumed fill',()=>{
 const {rows,t}=timedFixture(),r=simulateDay(rows.filter(b=>b.t!==t+missing),c,'2025-01-06');
 assert.equal(r.trades.length,0);assert.equal(r.rejections['missing entry-window seconds'],1);
});
test('completed entry survives a subsequent missing second',()=>{
 const {rows,t}=timedFixture(),r=simulateDay(rows.filter(b=>b.t!==t+8),c,'2025-01-06');assert.equal(r.trades.length,1);assert.equal(r.trades[0].reason,'TARGET');
});
test('legacy direction gate cannot override the new trigger rule',()=>{
 for(const directionGate of [true,false]){const config=validateConfig({...c,directionGate}),{rows}=timedFixture();
  assert.equal('directionGate' in config,false);assert.equal(simulateDay(rows,config,'2025-01-06').trades[0].entry,100.32);}
});
test('fixed-R target is calculated from trigger price',()=>{
 const {rows}=timedFixture(),r=simulateDay(rows,{...c,targetMode:'fixedRR',fixedRR:2},'2025-01-06');
 assert.equal(r.trades[0].entry,100.32);assert.equal(r.trades[0].target,100.96);
});

function trendFixture({dir=1,bias='with',boundary=false}={}){
 const {start,minutes}=fixture();
 const prefix=Array.from({length:40},(_,i)=>{const p=bias==='with'?80+i*.25:bias==='against'?120-i*.25:100.5;return {t:start+i*60,minute:570+i,o:p,h:p+.05,l:p-.05,c:p,v:bias==='sideways'?10000:60};});
 const setup=[...minutes];if(boundary)setup.splice(16,0,{...minutes[15]});
 let rows=[...prefix,...setup.map((b,i)=>({...b,t:start+(40+i)*60,minute:610+i}))];
 if(dir===-1)rows=rows.map(b=>({...b,o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}));
 return {rows,start,entryTime:rows.at(-1).t};
}
for(const dir of [1,-1]){
 test('confirmed trend allows aligned direction '+dir,()=>{
  const {rows}=trendFixture({dir}),r=simulateDay(rows,{...c,trendFilter:true},'2025-01-06');
  assert.equal(r.trades.length,1,JSON.stringify(r.rejections));assert.equal(r.trades[0].trendAtSignal,dir===1?'up':'down');assert.equal(r.trades[0].trendFilterApplied,true);assert.equal(r.trades[0].reason,'TARGET');
 });
 test('confirmed trend rejects counter-trend direction '+dir,()=>{
  const {rows}=trendFixture({dir,bias:'against'}),r=simulateDay(rows,{...c,trendFilter:true},'2025-01-06');
  assert.equal(r.trades.length,0);assert.equal(r.rejections['trend filter: '+(dir===1?'down':'up')],1,JSON.stringify(r.rejections));
 });
 test('sideways permits direction '+dir,()=>{
  const {rows}=trendFixture({dir,bias:'sideways'}),r=simulateDay(rows,{...c,trendFilter:true},'2025-01-06');
  assert.equal(r.trades.length,1,JSON.stringify(r.rejections));assert.equal(r.trades[0].trendAtSignal,'sideways');
 });
 test('warmup blocks direction '+dir,()=>{
  const {rows}=timedFixture({dir}),r=simulateDay(rows,{...c,trendFilter:true},'2025-01-06');assert.equal(r.trades.length,0);assert.equal(r.rejections['trend filter: unclear'],1);
 });
}
test('new defaults enable trend filtering and invalid flag is rejected',()=>{
 assert.equal(validateConfig({}).trendFilter,true);assert.throws(()=>validateConfig({trendFilter:'yes'}));
 const {rows}=timedFixture();const config={...c};delete config.trendFilter;assert.equal(simulateDay(rows,config,'2025-01-06').trades.length,0);
});
test('a trend update at the signal timestamp is applied at that timestamp',()=>{
 const {rows,entryTime}=trendFixture({boundary:true}),r=simulateDay(rows,{...c,trendFilter:true},'2025-01-06');
 assert.equal(r.trades.length,1,JSON.stringify(r.rejections));assert.equal(r.trades[0].signalTime,entryTime);assert.equal(r.trades[0].trendTime,entryTime);
 assert.equal(r.trades[0].trendAtSignal,r.trends.find(t=>t.t===entryTime).trend);
});
test('later trends cannot allow a setup rejected during warmup',()=>{
 const {rows,t}=timedFixture();for(let i=1;i<=35;i++)rows.push({t:t+60+i*60,minute:590+i,o:103+i,h:104+i,l:102+i,c:103+i,v:100});
 const r=simulateDay(rows,{...c,trendFilter:true},'2025-01-06');assert.ok(r.trends.some(t=>t.trend==='up'));assert.equal(r.trades.length,0);assert.equal(r.rejections['trend filter: unclear'],1);
});
test('an open trade retains its target when the trend later becomes unclear',()=>{
 const {rows,entryTime}=trendFixture();Object.assign(rows.at(-1),{o:100.3,h:100.4,l:100.25,c:100.35});
 for(let i=1;i<=12;i++)rows.push({t:entryTime+i*60,minute:629+i,o:100.35,h:i===12?102.2:100.4,l:100.25,c:100.35,v:0});
 const r=simulateDay(rows,{...c,trendFilter:true},'2025-01-06');assert.ok(r.trends.some(t=>t.t>entryTime&&t.trend==='unclear'));
 assert.equal(r.trades.length,1);assert.equal(r.trades[0].reason,'TARGET');assert.equal(r.trades[0].exitTime,entryTime+720);
});

test('slider threshold changes both confirmed labels and entry eligibility',()=>{
 const {rows}=trendFixture({bias:'against'});
 for(let i=0;i<40;i++){const p=101-i*.01;Object.assign(rows[i],{o:p,h:p+.005,l:p-.005,c:p});}
 const directional=simulateDay(rows,{...c,trendFilter:true,trendSlopeThreshold:0},'2025-01-06');
 const flat=simulateDay(rows,{...c,trendFilter:true,trendSlopeThreshold:.05},'2025-01-06');
 assert.equal(directional.trades.length,0);assert.equal(directional.rejections['trend filter: down'],1);
 assert.equal(flat.trades.length,1);assert.equal(flat.trades[0].trendAtSignal,'sideways');
});
