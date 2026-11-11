import fs from 'node:fs';
import path from 'node:path';
import {defaults} from './strategy.mjs';
const runName=/^[a-f0-9-]{36}\.json$/;
export function savedReports(root){
 const dir=path.join(root,'runs');if(!fs.existsSync(dir))return [];
 return fs.readdirSync(dir).filter(name=>runName.test(name)).flatMap(name=>{
  try{const parsed=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));const {id,created,dataset,from,to,config,summary,quality,changes,version}=parsed;const report={id,created,dataset,from,to,config,summary,quality,changes,version};return report.id+'.json'===name&&Number.isFinite(Date.parse(report.created))&&report.summary?[{name,report}]:[];}catch{return [];}
 }).sort((a,b)=>b.report.created.localeCompare(a.report.created)||b.name.localeCompare(a.name));
}
export function pruneSavedRuns(root,limit=10){
 const reports=savedReports(root);
 for(const item of reports.slice(limit))fs.rmSync(path.join(root,'runs',item.name));
 return reports.slice(0,limit).map(item=>item.report);
}

const labels={clearPath:'Clear path',confirmationMustNotTouchZone:'Confirmation must not touch zone',minRR:'Minimum R/R',minProfitTarget:'Minimum TP',minZonePower:'Minimum zone power',zonePowerTimeframe:'Zone power candles',trendMethod:'Trend method',trendLookbackMinutes:'VWAP lookback',trendSlopeThreshold:'VWAP slope threshold',stackedCandles:'Stacked candles',stackedCandleMarginCents:'Stacked overlap (cents)',tradeBothDirections:'Both directions',tradingStart:'Trading start (ET)',meetingTolerance:'5m meet tolerance',entryWindowSeconds:'Entry window (seconds)',exitStrategy:'Exit strategy'};
const label=k=>labels[k]||k.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,s=>s.toUpperCase());
const value=v=>v===undefined||v===null?'None':typeof v==='boolean'?(v?'On':'Off'):typeof v==='object'?JSON.stringify(v):String(v);
const stable=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable(v[k]))])):v??null);
export function describeRunChanges(current,previous){
 if(!previous)return {previousRunId:null,items:[],text:'No earlier saved run available to compare.'};
 const items=[],add=(name,a,b)=>{if(stable(a)!==stable(b))items.push(name+': '+value(a)+' → '+value(b));};
 add('Dataset',previous.dataset?.id??previous.dataset,current.dataset?.id??current.dataset);add('From',previous.from,current.from);add('Through',previous.to,current.to);
 const before={...defaults,...previous.config},after={...defaults,...current.config};
 for(const k of new Set([...Object.keys(before),...Object.keys(after)])){
  if(k==='trendFilter')continue;
  if(k==='exitStrategy'){
   const a=before[k],b=after[k];
   if(!a||!b){add(label(k),a?.name??'5m candle meet',b?.name??'5m candle meet');if(b)items.push('Exit plan: '+JSON.stringify(b));continue;}
   add('Exit strategy name',a.name,b.name);
   const walk=(x,y,prefix)=>{for(const key of new Set([...Object.keys(x||{}),...Object.keys(y||{})])){const av=x?.[key],bv=y?.[key],name=prefix+(Array.isArray(x)||Array.isArray(y)?'Exit '+(Number(key)+1):label(key));if(av&&bv&&typeof av==='object'&&typeof bv==='object')walk(av,bv,name+' · ');else add(name,av,bv);}};
   walk(a.exits,b.exits,'');
  }else add(label(k),before[k],after[k]);
 }
 if(previous.version&&current.version)add('Engine version',previous.version,current.version);
 return {previousRunId:previous.id,items,text:items.length?items.slice(0,4).join('; ')+(items.length>4?'; +'+(items.length-4)+' more changes':''):'No settings changes from previous run.'};
}
