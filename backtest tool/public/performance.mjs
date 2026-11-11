// One entry is one trade, regardless of partial exits. Use the recorded entry trend.
export function summarizeByTrend(trades){
 const result=Object.fromEntries(['down','up','sideways','other'].map(key=>[key,{trades:0,wins:0,losses:0,breakeven:0,winRate:0,pnl:0}]));
 for(const trade of trades){
  if(trade.excluded||!Number.isFinite(trade.pnl))continue;
  const key=['down','up','sideways'].includes(trade.trendAtSignal)?trade.trendAtSignal:'other',row=result[key];
  row.trades++;row.pnl+=trade.pnl;if(trade.pnl>0)row.wins++;else if(trade.pnl<0)row.losses++;else row.breakeven++;
 }
 for(const row of Object.values(result))row.winRate=row.trades?row.wins/row.trades:0;
 return result;
}
// Hours are relative to the configured regular-session open, using New York entry time.
const entryClock=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function summarizeByHour(trades,config={}){
 const clock=s=>Number(s.slice(0,2))*60+Number(s.slice(3)),open=clock(config.sessionStart||'09:30'),close=clock(config.sessionEnd||'16:00');
 const label=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 const rows=Array.from({length:Math.max(0,Math.ceil((close-open)/60))},(_,i)=>({hour:i+1,start:label(open+i*60),end:label(Math.min(close,open+(i+1)*60)),trades:0,wins:0,losses:0,breakeven:0,winRate:0,pnl:0}));
 for(const trade of trades){
  if(trade.excluded||!Number.isFinite(trade.pnl)||!Number.isFinite(trade.t))continue;
  const parts=entryClock.formatToParts(new Date(trade.t*1000)),minute=Number(parts.find(p=>p.type==='hour').value)*60+Number(parts.find(p=>p.type==='minute').value);
  if(minute<open||minute>=close)continue;
  const row=rows[Math.floor((minute-open)/60)];row.trades++;row.pnl+=trade.pnl;
  if(trade.pnl>0)row.wins++;else if(trade.pnl<0)row.losses++;else row.breakeven++;
 }
 for(const row of rows)row.winRate=row.trades?row.wins/row.trades:0;
 return rows;
}
// Exchange configuration remains Eastern; the UI presents equivalent Central clocks.
function shiftClock(value,minutes){
 if(typeof value!=='string'||!/^\d{2}:\d{2}$/.test(value))return value;
 const hour=Number(value.slice(0,2)),minute=Number(value.slice(3));if(hour>23||minute>59)return value;
 const shifted=(hour*60+minute+minutes+1440)%1440;return String(Math.floor(shifted/60)).padStart(2,'0')+':'+String(shifted%60).padStart(2,'0');
}
export const easternToCentral=value=>shiftClock(value,-60);
export const centralToEastern=value=>shiftClock(value,60);
export function convertOverrideClocks(value,convert){
 return value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).map(([date,time])=>[date,convert(time)])):value;
}

export function equityYearTicks(equity){
 const ticks=[];let previous=null;
 for(let i=0;i<equity.length;i++){if(!Number.isFinite(equity[i].t))continue;const year=new Date(equity[i].t*1000).getUTCFullYear();if(year!==previous){ticks.push({year,index:ticks.length?i+1:0});previous=year;}}
 return ticks;
}
