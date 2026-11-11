import {checkClearPath} from './clear-path.mjs';
import {rateZonePower} from '../public/zones.mjs';
import {summarizeByTrend,summarizeByHour} from '../public/performance.mjs';
import {exitZoneCatalog,planExits,allocateExits,movedStop,exitReward,furthestTarget} from './exits.mjs';
import {marketTime} from './market.mjs';
import {ZRCE,clock} from './strategy.mjs';
import {chartStudy} from './trend.mjs';
export const ENGINE_VERSION='0.53.0';
export const trendAllows=(trend,dir)=>trend==='sideways'||(trend==='up'&&dir===1)||(trend==='down'&&dir===-1);
export function trendSelected(config,trend){
 const flags={up:config.allowUptrend!==false,down:config.allowDowntrend!==false,sideways:config.allowSideways!==false};
 // Unclassified legacy entries are preserved only when all trend selections are enabled.
 return Object.hasOwn(flags,trend)?flags[trend]:Object.values(flags).every(Boolean);
}
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

// Use only VWAP from a completed minute before entry. Fixed targets are capped individually;
// no-limit runners retain their trailing protection and have no intervening fixed target.
export function applyVwapTarget(mode,dir,entry,vwap,target,plan=null){
 const between=value=>Number.isFinite(vwap)&&dir*(vwap-entry)>1e-8&&Number.isFinite(value)&&dir*(value-vwap)>1e-8;
 const blocked=plan?plan.some(e=>between(e.target)):between(target);
 if(!blocked||!mode||mode==='ignore')return {target,plan};
 if(mode==='skip')throw Error('VWAP between entry and target');
 const adjusted=plan?plan.map(e=>between(e.target)?{...e,target:vwap,originalTarget:e.target,vwapTarget:true}:e):null;
 return {target:adjusted?furthestTarget(adjusted,dir):vwap,plan:adjusted};
}


// Cap fixed exits at the near edge of the first confirmed 5m zone on their path.
export function applyZoneTarget(zones,through,dir,entry,target,plan=null){
 const ahead=zones.filter(z=>z.t<=through&&(z.invalidatedAt==null||z.invalidatedAt>through)&&dir*((dir===1?z.bottom:z.top)-entry)>1e-8)
  .map(z=>({zone:z,level:dir===1?z.bottom:z.top})).sort((a,b)=>dir*(a.level-b.level));
 const cap=value=>Number.isFinite(value)?ahead.find(z=>dir*(value-z.level)>1e-8):null;
 const adjusted=plan?plan.map(e=>{const hit=cap(e.target);return hit?{...e,target:hit.level,originalTarget:e.originalTarget??e.target,targetZone:{...hit.zone}}:e;}):null;
 const hit=cap(target);
 return {target:adjusted?furthestTarget(adjusted,dir):hit?.level??target,plan:adjusted,targetZone:hit?.zone??null};
}


export function entryRejectionMessage(reason,c,dir){
 if(reason==='minimum reward/risk'||reason==='reward/risk after costs')return 'R/R below '+c.minRR+':1';
 if(reason.startsWith('clear path: '))return 'Clear path blocked: '+reason.slice(12);
 if(reason==='stacked entry overlap')return 'Entry overlaps confirmation beyond stacked margin';
 if(reason==='minimum zone power')return 'Zone power below minimum';
 if(reason==='minimum profit target')return 'TP below minimum';
 if(reason==='maximum entry distance')return 'Entry too far from zone';
 if(reason==='entry window expired')return (c.entryWindowSeconds??10)===0?'No trigger at candle open':'Trigger not reached in '+(c.entryWindowSeconds??10)+'s';
 if(reason==='missing entry-window seconds')return c.entryWindowSeconds===0?'Opening sample missing':'Data gap of 20s or more';
 if(reason.startsWith('trend selection: '))return reason.slice(17)+' trades disabled';
 if(reason.startsWith('trend filter: '))return (dir===1?'CALL':'PUT')+' conflicts with '+reason.slice(14)+' trend';
 if(reason.includes('no completed opposing'))return 'No '+(reason.includes('1m')?'1m':'5m')+' target available';
 if(reason.includes('not profitable'))return 'TP not beyond entry';
 if(reason==='entry time: before trading start')return 'Before trading start';
 if(reason==='entry time: final 60 minutes')return 'Final-hour entry cutoff';
 if(reason==='position already open')return 'Another trade is open';
 if(reason==='trade direction disabled')return 'Trade direction disabled';
 if(reason==='no completed target')return 'No target available';
 return reason.charAt(0).toUpperCase()+reason.slice(1);
}

export function simulateDay(rows,c,day){const start=clock(c.sessionStart),tradingStart=clock(c.tradingStart??'10:30'),end=clock(c.sessionOverrides[day]||c.sessionEnd);rows=rows.filter(r=>r.minute>=start&&r.minute<end);if(!rows.length)return {trades:[],zones:[],events:[],entryRejections:[],trends:[],rejections:{},quality:{seconds:0,minuteGaps:0,truncated:true}};
 const sessionStart=Math.floor(rows[0].t/60)*60-(rows[0].minute-start)*60;
 const {bars:minutes,trends}=chartStudy(rows,sessionStart,60,c.trendSlopeThreshold,c.trendLookbackMinutes,c),s=new ZRCE(c),trades=[];let p=null,idx=0,previous=null,minuteGaps=0,trendIndex=0;const truncated=rows.at(-1).minute<end-1;
 const rejectedEntries=new Map();let attemptedEntry=null,rejectionAt=sessionStart,recordedThisWindow=false;
 const reject=s.reject.bind(s);s.reject=reason=>{reject(reason);if(attemptedEntry&&!recordedThisWindow){rejectedEntries.set(attemptedEntry.key,{...attemptedEntry,availableAt:rejectionAt,reason,message:entryRejectionMessage(reason,c,attemptedEntry.dir)});recordedThisWindow=true;}};
 const catalog=c.exitStrategy?exitZoneCatalog(minutes,sessionStart,c.meetingTolerance):[];
 const close=(b,x)=>{if(p.exitPlan){recordFill(b,x,p.remaining);finish(b,x);return;}const exit=x.price;const gross=exit===null?null:(exit-p.entry)*p.dir*c.shares,fees=2*c.feePerShare*c.shares;trades.push({...p,exitTime:b.t,exit,reason:x.reason,excluded:x.excluded,gross,fees:x.excluded?null:fees,pnl:x.excluded?null:gross-fees,duration:b.t-p.t});p=null;};
 const recordFill=(b,x,shares,index=null,currentPrice=null)=>{p.exits.push({index,shares,percent:shares/c.shares*100,exitTime:b.t,price:x.price,reason:x.reason,excluded:x.excluded});p.remaining-=shares;
  if(p.remaining>0&&x.reason==='TARGET'){
   const firstTP=p.exitPlan.find(e=>e.type!=='noLimit');
   if(index===firstTP?.index)for(const runner of p.exitPlan.filter(e=>e.type==='noLimit'&&!e.filled&&!e.active)){
    runner.active=true;runner.activatedAt=b.t;runner.best=currentPrice??(x.price+p.dir*c.spread/2);
   }
   const rule=p.exitPlan.find(e=>e.index===index)?.moveStop;
   const before=p.pendingStop?.price??p.stop,spy=currentPrice??(x.price+p.dir*c.spread/2),next=movedStop(before,p.entry,p.dir,rule,spy);
   if(rule?.type==='trailing')p.trailing={amount:rule.amount,best:spy};else if(rule&&rule.type!=='keep')delete p.trailing;
   if(next!==before){if(p.stopHistory.at(-1)?.t===b.t+1)p.stopHistory.pop();p.pendingStop={price:next,effectiveAt:b.t+1};p.stopHistory.push({t:b.t+1,price:next,afterExit:index,action:rule.type,spyPrice:spy});p.exits.at(-1).stopAfter=next;}
  }
 };
 const finish=(b,last)=>{for(const runner of p.exitPlan.filter(e=>e.type==='noLimit')){runner.stopHistory=runner.stopHistory.filter(change=>change.t<=b.t);delete runner.pendingStop;}p.stopHistory=p.stopHistory.filter(change=>change.t<=b.t);delete p.pendingStop;for(const fill of p.exits)if(fill.stopAfter!==undefined&&!p.stopHistory.some(change=>change.afterExit===fill.index))delete fill.stopAfter;const excluded=p.exits.some(e=>e.excluded),exit=excluded?null:p.exits.reduce((n,e)=>n+e.price*e.shares,0)/c.shares,gross=excluded?null:p.exits.reduce((n,e)=>n+(e.price-p.entry)*p.dir*e.shares,0),fees=2*c.feePerShare*c.shares;const {remaining,...trade}=p;trades.push({...trade,exitTime:b.t,exit,reason:p.exits.length>1?'SCALE_OUT':last.reason,excluded,gross,fees:excluded?null:fees,pnl:excluded?null:gross-fees,duration:b.t-p.t});p=null;};
 for(const [minuteIndex,m] of minutes.entries()){const mt=marketTime(m.t),from=idx;while(idx<rows.length&&rows[idx].t<m.t+60)idx++;const seconds=rows.slice(from,idx);
  if(previous!==null&&m.t-previous>60)minuteGaps+=(m.t-previous)/60-1;previous=m.t;
  attemptedEntry=null;recordedThisWindow=false;rejectionAt=m.t;
  if(Math.abs(s.state)===3){const dir=Math.sign(s.state),confirmation=s.confirmation||minutes[minuteIndex-1];if(confirmation)attemptedEntry={key:confirmation.t+':'+dir,t:m.t,confirmationTime:confirmation.t,dir,price:confirmation.c+dir*.02,zone:s.setupZone?{...s.setupZone}:null};}
  // Arm a trigger from completed candles; inspect each entry-window second in order.
  let candidate=s.onOpen({t:m.t,o:m.o},mt.minute);
  if(p&&c.exitOnOpposingZone){const opposing=s.zones.find(z=>z.t===m.t&&z.t>p.t&&z.side===(p.dir===1?'supply':'demand'));if(opposing)p.opposingZoneExit={...opposing};}
  if(candidate&&p){s.reject('position already open');candidate=null;}
  if(candidate){const zonePower=candidate.zone?rateZonePower(candidate.zone,minutes,m.t,c.zonePowerTimeframe).power:0;
   if(zonePower+1e-8<(c.minZonePower??0)){s.reject('minimum zone power');candidate=null;}
   else candidate={...candidate,zonePower};
  }
  if(candidate&&c.exitStrategy){try{const plan=planExits(c.exitStrategy,candidate.dir,candidate.triggerPrice,m.t,catalog,{zone:candidate.zone,retestAt:candidate.retestAt??candidate.signalTime-180,minutes,allowWickZoneCandles:c.allowWickZoneCandles});allocateExits(plan,c.shares);const reward=exitReward(plan,candidate.dir,candidate.triggerPrice),risk=candidate.dir*(candidate.triggerPrice-candidate.stop);if((c.minProfitTarget??0)>0&&(reward===null||reward+1e-8<c.minProfitTarget))throw Error('minimum profit target');if(reward!==null&&(reward<=0||reward+1e-8<risk*c.minRR))throw Error('minimum reward/risk');candidate={...candidate,target:furthestTarget(plan,candidate.dir),plannedExits:plan};}catch(e){s.reject(e.message);candidate=null;}}
  while(trendIndex+1<trends.length&&trends[trendIndex+1].t<=m.t)trendIndex++;
  const trend=trends[trendIndex];
  let pending=!p?candidate:null,expected=m.t,lastEntrySample=null;
  if(pending&&(mt.minute<tradingStart||mt.minute>=end-60)){s.reject(mt.minute<tradingStart?'entry time: before trading start':'entry time: final 60 minutes');pending=null;}
  if(pending){
   const both=c.tradeBothDirections===true||(c.tradeBothDirections===undefined&&c.trendFilter===false);
   if(!trendSelected(c,trend.trend)){s.reject('trend selection: '+trend.trend);pending=null;}
   else if(!both&&!trendAllows(trend.trend,pending.dir)){s.reject('trend filter: '+trend.trend);pending=null;}
   else pending={...pending,trendAtSignal:trend.trend,trendTime:trend.t,trendFilterApplied:!both};
  }
  for(const b of seconds){
   rejectionAt=b.t;
   if(p?.pendingStop&&b.t>=p.pendingStop.effectiveAt){p.stop=p.pendingStop.price;delete p.pendingStop;}
   if(p?.exitPlan)for(const runner of p.exitPlan)if(runner.pendingStop&&b.t>=runner.pendingStop.effectiveAt){runner.stop=runner.pendingStop.price;delete runner.pendingStop;}
   if(p?.opposingZoneExit){const dir=p.dir;p.exitZone=p.opposingZoneExit;delete p.opposingZoneExit;close(b,{price:b.o-dir*(c.spread/2+c.slippage),reason:'OPPOSING_ZONE',excluded:false});continue;}
   let intrabarEntry=false;
   if(pending){
    if(b.t>=pending.expiresAt){s.reject(b.t>expected&&b.t-(lastEntrySample??m.t)>=20?'missing entry-window seconds':'entry window expired');pending=null;}
    else if(c.stackedCandles&&pending.dir*((pending.dir*(b.o-pending.triggerPrice)>=0?b.o:pending.dir===1?b.l:b.h)-pending.confirmationClose)<-(c.stackedCandleMarginCents??1)/100-1e-9){s.reject('stacked entry overlap');pending=null;}
    else if(b.t<expected||(b.t>expected&&(pending.entryWindowSeconds===0||b.t-(lastEntrySample??m.t)>=20))){s.reject('missing entry-window seconds');pending=null;}
    else {
     if(b.t>expected)pending={...pending,entryDataGaps:[...(pending.entryDataGaps||[]),{from:lastEntrySample??m.t,to:b.t,seconds:b.t-(lastEntrySample??m.t)}]};
     lastEntrySample=b.t;expected=b.t+1;
     const dir=pending.dir,trigger=pending.triggerPrice;
     const touched=pending.entryWindowSeconds===0?dir*(b.o-trigger)>=0:dir===1?b.h>=trigger:b.l<=trigger;
     if(touched){
      const atOpen=dir*(b.o-trigger)>=0,reference=atOpen?b.o:trigger;
      const entry=reference+dir*(c.spread/2+c.slippage),risk=dir*(entry-pending.stop);
      const zoneDistance=pending.zone?Math.max(pending.zone.bottom-entry,entry-pending.zone.top,0):null;
      if(c.maxEntryDistance!=null&&(zoneDistance===null||zoneDistance>c.maxEntryDistance+1e-8)){s.reject('maximum entry distance');pending=null;continue;}
      let exitPlan=null,planError=false;
      if(c.exitStrategy){try{exitPlan=allocateExits(planExits(c.exitStrategy,dir,entry,pending.signalTime,catalog,{zone:pending.zone,retestAt:pending.retestAt??pending.signalTime-180,minutes,allowWickZoneCandles:c.allowWickZoneCandles}),c.shares);}catch(e){s.reject(e.message);planError=true;}}
      const zoneAdjusted=applyZoneTarget(s.zones,b.t,dir,entry,pending.target,exitPlan);
      exitPlan=zoneAdjusted.plan;pending={...pending,target:zoneAdjusted.target,targetZone:zoneAdjusted.targetZone};
      const entryVwap=minutes[minuteIndex-1]?.t===m.t-60?minutes[minuteIndex-1].vwap:null;
      try{const adjusted=applyVwapTarget(c.vwapTargetMode,dir,entry,entryVwap,pending.target,exitPlan);exitPlan=adjusted.plan;pending={...pending,target:adjusted.target,entryVwap,vwapTargetMode:c.vwapTargetMode??'ignore'};}catch(e){s.reject(e.message);pending=null;continue;}
      const reward=exitPlan?exitReward(exitPlan,dir,entry,c.shares):dir*(pending.target-entry);
      if(!planError&&c.clearPath){const target=exitPlan?exitPlan.find(e=>Number.isFinite(e.target))?.target:pending.target;const path=checkClearPath(minutes,{dir,entry,target,retestAt:pending.retestAt,zoneCreatedAt:pending.zone?.t});if(!path.ok){s.reject(path.reason);pending=null;continue;}pending={...pending,clearPath:path};}
      if(!planError&&(c.minProfitTarget??0)>0&&(reward===null||reward+1e-8<c.minProfitTarget)){s.reject('minimum profit target');pending=null;continue;}
      if(!planError&&risk>0&&(reward===null||(reward>0&&reward+1e-8>=risk*c.minRR))){p={...pending,reference,t:b.t,entry,zoneDistance,targetDistance:reward,risk,rr:reward===null?null:reward/risk,shares:c.shares,day,...(exitPlan?{exitPlan,exits:[],initialStop:pending.stop,stopHistory:[],remaining:c.shares,target:furthestTarget(exitPlan,dir)}:{})};s.markZoneTraded(pending.zone);intrabarEntry=!atOpen;for(const runner of p.exitPlan||[])if(runner.type==='noLimit'){runner.stop=p.stop;runner.initialStop=p.stop;runner.best=reference;runner.active=!p.exitPlan.some(e=>e.type!=='noLimit');if(runner.active)runner.activatedAt=b.t;runner.stopHistory=[];}}
      else s.reject('reward/risk after costs');
      pending=null; // One entry attempt per setup, even if it exits in this second.
     }
    }
   }
   if(p){
    // A stop touched in the trigger second may have occurred before the entry.
    // Preserve that unknown ordering as an excluded trade instead of inventing a fill.
    const stopTouched=p.dir===1?b.l-c.spread/2<=p.stop:b.h+c.spread/2>=p.stop;
    if(p.exitPlan){
     const bar=intrabarEntry?{...b,o:p.reference}:b;
     if(intrabarEntry&&stopTouched)close(b,{price:null,reason:'AMBIGUOUS',excluded:true});
     else {
      const targets=p.exitPlan.filter(e=>!e.filled&&e.type!=='noLimit').sort((a,b)=>p.dir*(a.target-b.target)||a.index-b.index);
      const q=c.spread/2,open=bar.o-p.dir*q,hit=e=>p.dir===1?bar.h-q>=e.target:bar.l+q<=e.target;
      const gapStop=p.dir*(open-p.stop)<=0;
      if(gapStop)close(b,{price:open-p.dir*c.slippage,reason:'GAP_STOP',excluded:false});
      else {
       // Targets already reached at the open precede any later intrabar stop.
       for(const e of targets)if(p&&p.dir*(open-e.target)>=0){recordFill(b,{price:e.target,reason:'TARGET',excluded:false},e.shares,e.index,b.o);e.filled=true;if(!p.remaining)finish(b,{reason:'TARGET'});}
       // A runner has its own quantity and trailing stop, with no target order.
       if(p)for(const runner of p.exitPlan.filter(e=>e.type==='noLimit'&&!e.filled&&e.active)){
        const stop=p.dir===1?Math.max(p.stop,runner.stop):Math.min(p.stop,runner.stop),gap=p.dir*(open-stop)<=0,touched=p.dir===1?bar.l-q<=stop:bar.h+q>=stop;
        if(gap||touched){recordFill(b,{price:(gap?open:stop)-p.dir*c.slippage,reason:gap?'GAP_STOP':'STOP',excluded:false},runner.shares,runner.index);runner.filled=true;if(!p.remaining){finish(b,{reason:gap?'GAP_STOP':'STOP'});break;}}
       }
       if(p){const rest=targets.filter(e=>!e.filled),touchesStop=p.dir===1?bar.l-q<=p.stop:bar.h+q>=p.stop;
        if(touchesStop&&rest.some(hit))close(b,{price:null,reason:'AMBIGUOUS',excluded:true});
        else if(touchesStop)close(b,{price:p.stop-p.dir*c.slippage,reason:'STOP',excluded:false});
        else for(const e of rest)if(p&&hit(e)){recordFill(b,{price:e.target,reason:'TARGET',excluded:false},e.shares,e.index);e.filled=true;if(!p.remaining)finish(b,{reason:'TARGET'});}
       }
      }
     }
    }else {const x=intrabarEntry&&stopTouched?{price:null,reason:'AMBIGUOUS',excluded:true}:resolveExit(p,intrabarEntry?{...b,o:p.reference}:b,c);if(x)close(b,x);}
   }
   if(p?.exitPlan)for(const runner of p.exitPlan.filter(e=>e.type==='noLimit'&&!e.filled&&e.active)){
    runner.best=p.dir===1?Math.max(runner.best,b.h):Math.min(runner.best,b.l);
    const before=runner.pendingStop?.price??runner.stop,next=movedStop(before,p.entry,p.dir,runner.moveStop,runner.best);
    if(next!==before){runner.pendingStop={price:next,effectiveAt:b.t+1};runner.stopHistory.push({t:b.t+1,price:next,action:'trailing',spyPrice:runner.best});}
   }
   if(p?.trailing){
    const trail=p.trailing;trail.best=p.dir===1?Math.max(trail.best,b.h):Math.min(trail.best,b.l);
    const before=p.pendingStop?.price??p.stop,next=movedStop(before,p.entry,p.dir,{type:'trailing',amount:trail.amount},trail.best);
    if(next!==before){
     const previous=p.stopHistory.at(-1)?.t===b.t+1?p.stopHistory.pop():null;
     p.pendingStop={price:next,effectiveAt:b.t+1};
     p.stopHistory.push({t:b.t+1,price:next,action:'trailing',spyPrice:trail.best,...(previous?.afterExit?{afterExit:previous.afterExit}:{})});
     if(previous?.afterExit){const fill=p.exits.find(e=>e.index===previous.afterExit);if(fill)fill.stopAfter=next;}
    }
   }
  }
  rejectionAt=Math.min(m.t+60,rows.at(-1).t+1);
  if(pending)s.reject(pending.expiresAt-(lastEntrySample??m.t)>=20?'missing entry-window seconds':'entry window expired');
  s.onClose(m);
 }
 if(Math.abs(s.state)===3&&!s.entryFilled&&s.confirmation){const confirmation=s.confirmation,dir=Math.sign(s.state),key=confirmation.t+':'+dir;if(!rejectedEntries.has(key)){const reason=truncated?'data ended before entry':'session ended before entry';rejectedEntries.set(key,{key,t:confirmation.t,confirmationTime:confirmation.t,dir,price:confirmation.c+dir*.02,availableAt:rows.at(-1).t+1,reason,message:entryRejectionMessage(reason,c,dir),zone:s.setupZone?{...s.setupZone}:null});}}
 if(p){const b=rows.at(-1);close(b,{price:b.c-p.dir*(c.spread/2+c.slippage),reason:truncated?'DATA_END':'SESSION_CLOSE',excluded:truncated});}
 const entered=new Set(trades.map(t=>t.confirmationTime+':'+t.dir));
 const entryRejections=[...rejectedEntries.values()].filter(e=>!entered.has(e.key)).map(({key,...entry})=>entry);
 return {trades,trends,entryRejections,zones:s.zones.map(z=>({...rateZonePower(z,minutes,rows.at(-1).t+1,c.zonePowerTimeframe),day})),events:s.events,rejections:s.rejections,quality:{seconds:rows.length,minutes:minutes.length,minuteGaps,truncated,lastTime:rows.at(-1).t}};
}
export function summarize(trades,capital=100000,config={}){let net=0,peak=0,maxDrawdown=0,lowestPnl=0,gains=0,losses=0,wins=0,losers=0,fees=0;const equity=[],monthly={},byDay={},bySide={long:{count:0,pnl:0},short:{count:0,pnl:0}};const valid=trades.filter(t=>!t.excluded);
 for(const t of valid){net+=t.pnl;lowestPnl=Math.min(lowestPnl,net);peak=Math.max(peak,net);maxDrawdown=Math.max(maxDrawdown,peak-net);if(t.pnl>0){wins++;gains+=t.pnl;}if(t.pnl<0){losers++;losses-=t.pnl;}fees+=t.fees;equity.push({t:t.exitTime,value:net});monthly[t.day.slice(0,7)]=(monthly[t.day.slice(0,7)]||0)+t.pnl;byDay[t.day]=(byDay[t.day]||0)+t.pnl;const side=bySide[t.dir===1?'long':'short'];side.count++;side.pnl+=t.pnl;}
 return {trades:valid.length,excluded:trades.length-valid.length,wins,losses:losers,breakeven:valid.length-wins-losers,winRate:valid.length?wins/valid.length:0,net,gross:valid.reduce((a,t)=>a+t.gross,0),fees,profitFactor:losses?gains/losses:null,maxDrawdown,lowestPnl,returnPct:net/capital,expectancy:valid.length?net/valid.length:0,averageWinLossPerEntry:valid.length?net/valid.length:0,averageWin:wins?gains/wins:0,averageLoss:losers?-losses/losers:0,equity,monthly,byDay,bySide,byTrend:summarizeByTrend(valid),byHour:summarizeByHour(valid,config)};
}
