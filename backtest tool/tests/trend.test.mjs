import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig} from '../lib/strategy.mjs';
import {classifyTrend,chartStudy,smoothTrends} from '../lib/trend.mjs';
const start=Date.parse('2025-01-06T14:30:00Z')/1000;
const bars=(values,closes)=>values.map((vwap,i)=>({t:start+i*60,vwap,c:closes[i],h:103,l:99,v:10}));
const rising=()=>bars([100,100.04,100.08,100.12,100.16],[100.6,100.8,101,101.2,101.4,101.6]);
const observations=states=>states.map((trend,i)=>({t:start+300+i*60,trend,reason:trend}));
test('VWAP slope alone sets direction despite price retests and large candle ranges',()=>{
 const up=rising(),down=up.map(b=>({...b,vwap:200-b.vwap}));
 assert.equal(classifyTrend(up).trend,'up');assert.equal(classifyTrend(down).trend,'down');
 for(const input of [up,down]){const retests=input.map((b,i)=>({...b,c:b.vwap+(i%2?10:-10),h:1000,l:0}));assert.deepEqual(classifyTrend(retests),classifyTrend(input));}
 assert.ok(Math.abs(classifyTrend(up).slope-.04)<1e-10);assert.equal(classifyTrend(up).slopeUnit,'dollarsPerMinute');
});
test('threshold defines a symmetric inclusive flat band, including zero',()=>{
 for(const direction of [1,-1]){const input=rising().map(b=>({...b,vwap:100+direction*(b.vwap-100)}));
 assert.equal(classifyTrend(input,.039).trend,direction===1?'up':'down');
 assert.equal(classifyTrend(input,.04).trend,'sideways');assert.equal(classifyTrend(input,.05).trend,'sideways');
 assert.equal(classifyTrend(input,0).trend,direction===1?'up':'down');}
 assert.equal(classifyTrend(rising().map(b=>({...b,vwap:100})),0).trend,'sideways');
});
test('threshold config accepts slider endpoints and rejects invalid values',()=>{
 assert.equal(validateConfig({}).trendSlopeThreshold,.005);
 for(const value of [0,.005,.05])assert.equal(validateConfig({trendSlopeThreshold:value}).trendSlopeThreshold,value);
 for(const value of [-.001,.051,NaN,Infinity,null,'0.005'])assert.throws(()=>validateConfig({trendSlopeThreshold:value}));
});
test('two consecutive confirmations prevent one-update flicker and allow real reversals',()=>{
 const result=smoothTrends(observations(['sideways','sideways','up','sideways','down','sideways','up','up','sideways','up','down','down']));
 assert.deepEqual(result.map(x=>x.trend),['unclear','sideways','sideways','sideways','sideways','sideways','sideways','up','up','up','up','down']);
 assert.equal(result[6].candidate,'up');assert.equal(result[7].t,start+720);
});
test('invalid data immediately resets the held trend and its pending confirmation',()=>{
 assert.deepEqual(smoothTrends(observations(['up','up','down','unclear','down','down'])).map(x=>x.trend),['unclear','up','up','unclear','unclear','down']);
 const gap=observations(['up','up']);gap[1].t+=300;assert.equal(smoothTrends(gap)[1].trend,'unclear');
});
const rows=Array.from({length:5400},(_,i)=>{const p=100+i/1000;return {t:start+i,o:p,h:p+.01,l:p-.01,c:p,v:1};});
test('VWAP is volume weighted using 1s typical prices and resets per session',()=>{
 const input=[{t:start,o:10,h:12,l:9,c:9,v:1},{t:start+1,o:20,h:21,l:18,c:21,v:3}];
 const result=chartStudy(input,start,1);assert.equal(result.bars[0].vwap,10);assert.equal(result.bars[1].vwap,17.5);
 assert.equal(chartStudy([input[1]],start,1).bars[0].vwap,20);assert.equal(chartStudy([{...input[0],v:0}],start,1).bars[0].vwap,null);
});
test('5-minute warmup and confirmation timestamps never backfill earlier candles',()=>{
 assert.equal(chartStudy(rows.slice(0,299),start).trends.length,1);
 const first=chartStudy(rows.slice(0,300),start);assert.equal(first.trends[1].t,start+300);assert.equal(first.trends[1].trend,'unclear');assert.equal(first.trends[1].candidate,'up');
 const confirmed=chartStudy(rows.slice(0,360),start);assert.equal(confirmed.trends[2].t,start+360);assert.equal(confirmed.trends[2].trend,'up');
});
test('trend and VWAP are independent of chart timeframe',()=>{
 const a=chartStudy(rows,start,1),b=chartStudy(rows,start,60),c=chartStudy(rows,start,300);assert.deepEqual(a.trends,b.trends);assert.deepEqual(b.trends,c.trends);
 for(const bar of c.bars)assert.equal(bar.vwap,a.bars.find(b=>b.t===bar.t+299).vwap);
});
test('future prices cannot change earlier confirmed or pending labels',()=>{
 const before=chartStudy(rows.slice(0,2400),start,1),changed=rows.map((b,i)=>i<2400?b:{...b,h:1000,l:900,c:999,v:1000}),after=chartStudy(changed,start,1);
 assert.deepEqual(before.bars,after.bars.slice(0,2400));assert.deepEqual(before.trends,after.trends.filter(t=>t.t<=start+2400));
});
test('missing one-minute candles and zero-volume windows are unclear',()=>{
 const missing=chartStudy(rows.filter(b=>b.t<start+300||b.t>=start+600),start);assert.equal(missing.trends.find(t=>t.t===start+300).trend,'unclear');
 assert.equal(chartStudy(rows.map(b=>({...b,v:0})),start).trends.at(-1).trend,'unclear');
});
test('nonstandard session opens align both evaluations and confirmations',()=>{
 const shifted=chartStudy(rows.map(b=>({...b,t:b.t+120})),start+120);assert.equal(shifted.trends[1].t,start+420);assert.equal(shifted.trends[2].t,start+480);assert.equal(shifted.trends[2].trend,'up');
});
test('a wider flat band keeps oscillating VWAP sideways after warmup',()=>{
 const chop=Array.from({length:4800},(_,i)=>{const p=100+Math.sin(i*Math.PI/300)*.05;return {t:start+i,o:p,h:p+.1,l:p-.1,c:p,v:10};});
 const trends=chartStudy(chop,start,60,.05).trends;assert.ok(trends.slice(2).every(t=>t.trend==='sideways'));
 const transitions=trends.filter((t,i)=>i&&t.trend!==trends[i-1].trend);assert.equal(transitions.length,1);
});

test('threshold changes labels without changing VWAP or availability times',()=>{
 const low=chartStudy(rows,start,60,0),high=chartStudy(rows,start,60,.05);
 assert.deepEqual(low.bars,high.bars);assert.deepEqual(low.trends.map(t=>t.t),high.trends.map(t=>t.t));
 assert.ok(low.trends.slice(2).every(t=>t.trend==='up'));assert.ok(high.trends.slice(2).every(t=>t.trend==='sideways'));
});
test('lookback setting validates integer minutes from 5 through 60',()=>{
 assert.equal(validateConfig({}).trendLookbackMinutes,5);
 for(const n of [5,15,30,60])assert.equal(validateConfig({trendLookbackMinutes:n}).trendLookbackMinutes,n);
 for(const n of [4,61,5.5,null,'15',NaN])assert.throws(()=>validateConfig({trendLookbackMinutes:n}));
});
test('longer average slope retains a broad uptrend during a short VWAP pullback',()=>{
 const values=Array.from({length:11},(_,i)=>100+i*.1).concat([100.99,100.98,100.97,100.96]);
 const input=values.map((vwap,i)=>({t:start+i*60,vwap,v:10}));
 assert.equal(classifyTrend(input.slice(-5),0).trend,'down');assert.equal(classifyTrend(input,0,15).trend,'up');assert.equal(classifyTrend(input,0,15).lookbackMinutes,15);
});
test('lookback expands from five minutes without delaying opening confirmation',()=>{
 const study=chartStudy(rows,start,60,.005,30);
 assert.equal(study.trends[1].t,start+300);assert.equal(study.trends[1].lookbackMinutes,5);assert.equal(study.trends[2].trend,'up');assert.equal(study.trends[2].lookbackMinutes,6);
 assert.equal(study.trends.find(t=>t.t===start+1800).lookbackMinutes,30);assert.equal(study.trends.at(-1).lookbackMinutes,30);
 const before=chartStudy(rows.slice(0,2400),start,60,.005,30);assert.deepEqual(before.trends,study.trends.filter(t=>t.t<=start+2400));
 assert.deepEqual(study.trends,chartStudy(rows,start,300,.005,30).trends);
});
import {classifyCandleTrend} from '../lib/trend.mjs';
test('candle trend method defaults and count validation',()=>{
 assert.equal(validateConfig({}).trendMethod,'vwap');assert.equal(validateConfig({}).candleTrendCount,3);assert.equal(validateConfig({trendMethod:'candles',candleTrendCount:4}).candleTrendCount,4);
 for(const trendMethod of [null,'price',true])assert.throws(()=>validateConfig({trendMethod}));for(const candleTrendCount of [1,79,2.5,null,'3'])assert.throws(()=>validateConfig({candleTrendCount}));
});
test('candle trend supports strictly rising/falling closes and neutral mixed bodies',()=>{
 const make=values=>values.map((c,i)=>({t:start+i*300,o:c,c}));
 assert.equal(classifyCandleTrend(make([100,101,102])).trend,'up');assert.equal(classifyCandleTrend(make([102,101,100])).trend,'down');
 for(const values of [[100,100,101],[100,102,101],[101,100,100]])assert.equal(classifyCandleTrend(make(values)).trend,'sideways');
 assert.equal(classifyCandleTrend(make([100,101])).trend,'sideways');assert.equal(classifyCandleTrend(make([100,101,102,103]),4).trend,'up');
 assert.equal(classifyCandleTrend([{t:start,o:1,c:1},null,{t:start+600,o:1,c:2}]).trend,'unclear');
});
test('candle trend uses completed 5m bars without delayed confirmation or future repaint',()=>{
 const config={trendMethod:'candles',candleTrendCount:3};
 const before=chartStudy(rows.slice(0,899),start,60,.005,5,config);assert.ok(before.trends.every(t=>t.trend==='sideways'));
 const first=chartStudy(rows.slice(0,900),start,60,.005,5,config);assert.equal(first.trends.at(-1).t,start+900);assert.equal(first.trends.at(-1).trend,'up');assert.equal(first.trends.at(-1).candleCount,3);
 const after=chartStudy(rows,start,60,.005,5,config);assert.deepEqual(first.trends,after.trends.filter(t=>t.t<=start+900));assert.deepEqual(after.trends,chartStudy(rows,start,300,.005,5,config).trends);
 assert.deepEqual(after.bars,chartStudy(rows,start).bars);assert.equal(chartStudy(rows,start,60,.005,5,{...config,candleTrendCount:2}).trends.find(t=>t.t===start+600).trend,'up');
 const shifted=chartStudy(rows.map(b=>({...b,t:b.t+120})),start+120,60,.005,5,config);assert.equal(shifted.trends.find(t=>t.trend==='up').t,start+1020);
});
test('missing 1m data cannot form a complete candle trend window',()=>{
 const config={trendMethod:'candles',candleTrendCount:3},data=rows.filter(b=>b.t<start+300||b.t>=start+360),study=chartStudy(data,start,60,.005,5,config);
 assert.equal(study.trends.find(t=>t.t===start+900).trend,'unclear');assert.equal(study.trends.find(t=>t.t===start+1500).trend,'up');
});
test('candle trends continue through pullbacks holding the previous open',()=>{
 const make=specs=>specs.map(([o,c],i)=>({t:start+i*300,o,c}));
 const up=make([[99,100],[100,102],[102,101]]);assert.equal(classifyCandleTrend(up).trend,'up');
 const down=up.map(b=>({...b,o:200-b.o,c:200-b.c}));assert.equal(classifyCandleTrend(down).trend,'down');
 assert.equal(classifyCandleTrend(make([[99,100],[100,101],[101,101]])).trend,'up');
 assert.equal(classifyCandleTrend(make([[102,101],[101,100],[100,100]])).trend,'down');
});
test('overlapping candle patterns preserve an established trend and otherwise stay sideways',()=>{
 const bars=[[100,101],[101,100.5],[100.5,100.75]].map(([o,c],i)=>({t:start+i*300,o,c}));
 assert.equal(classifyCandleTrend(bars,3,'up').trend,'up');assert.equal(classifyCandleTrend(bars,3,'down').trend,'down');assert.equal(classifyCandleTrend(bars,3,'sideways').trend,'sideways');assert.equal(classifyCandleTrend(bars,3,'unclear').trend,'sideways');
 const falling=[103,102,101].map((c,i)=>({t:start+i*300,o:c+.5,c}));assert.equal(classifyCandleTrend(falling,3,'up').trend,'down');
});
test('completed 5m pullback bars do not erase a confirmed candle downtrend',()=>{
 const specs=[[103,102],[102,101],[101,100],[100,100.2],[100.2,99],[99,98]];
 const data=specs.flatMap(([o,c],i)=>Array.from({length:300},(_,j)=>({t:start+i*300+j,o:j===0?o:c,h:Math.max(o,c),l:Math.min(o,c),c,v:1})));
 const config={trendMethod:'candles',candleTrendCount:3},study=chartStudy(data,start,60,.005,5,config);
 assert.ok(study.trends.filter(t=>t.t>=start+900).every(t=>t.trend==='down'));
 const before=chartStudy(data.slice(0,1200),start,60,.005,5,config);assert.deepEqual(before.trends,study.trends.filter(t=>t.t<=start+1200));
 assert.deepEqual(study.trends,chartStudy(data,start,300,.005,5,config).trends);
});
