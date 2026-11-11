// Check completed one-minute candles only, before the first Z of this attempt.
export function checkClearPath(minutes,{dir,entry,target,retestAt,zoneCreatedAt=-Infinity}){
 if(!Number.isFinite(target)||dir*(target-entry)<=1e-9)return {ok:false,reason:'clear path: no fixed target'};
 const bars=minutes.filter(b=>b.t>=zoneCreatedAt&&b.t+60<=retestAt);
 // The latest visit to TP starts the return leg; earlier trips are irrelevant.
 let start=-1;for(let i=bars.length-1;i>=0;i--)if(dir===1?bars[i].h>=target-1e-9:bars[i].l<=target+1e-9){start=i;break;}
 if(start<0)return {ok:false,reason:'clear path: target not visited'};
 let directional=0,previous=null,reached=false;const checked=[];
 for(const b of bars.slice(start)){
  if(previous!==null&&b.t!==previous+60)return {ok:false,reason:'clear path: missing minute'};
  previous=b.t;
  const intersects=dir===1?b.h>entry+1e-9&&b.l<target-1e-9:b.l<entry-1e-9&&b.h>target+1e-9;
  if(intersects){
   if(dir*(b.c-b.o)>1e-9)return {ok:false,reason:'clear path: candle in trade direction',candleTime:b.t};
   if(dir*(b.c-b.o)<-1e-9)directional++;
   checked.push(b.t);
  }
  if(dir===1?b.l<=entry+1e-9:b.h>=entry-1e-9)reached=true;
 }
 if(!reached)return {ok:false,reason:'clear path: return did not reach entry'};
 if(!directional)return {ok:false,reason:'clear path: no directional return candles'};
 return {ok:true,from:bars[start].t,to:bars.at(-1).t,candles:checked};
}
