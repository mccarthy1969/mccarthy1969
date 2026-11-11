import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveExit,simulateDay,summarize} from '../lib/engine.mjs';
import {defaults,validateConfig,ZRCE} from '../lib/strategy.mjs';
import {aggregate,marketTime} from '../lib/market.mjs';
// Execution fixtures use an earlier configured open so their setups are inside the entry window.
// Dedicated time-boundary cases below use the actual 09:30 open.
const c={...defaults,sessionStart:'09:00',tradingStart:'09:30',spread:0,slippage:0,tradeBothDirections:true,trendFilter:false};
const p={dir:1,entry:100,stop:99,target:102};
test('long and short exit ambiguity is excluded',()=>{assert.deepEqual(resolveExit(p,{o:100,h:103,l:98},c),{price:null,reason:'AMBIGUOUS',excluded:true});assert.equal(resolveExit({dir:-1,entry:100,stop:101,target:98},{o:100,h:102,l:97},c).excluded,true);});
test('opening gap resolves before subsequent ambiguous range',()=>{assert.equal(resolveExit(p,{o:98.5,h:103,l:98},c).price,98.5);assert.equal(resolveExit(p,{o:103,h:104,l:98},c).price,102);assert.equal(resolveExit({dir:-1,stop:101,target:98},{o:102,h:103,l:97},c).price,102);});
test('spread changes executable triggers and slippage is adverse',()=>{const cost={...c,spread:.02,slippage:.005};assert.equal(resolveExit(p,{o:100,h:102,l:99.5},cost),null);assert.equal(resolveExit(p,{o:100,h:102.02,l:99.5},cost).price,102);assert.equal(resolveExit(p,{o:100,h:101,l:99},cost).price,98.995);const short={dir:-1,stop:101,target:98};assert.equal(resolveExit(short,{o:100,h:101,l:99},cost).price,101.005);});
test('aggregation preserves OHLC and volume',()=>{const r=aggregate([{t:120,o:1,h:3,l:1,c:2,v:10},{t:121,o:2,h:4,l:.5,c:3,v:20},{t:180,o:3,h:3,l:2,c:2,v:4}]);assert.deepEqual(r[0],{t:120,o:1,h:4,l:.5,c:3,v:30,n:2});assert.equal(r.length,2);});
test('New York session clock handles daylight saving',()=>{assert.equal(marketTime(Date.parse('2025-01-06T14:30:00Z')/1000).minute,570);assert.equal(marketTime(Date.parse('2025-07-07T13:30:00Z')/1000).minute,570);});
test('report excludes ambiguous trades and computes realized drawdown',()=>{const rows=[10,-5,-8,20].map((pnl,i)=>({pnl,gross:pnl+1,fees:1,excluded:false,exitTime:i,dir:1,day:'2025-01-06'}));rows.push({excluded:true,pnl:null});const s=summarize(rows,100);assert.equal(s.net,17);assert.equal(s.maxDrawdown,13);assert.equal(s.trades,4);assert.equal(s.excluded,1);assert.equal(s.fees,4);assert.equal(s.winRate,.5);assert.equal(s.returnPct,.17);assert.equal(s.averageWinLossPerEntry,4.25);assert.equal(summarize([],100).averageWinLossPerEntry,0);});
test('reject invalid execution and session settings',()=>{assert.throws(()=>validateConfig({spread:-1}));assert.throws(()=>validateConfig({shares:1.2}));assert.throws(()=>validateConfig({sessionStart:'25:00'}));assert.throws(()=>validateConfig({sessionOverrides:{'2025-11-28':'09:00'}}));assert.equal(validateConfig({spread:.01}).spread,.01);});
// Independent fixture: two completed 5m candles create a demand zone at 100.
function fixture(){const start=Date.parse('2025-01-06T14:30:00Z')/1000;const specs=[];for(let i=0;i<5;i++)specs.push({o:101,h:101.1,l:99.9,c:100});for(let i=0;i<5;i++)specs.push({o:100,h:102.1,l:99.95,c:102});specs.push({o:102,h:102.1,l:101.4,c:101.5}); // run complete -> target 102
 for(let i=0;i<5;i++)specs.push({o:101.8,h:101.9,l:101.3,c:101.5}); specs.push({o:101,h:101.1,l:100,c:100.01}); // Z
 specs.push({o:100.01,h:100.2,l:100,c:100.15}); // R
 specs.push({o:100.15,h:100.4,l:100.1,c:100.3}); // C
 specs.push({o:100.3,h:102.2,l:100.25,c:102}); // E and target
 return {start,minutes:specs.map((x,i)=>({...x,t:start+i*60,v:60}))};}
test('ZRCE creates zone only after 10 completed minutes and respects ZRC sequence',()=>{const {minutes}=fixture(),s=new ZRCE({...c,shares:1});const signals=[];for(let i=0;i<minutes.length;i++){const b=minutes[i],sig=s.onOpen({t:b.t,o:b.o},570+i);if(i<10)assert.equal(s.demand,0);if(sig)signals.push(sig);s.onClose(b);}assert.equal(s.zones[0].t,minutes[10].t);assert.equal(signals.length,1);assert.equal(signals[0].t,minutes[19].t);assert.equal(signals[0].stop,100);assert.equal(signals[0].target,102);assert.deepEqual(s.events.map(x=>x.label),['Z','R','C']);});
test('same entry second exits and no minute-high lookahead at signal time',()=>{const {minutes}=fixture();const rows=minutes.map((b,i)=>({...b,minute:570+i}));const r=simulateDay(rows,{...c,shares:1},'2025-01-06');assert.equal(r.trades.length,1);assert.equal(r.trades[0].reason,'TARGET');assert.equal(r.trades[0].duration,0);assert.ok(Math.abs(r.trades[0].pnl-1.63)<1e-8);});
test('entry second both touched is retained as excluded ledger record',()=>{const {minutes}=fixture();minutes.at(-1).l=99.9;const r=simulateDay(minutes.map((b,i)=>({...b,minute:570+i})),c,'2025-01-06');assert.equal(r.trades.length,1);assert.equal(r.trades[0].reason,'AMBIGUOUS');assert.equal(r.trades[0].pnl,null);});
test('missing minute prevents using stale confirmation for entry',()=>{const {minutes}=fixture();const s=new ZRCE(c);for(let i=0;i<19;i++){s.onOpen({t:minutes[i].t,o:minutes[i].o},570+i);s.onClose(minutes[i]);}const late={...minutes[19],t:minutes[19].t+60};assert.equal(s.onOpen(late,585),null);});
test('short ZRC mirror creates supply, enters short and hits target',()=>{const {minutes}=fixture();const rows=minutes.map((b,i)=>({...b,o:200-b.o,c:200-b.c,h:200-b.l,l:200-b.h,minute:570+i}));const r=simulateDay(rows,{...c,shares:1},'2025-01-06');assert.equal(r.trades.length,1);assert.equal(r.trades[0].dir,-1);assert.equal(r.trades[0].stop,100);assert.equal(r.trades[0].target,98.05);assert.equal(r.trades[0].reason,'TARGET');assert.ok(Math.abs(r.trades[0].pnl-1.63)<1e-8);});
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
  assert.equal(trade.duration,60-second);assert.ok(Math.abs(trade.pnl-1.63)<1e-8);
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
for(const missing of [0,3])test('short missing entry-window second '+missing+' permits a later observed fill',()=>{
 const {rows,t}=timedFixture(),r=simulateDay(rows.filter(b=>b.t!==t+missing),c,'2025-01-06');
 assert.equal(r.trades.length,1);assert.equal(r.trades[0].t,t+5);assert.ok(r.trades[0].entryDataGaps.length>0);
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
  const {rows}=trendFixture({dir}),r=simulateDay(rows,{...c,tradeBothDirections:false,trendFilter:true},'2025-01-06');
  assert.equal(r.trades.length,1,JSON.stringify(r.rejections));assert.equal(r.trades[0].trendAtSignal,dir===1?'up':'down');assert.equal(r.trades[0].trendFilterApplied,true);assert.equal(r.trades[0].reason,'TARGET');
 });
 test('confirmed trend rejects counter-trend direction '+dir,()=>{
  const {rows}=trendFixture({dir,bias:'against'}),r=simulateDay(rows,{...c,tradeBothDirections:false,trendFilter:true},'2025-01-06');
  assert.equal(r.trades.length,0);assert.equal(r.rejections['trend filter: '+(dir===1?'down':'up')],1,JSON.stringify(r.rejections));
 });
 test('selected sideways permits both directions with flag off '+dir,()=>{
  const {rows}=trendFixture({dir,bias:'sideways'}),r=simulateDay(rows,{...c,tradeBothDirections:false,trendFilter:true},'2025-01-06');
  assert.equal(r.trades.length,1);assert.equal(r.trades[0].trendAtSignal,'sideways');
 });
 test('missing recent volume blocks direction '+dir,()=>{
  const {rows}=timedFixture({dir});for(const row of rows)row.v=0;const r=simulateDay(rows,{...c,tradeBothDirections:false,trendFilter:true},'2025-01-06');assert.equal(r.trades.length,0);assert.equal(r.rejections['trend filter: unclear'],1);
 });
}
test('new defaults enable trend filtering and invalid flag is rejected',()=>{
 assert.equal(validateConfig({}).trendFilter,true);assert.throws(()=>validateConfig({trendFilter:'yes'}));
 const {rows}=timedFixture();const config={...c};delete config.trendFilter;delete config.tradeBothDirections;assert.equal(simulateDay(rows,config,'2025-01-06').trades.length,0);
});
test('a trend update at the signal timestamp is applied at that timestamp',()=>{
 const {rows,entryTime}=trendFixture({boundary:true}),r=simulateDay(rows,{...c,tradeBothDirections:false,trendFilter:true},'2025-01-06');
 assert.equal(r.trades.length,1,JSON.stringify(r.rejections));assert.equal(r.trades[0].signalTime,entryTime);assert.equal(r.trades[0].trendTime,entryTime);
 assert.equal(r.trades[0].trendAtSignal,r.trends.find(t=>t.t===entryTime).trend);
});
test('later trends cannot allow a setup rejected during warmup',()=>{
 const {rows,t}=timedFixture();for(const row of rows)row.v=0;for(let i=1;i<=35;i++)rows.push({t:t+60+i*60,minute:590+i,o:103+i,h:104+i,l:102+i,c:103+i,v:100});
 const r=simulateDay(rows,{...c,tradeBothDirections:false,trendFilter:true},'2025-01-06');assert.ok(r.trends.some(t=>t.trend==='up'));assert.equal(r.trades.length,0);assert.equal(r.rejections['trend filter: unclear'],1);
});
test('an open trade retains its target when the trend later becomes unclear',()=>{
 const {rows,entryTime}=trendFixture();Object.assign(rows.at(-1),{o:100.3,h:100.4,l:100.25,c:100.35});
 for(let i=1;i<=12;i++)rows.push({t:entryTime+i*60,minute:629+i,o:100.35,h:i===12?102.2:100.4,l:100.25,c:100.35,v:0});
 const r=simulateDay(rows,{...c,tradeBothDirections:false,trendFilter:true},'2025-01-06');assert.ok(r.trends.some(t=>t.t>entryTime&&t.trend==='unclear'));
 assert.equal(r.trades.length,1);assert.equal(r.trades[0].reason,'TARGET');assert.equal(r.trades[0].exitTime,entryTime+720);
});

test('slider threshold changes both confirmed labels and entry eligibility',()=>{
 const {rows}=trendFixture({bias:'against'});
 for(let i=0;i<40;i++){const p=110-i*.01;Object.assign(rows[i],{o:p,h:p+.005,l:p-.005,c:p,v:100000});}
 
 const directional=simulateDay(rows,{...c,tradeBothDirections:false,trendFilter:true,trendSlopeThreshold:0},'2025-01-06');
 const flat=simulateDay(rows,{...c,tradeBothDirections:false,trendFilter:true,trendSlopeThreshold:.05},'2025-01-06');
 assert.equal(directional.trades.length,0);assert.equal(directional.rejections['trend filter: down'],1);
 assert.equal(flat.trades.length,1);assert.equal(flat.trades[0].trendAtSignal,'sideways');
});

// Shift the complete Z/R/C/E fixture to a chosen entry minute; keep the actual session open.
function timedSession(entryMinute,dir=1){
 const {minutes,start}=fixture();
 if(entryMinute%5===0)minutes.splice(16,0,{...minutes[15]});
 const first=start+(entryMinute-570-(minutes.length-1))*60;
 return minutes.map((b,i)=>{const row={...b,t:first+i*60};row.minute=marketTime(row.t).minute;return dir===1?row:{...row,o:200-row.o,h:200-row.l,l:200-row.h,c:200-row.c};});
}
for(const dir of [1,-1]){
 for(const [minute,allowed] of [[629,false],[630,true],[899,true],[900,false],[959,false]])test('entry-time boundaries at minute '+minute+' direction '+dir,()=>{
  const result=simulateDay(timedSession(minute,dir),{...defaults,tradeBothDirections:true,trendFilter:false,spread:0},'2025-01-06');
  assert.equal(result.trades.length,allowed?1:0);if(!allowed)assert.equal(result.rejections[minute<630?'entry time: before trading start':'entry time: final 60 minutes'],1);
 });
 for(const [minute,allowed] of [[719,true],[720,false],[779,false]])test('13:00 early close moves entry cutoff to noon '+minute+' direction '+dir,()=>{
  const result=simulateDay(timedSession(minute,dir),{...defaults,tradeBothDirections:true,trendFilter:false,spread:0,sessionOverrides:{'2025-01-06':'13:00'}},'2025-01-06');
  assert.equal(result.trades.length,allowed?1:0);if(!allowed)assert.equal(result.rejections['entry time: final 60 minutes'],1);
 });
 test('an existing position can hit target inside the final hour, direction '+dir,()=>{
  const rows=timedSession(899,dir),entry=rows.at(-1);
  Object.assign(entry,dir===1?{h:100.5,c:100.4}:{l:99.5,c:99.6});
  rows.push({...entry,t:entry.t+60,minute:900,...(dir===1?{o:100.4,h:102.2,l:100.35,c:102}:{o:99.6,h:99.65,l:97.8,c:98})});
  const result=simulateDay(rows,{...defaults,tradeBothDirections:true,trendFilter:false,spread:0},'2025-01-06');
  assert.equal(result.trades.length,1);assert.equal(result.trades[0].reason,'TARGET');assert.equal(result.trades[0].exitTime,entry.t+60);
 });
 test('missing opening data does not postpone the first eligible entry, direction '+dir,()=>{
  const rows=timedSession(630,dir);assert.equal(rows[0].minute,610);
  assert.equal(simulateDay(rows,{...defaults,tradeBothDirections:true,trendFilter:false,spread:0},'2025-01-06').trades.length,1);
 });
}
test('a session with overlapping opening and closing restrictions allows no entries',()=>{
 const result=simulateDay(timedSession(600),{...defaults,tradeBothDirections:true,trendFilter:false,sessionEnd:'11:00'},'2025-01-06');assert.equal(result.trades.length,0);
});

for(const dir of [1,-1])for(const [open,allowed] of [[100.15,true],[100.3,false],[100.35,false]])test('C directional color gates markers and executed trades '+dir+' open '+open,()=>{
 const {minutes}=fixture();minutes[18].o=open;
 const rows=minutes.map((b,i)=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:570+i}));
 const result=simulateDay(rows,{...c,shares:1},'2025-01-06');
 assert.equal(result.trades.length,allowed?1:0);assert.equal(result.events.some(e=>e.label==='C'),allowed);
});

for(const dir of [1,-1]){
 const config={...c,minRR:0,shares:10,exitStrategy:{name:'Half at 10c, half at 20c',exits:[{type:'cents',cents:10,percent:50},{type:'cents',cents:20,percent:50}]}};
 const rowsFor=(mode)=>{const {minutes}=fixture();if(mode!=='all'){Object.assign(minutes[19],{o:100.3,h:100.45,l:100.25,c:100.4});minutes.push({t:minutes[19].t+1,o:mode==='gap'?99.9:100.4,h:mode==='ambiguous'?100.6:100.45,l:mode==='ambiguous'?99.9:mode==='gap'?99.8:100,c:100.1,v:1});}return minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));};
 for(const mode of ['all','stop','gap','ambiguous'])test('partial exit accounting '+mode+' direction '+dir,()=>{
  const result=simulateDay(rowsFor(mode),config,'2025-01-06');assert.equal(result.trades.length,1,JSON.stringify(result.rejections));const trade=result.trades[0];assert.equal(trade.exits.length,2);assert.equal(trade.exits.reduce((n,e)=>n+e.shares,0),10);assert.equal(trade.exits[0].shares,5);assert.equal(trade.exits[0].reason,'TARGET');assert.equal(trade.exits[1].reason,({all:'TARGET',stop:'STOP',gap:'GAP_STOP',ambiguous:'AMBIGUOUS'})[mode]);
  if(mode==='all'){assert.ok(Math.abs(trade.pnl-1.5)<1e-7);assert.ok(Math.abs(trade.exit-(trade.entry+dir*.15))<1e-7);}if(mode==='ambiguous'){assert.equal(trade.excluded,true);assert.equal(trade.pnl,null);}else assert.equal(trade.excluded,false);
 });
 test('custom candle target missing before entry rejects rather than using future zone '+dir,()=>{const missing=rowsFor('all');missing[10].o=dir===1?101.8:98.2;const result=simulateDay(missing,{...config,exitStrategy:{name:'5m opposing',exits:[{type:'5mMeet',percent:100}]}},'2025-01-06');assert.equal(result.trades.length,0);assert.ok(Object.keys(result.rejections).some(k=>k.includes('no completed opposing')));});
}

for(const dir of [1,-1])test('remaining position closes at session end and fees cover original quantity '+dir,()=>{
 const {minutes}=fixture();Object.assign(minutes.at(-1),{o:100.3,h:100.45,l:100.25,c:100.4});
 const entry=minutes.at(-1).t;minutes.push({t:entry+1,o:100.4,h:100.45,l:100.3,c:100.4,v:1});
 const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));
 const result=simulateDay(rows,{...c,shares:10,minRR:0,feePerShare:.01,exitStrategy:{name:'Two targets',exits:[{type:'cents',cents:10,percent:50},{type:'cents',cents:20,percent:50}]}},'2025-01-06');
 const trade=result.trades[0];assert.equal(trade.exits[0].reason,'TARGET');assert.equal(trade.exits[1].reason,'DATA_END');assert.equal(trade.exits[1].shares,5);assert.equal(trade.excluded,true);assert.equal(trade.pnl,null);
});
for(const dir of [1,-1])test('custom targets follow actual entry price including costs and charge fees once '+dir,()=>{
 const {minutes}=fixture();const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));
 const r=simulateDay(rows,{...c,shares:10,minRR:0,spread:.02,slippage:.005,feePerShare:.01,exitStrategy:{name:'Three targets',exits:[{type:'cents',cents:30,percent:30},{type:'cents',cents:10,percent:40},{type:'cents',cents:20,percent:30}]}},'2025-01-06');const trade=r.trades[0];assert.ok(trade);assert.deepEqual(trade.exits.map(e=>e.index),[2,3,1]);assert.deepEqual(trade.exits.map(e=>e.shares),[4,3,3]);assert.ok(Math.abs(trade.fees-.2)<1e-8);assert.ok(Math.abs(trade.pnl-(trade.gross-.2))<1e-8);assert.ok(Math.abs(trade.gross-trade.exits.reduce((n,e)=>n+(e.price-trade.entry)*dir*e.shares,0))<1e-8);
});

for(const dir of [1,-1])for(const touched of [false,true])test('meet early-exit boundary executes at adjusted price '+dir+' reached '+touched,()=>{
 const {minutes}=fixture();
 // Establish the turnaround after the demand zone exists, before the retest.
 const offset=minutes[10].t;const departure=Array.from({length:10},(_,i)=>({t:offset+i*60,o:i<5?101:102,c:i<5?102:101.5,h:102.1,l:100.8,v:60}));
 const tail=minutes.slice(10).map(b=>({...b,t:b.t+600}));minutes.splice(10,minutes.length-10,...departure,...tail);Object.assign(minutes.at(-1),{o:100.3,h:touched?101.95:101.9499,l:100.25,c:101.9});
 const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));
 const result=simulateDay(rows,{...c,cooldownMinutes:0,minRR:0,shares:10,exitStrategy:{name:'5m meet',exits:[{type:'5mMeet',percent:100}]}},'2025-01-06');assert.equal(result.trades.length,1,JSON.stringify(result.rejections));const trade=result.trades[0];assert.equal(trade.exitPlan[0].rawTarget,dir===1?102:98);assert.equal(trade.target,dir===1?101.95:98.05);assert.equal(trade.exits[0].reason,touched?'TARGET':'DATA_END');if(touched){assert.equal(trade.exit,trade.target);assert.ok(Math.abs(trade.pnl-16.3)<1e-7);}
});

for(const dir of [1,-1])for(const moveStop of [{type:'breakEven'},{type:'offset',amount:.2},{type:'keep'}])test('partial exit changes remaining stop '+dir+' '+moveStop.type,()=>{
 const {minutes}=fixture();Object.assign(minutes.at(-1),{o:100.3,h:100.45,l:100.25,c:100.4});const at=minutes.at(-1).t;minutes.push({t:at+1,o:100.4,h:100.45,l:100.15,c:100.2,v:1});
 const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));
 const r=simulateDay(rows,{...c,shares:10,minRR:0,exitStrategy:{name:'Stop moves',exits:[{type:'cents',cents:10,percent:50,moveStop},{type:'cents',cents:80,percent:50}]}},'2025-01-06');const trade=r.trades[0];assert.ok(trade);assert.equal(trade.exits.length,2);assert.equal(trade.initialStop,100);assert.equal(trade.exits[0].reason,'TARGET');assert.equal(trade.exits[1].shares,5);
 if(moveStop.type==='keep'){assert.equal(trade.exits[1].reason,'DATA_END');assert.equal(trade.stopHistory.length,0);}else{assert.equal(trade.exits[1].reason,'STOP');const expected=moveStop.type==='breakEven'?trade.entry:dir===1?100.22:99.78;assert.equal(trade.stop,expected);assert.equal(trade.exits[1].price,expected);assert.equal(trade.stopHistory[0].t,at+1);assert.equal(trade.exits[0].stopAfter,expected);assert.equal(trade.excluded,false);}
});
for(const dir of [1,-1])test('gap target move uses current SPY open, not target limit price '+dir,()=>{
 const {minutes}=fixture();Object.assign(minutes.at(-1),{o:100.3,h:100.35,l:100.25,c:100.34});const at=minutes.at(-1).t;minutes.push({t:at+1,o:100.7,h:100.75,l:100.3,c:100.6,v:1},{t:at+2,o:100.6,h:100.65,l:100.4,c:100.45,v:1});
 const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));
 const r=simulateDay(rows,{...c,shares:10,minRR:0,exitStrategy:{name:'Gap stop moves',exits:[{type:'cents',cents:10,percent:50,moveStop:{type:'offset',amount:.2}},{type:'cents',cents:100,percent:50}]}},'2025-01-06');const trade=r.trades[0];assert.ok(trade);assert.equal(trade.exits[0].exitTime,at+1);assert.equal(trade.exits[1].exitTime,at+2);assert.equal(trade.exits[1].reason,'STOP');assert.equal(trade.stop,dir===1?100.5:99.5);assert.equal(trade.stopHistory[0].spyPrice,dir===1?100.7:99.3);
});

for(const dir of [1,-1])for(const action of ['trailing','offset'])test('trailing follows favorable prices without loosening '+dir+' '+action,()=>{
 const {minutes}=fixture();Object.assign(minutes.at(-1),{o:100.3,h:100.45,l:100.25,c:100.4});const at=minutes.at(-1).t;
 minutes.push({t:at+1,o:100.4,h:100.7,l:100.35,c:100.65,v:1},{t:at+2,o:100.65,h:100.66,l:100.55,c:100.58,v:1},{t:at+3,o:100.58,h:100.6,l:100.49,c:100.5,v:1});
 const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));
 const result=simulateDay(rows,{...c,shares:10,minRR:0,exitStrategy:{name:'Trail test',exits:[{type:'cents',cents:10,percent:50,moveStop:{type:action,amount:.2}},{type:'cents',cents:300,percent:50}]}},'2025-01-06');const trade=result.trades[0];assert.ok(trade,JSON.stringify(result.rejections));assert.equal(trade.exits[0].shares,5);
 if(action==='trailing'){
  assert.equal(trade.exits[1].reason,'STOP');assert.equal(trade.exits[1].exitTime,at+3);assert.equal(trade.stop,dir===1?100.5:99.5);assert.equal(trade.stopHistory.length,2);assert.equal(trade.stopHistory[0].t,at+1);assert.equal(trade.stopHistory[1].t,at+2);assert.equal(trade.exits[0].stopAfter,dir===1?100.25:99.75);assert.ok(Math.abs(trade.pnl-1.4)<1e-7);
 }else{assert.equal(trade.exits[1].reason,'DATA_END');assert.equal(trade.stop,dir===1?100.22:99.78);}
});
for(const dir of [1,-1])test('trailing does not activate when its exit never fills '+dir,()=>{
 const {minutes}=fixture();Object.assign(minutes.at(-1),{o:100.3,h:100.4,l:100.25,c:100.35});const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));
 const r=simulateDay(rows,{...c,minRR:0,shares:10,exitStrategy:{name:'No activation',exits:[{type:'cents',cents:10,percent:50,moveStop:{type:'trailing',amount:.2}},{type:'cents',cents:20,percent:50}]}},'2025-01-06');assert.equal(r.trades[0].stopHistory.length,0);assert.equal(r.trades[0].trailing,undefined);assert.equal(r.trades[0].stop,100);
});

test('entry distance defaults to unlimited and validates optional dollar limits',()=>{
 assert.equal(defaults.maxEntryDistance,null);assert.equal(validateConfig({}).maxEntryDistance,null);assert.equal(validateConfig({maxEntryDistance:0}).maxEntryDistance,0);assert.equal(validateConfig({maxEntryDistance:.3}).maxEntryDistance,.3);
 for(const value of [-.01,NaN,Infinity,'0.30',false])assert.throws(()=>validateConfig({maxEntryDistance:value}));
});
for(const dir of [1,-1])for(const [limit,allowed] of [[null,true],[undefined,true],[.27,true],[.2699,false],[0,false]])test('actual entry distance boundary '+dir+' '+limit,()=>{
 const {minutes}=fixture();const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));
 const result=simulateDay(rows,{...c,shares:1,maxEntryDistance:limit},'2025-01-06');assert.equal(result.trades.length,allowed?1:0);if(allowed)assert.ok(Math.abs(result.trades[0].zoneDistance-.27)<1e-8);else assert.equal(result.rejections['maximum entry distance'],1);
});
for(const dir of [1,-1])test('entry gap beyond maximum consumes setup without a fill '+dir,()=>{
 const {minutes}=fixture();Object.assign(minutes.at(-1),{o:100.5,l:100.4});const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));
 const r=simulateDay(rows,{...c,maxEntryDistance:.3},'2025-01-06');assert.equal(r.trades.length,0);assert.equal(r.rejections['maximum entry distance'],1);
});
for(const dir of [1,-1])for(const allowed of [true,false])test('entry limit includes spread and slippage '+dir+' '+allowed,()=>{
 const {minutes}=fixture();const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));
 const r=simulateDay(rows,{...c,spread:.02,slippage:.02,maxEntryDistance:allowed?.3:.2999},'2025-01-06');assert.equal(r.trades.length,allowed?1:0);if(allowed)assert.ok(Math.abs(r.trades[0].zoneDistance-.3)<1e-8);else assert.equal(r.rejections['maximum entry distance'],1);
});

for(const dir of [1,-1])for(const mixed of [false,true])test('NO LIMIT runner exits only on its trailing stop '+dir+' mixed '+mixed,()=>{
 const {minutes}=fixture();Object.assign(minutes.at(-1),{o:100.3,h:100.45,l:100.25,c:100.4});const at=minutes.at(-1).t;
 minutes.push({t:at+1,o:100.4,h:101,l:100.35,c:100.9,v:1},{t:at+2,o:100.9,h:101.1,l:100.85,c:101,v:1},{t:at+3,o:101,h:101.02,l:100.89,c:100.9,v:1});
 const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));
 const exits=[...(mixed?[{type:'cents',cents:10,percent:50}]:[]),{type:'noLimit',percent:mixed?50:100,moveStop:{type:'trailing',amount:.2}}];
 const r=simulateDay(rows,{...c,shares:10,minRR:0,exitStrategy:{name:'Runner',exits}},'2025-01-06');assert.equal(r.trades.length,1,JSON.stringify(r.rejections));const trade=r.trades[0];if(mixed)assert.ok(Math.abs(trade.rr-.3125)<1e-7);else assert.equal(trade.rr,null);assert.equal(trade.exits.at(-1).reason,'STOP');assert.equal(trade.exits.at(-1).exitTime,at+3);assert.equal(trade.exits.at(-1).price,dir===1?100.9:99.1);assert.equal(trade.exitPlan.at(-1).target,null);assert.equal(trade.exits.reduce((n,e)=>n+e.shares,0),10);assert.ok(Math.abs(trade.pnl-(mixed?3.4:5.8))<1e-7);assert.equal(trade.excluded,false);assert.equal(trade.exitPlan.at(-1).stopHistory.length,3);if(mixed)assert.equal(trade.exits[0].reason,'TARGET');else assert.equal(trade.target,null);
});
for(const dir of [1,-1])test('NO LIMIT tranches have independent distances and quantities '+dir,()=>{
 const {minutes}=fixture();Object.assign(minutes.at(-1),{o:100.3,h:100.45,l:100.25,c:100.4});const at=minutes.at(-1).t;minutes.push({t:at+1,o:100.4,h:101,l:100.35,c:100.9,v:1},{t:at+2,o:100.9,h:101.1,l:100.7,c:100.9,v:1},{t:at+3,o:100.9,h:100.95,l:100.65,c:100.7,v:1});
 const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));const exits=[.2,.4].map(amount=>({type:'noLimit',percent:50,moveStop:{type:'trailing',amount}}));
 const result=simulateDay(rows,{...c,shares:10,exitStrategy:{name:'Independent runners',exits}},'2025-01-06');const trade=result.trades[0];assert.ok(trade,JSON.stringify(result.rejections));assert.deepEqual(trade.exits.map(e=>e.shares),[5,5]);assert.deepEqual(trade.exits.map(e=>e.exitTime),[at+2,at+3]);assert.deepEqual(trade.exits.map(e=>e.reason),['STOP','STOP']);assert.deepEqual(trade.exits.map(e=>e.price),dir===1?[100.8,100.7]:[99.2,99.3]);
});

for(const dir of [1,-1])for(const allowed of [true,false])test('mixed runner plan enforces first TP risk/reward '+dir+' '+allowed,()=>{
 const {minutes}=fixture();const at=minutes.at(-1).t;minutes.push({t:at+1,o:102.1,h:102.2,l:102.01,c:102.1,v:1},{t:at+2,o:102.1,h:102.15,l:101.99,c:102,v:1});
 const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));
 const config={...c,shares:10,minRR:allowed?2.5:2.5001,exitStrategy:{name:'RR uses first TP',exits:[{type:'cents',cents:80,percent:20},{type:'noLimit',percent:80,moveStop:{type:'trailing',amount:.2}}]}};
 const result=simulateDay(rows,config,'2025-01-06');assert.equal(result.trades.length,allowed?1:0,JSON.stringify(result.rejections));if(allowed){assert.ok(Math.abs(result.trades[0].rr-2.5)<1e-7);assert.equal(result.trades[0].exits[0].shares,2);}else assert.equal(result.rejections['minimum reward/risk'],1);
});
import {trendSelected} from '../lib/engine.mjs';
test('trend selections support all eight combinations and default all enabled',()=>{
 const keys=['allowUptrend','allowDowntrend','allowSideways'];for(const key of keys){assert.equal(defaults[key],true);assert.equal(validateConfig({})[key],true);for(const value of [null,1,'true'])assert.throws(()=>validateConfig({[key]:value}));}
 for(let mask=0;mask<8;mask++){
  const config=Object.fromEntries(keys.map((key,i)=>[key,!!(mask&(1<<i))]));for(const [i,trend] of ['up','down','sideways'].entries())assert.equal(trendSelected(config,trend),!!(mask&(1<<i)));assert.equal(trendSelected(config,'unclear'),mask===7);
 }
 assert.equal(trendSelected({},'up'),true);assert.equal(trendSelected({},'unclear'),true);
});
test('entry engine enforces every selected trend combination independently of direction filter',()=>{
 for(let mask=0;mask<8;mask++)for(const [trend,options] of [['up',{dir:1}],['down',{dir:-1}],['sideways',{dir:1,bias:'sideways'}]]){
  const config={...c,tradeBothDirections:false,trendFilter:true,allowUptrend:!!(mask&1),allowDowntrend:!!(mask&2),allowSideways:!!(mask&4)},allowed=trendSelected(config,trend),{rows}=trendFixture(options);
  const result=simulateDay(rows,config,'2025-01-06');assert.equal(result.trades.length,allowed?1:0,JSON.stringify({mask,trend,rejections:result.rejections}));if(allowed)assert.equal(result.trades[0].trendAtSignal,trend);else assert.ok(result.rejections['trend selection: '+trend]||result.rejections['trend filter: '+trend]);
 }
});
test('trading start defaults to 10:30 and validates New York clock times within the session',()=>{
 assert.equal(defaults.tradingStart,'10:30');assert.equal(validateConfig({}).tradingStart,'10:30');assert.equal(validateConfig({tradingStart:'09:30'}).tradingStart,'09:30');
 for(const tradingStart of ['9:30','24:00','10:60','09:29','16:00',null,630])assert.throws(()=>validateConfig({tradingStart}));
});
for(const dir of [1,-1])for(const [minute,tradingStart,allowed] of [[599,'10:00',false],[600,'10:00',true],[629,'10:30',false],[630,'10:30',true],[674,'11:15',false],[675,'11:15',true],[899,'14:59',true],[900,'15:00',false]])test('editable trading start boundary '+dir+' '+tradingStart+' entry '+minute,()=>{
 const rows=timedSession(minute,dir),config={...defaults,tradingStart,tradeBothDirections:true,trendFilter:false,spread:0};const result=simulateDay(rows,config,'2025-01-06');assert.equal(result.trades.length,allowed?1:0,JSON.stringify(result.rejections));
 assert.ok(result.zones.length>0);assert.ok(result.zones[0].t<rows.at(-1).t);if(!allowed)assert.equal(result.rejections[minute<Number(tradingStart.slice(0,2))*60+Number(tradingStart.slice(3))?'entry time: before trading start':'entry time: final 60 minutes'],1);
});
test('trading start changes entry eligibility without changing zone calculations',()=>{
 const rows=timedSession(630),early=simulateDay(rows,{...defaults,tradeBothDirections:true,trendFilter:false,spread:0,tradingStart:'10:00'},'2025-01-06'),late=simulateDay(rows,{...defaults,tradeBothDirections:true,trendFilter:false,spread:0,tradingStart:'11:00'},'2025-01-06');
 assert.equal(early.trades.length,1);assert.equal(late.trades.length,0);assert.deepEqual(early.zones,late.zones);assert.deepEqual(early.trends,late.trends);
});

for(const dir of [1,-1])for(const targetFills of [true,false])test('80 percent TP precedes activating 20 percent runner '+dir+' TP fills '+targetFills,()=>{
 const {minutes}=fixture();Object.assign(minutes.at(-1),{o:100.3,h:100.7,l:100.25,c:100.65});const at=minutes.at(-1).t;
 minutes.push({t:at+1,o:100.65,h:100.68,l:100.35,c:100.4,v:1});
 if(targetFills)minutes.push({t:at+2,o:100.4,h:101.2,l:100.35,c:101.15,v:1},{t:at+3,o:101.15,h:101.18,l:100.99,c:101,v:1});
 else minutes.push({t:at+2,o:100.4,h:100.6,l:99.9,c:100.1,v:1});
 const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));
 const result=simulateDay(rows,{...c,shares:10,minRR:1,exitStrategy:{name:'80 TP / 20 delayed runner',exits:[{type:'cents',cents:80,percent:80,moveStop:{type:'breakEven'}},{type:'noLimit',percent:20,moveStop:{type:'trailing',amount:.2}}]}},'2025-01-06');
 const trade=result.trades[0];assert.ok(trade,JSON.stringify(result.rejections));const runner=trade.exitPlan[1];
 if(targetFills){assert.equal(trade.exits[0].index,1);assert.equal(trade.exits[0].percent,80);assert.equal(trade.exits[0].reason,'TARGET');assert.equal(trade.exits[0].exitTime,at+2);assert.equal(trade.exits[1].index,2);assert.equal(trade.exits[1].percent,20);assert.equal(trade.exits[1].reason,'STOP');assert.equal(trade.exits[1].exitTime,at+3);assert.equal(runner.activatedAt,at+2);assert.equal(runner.stopHistory[0].t,at+3);assert.equal(runner.stopHistory[0].price,dir===1?101:99);}
 else{assert.equal(runner.active,false);assert.equal(runner.activatedAt,undefined);assert.equal(runner.stopHistory.length,0);assert.equal(trade.exits.length,1);assert.equal(trade.exits[0].percent,100);assert.equal(trade.exits[0].reason,'STOP');assert.equal(trade.exits[0].exitTime,at+2);}
});

for(const dir of [1,-1])for(const allowZoneReuse of [false,true])test('multiple completed trades may reuse an active zone only when enabled '+dir+' '+allowZoneReuse,()=>{
 const {minutes}=fixture();const repeated=minutes.slice(16,20).map(b=>({...b}));let t=minutes.at(-1).t;
 for(let i=0;i<25;i++)minutes.push({t:t+=60,o:101.8,h:101.9,l:101.3,c:101.5,v:60});for(const b of repeated)minutes.push({...b,t:t+=60});
 const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));
 const result=simulateDay(rows,{...c,targetMode:'fixedRR',allowZoneReuse},'2025-01-06');assert.equal(result.trades.length,allowZoneReuse?2:1,JSON.stringify(result.rejections));if(allowZoneReuse){assert.equal(result.trades[0].zone.t,result.trades[1].zone.t);assert.equal(result.trades[0].zone.bottom,result.trades[1].zone.bottom);assert.ok(result.trades[0].exitTime<result.trades[1].t);}
});

test('minimum profit target defaults to zero and validates non-negative SPY dollars',()=>{
 assert.equal(defaults.minProfitTarget,0);assert.equal(validateConfig({}).minProfitTarget,0);assert.equal(validateConfig({minProfitTarget:.3}).minProfitTarget,.3);for(const value of [-.01,null,'0.3',NaN,Infinity])assert.throws(()=>validateConfig({minProfitTarget:value}));
});
for(const dir of [1,-1])for(const allowed of [true,false])test('minimum profit target exact boundary original zone '+dir+' '+allowed,()=>{
 const {minutes}=fixture();const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));const result=simulateDay(rows,{...c,minProfitTarget:allowed?1.63:1.6301},'2025-01-06');assert.equal(result.trades.length,allowed?1:0);if(allowed)assert.ok(Math.abs(result.trades[0].targetDistance-1.63)<1e-8);else assert.equal(result.rejections['minimum profit target'],1);
});
for(const dir of [1,-1])for(const gap of [false,true])test('minimum profit target rechecks actual fill after costs or gap '+dir+' '+gap,()=>{
 const {minutes}=fixture();if(gap)Object.assign(minutes.at(-1),{o:100.5,l:100.4});const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));const result=simulateDay(rows,{...c,minProfitTarget:gap?1.6:1.66,spread:gap?0:.02,slippage:gap?0:.02},'2025-01-06');assert.equal(result.trades.length,0);assert.equal(result.rejections['minimum profit target'],1);
});
for(const dir of [1,-1])for(const allowed of [true,false])test('minimum profit target uses first TP rather than distant TP or runner '+dir+' '+allowed,()=>{
 const {minutes}=fixture();const rows=minutes.map(b=>({...b,...(dir===-1?{o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}:{}),minute:marketTime(b.t).minute}));const result=simulateDay(rows,{...c,minRR:0,minProfitTarget:allowed?.1:.1001,exitStrategy:{name:'First TP minimum',exits:[{type:'cents',cents:10,percent:40},{type:'cents',cents:100,percent:40},{type:'noLimit',percent:20,moveStop:{type:'trailing',amount:.2}}]}},'2025-01-06');assert.equal(result.trades.length,allowed?1:0);if(!allowed)assert.equal(result.rejections['minimum profit target'],1);
});
test('positive minimum target blocks runner-only strategies without a fixed target',()=>{
 const {minutes}=fixture();const rows=minutes.map(b=>({...b,minute:marketTime(b.t).minute}));const r=simulateDay(rows,{...c,minProfitTarget:.01,exitStrategy:{name:'No fixed reward',exits:[{type:'noLimit',percent:100,moveStop:{type:'trailing',amount:.2}}]}},'2025-01-06');assert.equal(r.trades.length,0);assert.equal(r.rejections['minimum profit target'],1);
});

for(const dir of [1,-1])test('VWAP entry policy adjusts TP and rechecks gates '+dir,()=>{
 const {rows}=timedFixture({dir});
 const base={...c,vwapTargetMode:'ignore',minRR:0};
 const ignored=simulateDay(rows,base,'2025-01-06');assert.equal(ignored.trades.length,1);
 const skipped=simulateDay(rows,{...base,vwapTargetMode:'skip'},'2025-01-06');assert.equal(skipped.trades.length,0);assert.equal(skipped.rejections['VWAP between entry and target'],1);
 const adjusted=simulateDay(rows,{...base,vwapTargetMode:'target'},'2025-01-06');assert.equal(adjusted.trades.length,1);
 const trade=adjusted.trades[0];assert.equal(trade.target,trade.entryVwap);assert.ok(trade.rr<ignored.trades[0].rr);
 assert.equal(simulateDay(rows,{...base,vwapTargetMode:'target',minRR:trade.rr+.01},'2025-01-06').trades.length,0);
 const minimum=trade.targetDistance+.01;assert.ok(minimum<ignored.trades[0].targetDistance);
 assert.equal(simulateDay(rows,{...base,vwapTargetMode:'target',minProfitTarget:minimum},'2025-01-06').rejections['minimum profit target'],1);
});
test('minimum zone power accepts nonnegative dollars and defaults to zero',()=>{
 assert.equal(defaults.minZonePower,0);assert.equal(validateConfig({}).minZonePower,0);
 for(const n of [0,.25,1])assert.equal(validateConfig({minZonePower:n}).minZonePower,n);
 for(const n of [-.01,NaN,Infinity,null,'1'])assert.throws(()=>validateConfig({minZonePower:n}));
});
for(const dir of [1,-1])test('minimum zone power gates entries at an inclusive boundary '+dir,()=>{
 const {rows}=timedFixture({dir});const base={...c,minZonePower:0};
 const run=simulateDay(rows,base,'2025-01-06');assert.equal(run.trades.length,1);
 const power=run.trades[0].zonePower;assert.ok(power>0);
 assert.equal(simulateDay(rows,{...base,minZonePower:power},'2025-01-06').trades.length,1);
 const custom=simulateDay(rows,{...base,minRR:0,minZonePower:power+.01,exitStrategy:{name:'10c',exits:[{type:'cents',cents:10,percent:100}]}},'2025-01-06');assert.equal(custom.trades.length,0);assert.equal(custom.rejections['minimum zone power'],1);
 const rejected=simulateDay(rows,{...base,minZonePower:power+.01},'2025-01-06');assert.equal(rejected.trades.length,0);assert.equal(rejected.rejections['minimum zone power'],1);
 const future=rows.map(b=>b.t>=run.trades[0].signalTime?{...b,o:b.o+50,h:b.h+50,l:b.l+50,c:b.c+50}:b);
 assert.equal(simulateDay(future,{...base,minZonePower:power+.01},'2025-01-06').rejections['minimum zone power'],1);
});

for(const dir of [1,-1])test('intervening 5m zone reduces TP and recalculates R/R '+dir,()=>{
 const {rows}=timedFixture({dir});const result=simulateDay(rows,c,'2025-01-06');const trade=result.trades[0];
 assert.equal(trade.target,dir===1?101.95:98.05);assert.ok(trade.targetZone);assert.ok(Math.abs(trade.rr-1.63/.32)<1e-8);
 const rejected=simulateDay(rows,{...c,minRR:5.15},'2025-01-06');assert.equal(rejected.trades.length,0);assert.equal(rejected.rejections['reward/risk after costs'],1);
 const custom=simulateDay(rows,{...c,minRR:0,exitStrategy:{name:'3 dollars',exits:[{type:'cents',cents:300,percent:100}]}},'2025-01-06');
 assert.equal(custom.trades[0].target,trade.target);assert.equal(custom.trades[0].exitPlan[0].targetZone.t,trade.targetZone.t);
});
test('exit on opposing zone defaults off and requires boolean',()=>{
 assert.equal(validateConfig({}).exitOnOpposingZone,false);assert.equal(validateConfig({exitOnOpposingZone:true}).exitOnOpposingZone,true);for(const value of [null,1,'true'])assert.throws(()=>validateConfig({exitOnOpposingZone:value}));
});
for(const dir of [1,-1])for(const mixed of [false,true])for(const enabled of [false,true])test('new opposing 5m zone exits remaining position '+dir+' mixed '+mixed+' enabled '+enabled,()=>{
 const {minutes,start}=fixture();Object.assign(minutes[19],{o:100.3,h:100.45,l:100.25,c:100.4});
 const rows=minutes.map((b,i)=>({...b,minute:570+i}));
 for(let i=20;i<30;i++){const first=i<25,offset=i%5,o=first?100.4+offset*.08:100.8-offset*.03,close=first?o+.08:o-.03;rows.push({t:start+i*60,minute:570+i,o,h:Math.max(o,close)+.01,l:Math.min(o,close)-.01,c:close,v:60});}
 rows.push({t:start+1800,minute:600,o:100.65,h:100.7,l:100.6,c:100.66,v:60});
 const data=dir===1?rows:rows.map(b=>({...b,o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}));
 const exits=mixed?[{type:'cents',cents:10,percent:80},{type:'noLimit',percent:20,moveStop:{type:'trailing',amount:10}}]:[{type:'cents',cents:300,percent:100}];
 const result=simulateDay(data,{...c,minRR:0,spread:.02,slippage:.005,exitOnOpposingZone:enabled,exitStrategy:{name:'Opposing exit fixture',exits}},'2025-01-06');assert.equal(result.trades.length,1,JSON.stringify(result.rejections));const trade=result.trades[0];
 if(enabled){assert.equal(trade.excluded,false);assert.equal(trade.exitTime,start+1800);assert.equal(trade.exitZone.side,dir===1?'supply':'demand');const fill=trade.exits.at(-1);assert.equal(fill.reason,'OPPOSING_ZONE');assert.equal(fill.shares,mixed?20:100);assert.ok(Math.abs(fill.price-((dir===1?100.65:99.35)-dir*.015))<1e-8);assert.equal(trade.exits.reduce((n,e)=>n+e.shares,0),100);if(mixed)assert.equal(trade.exits[0].reason,'TARGET');const delayed=data.map((b,i)=>i===data.length-1?{...b,t:b.t+7}:b);const late=simulateDay(delayed,{...c,minRR:0,spread:.02,slippage:.005,exitOnOpposingZone:true,exitStrategy:{name:'Delayed zone exit',exits}},'2025-01-06');assert.equal(late.trades[0].exitTime,start+1807);if(!mixed){const original=simulateDay(data,{...c,minRR:0,exitOnOpposingZone:true},'2025-01-06');assert.equal(original.trades[0].reason,'OPPOSING_ZONE');assert.equal(original.trades[0].exitTime,start+1800);}}
 else assert.ok(trade.exits.every(e=>e.reason!=='OPPOSING_ZONE'));
});
for(const dir of [1,-1])test('new same-direction zone does not force exit '+dir,()=>{
 const {minutes,start}=fixture();Object.assign(minutes[19],{o:100.3,h:100.45,l:100.25,c:100.4});const rows=minutes.map((b,i)=>({...b,minute:570+i}));
 for(let i=20;i<30;i++){const first=i<25,offset=i%5,o=first?100.8-offset*.04:100.6+offset*.04,c=first?o-.04:o+.04;rows.push({t:start+i*60,minute:570+i,o,h:Math.max(o,c)+.01,l:Math.min(o,c)-.01,c,v:60});}
 rows.push({t:start+1800,minute:600,o:100.8,h:100.85,l:100.75,c:100.8,v:60});const data=dir===1?rows:rows.map(b=>({...b,o:200-b.o,h:200-b.l,l:200-b.h,c:200-b.c}));
 const r=simulateDay(data,{...c,minRR:0,exitOnOpposingZone:true,exitStrategy:{name:'Far target',exits:[{type:'cents',cents:300,percent:100}]}},'2025-01-06');assert.equal(r.trades.length,1);assert.equal(r.trades[0].reason,'DATA_END');assert.ok(!r.trades[0].exitZone);
});
test('5m meet tolerance defaults to five cents and preserves explicit settings',()=>{
 assert.equal(defaults.meetingTolerance,.05);assert.equal(validateConfig({}).meetingTolerance,.05);assert.equal(validateConfig({meetingTolerance:.03}).meetingTolerance,.03);assert.equal(validateConfig({meetingTolerance:0}).meetingTolerance,0);
 for(const value of [-.01,null,'0.05',NaN,Infinity])assert.throws(()=>validateConfig({meetingTolerance:value}));
});
test('entry window defaults to ten and validates integer seconds 0-59',()=>{
 assert.equal(defaults.entryWindowSeconds,10);assert.equal(validateConfig({}).entryWindowSeconds,10);
 for(const n of [0,1,10,30,59])assert.equal(validateConfig({entryWindowSeconds:n}).entryWindowSeconds,n);
 for(const n of [-1,60,1.5,null,'10',NaN])assert.throws(()=>validateConfig({entryWindowSeconds:n}));
});
for(const dir of [1,-1])for(const [window,second,allowed] of [[1,0,true],[1,1,false],[10,9,true],[10,10,false],[30,29,true],[30,30,false],[59,58,true],[59,59,false]])test('configured entry window boundary '+dir+' '+window+' trigger '+second,()=>{
 const {rows,t}=timedFixture({dir,triggerAt:second});const result=simulateDay(rows,{...c,entryWindowSeconds:window},'2025-01-06');assert.equal(result.trades.length,allowed?1:0,JSON.stringify(result.rejections));if(allowed)assert.equal(result.trades[0].t,t+second);else assert.equal(result.rejections['entry window expired'],1);
});
for(const dir of [1,-1])test('zero-second entry window requires opening price, not intrasecond wick '+dir,()=>{
 const no=timedFixture({dir,triggerAt:0});assert.equal(simulateDay(no.rows,{...c,entryWindowSeconds:0},'2025-01-06').trades.length,0);
 const yes=timedFixture({dir,triggerAt:0,patch:{0:{o:100.34,l:100.33,h:100.4,c:100.35}}});const result=simulateDay(yes.rows,{...c,entryWindowSeconds:0},'2025-01-06');assert.equal(result.trades.length,1);assert.equal(result.trades[0].t,yes.t);
});
test('both-directions flag defaults off, validates and migrates the legacy filter',()=>{
 assert.equal(defaults.tradeBothDirections,false);assert.equal(validateConfig({}).tradeBothDirections,false);assert.equal(validateConfig({trendFilter:false}).tradeBothDirections,true);
 assert.equal(validateConfig({tradeBothDirections:false,trendFilter:false}).trendFilter,true);assert.equal(validateConfig({tradeBothDirections:true}).trendFilter,false);
 for(const value of [null,1,'true'])assert.throws(()=>validateConfig({tradeBothDirections:value}));
});
for(const dir of [1,-1])for(const bias of ['with','against','sideways'])test('both directions bypass trend direction within selected periods '+dir+' '+bias,()=>{
 const {rows}=trendFixture({dir,bias});const config={...c,tradeBothDirections:true,trendFilter:true,allowUptrend:true,allowDowntrend:true,allowSideways:true,direction:'both'};
 const result=simulateDay(rows,config,'2025-01-06');assert.equal(result.trades.length,1,JSON.stringify(result.rejections));assert.equal(result.trades[0].dir,dir);assert.equal(result.trades[0].trendFilterApplied,false);
});
for(const dir of [1,-1])test('both directions permits an unclassified trend '+dir,()=>{
 const {rows}=timedFixture({dir});for(const b of rows)b.v=0;const r=simulateDay(rows,{...c,tradeBothDirections:true,allowUptrend:true,allowDowntrend:true,allowSideways:true},'2025-01-06');assert.equal(r.trades.length,1);assert.equal(r.trades[0].trendAtSignal,'unclear');
});
for(const dir of [1,-1])for(const both of [false,true])test('sideways checkbox remains authoritative with both-directions flag '+dir+' '+both,()=>{
 const {rows}=trendFixture({dir,bias:'sideways'});
 for(const selected of [false,true]){const result=simulateDay(rows,{...c,tradeBothDirections:both,allowSideways:selected},'2025-01-06');assert.equal(result.trades.length,selected?1:0);if(!selected)assert.equal(result.rejections['trend selection: sideways'],1);}
});
for(const both of [false,true])for(const dir of [1,-1])test('up/down selections remain authoritative '+dir+' '+both,()=>{
 const {rows}=trendFixture({dir});const result=simulateDay(rows,{...c,tradeBothDirections:both,allowUptrend:false,allowDowntrend:false},'2025-01-06');assert.equal(result.trades.length,0);assert.equal(result.rejections['trend selection: '+(dir===1?'up':'down')],1);
});
for(const dir of [1,-1])for(const gap of [19,20,21])for(const opening of [false,true])test('entry gap boundary '+dir+' '+gap+' opening '+opening,()=>{
 const {rows,t}=timedFixture({dir,triggerAt:gap}),data=rows.filter(b=>b.t<t||b.t>=t+gap||(!opening&&b.t===t));
 const r=simulateDay(data,{...c,entryWindowSeconds:59},'2025-01-06');assert.equal(r.trades.length,gap<20?1:0,JSON.stringify(r.rejections));if(gap<20){assert.equal(r.trades[0].t,t+gap);assert.equal(r.trades[0].entryDataGaps[0].seconds,19);}else assert.equal(r.rejections['missing entry-window seconds'],1);
});
for(const dir of [1,-1])test('gap crossing the trigger fills next observed open rather than inferred trigger '+dir,()=>{
 const {rows,t}=timedFixture({dir,triggerAt:5,patch:{5:{o:100.5,h:100.55,l:100.45,c:100.5}}}),data=rows.filter(b=>b.t<t+2||b.t>=t+5),r=simulateDay(data,{...c,entryWindowSeconds:59,minRR:0},'2025-01-06');assert.equal(r.trades.length,1);assert.equal(r.trades[0].t,t+5);assert.equal(r.trades[0].entry,dir===1?100.5:99.5);
});
test('short missing final seconds do not extend an expired entry window',()=>{
 const {rows,t}=timedFixture({triggerAt:10}),r=simulateDay(rows.filter(b=>b.t!==t+9),{...c,entryWindowSeconds:10},'2025-01-06');assert.equal(r.trades.length,0);assert.equal(r.rejections['entry window expired'],1);
});
test('rejected ZRC records a brief reason available only after window expiry',()=>{
 const {rows,t}=timedFixture({triggerAt:Infinity}),r=simulateDay(rows,c,'2025-01-06');assert.equal(r.trades.length,0);assert.equal(r.entryRejections.length,1);const skipped=r.entryRejections[0];assert.equal(skipped.t,t);assert.equal(skipped.confirmationTime,t-60);assert.equal(skipped.reason,'entry window expired');assert.equal(skipped.message,'Trigger not reached in 10s');assert.equal(skipped.availableAt,t+10);
});
test('pre-entry risk gate records a reason even when no trigger is armed',()=>{
 const {rows,t}=timedFixture(),r=simulateDay(rows,{...c,minRR:100},'2025-01-06');assert.equal(r.trades.length,0);assert.equal(r.entryRejections[0].t,t);assert.equal(r.entryRejections[0].message,'R/R below 100:1');
});
test('successful doji retry removes an earlier no-entry annotation for the same C',()=>{
 const {rows,t}=timedFixture({triggerAt:Infinity});Object.assign(rows.at(-1),{o:100.4,h:102.2,l:100.33,c:102});const r=simulateDay(rows,{...c,ignoreSingleDoji:true},'2025-01-06');assert.equal(r.trades.length,1);assert.equal(r.trades[0].t,t+60);assert.equal(r.entryRejections.length,0);
});
test('an executed but excluded ambiguous trade is not labeled as no entry',()=>{
 const {rows}=timedFixture({patch:{5:{l:99.9}}}),r=simulateDay(rows,c,'2025-01-06');assert.equal(r.trades.length,1);assert.equal(r.trades[0].excluded,true);assert.equal(r.entryRejections.length,0);
});
test('ZRC at data end still explains why no entry followed',()=>{
 const {rows,t}=timedFixture(),data=rows.filter(b=>b.t<t);data.push({...data.at(-1),t:t-1});const r=simulateDay(data,c,'2025-01-06');assert.equal(r.trades.length,0);assert.equal(r.entryRejections.length,1);assert.equal(r.entryRejections[0].reason,'data ended before entry');
});
