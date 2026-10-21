import {parentPort,workerData as w} from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {openStore,dayBars} from './lib/store.mjs';
import {importCsv} from './lib/importer.mjs';
import {simulateDay,summarize,ENGINE_VERSION} from './lib/engine.mjs';
const db=openStore(w.root);try{if(w.type==='import'){const result=await importCsv(db,w.file,w.name,p=>parentPort.postMessage({progress:p}));parentPort.postMessage({done:result});}
else {const config=w.config,days=db.prepare('SELECT DISTINCT day FROM bars WHERE dataset=? AND day>=? AND day<=? ORDER BY day').all(w.dataset,w.from,w.to);if(!days.length)throw Error('No data in selected date range');const trades=[],quality=[],rejections={},annotations={};let zones=0;parentPort.postMessage({progress:{completed:0,total:days.length,trades:0,phase:'backtest'}});
 for(let i=0;i<days.length;i++){const day=days[i].day;const r=simulateDay(dayBars(db,w.dataset,day),config,day);annotations[day]={zones:r.zones,events:r.events,trends:r.trends,quality:r.quality};trades.push(...r.trades);quality.push({day,...r.quality});zones+=r.zones.length;for(const [k,v] of Object.entries(r.rejections))rejections[k]=(rejections[k]||0)+v;parentPort.postMessage({progress:{completed:i+1,total:days.length,day,trades:trades.length}});}
 parentPort.postMessage({progress:{completed:days.length,total:days.length,trades:trades.length,phase:'finalizing'}});
 const dataset=db.prepare('SELECT * FROM datasets WHERE id=?').get(w.dataset);const id=w.jobId||crypto.randomUUID();const report={id,version:ENGINE_VERSION,created:new Date().toISOString(),dataset,from:w.from,to:w.to,config,summary:summarize(trades,config.initialCapital),trades:trades.map((t,i)=>({...t,id:i+1})),quality,rejections,zones,dataFingerprint:{rows:db.prepare('SELECT count(*) n FROM bars WHERE dataset=? AND day>=? AND day<=?').get(w.dataset,w.from,w.to).n,updated:dataset.updated},annotations,trendHash:crypto.createHash('sha256').update(fs.readFileSync(new URL('./lib/trend.mjs',import.meta.url))).digest('hex'),engineHash:crypto.createHash('sha256').update(fs.readFileSync(new URL('./lib/engine.mjs',import.meta.url))).digest('hex'),strategyHash:crypto.createHash('sha256').update(fs.readFileSync(new URL('./lib/strategy.mjs',import.meta.url))).digest('hex')};
 fs.mkdirSync(path.join(w.root,'runs'),{recursive:true});fs.writeFileSync(path.join(w.root,'runs',id+'.json'),JSON.stringify(report));parentPort.postMessage({done:{id}});}
}catch(e){parentPort.postMessage({error:e.message});}finally{db.close();if(w.type==='import'&&w.remove)fs.rmSync(w.file,{force:true});}
