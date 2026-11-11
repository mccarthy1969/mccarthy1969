import {readOptimization as readCheckpoint,writeOptimization as writeCheckpoint} from './lib/optimizer-store.mjs';
import {validateSearch,assertCoverage} from './lib/optimizer.mjs';
import {pruneSavedRuns,savedReports,describeRunChanges} from './lib/runs.mjs';
import {readSettings,writeSettings} from './lib/settings.mjs';
import {rateZonePower} from './public/zones.mjs';
import {aggregate as powerMinutes} from './lib/market.mjs';
import {chartTimeline} from './lib/chart-timeline.mjs';
import {tradingDay} from './lib/calendar.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {Worker} from 'node:worker_threads';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {openStore,listData,listDays,dayBars} from './lib/store.mjs';
import {seedDemo} from './lib/demo.mjs';
import {chartStudy} from './lib/trend.mjs';
import {defaults,validateConfig} from './lib/strategy.mjs';
import {simulateDay,ENGINE_VERSION} from './lib/engine.mjs';
const home=path.dirname(fileURLToPath(import.meta.url)),root=process.env.SPY_LAB_DATA_ROOT||path.join(home,'data'),db=openStore(root);seedDemo(db);
pruneSavedRuns(root);
const chartDaysCache=new Map();
function chartDays(dataset){if(!chartDaysCache.has(dataset))chartDaysCache.set(dataset,db.prepare('SELECT DISTINCT day FROM bars INDEXED BY bars_day WHERE dataset=? ORDER BY day').all(dataset).map(r=>r.day).filter(tradingDay));return chartDaysCache.get(dataset);}
const jobs=new Map(),workers=new Map();let busy=false;const active=new Set();
function launch(w){if(busy)throw Error('Another import or backtest is running');busy=true;const id=crypto.randomUUID(),job={id,kind:w.type,optimizationId:w.optimizationId,startedAt:Date.now(),status:'running',progress:{}};jobs.set(id,job);const worker=new Worker(new URL(w.type==='optimize'?'./optimizer-worker.mjs':w.type==='estimate'?'./optimizer-estimate-worker.mjs':'./worker.mjs',import.meta.url),{workerData:{root,...w,jobId:id}});active.add(worker);workers.set(id,worker);worker.on('message',m=>{if(job.status==='cancelling'||job.status==='cancelled')return;if(m.progress)job.progress=m.progress;if(m.done){if(w.type==='import')chartDaysCache.clear();job.status='done';job.result=m.done;}if(m.error){job.status='error';job.error=m.error;}});worker.on('error',e=>{job.status='error';job.error=e.message;});worker.on('exit',code=>{busy=false;active.delete(worker);workers.delete(id);if(job.status==='running'){job.status='error';job.error=`Worker exited (${code})`;}});return job;}
function json(res,obj,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
async function body(req){let data='';for await(const c of req){data+=c;if(data.length>1000000)throw Error('Request too large');}return JSON.parse(data||'{}');}
function optimizerFingerprint(){return crypto.createHash('sha256').update(['lib/optimizer.mjs','lib/optimizer-store.mjs','lib/strategy.mjs','lib/engine.mjs','lib/exits.mjs','lib/trend.mjs','public/zones.mjs','lib/clear-path.mjs','lib/market.mjs'].map(f=>fs.readFileSync(path.join(home,f),'utf8')).join('')).digest('hex');}
function readOptimization(id){return readCheckpoint(root,id);}
function writeOptimization(state){writeCheckpoint(root,state);}
function optimizerView(state){const latest=[...jobs.values()].filter(j=>j.optimizationId===state.id).at(-1),live=latest?.status==='running'?latest:null;return {...state,status:latest?.status==='error'?'error':state.status==='running'&&!live?'paused':state.status,error:latest?.error,job:live||null,candidates:state.candidates.map(({records,stressRecords,...rest})=>rest)};}
function readRun(id){if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Invalid run ID');return JSON.parse(fs.readFileSync(path.join(root,'runs',id+'.json'),'utf8'));}
function csv(trades){const cols=['id','day','dir','t','entry','trendAtSignal','trendTime','trendFilterApplied','stop','target','exitTime','exit','reason','excluded','shares','gross','fees','pnl','duration','exits','initialStop','stopHistory','zoneDistance'];return [cols.join(','),...trades.map(t=>cols.map(k=>{const value=t[k]??'';const text=typeof value==='object'?JSON.stringify(value):String(value);return /[",\r\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;}).join(','))].join('\r\n');}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),p=url.pathname;
 // Local-only service; reject cross-site mutation attempts.
 if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return json(res,{error:'Cross-origin request rejected'},403);
 if(!['localhost','127.0.0.1','[::1]'].includes(new URL(`http://${req.headers.host}`).hostname))throw Error('Invalid host');
 if(p==='/api/status')return json(res,{datasets:listData(db),defaults,savedSettings:readSettings(root),busy,jobControl:true,activeJob:[...jobs.values()].find(j=>j.status==='running'||j.status==='cancelling')||null});
 if(p==='/api/jobs/cancel'&&req.method==='POST'){const {id}=await body(req),job=jobs.get(id);if(!job)throw Error('Job not found');if(job.kind!=='run')throw Error('Only backtests can be stopped');if(job.status!=='running')return json(res,job);job.status='cancelling';const worker=workers.get(id);if(worker)await worker.terminate();fs.rmSync(path.join(root,'runs',id+'.json'),{force:true});job.status='cancelled';job.finishedAt=Date.now();return json(res,job);}
 if(p==='/api/optimizer/estimate'&&req.method==='POST'){if(busy)throw Error('Pause or finish the current job before estimating');const spec=validateSearch(await body(req));assertCoverage(listDays(db,spec.dataset).map(r=>r.day).filter(d=>d>=spec.from&&d<=spec.to),spec);return json(res,launch({type:'estimate',spec}));}
 if(p==='/api/optimizer/start'&&req.method==='POST'){
  if(busy)throw Error('Another job is running');const b=await body(req),spec=validateSearch(b);const days=listDays(db,spec.dataset).map(r=>r.day).filter(d=>d>=spec.from&&d<=spec.to);assertCoverage(days,spec);
  const id=crypto.randomUUID(),dataset=db.prepare('SELECT * FROM datasets WHERE id=?').get(spec.dataset);const state={id,created:new Date().toISOString(),status:'running',phase:'search',spec,candidates:[],engineVersion:ENGINE_VERSION,fingerprint:optimizerFingerprint(),datasetUpdated:dataset.updated};writeOptimization(state);return json(res,{optimizationId:id,job:launch({type:'optimize',optimizationId:id})});
 }
 if(p==='/api/optimizer/pause'&&req.method==='POST'){
  const {id}=await body(req);readOptimization(id);const job=[...jobs.values()].find(j=>j.optimizationId===id&&j.status==='running');if(job){job.status='cancelling';await workers.get(job.id)?.terminate();job.status='cancelled';}
  const state=readOptimization(id);if(state.status!=='complete'){state.status='paused';writeOptimization(state);}return json(res,optimizerView(state));
 }
 if(p==='/api/optimizer/resume'&&req.method==='POST'){
  if(busy)throw Error('Another job is running');const {id}=await body(req),state=readOptimization(id);if(state.status==='complete')throw Error('This search is already complete');if(state.fingerprint!==optimizerFingerprint())throw Error('Strategy code changed. Start a new search to keep results comparable.');const dataset=db.prepare('SELECT * FROM datasets WHERE id=?').get(state.spec.dataset);if(dataset.updated!==state.datasetUpdated)throw Error('Dataset changed. Start a new search.');state.status='running';writeOptimization(state);return json(res,{optimizationId:id,job:launch({type:'optimize',optimizationId:id})});
 }
 if(p==='/api/optimizer/result')return json(res,optimizerView(readOptimization(url.searchParams.get('id'))));
 if(p==='/api/optimizer/list'){const dir=path.join(root,'optimizations');return json(res,fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).map(n=>{try{const r=readOptimization(n.slice(0,-5));return {id:r.id,created:r.created,status:r.status,from:r.spec.from,to:r.spec.to};}catch{return null;}}).filter(Boolean).sort((a,b)=>b.created.localeCompare(a.created)):[]);}
 if(p==='/api/days')return json(res,listDays(db,url.searchParams.get('dataset')).filter(row=>tradingDay(row.day)));
 if(p==='/api/jobs')return json(res,jobs.get(url.searchParams.get('id'))||{status:'error',error:'Job not found'});
 if(p==='/api/runs'){const runs=savedReports(root).slice(0,10).map(({report:r},i,reports)=>({changes:r.changes??describeRunChanges(r,reports[i+1]?.report),id:r.id,created:r.created,dataset:r.dataset,from:r.from,to:r.to,config:r.config,summary:{...r.summary,lowestPnl:r.summary.lowestPnl??(r.summary.equity||[]).reduce((low,p)=>Math.min(low,p.value),0),equity:undefined},qualityIssues:r.quality.filter(q=>q.truncated||q.minuteGaps).length}));return json(res,runs);}
 if(p==='/api/run'&&req.method==='POST'){const b=await body(req),config=validateConfig(b.config);if(!['demo','spy'].includes(b.dataset)||!/^\d{4}-\d{2}-\d{2}$/.test(b.from)||!/^\d{4}-\d{2}-\d{2}$/.test(b.to)||b.from>b.to)throw Error('Choose a dataset and valid date range');if(busy)throw Error('Another import or backtest is running');writeSettings(root,{dataset:b.dataset,from:b.from,to:b.to,config});return json(res,launch({type:'run',dataset:b.dataset,from:b.from,to:b.to,config}));}
 if(p==='/api/report'){const r=readRun(url.searchParams.get('id'));if(url.searchParams.get('format')==='csv'){res.writeHead(200,{'Content-Type':'text/csv','Content-Disposition':`attachment; filename="spy-trades-${r.id}.csv"`});return res.end(csv(r.trades));}if(url.searchParams.get('download'))res.setHeader('Content-Disposition',`attachment; filename="spy-report-${r.id}.json"`);return json(res,r);}
 if(p==='/api/chart'){const day=url.searchParams.get('day'),dataset=url.searchParams.get('dataset');if(!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||!['demo','spy'].includes(dataset))throw Error('Invalid chart selection');let config=defaults,report;if(url.searchParams.get('run')){report=readRun(url.searchParams.get('run'));if(report.dataset.id!==dataset)throw Error('Run dataset mismatch');config=report.config;}
 const trendPreview=['trendSlopeThreshold','trendLookbackMinutes','trendMethod','candleTrendCount'].some(k=>url.searchParams.has(k));
 if(trendPreview){const preview={...config};for(const key of ['trendSlopeThreshold','trendLookbackMinutes','trendMethod','candleTrendCount'])if(url.searchParams.has(key)){const raw=url.searchParams.get(key);if(!raw.trim())throw Error('Invalid '+key);preview[key]=key==='trendMethod'?raw:Number(raw);}config=validateConfig(preview);}
 if(url.searchParams.get('continuous')==='1'){
  const seconds=Number(url.searchParams.get('seconds')||60);if(![1,60,300].includes(seconds))throw Error('Invalid timeframe');
  return json(res,chartTimeline({days:chartDays(dataset),day,seconds,config,report,preview:trendPreview,readRows:date=>dayBars(db,dataset,date)}));
 }
 const rows=dayBars(db,dataset,day),r=report?.annotations?.[day]||simulateDay(rows,config,day),seconds=Number(url.searchParams.get('seconds')||60);if(![1,60,300].includes(seconds))throw Error('Invalid timeframe');
 const start=Number(config.sessionStart.slice(0,2))*60+Number(config.sessionStart.slice(3)),close=config.sessionOverrides[day]||config.sessionEnd,end=Number(close.slice(0,2))*60+Number(close.slice(3));
 const session=rows.filter(b=>b.minute>=start&&b.minute<end),first=session[0];
 const sessionStart=first?Math.floor(first.t/60)*60-(first.minute-start)*60:0;
 const study=chartStudy(session,sessionStart,seconds,config.trendSlopeThreshold,config.trendLookbackMinutes,config);
 return json(res,{...study,trends:trendPreview?study.trends:r.trends||study.trends,trendPreview:!!report&&trendPreview,trendSlopeThreshold:config.trendSlopeThreshold??defaults.trendSlopeThreshold,trendLookbackMinutes:config.trendLookbackMinutes??5,trendMethod:config.trendMethod??'vwap',candleTrendCount:config.candleTrendCount??3,zones:r.zones.map(z=>rateZonePower(z,powerMinutes(session,60),session.at(-1)?.t+1,config.zonePowerTimeframe)),events:r.events,entryRejections:r.entryRejections||[],trades:report?report.trades.filter(t=>t.day===day):[],quality:r.quality});}

 if(p==='/api/import'&&req.method==='POST'){if(busy)throw Error('Another job is running');const name=url.searchParams.get('name')||'';if(!/\.csv(?:\.(?:gz|zst))?$/i.test(name))throw Error('Choose a CSV, CSV.GZ or CSV.ZST file. Convert DBN with the included helper.');const dir=path.join(root,'uploads');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,crypto.randomUUID()+'.upload');try{await pipeline(req,fs.createWriteStream(file,{flags:'wx'}));return json(res,launch({type:'import',file,name,remove:true}));}catch(e){fs.rmSync(file,{force:true});throw e;}}
 if(p.startsWith('/api/'))return json(res,{error:'Unknown endpoint'},404);
 if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
 const files={'/':'index.html','/app.js':'app.js','/zones.mjs':'zones.mjs','/optimizer-ui.mjs':'optimizer-ui.mjs','/performance.mjs':'performance.mjs','/style.css':'style.css'},file=files[p];if(!file)return json(res,{error:'Not found'},404);res.writeHead(200,{'Content-Type':file.endsWith('html')?'text/html; charset=utf-8':file.endsWith('css')?'text/css':'text/javascript','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});fs.createReadStream(path.join(home,'public',file)).pipe(res);
 }catch(e){json(res,{error:e.message},400);}});
const port=Number(process.env.SPY_LAB_PORT||8787);server.listen(port,'127.0.0.1',()=>{const url=`http://127.0.0.1:${server.address().port}`;console.log(`SPY Lab: ${url}\nLocal data: ${root}`);if(process.argv.includes('--open')&&process.platform==='win32')execFile('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true},e=>{if(e)console.error('Open the local URL above in your browser.');});});
function shutdown(){for(const w of active)w.terminate();server.close(()=>{db.close();process.exit(0);});}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
