import {readOptimization,writeOptimization} from './lib/optimizer-store.mjs';
import {parentPort,workerData as w} from 'node:worker_threads';
import fs from 'node:fs';import path from 'node:path';
import {openStore,dayBars} from './lib/store.mjs';import {simulateDay} from './lib/engine.mjs';import {optimize} from './lib/optimizer.mjs';
const db=openStore(w.root),file=path.join(w.root,'optimizations',w.optimizationId+'.json');
try{const state=readOptimization(w.root,w.optimizationId);state.status='running';const save=s=>writeOptimization(w.root,s);const days=db.prepare('SELECT DISTINCT day FROM bars WHERE dataset=? AND day>=? AND day<=? ORDER BY day').all(state.spec.dataset,state.spec.from,state.spec.to).map(r=>r.day);
 let cachedDay,cachedRows;await optimize(state,days,async(day,c)=>{if(cachedDay!==day){cachedRows=dayBars(db,state.spec.dataset,day);cachedDay=day;}return simulateDay(cachedRows,c,day);},save,p=>parentPort.postMessage({progress:p}));parentPort.postMessage({done:{optimizationId:state.id}});
}catch(e){parentPort.postMessage({error:e.message});}finally{db.close();}
