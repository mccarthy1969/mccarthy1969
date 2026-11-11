import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExitStrategy,exitZoneCatalog,planExits,allocateExits} from '../lib/exits.mjs';
import {validateConfig} from '../lib/strategy.mjs';
const strategy=exits=>({name:'Test exits',exits});
test('exit validation rejects wrong totals, empty strategies, invalid targets and zero allocations',()=>{
 assert.equal(validateExitStrategy(null),null);
 for(const exits of [[],[{type:'cents',cents:10,percent:99}],[{type:'cents',cents:0,percent:100}],[{type:'bad',percent:100}],[{type:'cents',cents:10,percent:0},{type:'cents',cents:20,percent:100}]])assert.throws(()=>validateConfig({exitStrategy:strategy(exits)}));
 assert.equal(validateConfig({exitStrategy:strategy([{type:'cents',cents:10,percent:33.33},{type:'1mMax',percent:66.67}])}).exitStrategy.exits.length,2);
});
test('whole share allocation preserves all shares and rejects exits too small to fill',()=>{
 const plan=[{percent:33.33},{percent:33.33},{percent:33.34}];assert.deepEqual(allocateExits(plan,10).map(e=>e.shares),[3,3,4]);assert.throws(()=>allocateExits(plan,2),/too small/);
});
for(const dir of [1,-1])test('cents and opposing-zone targets resolve by direction without future data '+dir,()=>{
 const catalog=[{timeframe:'1m',side:dir===1?'supply':'demand',availableAt:10,meet:100+dir,max:100+dir*2},{timeframe:'5m',side:dir===1?'supply':'demand',availableAt:10,meet:100+dir*3,max:100+dir*4},{timeframe:'1m',side:dir===1?'supply':'demand',availableAt:30,meet:100+dir*.5,max:100+dir*.6}];
 const config=strategy([{type:'cents',cents:10,percent:20},{type:'1mMeet',percent:20},{type:'1mMax',percent:20},{type:'5mMeet',percent:20},{type:'5mMax',percent:20}]);
 assert.deepEqual(planExits(config,dir,100,20,catalog).map(e=>e.target),[100+dir*.1,100+dir*.95,100+dir*2,100+dir*2.95,100+dir*4]);assert.throws(()=>planExits(config,dir,100,9,catalog),/no completed/);
});
test('zone catalog waits for both completed candles, honors gaps and meeting tolerance',()=>{
 const start=1200,rows=Array.from({length:10},(_,i)=>({t:start+i*60,o:i<5?100:102.02,c:i<5?102:101,h:103,l:99}));
 const zones=exitZoneCatalog(rows,start,.03);const five=zones.filter(z=>z.timeframe==='5m');assert.equal(five.length,1);assert.equal(five[0].availableAt,start+600);assert.equal(five[0].meet,102.02);assert.equal(five[0].max,103);
 assert.equal(exitZoneCatalog(rows.slice(0,9),start,.03).filter(z=>z.timeframe==='5m').length,0);assert.equal(exitZoneCatalog(rows.filter((b,i)=>i!==3),start,.03).filter(z=>z.timeframe==='5m').length,0);
 assert.equal(exitZoneCatalog(rows,start,.01).filter(z=>z.timeframe==='5m').length,0);
});
for(const dir of [1,-1])for(const nextOpen of [101.8,102,102.2])test('1m body turnaround chooses close/open nearest entry without wick or tolerance '+dir+' open '+nextOpen,()=>{
 const start=1200;let rows=[{t:start,o:101,c:102,h:110,l:100},{t:start+60,o:nextOpen,c:101.5,h:111,l:100}];
 if(dir===-1)rows=rows.map(b=>({...b,o:200-b.o,c:200-b.c,h:200-b.l,l:200-b.h}));
 const catalog=exitZoneCatalog(rows,start,.03),config=strategy([{type:'1mMeet',percent:100}]);const expected=dir===1?Math.min(102,nextOpen):200-Math.min(102,nextOpen);
 assert.equal(planExits(config,dir,100,start+120,catalog)[0].target,Math.round((expected-dir*.05)*100)/100);
 assert.throws(()=>planExits(config,dir,100,start+119,catalog),/no completed/);
 if(nextOpen!==102)assert.throws(()=>planExits(strategy([{type:'1mMax',percent:100}]),dir,100,start+120,catalog),/no completed/);
});
for(const dir of [1,-1])test('1m meet rejects a pair when its closest body price is not profitable '+dir,()=>{
 const catalog=[{timeframe:'1m',side:dir===1?'supply':'demand',availableAt:10,bodyClose:100+dir*2,bodyOpen:100-dir*.01,meet:100+dir*2,max:100+dir*3,meetsTolerance:false}];
 assert.throws(()=>planExits(strategy([{type:'1mMeet',percent:100}]),dir,100,20,catalog),/no completed/);
});
test('1m turnaround still requires opposite colors and continuous completed candles',()=>{
 const start=1200,green={t:start,o:100,c:102,h:103,l:99},red={t:start+60,o:101.8,c:101,h:104,l:100};
 assert.equal(exitZoneCatalog([green,red],start,.03).length,1);
 assert.equal(exitZoneCatalog([green,{...red,t:start+120}],start,.03).length,0);
 assert.equal(exitZoneCatalog([green,{...red,c:102}],start,.03).length,0);
 assert.equal(exitZoneCatalog([green,{...red,c:red.o}],start,.03).length,0);
});
for(const dir of [1,-1])test('1m meet uses the extreme of the prior excursion from the entry zone '+dir,()=>{
 const mirror=p=>dir===1?p:200-p;
 const pair=(time,a,b)=>({timeframe:'1m',side:dir===1?'supply':'demand',availableAt:time,bodyClose:mirror(a),bodyOpen:mirror(b),meet:mirror(a),max:mirror(a+1)});
 const catalog=[pair(600,104,104.01),pair(720,102,102.01),pair(840,103,103.01),pair(1080,100.1,100.11),pair(1260,105,105.01)];
 let minutes=[{t:600,h:99.1,l:98.9},{t:660,h:102,l:100},{t:720,h:103,l:102},{t:900,h:100.2,l:100}];
 const zone={t:600,side:dir===1?'demand':'supply',bottom:dir===1?99:100.95,top:dir===1?99.05:101};
 if(dir===-1)minutes=minutes.map(b=>({...b,h:200-b.l,l:200-b.h}));
 const config=strategy([{type:'1mMeet',percent:100}]),context={zone,retestAt:1200,minutes};
 assert.equal(planExits(config,dir,100,1380,catalog,context)[0].target,Math.round((mirror(103)-dir*.05)*100)/100);
 const touched=dir===1?{t:900,h:99.2,l:99}:{t:900,h:101,l:100.8};
 assert.equal(planExits(config,dir,100,1380,catalog,{...context,minutes:[...minutes.slice(0,-1),touched]})[0].target,Math.round((mirror(100.1)-dir*.05)*100)/100);
 assert.equal(planExits(config,dir,100,1380,catalog,{...context,minutes:[]})[0].rawTarget,mirror(103));
});
for(const dir of [1,-1])for(const type of ['1mMeet','5mMeet'])test('meet targets use exactly five cents of early-exit margin '+type+' '+dir,()=>{
 const catalog=[{timeframe:type.slice(0,2),side:dir===1?'supply':'demand',availableAt:10,meet:100+dir,max:100+dir*2}];
 const exit=planExits(strategy([{type,percent:100}]),dir,100,20,catalog)[0];assert.equal(exit.rawTarget,100+dir);assert.equal(exit.target,100+dir*.95);assert.equal(exit.margin,.05);
 const tooClose=[{...catalog[0],meet:100+dir*.05}];assert.throws(()=>planExits(strategy([{type,percent:100}]),dir,100,20,tooClose),/not profitable/);
});
import {movedStop} from '../lib/exits.mjs';
for(const dir of [1,-1])test('exit stop actions tighten only and use dollars behind current price '+dir,()=>{
 const stop=100-dir,entry=100,spy=100+dir*.5;
 assert.equal(movedStop(stop,entry,dir,{type:'breakEven'},spy),100);
 assert.equal(movedStop(stop,entry,dir,{type:'offset',amount:.2},spy),100+dir*.3);
 assert.equal(movedStop(stop,entry,dir,{type:'keep'},spy),stop);
 assert.equal(movedStop(100+dir*.4,entry,dir,{type:'offset',amount:.2},spy),100+dir*.4);
 assert.equal(movedStop(100+dir*.4,entry,dir,{type:'breakEven'},spy),100+dir*.4);
});
test('stop move validation, defaults and preservation through exit planning',()=>{
 for(const moveStop of [{type:'bad'},{type:'offset',amount:0},{type:'offset',amount:-.2},{type:'offset',amount:'0.20'},{type:'offset',amount:Infinity}])assert.throws(()=>validateExitStrategy(strategy([{type:'cents',cents:10,percent:100,moveStop}])));
 const config=validateExitStrategy(strategy([{type:'cents',cents:10,percent:100,moveStop:{type:'offset',amount:.2}}]));assert.deepEqual(planExits(config,1,100,20,[])[0].moveStop,{type:'offset',amount:.2});
 assert.deepEqual(validateExitStrategy(strategy([{type:'cents',cents:10,percent:100,moveStop:{type:'keep'}}])),strategy([{type:'cents',cents:10,percent:100}]));
});
for(const amount of [0,-.2,NaN,Infinity,'0.20'])test('trailing distance rejects '+String(amount),()=>assert.throws(()=>validateExitStrategy(strategy([{type:'cents',cents:10,percent:100,moveStop:{type:'trailing',amount}}]))));
test('trailing rule survives validation, planning and allocation',()=>{
 const config=validateExitStrategy(strategy([{type:'cents',cents:10,percent:100,moveStop:{type:'trailing',amount:.2}}]));
 assert.deepEqual(allocateExits(planExits(config,1,100,20,[]),10)[0].moveStop,{type:'trailing',amount:.2});
});
import {exitReward,furthestTarget} from '../lib/exits.mjs';
test('NO LIMIT requires its own valid trailing rule and has no synthetic target or reward',()=>{
 for(const moveStop of [undefined,{type:'keep'},{type:'breakEven'},{type:'offset',amount:.2},{type:'trailing',amount:0}])assert.throws(()=>validateExitStrategy(strategy([{type:'noLimit',percent:100,moveStop}])));
 const config=validateExitStrategy(strategy([{type:'noLimit',percent:100,moveStop:{type:'trailing',amount:.2}}]));const plan=planExits(config,1,100,10,[]);assert.equal(plan[0].target,null);assert.equal(exitReward(plan,1,100),null);assert.equal(furthestTarget(plan,1),null);assert.equal(JSON.parse(JSON.stringify(plan))[0].target,null);assert.equal(allocateExits(plan,10)[0].shares,10);
});
test('mixed TP and runner retain finite target labels without assigning runner a fake price',()=>{
 const plan=planExits(strategy([{type:'cents',cents:20,percent:80},{type:'noLimit',percent:20,moveStop:{type:'trailing',amount:.2}}]),-1,100,10,[]);
 assert.equal(furthestTarget(plan,-1),99.8);assert.ok(Math.abs(exitReward(plan,-1,100)-.2)<1e-8);assert.deepEqual(allocateExits(plan,10).map(e=>e.shares),[8,2]);
});
test('R/R reward uses first price-based exit in editor order, ignoring percentages and runner legs',()=>{
 const exits=[{type:'noLimit',percent:60,moveStop:{type:'trailing',amount:.2}},{type:'cents',cents:10,percent:10},{type:'cents',cents:100,percent:30}];
 for(const dir of [1,-1]){const plan=planExits(strategy(exits),dir,100,10,[]);assert.ok(Math.abs(exitReward(plan,dir,100)-.1)<1e-8);assert.ok(Math.abs(exitReward(allocateExits(plan,10),dir,100,10)-.1)<1e-8);}
});
for(const dir of [1,-1])test('1m meet preserves excursion before a multi-candle retest approach '+dir,()=>{
 const mirror=p=>dir===1?p:200-p;
 const zone={t:600,side:dir===1?'demand':'supply',bottom:dir===1?99:100.95,top:dir===1?99.05:101};
 let minutes=[{t:600,h:99.1,l:98.9},{t:660,h:102,l:100},{t:720,h:103,l:102},{t:780,h:101,l:100},{t:840,h:99.2,l:99},{t:900,h:99.2,l:99}];
 if(dir===-1)minutes=minutes.map(b=>({...b,h:200-b.l,l:200-b.h}));
 const catalog=[{timeframe:'1m',side:dir===1?'supply':'demand',availableAt:840,bodyClose:mirror(103),bodyOpen:mirror(103.01),meet:mirror(103)}];
 const exit=planExits(strategy([{type:'1mMeet',percent:100}]),dir,100,1140,catalog,{zone,retestAt:960,minutes})[0];
 assert.equal(exit.rawTarget,mirror(103));assert.equal(exit.target,mirror(103)-dir*.05);
 // Quotes after the retest start must not shift the excursion boundary or target.
 const extended=[...minutes,{t:960,h:dir===1?99.1:101.1,l:dir===1?98.9:100.9},{t:1020,h:dir===1?99.1:101.1,l:dir===1?98.9:100.9}];
 assert.deepEqual(planExits(strategy([{type:'1mMeet',percent:100}]),dir,100,1140,catalog,{zone,retestAt:960,minutes:extended})[0],exit);
});
for(const dir of [1,-1])test('pre-creation turnaround cannot supply a candle-meet target '+dir,()=>{
 const mirror=p=>dir===1?p:200-p,zone={t:600,side:dir===1?'demand':'supply',bottom:dir===1?100:99.95,top:dir===1?100.05:100};
 let minutes=[{t:300,o:100.2,c:100.1,h:100.3,l:100},{t:600,o:100.2,c:100.2,h:100.3,l:100.09}];if(dir===-1)minutes=minutes.map(b=>({...b,o:mirror(b.o),c:mirror(b.c),h:mirror(b.l),l:mirror(b.h)}));
 const catalog=[{timeframe:'1m',side:dir===1?'supply':'demand',availableAt:540,bodyClose:mirror(104),bodyOpen:mirror(104),meet:mirror(104)},{timeframe:'1m',side:dir===1?'supply':'demand',availableAt:780,bodyClose:mirror(103),bodyOpen:mirror(103),meet:mirror(103)}];
 for(const allowWickZoneCandles of [false,true])assert.equal(planExits(strategy([{type:'1mMeet',percent:100}]),dir,mirror(101),1080,catalog,{zone,retestAt:900,minutes,allowWickZoneCandles})[0].rawTarget,mirror(103));
});

for(const dir of [1,-1])for(const type of ['1mMeet','5mMeet','1mMax','5mMax'])test('candle TP belongs to post-creation excursion before retest '+[dir,type],()=>{
 const mirror=p=>dir===1?p:200-p,tf=type.slice(0,2),width=tf==='1m'?60:300,zone={t:1200,side:dir===1?'demand':'supply',bottom:dir===1?99:100.95,top:dir===1?99.05:101};
 const pair=(availableAt,p)=>({timeframe:tf,side:dir===1?'supply':'demand',availableAt,meet:mirror(p),bodyClose:mirror(p),bodyOpen:mirror(p),max:mirror(p+.2),meetsTolerance:true});
 const old=pair(1200,101),straddle=pair(1200+width,104),valid=pair(1200+2*width,103),future=pair(2400+width,105),catalog=[old,straddle,valid,future];
 const ctx={zone,retestAt:2400,minutes:[]},config=strategy([{type,percent:100}]);
 const result=planExits(config,dir,100,2700,catalog,ctx)[0];assert.equal(result.rawTarget,mirror(type.endsWith('Max')?103.2:103));
 assert.throws(()=>planExits(config,dir,100,2700,[old,straddle,future],ctx),/no completed/);
 assert.throws(()=>planExits(config,dir,100,2700,catalog,{...ctx,retestAt:1200}),/no completed/);
});
