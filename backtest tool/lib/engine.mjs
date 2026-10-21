import {marketTime} from './market.mjs';
import {ZRCE,clock} from './strategy.mjs';
import {chartStudy} from './trend.mjs';
export const ENGINE_VERSION='0.5.0';
export const trendAllows=(trend,dir)=>trend==='sideways'||(trend==='up'&&dir===1)||(trend==='down'&&dir===-1);
// Stop/target are executable exit-price levels. Synthetic bid/ask = trade reference +/- spread/2.
export function resolveExit(p,b,c){const q=c.spread/2,o=b.o-p.dir*q,h=b.h-p.dir*q,l=b.l-p.dir*q;
 const stop=p.dir===1?l<=p.stop:h>=p.stop,target=p.dir===1?h>=p.target:l<=p.target;
 const gapStop=p.dir===1?o<=p.stop:o>=p.stop,gapTarget=p.dir===1?o>=p.target:o<=p.target;
 if(gapStop)return {price:o-p.dir*c.slippage,reason:'GAP_STOP',excluded:false};
 if(gapTarget)return {price:p.target,reason:'TARGET',excluded:false};
 if(stop&&target)return {price:null,reason:'AMBIGUOUS',excluded:true};
 if(stop)return {price:p.stop-p.dir*c.slippage,reason:'STOP',excluded:false};
 if(target)return {price:p.target,reason:'TARGET',excluded:false};return null;
}
export function simulateDay(rows,c,day){const start=clock(c.sessionStart),end=clock(c.sessionOverrides[day]||c.sessionEnd);rows=rows.filter(r=>r.minute>=start&&r.minute<end);if(!rows.length)return {trades:[],zones:[],events:[],trends:[],rejections:{},quality:{seconds:0,minuteGaps:0,truncated:true}};
 const sessionStart=Math.floor(rows[0].t/60)*60-(rows[0].minute-start)*60;
 const {bars:minutes,trends}=chartStudy(rows,sessionStart,60,c.trendSlopeThreshold),s=new ZRCE(c),trades=[];let p=null,idx=0,previous=null,minuteGaps=0,trendIndex=0;const truncated=rows.at(-1).minute<end-1;
 const close=(b,x)=>{const exit=x.price;const gross=exit===null?null:(exit-p.entry)*p.dir*c.shares,fees=2*c.feePerShare*c.shares;trades.push({...p,exitTime:b.t,exit,reason:x.reason,excluded:x.excluded,gross,fees:x.excluded?null:fees,pnl:x.excluded?null:gross-fees,duration:b.t-p.t});p=null;};
 for(const m of minutes){const mt=marketTime(m.t),from=idx;while(idx<rows.length&&rows[idx].t<m.t+60)idx++;const seconds=rows.slice(from,idx);
  if(previous!==null&&m.t-previous>60)minuteGaps+=(m.t-previous)/60-1;previous=m.t;
  // Arm a trigger from completed candles; inspect each entry-window second in order.
  const candidate=s.onOpen({t:m.t,o:m.o},mt.minute);
  while(trendIndex+1<trends.length&&trends[trendIndex+1].t<=m.t)trendIndex++;
  const trend=trends[trendIndex];
  let pending=!p&&mt.minute<end-1?candidate:null,expected=m.t;
  if(pending){
   if(c.trendFilter!==false&&!trendAllows(trend.trend,pending.dir)){s.reject('trend filter: '+trend.trend);pending=null;}
   else pending={...pending,trendAtSignal:trend.trend,trendTime:trend.t,trendFilterApplied:c.trendFilter!==false};
  }
  for(const b of seconds){
   let intrabarEntry=false;
   if(pending){
    if(b.t>=pending.expiresAt){s.reject(expected<pending.expiresAt?'missing entry-window seconds':'entry window expired');pending=null;}
    else if(b.t!==expected){s.reject('missing entry-window seconds');pending=null;}
    else {
     expected=b.t+1;
     const dir=pending.dir,trigger=pending.triggerPrice;
     const touched=dir===1?b.h>=trigger:b.l<=trigger;
     if(touched){
      const atOpen=dir*(b.o-trigger)>=0,reference=atOpen?b.o:trigger;
      const entry=reference+dir*(c.spread/2+c.slippage),risk=dir*(entry-pending.stop),reward=dir*(pending.target-entry);
      if(risk>0&&reward>0&&reward+1e-8>=risk*c.minRR){p={...pending,reference,t:b.t,entry,risk,rr:reward/risk,shares:c.shares,day};intrabarEntry=!atOpen;}
      else s.reject('reward/risk after costs');
      pending=null; // One entry attempt per setup, even if it exits in this second.
     }
    }
   }
   if(p){
    // A stop touched in the trigger second may have occurred before the entry.
    // Preserve that unknown ordering as an excluded trade instead of inventing a fill.
    const stopTouched=p.dir===1?b.l-c.spread/2<=p.stop:b.h+c.spread/2>=p.stop;
    const x=intrabarEntry&&stopTouched?{price:null,reason:'AMBIGUOUS',excluded:true}:resolveExit(p,intrabarEntry?{...b,o:p.reference}:b,c);
    if(x)close(b,x);
   }
  }
  if(pending)s.reject(expected<pending.expiresAt?'missing entry-window seconds':'entry window expired');
  s.onClose(m);
 }
 if(p){const b=rows.at(-1);close(b,{price:b.c-p.dir*(c.spread/2+c.slippage),reason:truncated?'DATA_END':'SESSION_CLOSE',excluded:truncated});}
 return {trades,trends,zones:s.zones.map(z=>({...z,day})),events:s.events,rejections:s.rejections,quality:{seconds:rows.length,minutes:minutes.length,minuteGaps,truncated,lastTime:rows.at(-1).t}};
}
export function summarize(trades,capital=100000){let net=0,peak=0,maxDrawdown=0,gains=0,losses=0,wins=0,losers=0,fees=0;const equity=[],monthly={},byDay={},bySide={long:{count:0,pnl:0},short:{count:0,pnl:0}};const valid=trades.filter(t=>!t.excluded);
 for(const t of valid){net+=t.pnl;peak=Math.max(peak,net);maxDrawdown=Math.max(maxDrawdown,peak-net);if(t.pnl>0){wins++;gains+=t.pnl;}if(t.pnl<0){losers++;losses-=t.pnl;}fees+=t.fees;equity.push({t:t.exitTime,value:net});monthly[t.day.slice(0,7)]=(monthly[t.day.slice(0,7)]||0)+t.pnl;byDay[t.day]=(byDay[t.day]||0)+t.pnl;const side=bySide[t.dir===1?'long':'short'];side.count++;side.pnl+=t.pnl;}
 return {trades:valid.length,excluded:trades.length-valid.length,wins,losses:losers,breakeven:valid.length-wins-losers,winRate:valid.length?wins/valid.length:0,net,gross:valid.reduce((a,t)=>a+t.gross,0),fees,profitFactor:losses?gains/losses:null,maxDrawdown,returnPct:net/capital,expectancy:valid.length?net/valid.length:0,averageWin:wins?gains/wins:0,averageLoss:losers?-losses/losers:0,equity,monthly,byDay,bySide};
}
