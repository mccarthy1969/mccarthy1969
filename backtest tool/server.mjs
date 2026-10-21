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
import {simulateDay} from './lib/engine.mjs';
const home=path.dirname(fileURLToPath(import.meta.url)),root=process.env.SPY_LAB_DATA_ROOT||path.join(home,'data'),db=openStore(root);seedDemo(db);
const jobs=new Map(),workers=new Map();let busy=false;const active=new Set();
function launch(w){if(busy)throw Error('Another import or backtest is running');busy=true;const id=crypto.randomUUID(),job={id,kind:w.type,startedAt:Date.now(),status:'running',progress:{}};jobs.set(id,job);const worker=new Worker(new URL('./worker.mjs',import.meta.url),{workerData:{root,...w,jobId:id}});active.add(worker);workers.set(id,worker);worker.on('message',m=>{if(job.status==='cancelling'||job.status==='cancelled')return;if(m.progress)job.progress=m.progress;if(m.done){job.status='done';job.result=m.done;}if(m.error){job.status='error';job.error=m.error;}});worker.on('error',e=>{job.status='error';job.error=e.message;});worker.on('exit',code=>{busy=false;active.delete(worker);workers.delete(id);if(job.status==='running'){job.status='error';job.error=`Worker exited (${code})`;}});return job;}
function json(res,obj,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
async function body(req){let data='';for await(const c of req){data+=c;if(data.length>1000000)throw Error('Request too large');}return JSON.parse(data||'{}');}
function readRun(id){if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Invalid run ID');return JSON.parse(fs.readFileSync(path.join(root,'runs',id+'.json'),'utf8'));}
function csv(trades){const cols=['id','day','dir','t','entry','trendAtSignal','trendTime','trendFilterApplied','stop','target','exitTime','exit','reason','excluded','shares','gross','fees','pnl','duration'];return [cols.join(','),...trades.map(t=>cols.map(k=>JSON.stringify(t[k]??'')).join(','))].join('\r\n');}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),p=url.pathname;
 // Local-only service; reject cross-site mutation attempts.
 if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return json(res,{error:'Cross-origin request rejected'},403);
 if(!['localhost','127.0.0.1','[::1]'].includes(new URL(`http://${req.headers.host}`).hostname))throw Error('Invalid host');
 if(p==='/api/status')return json(res,{datasets:listData(db),defaults,busy,jobControl:true,activeJob:[...jobs.values()].find(j=>j.status==='running'||j.status==='cancelling')||null});
 if(p==='/api/jobs/cancel'&&req.method==='POST'){const {id}=await body(req),job=jobs.get(id);if(!job)throw Error('Job not found');if(job.kind!=='run')throw Error('Only backtests can be stopped');if(job.status!=='running')return json(res,job);job.status='cancelling';const worker=workers.get(id);if(worker)await worker.terminate();fs.rmSync(path.join(root,'runs',id+'.json'),{force:true});job.status='cancelled';job.finishedAt=Date.now();return json(res,job);}
 if(p==='/api/days')return json(res,listDays(db,url.searchParams.get('dataset')));
 if(p==='/api/jobs')return json(res,jobs.get(url.searchParams.get('id'))||{status:'error',error:'Job not found'});
 if(p==='/api/runs'){const dir=path.join(root,'runs');const runs=fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>n.endsWith('.json')).map(n=>{const r=JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));return {id:r.id,created:r.created,dataset:r.dataset,from:r.from,to:r.to,config:r.config,summary:{...r.summary,equity:undefined},qualityIssues:r.quality.filter(q=>q.truncated||q.minuteGaps).length};}).sort((a,b)=>b.created.localeCompare(a.created)):[];return json(res,runs);}
 if(p==='/api/run'&&req.method==='POST'){const b=await body(req),config=validateConfig(b.config);if(!['demo','spy'].includes(b.dataset)||!/^\d{4}-\d{2}-\d{2}$/.test(b.from)||!/^\d{4}-\d{2}-\d{2}$/.test(b.to)||b.from>b.to)throw Error('Choose a dataset and valid date range');return json(res,launch({type:'run',dataset:b.dataset,from:b.from,to:b.to,config}));}
 if(p==='/api/report'){const r=readRun(url.searchParams.get('id'));if(url.searchParams.get('format')==='csv'){res.writeHead(200,{'Content-Type':'text/csv','Content-Disposition':`attachment; filename="spy-trades-${r.id}.csv"`});return res.end(csv(r.trades));}if(url.searchParams.get('download'))res.setHeader('Content-Disposition',`attachment; filename="spy-report-${r.id}.json"`);return json(res,r);}
 if(p==='/api/chart'){const day=url.searchParams.get('day'),dataset=url.searchParams.get('dataset');if(!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||!['demo','spy'].includes(dataset))throw Error('Invalid chart selection');let config=defaults,report;if(url.searchParams.get('run')){report=readRun(url.searchParams.get('run'));if(report.dataset.id!==dataset)throw Error('Run dataset mismatch');config=report.config;}
 const trendPreview=url.searchParams.has('trendSlopeThreshold');
 if(trendPreview){const raw=url.searchParams.get('trendSlopeThreshold');if(!raw.trim())throw Error('Invalid trendSlopeThreshold');config=validateConfig({...config,trendSlopeThreshold:Number(raw)});}
 const rows=dayBars(db,dataset,day),r=report?.annotations?.[day]||simulateDay(rows,config,day),seconds=Number(url.searchParams.get('seconds')||60);if(![1,60,300].includes(seconds))throw Error('Invalid timeframe');
 const start=Number(config.sessionStart.slice(0,2))*60+Number(config.sessionStart.slice(3)),close=config.sessionOverrides[day]||config.sessionEnd,end=Number(close.slice(0,2))*60+Number(close.slice(3));
 const session=rows.filter(b=>b.minute>=start&&b.minute<end),first=session[0];
 const sessionStart=first?Math.floor(first.t/60)*60-(first.minute-start)*60:0;
 const study=chartStudy(session,sessionStart,seconds,config.trendSlopeThreshold);
 return json(res,{...study,trends:trendPreview?study.trends:r.trends||study.trends,trendPreview:!!report&&trendPreview,trendSlopeThreshold:config.trendSlopeThreshold??defaults.trendSlopeThreshold,zones:r.zones,events:r.events,trades:report?report.trades.filter(t=>t.day===day):[],quality:r.quality});}

 if(p==='/api/import'&&req.method==='POST'){if(busy)throw Error('Another job is running');const name=url.searchParams.get('name')||'';if(!/\.csv(?:\.(?:gz|zst))?$/i.test(name))throw Error('Choose a CSV, CSV.GZ or CSV.ZST file. Convert DBN with the included helper.');const dir=path.join(root,'uploads');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,crypto.randomUUID()+'.upload');try{await pipeline(req,fs.createWriteStream(file,{flags:'wx'}));return json(res,launch({type:'import',file,name,remove:true}));}catch(e){fs.rmSync(file,{force:true});throw e;}}
 if(p.startsWith('/api/'))return json(res,{error:'Unknown endpoint'},404);
 if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
 const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'},file=files[p];if(!file)return json(res,{error:'Not found'},404);res.writeHead(200,{'Content-Type':file.endsWith('html')?'text/html; charset=utf-8':file.endsWith('css')?'text/css':'text/javascript','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});fs.createReadStream(path.join(home,'public',file)).pipe(res);
 }catch(e){json(res,{error:e.message},400);}});
const port=Number(process.env.SPY_LAB_PORT||8787);server.listen(port,'127.0.0.1',()=>{const url=`http://127.0.0.1:${server.address().port}`;console.log(`SPY Lab: ${url}\nLocal data: ${root}`);if(process.argv.includes('--open')&&process.platform==='win32')execFile('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true},e=>{if(e)console.error('Open the local URL above in your browser.');});});
function shutdown(){for(const w of active)w.terminate();server.close(()=>{db.close();process.exit(0);});}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
