import {aggregate,marketTime} from './market.mjs';
import {ZRCE,clock} from './strategy.mjs';
export const ENGINE_VERSION='0.1.0';
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
export function simulateDay(rows,c,day){const start=clock(c.sessionStart),end=clock(c.sessionOverrides[day]||c.sessionEnd);rows=rows.filter(r=>r.minute>=start&&r.minute<end);if(!rows.length)return {trades:[],zones:[],events:[],rejections:{},quality:{seconds:0,minuteGaps:0,truncated:true}};
 const minutes=aggregate(rows),s=new ZRCE(c),trades=[];let p=null,idx=0,previous=null,minuteGaps=0;const truncated=rows.at(-1).minute<end-1;
 const close=(b,x)=>{const exit=x.price;const gross=exit===null?null:(exit-p.entry)*p.dir*c.shares,fees=2*c.feePerShare*c.shares;trades.push({...p,exitTime:b.t,exit,reason:x.reason,excluded:x.excluded,gross,fees:x.excluded?null:fees,pnl:x.excluded?null:gross-fees,duration:b.t-p.t});p=null;};
 for(const m of minutes){const mt=marketTime(m.t),from=idx;while(idx<rows.length&&rows[idx].t<m.t+60)idx++;const seconds=rows.slice(from,idx);
  if(previous!==null&&m.t-previous>60)minuteGaps+=(m.t-previous)/60-1;previous=m.t;
  // Only the current open is exposed to the strategy at entry time.
  const candidate=s.onOpen({t:m.t,o:m.o},mt.minute);
  if(!p&&candidate&&mt.minute<end-1&&seconds[0].t===m.t){const entry=candidate.reference+candidate.dir*(c.spread/2+c.slippage),risk=candidate.dir*(entry-candidate.stop),reward=candidate.dir*(candidate.target-entry);if(risk>0&&reward>0&&reward+1e-8>=risk*c.minRR)p={...candidate,entry,risk,rr:reward/risk,shares:c.shares,day};else s.reject('reward/risk after costs');}
  else if(candidate&&!p&&seconds[0].t!==m.t)s.reject('missing entry second');
  for(const b of seconds){if(p){const x=resolveExit(p,b,c);if(x)close(b,x);}}
  s.onClose(m);
 }
 if(p){const b=rows.at(-1);close(b,{price:b.c-p.dir*(c.spread/2+c.slippage),reason:truncated?'DATA_END':'SESSION_CLOSE',excluded:truncated});}
 return {trades,zones:s.zones.map(z=>({...z,day})),events:s.events,rejections:s.rejections,quality:{seconds:rows.length,minutes:minutes.length,minuteGaps,truncated,lastTime:rows.at(-1).t}};
}
export function summarize(trades,capital=100000){let net=0,peak=0,maxDrawdown=0,gains=0,losses=0,wins=0,losers=0,fees=0;const equity=[],monthly={},byDay={},bySide={long:{count:0,pnl:0},short:{count:0,pnl:0}};const valid=trades.filter(t=>!t.excluded);
 for(const t of valid){net+=t.pnl;peak=Math.max(peak,net);maxDrawdown=Math.max(maxDrawdown,peak-net);if(t.pnl>0){wins++;gains+=t.pnl;}if(t.pnl<0){losers++;losses-=t.pnl;}fees+=t.fees;equity.push({t:t.exitTime,value:net});monthly[t.day.slice(0,7)]=(monthly[t.day.slice(0,7)]||0)+t.pnl;byDay[t.day]=(byDay[t.day]||0)+t.pnl;const side=bySide[t.dir===1?'long':'short'];side.count++;side.pnl+=t.pnl;}
 return {trades:valid.length,excluded:trades.length-valid.length,wins,losses:losers,breakeven:valid.length-wins-losers,winRate:valid.length?wins/valid.length:0,net,gross:valid.reduce((a,t)=>a+t.gross,0),fees,profitFactor:losses?gains/losses:null,maxDrawdown,returnPct:net/capital,expectancy:valid.length?net/valid.length:0,averageWin:wins?gains/wins:0,averageLoss:losers?-losses/losers:0,equity,monthly,byDay,bySide};
}
