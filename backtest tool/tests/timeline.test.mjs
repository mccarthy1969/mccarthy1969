import test from 'node:test';
import assert from 'node:assert/strict';
import {tradingDay,exchangeClose} from '../lib/calendar.mjs';
import {chartTimeline} from '../lib/chart-timeline.mjs';
import {defaults} from '../lib/strategy.mjs';
const rowsFor=(day,prem=true)=>Array.from({length:prem?450:390},(_,i)=>{const minute=(prem?510:570)+i,t=Date.parse(day+'T04:00:00Z')/1000+minute*60,p=minute<570?200:100;return {t,minute,o:p,h:p+.1,l:p-.1,c:p,v:1};});
test('equity calendar omits weekends, recurring holidays, and special closures',()=>{
 for(const day of ['2026-07-03','2026-07-04','2026-07-05','2026-01-01','2026-04-03','2026-06-19','2026-11-26','2025-01-09','2022-06-20'])assert.equal(tradingDay(day),false,day);
 for(const day of ['2026-07-02','2026-07-06','2021-06-18','2021-12-31'])assert.equal(tradingDay(day),true,day);
 assert.equal(exchangeClose('2026-11-27'),780);assert.equal(exchangeClose('2026-12-24'),780);assert.equal(exchangeClose('2026-07-06'),960);
});
test('timeline shows premarket and joins valid days without overnight/weekend/holiday slots',()=>{
 const days=['2026-07-02','2026-07-03','2026-07-04','2026-07-05','2026-07-06'];const chart=chartTimeline({days,day:days[0],seconds:60,config:defaults,readRows:d=>rowsFor(d)});
 assert.deepEqual(chart.sessions.map(s=>s.day),['2026-07-02','2026-07-06']);assert.equal(chart.bars.length,900);assert.equal(chart.bars.filter(b=>b.premarket).length,120);assert.equal(chart.sessions[0].premarketBars,60);assert.equal(chart.sessions[0].open-chart.sessions[0].premarketStart,3600);
 assert.equal(chart.bars[449].day,'2026-07-02');assert.equal(chart.bars[450].day,'2026-07-06');assert.equal(chart.bars[450].premarket,true);assert.equal(chart.bars[60].vwap,100);assert.equal(chart.bars[510].vwap,100);
});
test('missing premarket is explicitly empty rather than invented price candles',()=>{
 const chart=chartTimeline({days:['2026-07-06'],day:'2026-07-06',seconds:300,config:defaults,readRows:d=>rowsFor(d,false)});assert.equal(chart.bars.length,90);assert.equal(chart.bars.filter(b=>b.empty).length,12);assert.equal(chart.sessions[0].premarketBars,0);assert.ok(chart.bars.slice(0,12).every(b=>b.c===null&&b.vwap===null));
});
test('timeline respects early close and bounds its loaded day window',()=>{
 const chart=chartTimeline({days:['2026-11-27'],day:'2026-11-27',seconds:60,config:defaults,readRows:d=>rowsFor(d)});assert.equal(chart.bars.length,270);assert.equal(chart.sessions[0].close-chart.sessions[0].open,210*60);
 const days=['2026-07-06','2026-07-07','2026-07-08','2026-07-09','2026-07-10','2026-07-13','2026-07-14'];const window=chartTimeline({days,day:'2026-07-09',seconds:60,config:defaults,readRows:d=>rowsFor(d)});assert.equal(window.sessions.length,5);assert.equal(window.hasNext,true);assert.equal(window.hasPrevious,true);
});
