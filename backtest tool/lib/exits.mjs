import {zoneCandleQualifies} from '../public/zones.mjs';
import {round} from './market.mjs';
export function validateExitStrategy(strategy){
 if(strategy==null)return null;
 if(typeof strategy!=='object'||Array.isArray(strategy)||typeof strategy.name!=='string'||!strategy.name.trim()||!Array.isArray(strategy.exits)||!strategy.exits.length)throw Error('Exit strategy needs a name and at least one exit');
 let total=0;const exits=strategy.exits.map(e=>{
  if(!e||!['cents','1mMeet','1mMax','5mMeet','5mMax','noLimit'].includes(e.type)||typeof e.percent!=='number'||!Number.isFinite(e.percent)||e.percent<=0||e.percent>100)throw Error('Each exit needs a target type and a percentage greater than 0');
  if(e.type==='cents'&&(typeof e.cents!=='number'||!Number.isFinite(e.cents)||e.cents<=0))throw Error('SPY movement must be greater than 0 cents');
  const action=e.moveStop;
  if(action!=null&&(!['keep','breakEven','offset','trailing'].includes(action.type)||(['offset','trailing'].includes(action.type)&&(typeof action.amount!=='number'||!Number.isFinite(action.amount)||action.amount<=0))))throw Error('Stop move must be keep, break even, offset, or trailing with a positive dollar distance');
  if(e.type==='noLimit'&&action?.type!=='trailing')throw Error('NO LIMIT requires a trailing stop with a positive dollar distance');
  total+=e.percent;return {type:e.type,percent:e.percent,...(e.type==='cents'?{cents:e.cents}:{}),...(action&&action.type!=='keep'?{moveStop:{type:action.type,...(['offset','trailing'].includes(action.type)?{amount:action.amount}:{})}}:{})};
 });
 if(Math.abs(total-100)>1e-8)throw Error('Exit percentages must total 100%');
 return {name:strategy.name.trim(),exits};
}
// Candles are session-aligned; a zone is available only after the second candle closes.
export function exitZoneCatalog(minutes,sessionStart,tolerance){
 const result=[];
 for(const width of [60,300]){
  const grouped=new Map();
  for(const b of minutes){const t=sessionStart+Math.floor((b.t-sessionStart)/width)*width;let a=grouped.get(t);if(!a){a={t,o:b.o,h:b.h,l:b.l,c:b.c,count:0,last:null,continuous:true};grouped.set(t,a);}if(a.last!==null&&b.t!==a.last+60)a.continuous=false;a.h=Math.max(a.h,b.h);a.l=Math.min(a.l,b.l);a.c=b.c;a.count++;a.last=b.t;}
  const candles=[...grouped.values()];
  for(let i=1;i<candles.length;i++){const a=candles[i-1],b=candles[i];if(a.count!==width/60||b.count!==width/60||!a.continuous||!b.continuous||b.t!==a.t+width)continue;
   const meetsTolerance=Math.abs(a.c-b.o)<=tolerance+1e-9;if(width===300&&!meetsTolerance)continue;
   const side=a.c>a.o&&b.c<b.o?'supply':a.c<a.o&&b.c>b.o?'demand':null;if(!side)continue;
   result.push({timeframe:width===60?'1m':'5m',side,availableAt:b.t+width,meetsTolerance,bodyClose:a.c,bodyOpen:b.o,meet:side==='supply'?Math.max(a.c,b.o):Math.min(a.c,b.o),max:side==='supply'?Math.max(a.h,b.h):Math.min(a.l,b.l)});
  }
 }
 return result;
}
export function planExits(strategy,dir,entry,at,catalog,context=null){
 return strategy.exits.map((e,i)=>{
  if(e.type==='noLimit'){if(e.moveStop?.type!=='trailing'||!Number.isFinite(e.moveStop.amount)||e.moveStop.amount<=0)throw Error('NO LIMIT requires a trailing stop');return {index:i+1,type:e.type,percent:e.percent,target:null,rawTarget:null,margin:0,moveStop:{...e.moveStop}};}
  let target;
  if(e.type==='cents')target=entry+dir*e.cents/100;
  else {
   const tf=e.type.slice(0,2),field=e.type.endsWith('Max')?'max':'meet';
   const level=z=>e.type.endsWith('Meet')&&Number.isFinite(z.bodyClose)&&Number.isFinite(z.bodyOpen)
    ?(Math.abs(z.bodyClose-entry)<=Math.abs(z.bodyOpen-entry)?z.bodyClose:z.bodyOpen):z[field];
   let candidates=catalog.filter(z=>z.timeframe===tf&&z.side===(dir===1?'supply':'demand')&&z.availableAt<=at
    &&(e.type==='1mMeet'||z.meetsTolerance!==false)&&dir*(round(level(z))-entry)>0).sort((a,b)=>dir*(level(a)-level(b)));
   if(context){
    const {zone,retestAt,minutes=[]}=context;
    if(!zone||!Number.isFinite(retestAt)||retestAt<=zone.t)candidates=[];
    else {
     // Only the departure after confirmation of this exact entry zone may set its TP.
     const touches=b=>zoneCandleQualifies(zone,b,context.allowWickZoneCandles);
     const before=minutes.filter(b=>b.t>=zone.t&&b.t<retestAt);
     let cursor=retestAt;while(before.length&&before.at(-1).t===cursor-60&&touches(before.at(-1))){cursor=before.pop().t;}
     const departure=Math.max(zone.t,before.filter(touches).at(-1)?.t??zone.t),width=tf==='1m'?60:300;
     candidates=candidates.filter(z=>z.availableAt-2*width>=departure&&z.availableAt<=retestAt);
     const extreme=z=>field==='max'?z.max:dir===1?Math.max(z.bodyClose??z.meet,z.bodyOpen??z.meet):Math.min(z.bodyClose??z.meet,z.bodyOpen??z.meet);
     candidates.sort((a,b)=>dir*(extreme(b)-extreme(a))||b.availableAt-a.availableAt);
    }
   }
   if(!candidates.length)throw Error('no completed opposing '+tf+' zone for exit '+(i+1));target=level(candidates[0]);
  }
  const rawTarget=round(target),margin=(e.type==='1mMeet'||e.type==='5mMeet')?0.05:0;
  target=round(rawTarget-dir*margin);if(dir*(target-entry)<=0)throw Error('Exit '+(i+1)+' target is not profitable after price rounding');return {index:i+1,type:e.type,percent:e.percent,target,rawTarget,margin,...(e.type!=='cents'&&context?.zone?{targetSource:{zoneCreatedAt:context.zone.t,retestAt:context.retestAt}}:{}),...(e.moveStop?{moveStop:{...e.moveStop}}:{})};
 });
}
export function allocateExits(plan,shares){
 const allocated=plan.map(e=>({...e,shares:Math.floor(shares*e.percent/100)}));let remaining=shares-allocated.reduce((n,e)=>n+e.shares,0);
 const ranked=plan.map((e,i)=>({i,f:shares*e.percent/100-allocated[i].shares})).sort((a,b)=>b.f-a.f||a.i-b.i);
 for(let i=0;i<remaining;i++)allocated[ranked[i].i].shares++;
 if(allocated.some(e=>e.shares<1))throw Error('Position too small: every exit must receive at least one share');
 return allocated;
}

// Tighten only; break even is the actual entry fill, before fees.
export function movedStop(stop,entry,dir,action,currentPrice){
 if(!action||action.type==='keep')return stop;
 const proposed=action.type==='breakEven'?entry:round(currentPrice-dir*action.amount);
 return dir*(proposed-stop)>0?proposed:stop;
}

// R/R uses the first price-based exit in configured order, not a weighted scale-out reward.
export function exitReward(plan,dir,entry){
 const first=plan.find(e=>Number.isFinite(e.target));
 return first?dir*(first.target-entry):null;
}

export function furthestTarget(plan,dir){
 const levels=plan.map(e=>e.target).filter(Number.isFinite);
 return levels.length?(dir===1?Math.max(...levels):Math.min(...levels)):null;
}
