// Shared geometric Z qualification for setup detection and prior-excursion targets.
export function zoneCandleQualifies(zone,bar,allowWicks=true){
 const tolerance=.05,epsilon=1e-9;
 if(Number.isFinite(bar.c)&&(zone.side==='demand'?bar.c<zone.bottom-tolerance-epsilon:bar.c>zone.top+tolerance+epsilon))return false;
 const close=Number.isFinite(bar.c)&&bar.c>=zone.bottom-tolerance-epsilon&&bar.c<=zone.top+tolerance+epsilon;
 return close||(allowWicks!==false&&bar.h>=zone.bottom-epsilon&&bar.l<=zone.top+epsilon);
}
// Preserve zones historically and end them at the close that invalidates them.
export function displayZones(zones,through){return zones.filter(z=>z.t<=through).sort((a,b)=>a.t-b.t||a.side.localeCompare(b.side)).map(z=>({...z,end:z.invalidatedAt!=null&&z.invalidatedAt<=through?z.invalidatedAt:null}));}
export function activeZones(zones,through){return zones.filter(z=>z.t<=through&&(z.invalidatedAt==null||z.invalidatedAt>through));}

// Initial departure begins in the second forming 5m candle. Body closes define distance;
// wicks and later retests never increase it. A doji does not end the run.
export function rateZonePower(zone,minutes,through=Infinity,timeframe='1m'){
 const invalidation=minutes.find(b=>b.t>=zone.t&&b.t+60<=through&&(zone.side==='demand'?b.c<zone.bottom-.05-1e-9:b.c>zone.top+.05+1e-9));
 const invalidatedAt=zone.invalidatedAt??(invalidation?invalidation.t+60:null);
 const width=timeframe==='5m'?300:60;
 if(width===300){
  const grouped=new Map();
  for(const b of minutes){const t=zone.t+Math.floor((b.t-zone.t)/300)*300;let g=grouped.get(t);if(!g){g={t,o:b.o,c:b.c,count:0,last:null,complete:true};grouped.set(t,g);}if(g.last!==null&&b.t!==g.last+60)g.complete=false;g.c=b.c;g.last=b.t;g.count++;}
  minutes=[...grouped.values()].filter(g=>g.count===5&&g.complete&&g.last===g.t+240);
 }
 const dir=zone.side==='demand'?1:-1,base=dir===1?zone.bottom:zone.top;
 let started=false,last=null,power=0,confirmedAt=null;const powerHistory=[];
 for(const b of minutes){
  if(b.t<zone.t-300)continue;
  if(b.t+width>through)break;
  if(last!==null&&b.t!==last+width)break;
  last=b.t;
  const color=Math.sign(b.c-b.o);
  if(started&&color===-dir){confirmedAt=b.t+width;break;}
  if(color===dir&&dir*(b.c-base)>0){started=true;power=Math.max(0,dir*(b.c-base));powerHistory.push({t:b.t+width,power});}
 }
 return {...zone,invalidatedAt,powerTimeframe:timeframe,power,powerHistory,powerConfirmedAt:confirmedAt};
}
export function zonePowerAt(zone,through){
 const history=zone.powerHistory||[];let power=0;
 for(const point of history){if(point.t>through)break;power=point.power;}
 return {power,confirmed:zone.powerConfirmedAt!=null&&zone.powerConfirmedAt<=through};
}

// Current daily extremes, using only zones confirmed at this time. Keep the first on ties.
export function majorZones(zones,through){
 let demand=null,supply=null;
 for(const zone of activeZones(zones,through).sort((a,b)=>a.t-b.t)){
  if(zone.side==='demand'&&(!demand||zone.bottom<demand.bottom))demand=zone;
  if(zone.side==='supply'&&(!supply||zone.top>supply.top))supply=zone;
 }
 return [demand,supply].filter(Boolean);
}
