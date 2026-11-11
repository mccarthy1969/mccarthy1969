// Shared chart and strategy study: one-second typical-price VWAP, reset at the session open.
import {aggregate} from './market.mjs';
export const TREND_BARS=5,TREND_CONFIRMATIONS=2,DEFAULT_SLOPE_THRESHOLD=0.005;
export function classifyTrend(bars,threshold=DEFAULT_SLOPE_THRESHOLD,lookback=TREND_BARS){
 if(bars.length!==lookback||bars.some((b,i)=>!b||!Number.isFinite(b.vwap)||b.v<=0||(i&&b.t!==bars[i-1].t+60)))return {trend:'unclear',reason:'Insufficient consecutive volume data'};
 const slopeMinutes=lookback-1,slope=(bars.at(-1).vwap-bars[0].vwap)/slopeMinutes;
 const metrics={slope,threshold,slopeMinutes,lookbackMinutes:lookback,slopeUnit:'dollarsPerMinute'};
 // Price location, candle direction and candle ranges do not participate in classification.
 if(slope>threshold+1e-12)return {trend:'up',reason:'VWAP rising faster than the slope threshold',...metrics};
 if(slope<-threshold-1e-12)return {trend:'down',reason:'VWAP falling faster than the slope threshold',...metrics};
 return {trend:'sideways',reason:'VWAP slope within the flat band',...metrics};
}
// Confirmation is causal: labels change at the second confirming close, never earlier.
export function smoothTrends(observations){
 let current='unclear',pending=null,count=0,previous=null;
 return observations.map(item=>{
  if(previous!==null&&item.t-previous!==60){pending=null;count=0;current='unclear';}
  previous=item.t;
  if(item.trend==='unclear'){current='unclear';pending=null;count=0;return {...item};}
  if(item.trend===current){pending=null;count=0;return {...item};}
  if(pending===item.trend)count++;else {pending=item.trend;count=1;}
  if(count>=TREND_CONFIRMATIONS){current=item.trend;pending=null;count=0;return {...item,reason:item.reason+' · Confirmed on two consecutive 1m updates'};}
  const label={up:'Uptrend',down:'Downtrend',sideways:'Sideways',unclear:'Unclear'};
  return {...item,trend:current,candidate:item.trend,reason:'Holding '+label[current]+'; '+label[item.trend]+' pending (1/2) · '+item.reason};
 });
}

export function classifyCandleTrend(bars,count=3,previous='sideways'){
 const recent=bars.slice(-count),metrics={method:'candles',candleCount:count};
 if(recent.some((b,i)=>!b||!Number.isFinite(b.o)||!Number.isFinite(b.c)||(i&&b.t!==recent[i-1].t+300)))return {trend:'unclear',reason:'Missing completed 5m candle data',...metrics};
 if(recent.length<count)return {trend:'sideways',reason:'Candles: waiting for '+count+' completed 5m candles',...metrics};
 const pairs=recent.slice(1),higher=(b,i)=>b.c>recent[i].c+1e-9,lower=(b,i)=>b.c<recent[i].c-1e-9;
 const up=pairs.every((b,i)=>higher(b,i)||b.c>recent[i].o+1e-9),down=pairs.every((b,i)=>lower(b,i)||b.c<recent[i].o-1e-9);
 let trend='sideways';
 if(up&&down){
  if(previous==='up'||previous==='down')trend=previous;
  else if(pairs.every(higher))trend='up';else if(pairs.every(lower))trend='down';
 }else if(up)trend='up';else if(down)trend='down';
 return {trend,reason:'Candles: '+count+' completed 5m bars · '+(trend==='up'?'higher closes or closes above prior opens':trend==='down'?'lower closes or closes below prior opens':'neither direction established'),upPattern:up,downPattern:down,...metrics};
}
export function candleTrendStudy(minute,sessionStart,through,count=3){
 const trends=[{t:sessionStart,...classifyCandleTrend([],count)}],five=[];
 for(let t=sessionStart+300;t<=through;t+=300){
  const parts=Array.from({length:5},(_,i)=>minute.get(t-300+i*60));
  five.push(parts.every(b=>b&&b.v>0&&Number.isFinite(b.o)&&Number.isFinite(b.c))?{t:t-300,o:parts[0].o,c:parts[4].c}:null);
  trends.push({t,...classifyCandleTrend(five,count,trends.at(-1).trend)});
 }
 return trends;
}

export function chartStudy(rows,sessionStart,seconds=60,threshold=DEFAULT_SLOPE_THRESHOLD,lookback=TREND_BARS,config={}){
 let pv=0,volume=0;const samples=new Map(),minuteSamples=new Map();
 for(const b of rows){pv+=(b.h+b.l+b.c)/3*b.v;volume+=b.v;const value=volume>0?pv/volume:null;
  samples.set(Math.floor(b.t/seconds)*seconds,value);minuteSamples.set(sessionStart+Math.floor((b.t-sessionStart)/60)*60,value);
 }
 const bars=aggregate(rows,seconds).map(b=>({...b,vwap:samples.get(b.t)??null}));
 const minute=new Map(aggregate(rows.map(b=>({...b,t:b.t-sessionStart})),60).map(b=>{const t=b.t+sessionStart;return [t,{...b,t,vwap:minuteSamples.get(t)??null}];}));
 const observedThrough=rows.length?rows.at(-1).t+1:sessionStart;
 if(config.trendMethod==='candles')return {bars,trends:candleTrendStudy(minute,sessionStart,observedThrough,config.candleTrendCount??3)};
 const trends=[{t:sessionStart,trend:'unclear',reason:'Collecting first 5 minutes'}];
 for(let t=sessionStart+TREND_BARS*60;t<=observedThrough;t+=60){
  const count=Math.min(lookback,Math.floor((t-sessionStart)/60));
  const recent=Array.from({length:count},(_,i)=>minute.get(t-(count-i)*60));
  trends.push({t,...(recent.every(Boolean)?classifyTrend(recent,threshold,count):{trend:'unclear',reason:'Missing one-minute data'})});
 }
 return {bars,trends:smoothTrends(trends)};
}
