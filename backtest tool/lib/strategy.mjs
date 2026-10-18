// ZRCE Stage A: rule module, independent of storage, charting and execution.
// Reference: reference/ZRCE_STAGE_A_STRATEGY_v1.4_SIM_ONLY.txt.
import {round} from './market.mjs';
export const defaults={zoneSize:0.05,meetingTolerance:0.05,cooldownMinutes:10,minRR:1,stopLookback:3,directionGate:true,direction:'both',targetMode:'zone',fixedRR:2,shares:100,spread:0.02,slippage:0,feePerShare:0,initialCapital:100000,sessionStart:'09:30',sessionEnd:'16:00',sessionOverrides:{}};
export function validateConfig(input={}){const c={...defaults,...input};for(const [k,min,max] of [['zoneSize',0.001,10],['meetingTolerance',0,10],['cooldownMinutes',0,120],['minRR',0,100],['stopLookback',1,30],['fixedRR',0.1,100],['shares',1,1000000],['spread',0,10],['slippage',0,10],['feePerShare',0,10],['initialCapital',1,1e10]]){if(typeof c[k]!=='number'||!Number.isFinite(c[k])||c[k]<min||c[k]>max)throw Error(`Invalid ${k}: expected ${min}–${max}`);}for(const k of ['shares','stopLookback','cooldownMinutes'])if(!Number.isInteger(c[k]))throw Error(`${k} must be an integer`);if(!['both','long','short'].includes(c.direction)||!['zone','fixedRR'].includes(c.targetMode)||typeof c.directionGate!=='boolean')throw Error('Invalid strategy selection');for(const k of ['sessionStart','sessionEnd'])if(!/^\d{2}:\d{2}$/.test(c[k])||clock(c[k])>=1440||Number(c[k].slice(3))>59)throw Error(`Invalid ${k}`);if(clock(c.sessionStart)>=clock(c.sessionEnd))throw Error('Session start must precede end');if(!c.sessionOverrides||typeof c.sessionOverrides!=='object'||Array.isArray(c.sessionOverrides))throw Error('Session overrides must be a date-to-close-time object');for(const [d,v] of Object.entries(c.sessionOverrides)){if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!/^\d{2}:\d{2}$/.test(v)||clock(v)>clock(c.sessionEnd)||clock(v)<=clock(c.sessionStart)||Number(v.slice(3))>59)throw Error('Invalid session override');}return c;}
export const clock=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
export class ZRCE {
 constructor(config){this.c=config;this.history=[];this.state=0;this.demand=0;this.supply=0;this.d={phase:0,run:null,target:null};this.s={phase:0,run:null,target:null};this.events=[];this.zones=[];this.rejections={};}
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
   if(dn)this.zones.push({t:bar.t,side:'demand',bottom:this.demand,top:this.demand+c.zoneSize});
   if(sn)this.zones.push({t:bar.t,side:'supply',bottom:this.supply-c.zoneSize,top:this.supply});
  }
  this.current={...bar,demandTop:this.demand?this.demand+c.zoneSize:0,supplyBottom:this.supply?this.supply-c.zoneSize:0};
  if(Math.abs(this.state)!==3)return null;
  const dir=this.state===3?1:-1;
  if((dir===1&&c.direction==='short')||(dir===-1&&c.direction==='long'))return null;
  if(!contiguous(Math.max(3,c.stopLookback))){this.reject('missing prior minutes');return null;}
  if(c.directionGate&&((dir===1&&bar.o<prev.c)||(dir===-1&&bar.o>prev.c))){this.reject('entry direction');return null;}
  const look=h.slice(-c.stopLookback),entry=round(bar.o),stop=round(dir===1?Math.min(...look.map(x=>x.l)):Math.max(...look.map(x=>x.h)));
  const target=c.targetMode==='zone'?(dir===1?this.d.target:this.s.target):entry+dir*Math.abs(entry-stop)*c.fixedRR;
  if(target===null||!Number.isFinite(target)){this.reject('no completed target');return null;}
  const tp=round(target),risk=dir*(entry-stop),reward=dir*(tp-entry);
  if(risk<=0||reward<=0){this.reject('invalid stop/target');return null;}if(reward+1e-8<risk*c.minRR){this.reject('minimum reward/risk');return null;}
  return {dir,stop,target:tp,reference:bar.o,t:bar.t,reason:'Z → R → C; entry at next minute open',signalTime:prev.t+60};
 }
 onClose(bar){const c=this.c,h=this.history,prev=h.at(-1),two=h.at(-2),old=this.state;const continuous=prev&&prev.t+60===bar.t;
  if(!continuous&&h.length)this.state=0;
  else if(old>=10)this.state=old===10?0:old-1;
  else if(old===1)this.state=bar.c>bar.o?2:10+c.cooldownMinutes;
  else if(old===2)this.state=bar.c>bar.o&&bar.c>prev.c&&two&&bar.c>two.demandTop?3:10+c.cooldownMinutes;
  else if(old===-1)this.state=bar.c<bar.o?-2:10+c.cooldownMinutes;
  else if(old===-2)this.state=bar.c<bar.o&&bar.c<prev.c&&two&&bar.c<two.supplyBottom?-3:10+c.cooldownMinutes;
  else if(Math.abs(old)===3)this.state=0;
  else if(this.demand>0&&bar.c<bar.o&&bar.o>this.demand+c.zoneSize&&bar.l<=this.demand+c.zoneSize)this.state=1;
  else if(this.supply>0&&bar.c>bar.o&&bar.o<this.supply-c.zoneSize&&bar.h>=this.supply-c.zoneSize)this.state=-1;
  else this.state=0;
  if([1,2,3,-1,-2,-3].includes(this.state)&&this.state!==old)this.events.push({t:bar.t,availableAt:bar.t+60,label:({1:'Z',2:'R',3:'C'})[Math.abs(this.state)],dir:Math.sign(this.state),price:this.state>0?bar.l:bar.h});
  this.history.push({...this.current,...bar});if(this.history.length>60)this.history.shift();
 }
}
