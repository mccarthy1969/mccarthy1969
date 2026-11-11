import fs from 'node:fs';
import path from 'node:path';
import {defaults,validateConfig} from './strategy.mjs';
export function restoreSettings(saved){
 if(!saved||!['demo','spy'].includes(saved.dataset)||!/^\d{4}-\d{2}-\d{2}$/.test(saved.from)||!/^\d{4}-\d{2}-\d{2}$/.test(saved.to)||saved.from>saved.to)return null;
 const retained=Object.fromEntries(Object.entries(saved.config||{}).filter(([k])=>(Object.hasOwn(defaults,k)||k==='exitStrategy')));
 return {dataset:saved.dataset,from:saved.from,to:saved.to,config:validateConfig(retained)};
}
export function readSettings(root){
 const file=path.join(root,'last-settings.json');
 if(fs.existsSync(file)){try{return restoreSettings(JSON.parse(fs.readFileSync(file,'utf8')));}catch{}}
 const dir=path.join(root,'runs');if(!fs.existsSync(dir))return null;
 const runs=fs.readdirSync(dir).filter(n=>n.endsWith('.json')).map(n=>{try{return JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));}catch{return null;}}).filter(Boolean).sort((a,b)=>(b.created||'').localeCompare(a.created||''));
 for(const run of runs){try{const saved=restoreSettings({...run,dataset:run.dataset?.id});if(saved)return saved;}catch{}}
 return null;
}
export function writeSettings(root,settings){
 const file=path.join(root,'last-settings.json');
 fs.writeFileSync(file,JSON.stringify(restoreSettings(settings),null,2));
}
