import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeByTrend} from '../public/performance.mjs';
import {summarize} from '../lib/engine.mjs';
test('trend breakdown uses entry trend, position net P&L, and counts entries once',()=>{
 const samples=[['down',10],['down',-5],['down',0],['up',20],['sideways',-2],['unclear',3],[undefined,-1]];
 const trades=samples.map(([trendAtSignal,pnl],i)=>({trendAtSignal,pnl,gross:pnl+1,fees:1,exitTime:i,dir:i%2?1:-1,day:'2026-07-13',exits:[{price:100},{price:101}]}));trades.push({trendAtSignal:'down',pnl:1000,excluded:true});
 const result=summarizeByTrend(trades);
 assert.deepEqual(result.down,{trades:3,wins:1,losses:1,breakeven:1,winRate:1/3,pnl:5});assert.equal(result.up.winRate,1);assert.equal(result.up.pnl,20);assert.equal(result.sideways.winRate,0);assert.equal(result.sideways.pnl,-2);assert.equal(result.other.trades,2);assert.equal(result.other.winRate,.5);assert.equal(result.other.pnl,2);
 const total=summarize(trades);assert.deepEqual(total.byTrend,result);assert.equal(Object.values(result).reduce((n,r)=>n+r.trades,0),total.trades);assert.equal(Object.values(result).reduce((n,r)=>n+r.pnl,0),total.net);
});
test('empty trend groups have no entries and safe zero metrics',()=>{
 for(const stats of Object.values(summarizeByTrend([])))assert.deepEqual(stats,{trades:0,wins:0,losses:0,breakeven:0,winRate:0,pnl:0});
});

test('lowest cumulative P&L includes starting zero and excludes excluded trades',()=>{
 const make=pnl=>({pnl,gross:pnl,fees:0,exitTime:0,day:'2026-07-13',dir:1});
 assert.equal(summarize([100,-98,200].map(make)).lowestPnl,0);
 assert.equal(summarize([-20,10,-30,100].map(make)).lowestPnl,-40);
 assert.equal(summarize([make(10),{...make(-1000),excluded:true}]).lowestPnl,0);
 assert.equal(summarize([]).lowestPnl,0);
});
import {summarizeByHour} from '../public/performance.mjs';
test('entry-hour stats use session-open boundaries, net position P&L and New York DST',()=>{
 const trade=(time,pnl,extra={})=>({t:Date.parse(time)/1000,pnl,exitTime:Date.parse('2026-07-13T19:59:00Z')/1000,exits:[{shares:80},{shares:20}],...extra});
 const rows=summarizeByHour([
  trade('2026-07-13T13:30:00Z',10),trade('2026-07-13T14:29:59Z',-5),trade('2026-07-13T14:30:00Z',20),
  trade('2026-01-06T14:30:00Z',0),trade('2026-07-13T19:59:59Z',-2),trade('2026-07-13T20:00:00Z',100),
  trade('2026-07-13T13:29:59Z',100),trade('2026-07-13T13:30:00Z',999,{excluded:true})]);
 assert.equal(rows.length,7);assert.equal(rows[0].start,'09:30');assert.equal(rows[0].end,'10:30');assert.equal(rows[0].trades,3);assert.equal(rows[0].wins,1);assert.equal(rows[0].breakeven,1);assert.equal(rows[0].winRate,1/3);assert.equal(rows[0].pnl,5);
 assert.equal(rows[1].trades,1);assert.equal(rows[1].pnl,20);assert.equal(rows[1].winRate,1);
 assert.equal(rows[6].start,'15:30');assert.equal(rows[6].end,'16:00');assert.equal(rows[6].pnl,-2);assert.equal(rows[2].trades,0);assert.equal(rows[2].winRate,0);
 assert.equal(rows.reduce((n,r)=>n+r.trades,0),5);assert.equal(rows.reduce((n,r)=>n+r.pnl,0),23);
});
test('entry-hour stats support custom sessions and short final hours',()=>{
 const config={sessionStart:'09:00',sessionEnd:'13:00'};
 const trades=[{t:Date.parse('2026-07-13T13:59:59Z')/1000,pnl:10,gross:10,fees:0,day:'2026-07-13',dir:1,exitTime:0}];
 const rows=summarizeByHour(trades,config);assert.equal(rows.length,4);assert.equal(rows[0].pnl,10);assert.equal(rows[3].end,'13:00');
 assert.deepEqual(summarize(trades,100000,config).byHour,rows);
 assert.equal(summarizeByHour([]).length,7);assert.ok(summarizeByHour([]).every(r=>r.pnl===0&&r.trades===0));
});
import {easternToCentral,centralToEastern,convertOverrideClocks} from '../public/performance.mjs';
test('Central display clocks round-trip exchange settings and early-close overrides',()=>{
 for(const [eastern,central] of [['09:30','08:30'],['10:30','09:30'],['16:00','15:00'],['13:00','12:00'],['00:30','23:30']]){assert.equal(easternToCentral(eastern),central);assert.equal(centralToEastern(central),eastern);}
 const config={'2026-11-27':'13:00'};assert.deepEqual(convertOverrideClocks(config,easternToCentral),{'2026-11-27':'12:00'});assert.deepEqual(convertOverrideClocks(convertOverrideClocks(config,easternToCentral),centralToEastern),config);
 for(const bad of [null,'bad','24:00','12:61'])assert.equal(centralToEastern(bad),bad);
 const clock=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 assert.equal(clock.format(new Date('2026-01-06T14:30:00Z')),'08:30');assert.equal(clock.format(new Date('2026-07-13T13:30:00Z')),'08:30');
});
import {equityYearTicks} from '../public/performance.mjs';
test('equity year ticks mark year changes at trade exits including starting baseline',()=>{
 const at=s=>Date.parse(s+'T18:00:00Z')/1000;
 assert.deepEqual(equityYearTicks([{t:at('2024-06-01')},{t:at('2024-12-31')},{t:at('2025-01-02')},{t:at('2026-05-01')}]),[{year:2024,index:0},{year:2025,index:3},{year:2026,index:4}]);
 assert.deepEqual(equityYearTicks([]),[]);assert.deepEqual(equityYearTicks([{t:NaN}]),[]);
});
