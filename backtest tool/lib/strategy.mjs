import {validateExitStrategy} from './exits.mjs';
import {activeZones,majorZones,zoneCandleQualifies} from '../public/zones.mjs';
// ZRCE Stage A: rule module, independent of storage, charting and execution.
// Reference: reference/ZRCE_STAGE_A_STRATEGY_v1.4_SIM_ONLY.txt.
import {DEFAULT_SLOPE_THRESHOLD} from './trend.mjs';
import {round} from './market.mjs';
export const ENTRY_OFFSET=0.02,ENTRY_WINDOW_SECONDS=10,ZONE_TOLERANCE=0.05;
export const defaults={zoneSize:0.05,meetingTolerance:0.05,cooldownMinutes:10,entryWindowSeconds:10,minRR:1,minProfitTarget:0,minZonePower:0,zonePowerTimeframe:'1m',vwapTargetMode:'ignore',maxEntryDistance:null,majorZonesOnly:false,allowZoneReuse:false,ignoreSingleDoji:false,clearPath:false,confirmationMustNotTouchZone:false,stackedCandles:false,stackedCandleMarginCents:1,allowWickZoneCandles:true,exitOnOpposingZone:false,stopLookback:3,trendFilter:true,tradeBothDirections:false,allowUptrend:true,allowDowntrend:true,allowSideways:true,trendSlopeThreshold:DEFAULT_SLOPE_THRESHOLD,trendLookbackMinutes:5,trendMethod:'vwap',candleTrendCount:3,direction:'both',targetMode:'zone',fixedRR:2,shares:100,spread:0.02,slippage:0,feePerShare:0,initialCapital:100000,sessionStart:'09:30',tradingStart:'10:30',sessionEnd:'16:00',sessionOverrides:{}};
export function validateConfig(input={}){const c={...defaults,...input};delete c.directionGate;if(!['vwap','candles'].includes(c.trendMethod))throw Error('Invalid trend method');if(!Object.hasOwn(input,'tradeBothDirections'))c.tradeBothDirections=input.trendFilter===false;if(!['1m','5m'].includes(c.zonePowerTimeframe))throw Error('Invalid zone power candle timeframe');if(!['ignore','skip','target'].includes(c.vwapTargetMode))throw Error('Invalid VWAP target mode');for(const key of ['clearPath','confirmationMustNotTouchZone','stackedCandles','tradeBothDirections','allowWickZoneCandles','ignoreSingleDoji','exitOnOpposingZone','allowZoneReuse','allowUptrend','allowDowntrend','allowSideways'])if(typeof c[key]!=='boolean')throw Error('Invalid '+key+': expected boolean');if(typeof c.majorZonesOnly!=='boolean')throw Error('Invalid majorZonesOnly: expected boolean');if(c.maxEntryDistance!==null&&(typeof c.maxEntryDistance!=='number'||!Number.isFinite(c.maxEntryDistance)||c.maxEntryDistance<0))throw Error('Maximum entry distance must be blank or a non-negative dollar amount');for(const [k,min,max] of [['stackedCandleMarginCents',0,10000],['trendSlopeThreshold',0,0.05],['trendLookbackMinutes',5,60],['candleTrendCount',2,78],['zoneSize',0.001,10],['meetingTolerance',0,10],['cooldownMinutes',0,120],['entryWindowSeconds',0,59],['minRR',0,100],['minProfitTarget',0,1e10],['minZonePower',0,1e10],['stopLookback',1,30],['fixedRR',0.1,100],['shares',1,1000000],['spread',0,10],['slippage',0,10],['feePerShare',0,10],['initialCapital',1,1e10]]){if(typeof c[k]!=='number'||!Number.isFinite(c[k])||c[k]<min||c[k]>max)throw Error(`Invalid ${k}: expected ${min}–${max}`);}for(const k of ['stackedCandleMarginCents','shares','stopLookback','cooldownMinutes','trendLookbackMinutes','entryWindowSeconds','candleTrendCount'])if(!Number.isInteger(c[k]))throw Error(`${k} must be an integer`);if(typeof c.trendFilter!=='boolean')throw Error('Invalid trendFilter: expected boolean');c.trendFilter=!c.tradeBothDirections;if(!['both','long','short'].includes(c.direction)||!['zone','fixedRR'].includes(c.targetMode))throw Error('Invalid strategy selection');for(const k of ['sessionStart','sessionEnd','tradingStart'])if(!/^\d{2}:\d{2}$/.test(c[k])||clock(c[k])>=1440||Number(c[k].slice(3))>59)throw Error(`Invalid ${k}`);if(clock(c.sessionStart)>=clock(c.sessionEnd))throw Error('Session start must precede end');if(clock(c.tradingStart)<clock(c.sessionStart)||clock(c.tradingStart)>=clock(c.sessionEnd))throw Error('Trading start must be within the configured session');if(!c.sessionOverrides||typeof c.sessionOverrides!=='object'||Array.isArray(c.sessionOverrides))throw Error('Session overrides must be a date-to-close-time object');for(const [d,v] of Object.entries(c.sessionOverrides)){if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!/^\d{2}:\d{2}$/.test(v)||clock(v)>clock(c.sessionEnd)||clock(v)<=clock(c.sessionStart)||Number(v.slice(3))>59)throw Error('Invalid session override');}c.exitStrategy=validateExitStrategy(c.exitStrategy);return c;}
export const clock=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
export class ZRCE {
 constructor(config){this.c=config;this.history=[];this.state=0;this.demand=0;this.supply=0;this.d={phase:0,run:null,target:null};this.s={phase:0,run:null,target:null};this.events=[];this.zones=[];this.zoneRuns=new Map();this.setupZone=null;this.retestedZones=new Set();this.tradedZones=new Set();this.rejections={};}
 zoneKey(zone){return zone.side+':'+zone.bottom+':'+zone.top+':'+(zone.t??'');}
 markZoneTraded(zone){this.entryFilled=true;if(zone)this.tradedZones.add(this.zoneKey(zone));}
 reject(reason){this.rejections[reason]=(this.rejections[reason]||0)+1;}
 onOpen(bar,minute){const c=this.c,h=this.history,prev=h.at(-1);const contiguous=n=>h.length>=n&&h.slice(-n).every((b,i)=>b.t===bar.t-(n-i)*60);
  // Levels become available only after both five-minute candles have closed.
  if((minute-clock(c.sessionStart))>=10&&(minute-clock(c.sessionStart))%5===0&&contiguous(10)){
   const a=h.slice(-10,-5),b=h.slice(-5),fo=a[0].o,fc=a.at(-1).c,so=b[0].o,sc=b.at(-1).c,lo=Math.min(...b.map(x=>x.l)),hi=Math.max(...b.map(x=>x.h));
   const dp=fc<fo&&sc>so&&Math.abs(fc-so)<=c.meetingTolerance+1e-9,sp=fc>fo&&sc<so&&Math.abs(fc-so)<=c.meetingTolerance+1e-9;
   const dc=Math.min(fc,so),ss=Math.max(fc,so),dn=dp&&(!this.demand||dc<this.demand),sn=sp&&(!this.supply||ss>this.supply);
   const dt=!dn&&this.demand>0&&sc<so&&lo<=this.demand+c.zoneSize&&hi>=this.demand,st=!sn&&this.supply>0&&sc>so&&hi>=this.supply-c.zoneSize&&lo<=this.supply;
   const update=(x,isNew,touch,favorable)=>{const old=x.phase;if(isNew){x.phase=2;x.run=sc;x.target=null;}else if(touch){x.phase=1;x.run=null;}else{if(old===2&&!favorable)x.target=x.run;if((old===1||old===2)&&favorable){x.phase=2;x.run=sc;}else x.phase=0;}};
   update(this.d,dn,dt,sc>so);update(this.s,sn,st,sc<so);
   if(dp)this.demand=this.demand?Math.min(this.demand,dc):dc;if(sp)this.supply=this.supply?Math.max(this.supply,ss):ss;
   for(const zone of this.zones){const run=this.zoneRuns.get(zone),demand=zone.side==='demand';const touch=demand?sc<so&&lo<=zone.top&&hi>=zone.bottom:sc>so&&hi>=zone.bottom&&lo<=zone.top;update(run,false,touch,demand?sc>so:sc<so);}
   const add=(side,bottom,top,major)=>{const zone={t:bar.t,side,bottom,top,major};this.zones.push(zone);this.zoneRuns.set(zone,{phase:2,run:sc,target:null});};
   if(dp)add('demand',dc,dc+c.zoneSize,dn);
   if(sp)add('supply',ss-c.zoneSize,ss,sn);
  }
  this.activeZones=activeZones(this.zones,bar.t);this.majorZones=majorZones(this.zones,bar.t);
  if(this.setupZone&&Math.abs(this.state)>=1&&Math.abs(this.state)<=3&&(!this.activeZones.includes(this.setupZone)||(c.majorZonesOnly&&!this.majorZones.includes(this.setupZone)))){
   this.reject('setup zone replaced');this.state=0;this.setupZone=null;
  }
  this.current={...bar,demandBottom:this.demand,demandTop:this.demand?this.demand+c.zoneSize:0,supplyBottom:this.supply?this.supply-c.zoneSize:0,supplyTop:this.supply};
  if(Math.abs(this.state)!==3)return null;
  const dir=this.state===3?1:-1;
  if((dir===1&&c.direction==='short')||(dir===-1&&c.direction==='long')){this.reject('trade direction disabled');return null;}
  if(!contiguous(Math.max(3,c.stopLookback))){this.reject('missing prior minutes');return null;}
  const confirmation=this.confirmation||prev;
  const look=[...h.slice(-c.stopLookback),...(this.zoneCandleExtreme?[this.zoneCandleExtreme]:[])],entry=Number((confirmation.c+dir*ENTRY_OFFSET).toFixed(8)),stop=round(dir===1?Math.min(...look.map(x=>x.l)):Math.max(...look.map(x=>x.h)));
  const target=c.exitStrategy?entry+dir*Math.abs(entry-stop)*Math.max(c.minRR,1):c.targetMode==='zone'?(this.setupZone?this.zoneRuns.get(this.setupZone)?.target:(dir===1?this.d.target:this.s.target)):entry+dir*Math.abs(entry-stop)*c.fixedRR;
  if(target===null||!Number.isFinite(target)){this.reject('no completed target');return null;}
  const tp=round(target),risk=dir*(entry-stop),reward=dir*(tp-entry);
  if(!c.exitStrategy&&reward+1e-8<(c.minProfitTarget??0)){this.reject('minimum profit target');return null;}
  if(risk<=0||(!c.exitStrategy&&reward<=0)){this.reject('invalid stop/target');return null;}if(!c.exitStrategy&&reward+1e-8<risk*c.minRR){this.reject('minimum reward/risk');return null;}
  return {retestAt:this.retestAt,zoneCandleRange:this.zoneCandleExtreme?{...this.zoneCandleExtreme}:null,zone:this.setupZone?{...this.setupZone}:null,dir,stop,target:tp,reference:entry,triggerPrice:entry,confirmationClose:confirmation.c,confirmationTime:confirmation.t,entryWindowSeconds:c.entryWindowSeconds??ENTRY_WINDOW_SECONDS,expiresAt:bar.t+Math.max(1,c.entryWindowSeconds??ENTRY_WINDOW_SECONDS),t:bar.t,reason:'Z → R → C; confirmation close +/- $0.02; entry window '+(c.entryWindowSeconds??ENTRY_WINDOW_SECONDS)+' seconds',signalTime:bar.t};
 }
 onClose(bar){
  const c=this.c,h=this.history,prev=h.at(-1),old=this.state,continuous=prev&&prev.t+60===bar.t;
  const near=z=>bar.c>=z.bottom-ZONE_TOLERANCE-1e-9&&bar.c<=z.top+ZONE_TOLERANCE+1e-9;
  const qualifies=z=>zoneCandleQualifies(z,bar,c.allowWickZoneCandles);
  const broken=z=>z.side==='demand'?bar.c<z.bottom-ZONE_TOLERANCE-1e-9:bar.c>z.top+ZONE_TOLERANCE+1e-9;
  for(const zone of this.zones)if(zone.t<=bar.t&&zone.invalidatedAt==null&&broken(zone))zone.invalidatedAt=bar.t+60;
  if(this.zones.length)this.majorZones=majorZones(this.zones,bar.t+60);
  const setup=this.setupZone||this.setupBounds;
  const cancelled=setup&&Math.abs(old)>=1&&Math.abs(old)<=3&&broken(setup);
  const candidates=this.zones.length?activeZones(this.zones,bar.t+60):[...(this.demand>0?[{side:'demand',bottom:this.demand,top:this.demand+c.zoneSize}]:[]),...(this.supply>0?[{side:'supply',bottom:this.supply-c.zoneSize,top:this.supply}]:[])];
  const key=z=>this.zoneRuns.has(z)?z:z.side+':'+z.bottom+':'+z.top;
  const firstTouches=candidates.filter(z=>(c.allowZoneReuse===true||!this.tradedZones.has(this.zoneKey(z)))&&!broken(z)&&qualifies(z));
  for(const zone of firstTouches)this.retestedZones.add(key(zone));
  let mark=null,ignoredDoji=false;
  const startSetup=()=>{
   const zone=[...firstTouches].filter(z=>!c.majorZonesOnly||this.majorZones.includes(z)).reverse()[0];
   this.state=zone?(zone.side==='demand'?1:-1):0;
   if(zone){this.setupZone=this.zoneRuns.has(zone)?zone:null;this.setupBounds=zone;this.retestAt=bar.t;this.zoneCandleExtreme=null;mark='Z';}
  };
  if(cancelled){this.reject('zone invalidated');this.state=0;this.setupZone=null;this.setupBounds=null;startSetup();}
  else if(!continuous&&h.length){this.state=0;this.setupZone=null;this.setupBounds=null;}
  else if(old>=10)this.state=old===10?0:old-1;
  else if(c.ignoreSingleDoji&&Math.abs(old)>=1&&Math.abs(old)<=3&&Math.abs(bar.c-bar.o)<=1e-9&&!this.dojiSkipped&&!(Math.abs(old)===3&&this.entryFilled)){
   this.dojiSkipped=true;ignoredDoji=true;
  }
  else if(old===1||old===-1){
   const dir=Math.sign(old);
   // Reversal is relative to the latest Z close, independent of candle color.
   if(prev&&dir*(bar.c-(this.lastZoneClose??prev.c))>1e-9){this.state=2*dir;this.reversal={...bar};}
   else if(setup&&qualifies(setup)){this.state=dir;mark='Z';}
   else this.state=10+c.cooldownMinutes;
  }
  else if(setup&&Math.abs(old)===2&&near(setup)){
   this.state=setup.side==='demand'?1:-1;mark='Z';
  }
  else if(old===2||old===-2){
   const dir=Math.sign(old),edge=dir===1?(setup?.top??prev.demandTop):(setup?.bottom??prev.supplyBottom);
   if(dir*(bar.c-bar.o)>0&&dir*(bar.c-edge)>1e-9){
    const reversal=this.reversal||prev,margin=(c.stackedCandleMarginCents??1)/100;
    if(c.confirmationMustNotTouchZone&&dir*((dir===1?bar.l:bar.h)-edge)<=1e-9){this.reject('confirmation touches zone');this.state=10+c.cooldownMinutes;}
    else if(c.stackedCandles&&dir*((dir===1?bar.l:bar.h)-reversal.c)<-margin-1e-9){this.reject('stacked confirmation overlap');this.state=10+c.cooldownMinutes;}
    else this.state=3*dir;
   }
   else if(setup&&qualifies(setup)){this.state=dir;mark='Z';}
   else this.state=10+c.cooldownMinutes;
  }
  else if(Math.abs(old)===3)this.state=0;
  else {
   startSetup();
  }
  if(!ignoredDoji)this.dojiSkipped=false;
  if(mark==='Z'){this.lastZoneClose=bar.c;this.entryFilled=false;this.zoneCandleExtreme={h:Math.max(this.zoneCandleExtreme?.h??-Infinity,bar.h),l:Math.min(this.zoneCandleExtreme?.l??Infinity,bar.l)};}
  if(Math.abs(this.state)===3&&this.state!==old){this.confirmation={...bar};this.entryFilled=false;}
  const chosen=this.setupZone||this.setupBounds;
  if(chosen&&Math.abs(this.state)>=1&&Math.abs(this.state)<=3){
   if(chosen.side==='demand'){this.current.demandBottom=chosen.bottom;this.current.demandTop=chosen.top;}
   else{this.current.supplyBottom=chosen.bottom;this.current.supplyTop=chosen.top;}
  }
  if(mark||([2,3,-2,-3].includes(this.state)&&this.state!==old))this.events.push({t:bar.t,availableAt:bar.t+60,label:mark||({2:'R',3:'C'})[Math.abs(this.state)],dir:Math.sign(this.state),zone:this.setupZone?{...this.setupZone}:null,price:this.state>0?bar.l:bar.h});
  this.history.push({...this.current,...bar});if(this.history.length>60)this.history.shift();
 }
}
