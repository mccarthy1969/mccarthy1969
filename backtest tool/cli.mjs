import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Worker} from 'node:worker_threads';
import fs from 'node:fs';
import {defaults,validateConfig} from './lib/strategy.mjs';
const home=path.dirname(fileURLToPath(import.meta.url));const [command,...args]=process.argv.slice(2);let work;
if(command==='import'&&args[0])work={type:'import',root:path.join(home,'data'),file:path.resolve(args[0]),name:path.basename(args[0]),remove:false};
else if(command==='backtest'&&args.length>=3){const [dataset,from,to,preset]=args;work={type:'run',root:path.join(home,'data'),dataset,from,to,config:validateConfig(preset?JSON.parse(fs.readFileSync(preset,'utf8')):defaults)};}
else {console.log('node cli.mjs import path/to/SPY.csv[.gz|.zst]\nnode cli.mjs backtest spy|demo YYYY-MM-DD YYYY-MM-DD [preset.json]\nRun one import/backtest at a time; do not run CLI jobs while the web app is running a job.');process.exit(1);}
const w=new Worker(new URL('./worker.mjs',import.meta.url),{workerData:work});w.on('message',m=>{if(m.error){console.error(m.error);process.exitCode=1;}else console.log(JSON.stringify(m));});w.on('error',e=>{console.error(e);process.exitCode=1;});
