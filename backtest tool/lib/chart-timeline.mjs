import {rateZonePower} from '../public/zones.mjs';
import {chartStudy} from './trend.mjs';
import {aggregate} from './market.mjs';
import {simulateDay} from './engine.mjs';
import {clock} from './strategy.mjs';
import {tradingDay,exchangeClose} from './calendar.mjs';
export function chartTimeline({days,day,seconds,config,report,preview,readRows}){
 const available=days.filter(tradingDay),found=available.findIndex(d=>d>=day),anchor=found<0?Math.max(0,available.length-1):found,radius=seconds===1?1:2,chosen=available.slice(Math.max(0,anchor-radius),anchor+radius+1);
 const result={bars:[],trends:[],zones:[],events:[],entryRejections:[],trades:[],sessions:[],quality:{minuteGaps:0},continuous:true,trendPreview:!!report&&preview,trendSlopeThreshold:config.trendSlopeThreshold,trendLookbackMinutes:config.trendLookbackMinutes??5,trendMethod:config.trendMethod??'vwap',candleTrendCount:config.candleTrendCount??3,hasPrevious:false,hasNext:false};
 for(const current of chosen){
  const rows=readRows(current);if(!rows.length)continue;const start=clock(config.sessionStart),end=Math.min(clock(config.sessionOverrides[current]||config.sessionEnd),exchangeClose(current));
  const midnight=Math.floor(rows[0].t/60)*60-rows[0].minute*60,open=midnight+start*60,close=midnight+end*60,pre=open-3600;
  const regular=rows.filter(b=>b.minute>=start&&b.minute<end);if(!regular.length)continue;
  const study=chartStudy(regular,open,seconds,config.trendSlopeThreshold,config.trendLookbackMinutes,config),annotations=report?.annotations?.[current]||simulateDay(rows,config,current);
  const prem=aggregate(rows.filter(b=>b.minute>=start-60&&b.minute<start),seconds),byTime=new Map(prem.map(b=>[b.t,b]));
  for(let t=pre;t<open;t+=seconds){const b=byTime.get(t);result.bars.push(b?{...b,vwap:null,day:current,premarket:true}:{t,o:null,h:null,l:null,c:null,v:0,vwap:null,day:current,premarket:true,empty:true});}
  result.bars.push(...study.bars.map(b=>({...b,day:current,premarket:false})));
  result.sessions.push({day:current,premarketStart:pre,open,close,premarketBars:prem.length});
  result.trends.push({t:pre,trend:'unclear',reason:'Premarket — regular-session trend has not started'},...(preview?study.trends:annotations.trends||study.trends));
  const powerBars=aggregate(regular,60);result.zones.push(...annotations.zones.map(z=>({...rateZonePower(z,powerBars,regular.at(-1).t+1,config.zonePowerTimeframe),day:current})));result.entryRejections.push(...(annotations.entryRejections||[]).map(e=>({...e,day:current})));result.events.push(...annotations.events.map(e=>({...e,day:current})));result.quality.minuteGaps+=annotations.quality.minuteGaps||0;
 }
 result.trades=report?report.trades.filter(t=>result.sessions.some(s=>s.day===t.day)):[];
 result.trends.sort((a,b)=>a.t-b.t);result.hasPrevious=chosen.length>0&&available.indexOf(chosen[0])>0;result.hasNext=chosen.length>0&&available.indexOf(chosen.at(-1))<available.length-1;
 return result;
}
