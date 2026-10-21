// Shared chart and strategy study: one-second typical-price VWAP, reset at the session open.
import {aggregate} from './market.mjs';
export const TREND_BARS=6,TREND_CONFIRMATIONS=2,DEFAULT_SLOPE_THRESHOLD=0.005;
export function classifyTrend(bars,threshold=DEFAULT_SLOPE_THRESHOLD){
 if(bars.length!==TREND_BARS||bars.some((b,i)=>!b||!Number.isFinite(b.vwap)||b.v<=0||(i&&b.t!==bars[i-1].t+300)))return {trend:'unclear',reason:'Insufficient consecutive volume data'};
 const slopeMinutes=25,slope=(bars.at(-1).vwap-bars[0].vwap)/slopeMinutes;
 const metrics={slope,threshold,slopeMinutes,lookbackMinutes:30,slopeUnit:'dollarsPerMinute'};
 // Price location, candle direction and candle ranges do not participate in classification.
 if(slope>threshold+1e-12)return {trend:'up',reason:'VWAP rising faster than the slope threshold',...metrics};
 if(slope<-threshold-1e-12)return {trend:'down',reason:'VWAP falling faster than the slope threshold',...metrics};
 return {trend:'sideways',reason:'VWAP slope within the flat band',...metrics};
}
// Confirmation is causal: labels change at the second confirming close, never earlier.
export function smoothTrends(observations){
 let current='unclear',pending=null,count=0,previous=null;
 return observations.map(item=>{
  if(previous!==null&&item.t-previous!==300){pending=null;count=0;current='unclear';}
  previous=item.t;
  if(item.trend==='unclear'){current='unclear';pending=null;count=0;return {...item};}
  if(item.trend===current){pending=null;count=0;return {...item};}
  if(pending===item.trend)count++;else {pending=item.trend;count=1;}
  if(count>=TREND_CONFIRMATIONS){current=item.trend;pending=null;count=0;return {...item,reason:item.reason+' · Confirmed on two consecutive 5m updates'};}
  const label={up:'Uptrend',down:'Downtrend',sideways:'Sideways',unclear:'Unclear'};
  return {...item,trend:current,candidate:item.trend,reason:'Holding '+label[current]+'; '+label[item.trend]+' pending (1/2) · '+item.reason};
 });
}
export function chartStudy(rows,sessionStart,seconds=60,threshold=DEFAULT_SLOPE_THRESHOLD){
 let pv=0,volume=0;const samples=new Map(),fiveSamples=new Map();
 for(const b of rows){pv+=(b.h+b.l+b.c)/3*b.v;volume+=b.v;const value=volume>0?pv/volume:null;
  samples.set(Math.floor(b.t/seconds)*seconds,value);fiveSamples.set(sessionStart+Math.floor((b.t-sessionStart)/300)*300,value);
 }
 const bars=aggregate(rows,seconds).map(b=>({...b,vwap:samples.get(b.t)??null}));
 const five=new Map(aggregate(rows.map(b=>({...b,t:b.t-sessionStart})),300).map(b=>{const t=b.t+sessionStart;return [t,{...b,t,vwap:fiveSamples.get(t)??null}];}));
 const trends=[{t:sessionStart,trend:'unclear',reason:'Collecting first 30 minutes'}];
 const observedThrough=rows.length?rows.at(-1).t+1:sessionStart;
 for(let t=sessionStart+TREND_BARS*300;t<=observedThrough;t+=300){
  const recent=Array.from({length:TREND_BARS},(_,i)=>five.get(t-(TREND_BARS-i)*300));
  trends.push({t,...(recent.every(Boolean)?classifyTrend(recent,threshold):{trend:'unclear',reason:'Missing five-minute data'})});
 }
 return {bars,trends:smoothTrends(trends)};
}
