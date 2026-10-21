import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
test('HTTP workflow: isolated import, background jobs, candles, reports and exports', {timeout:60000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spy-api-')),home=fileURLToPath(new URL('..',import.meta.url));const child=spawn(process.execPath,['server.mjs'],{cwd:home,env:{...process.env,SPY_LAB_DATA_ROOT:dir,SPY_LAB_PORT:'0'},stdio:['ignore','pipe','pipe']});let base='',logs='';
 try{base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timeout: '+logs)),20000);child.stdout.on('data',b=>{logs+=b;const m=logs.match(/SPY Lab: (http:\/\/127\.0\.0\.1:\d+)/);if(m){clearTimeout(timer);resolve(m[1]);}});child.stderr.on('data',b=>logs+=b);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code+': '+logs));});});
 const request=async(p,opts)=>{const r=await fetch(base+p,opts),j=await r.json();assert.equal(r.status,200,JSON.stringify(j));return j;};
 const poll=async id=>{for(let i=0;i<200;i++){const j=await request('/api/jobs?id='+id);if(j.status==='error')throw Error(j.error);if(j.status==='done')return j.result;await new Promise(r=>setTimeout(r,25));}throw Error('Job timed out');};
 const status=await request('/api/status');assert.equal(status.datasets[0].synthetic,1);assert.equal(status.datasets[0].rows,234000);assert.equal(status.jobControl,true);assert.equal(status.activeJob,null);
 const page=await fetch(base+'/');assert.equal(page.status,200);assert.match(await page.text(),/SPY Lab/);
 const rejected=await fetch(base+'/api/run',{method:'POST',headers:{Origin:'https://example.com'},body:'{}'});assert.equal(rejected.status,403);
 let job=await request('/api/run',{method:'POST',body:JSON.stringify({dataset:'demo',from:'2026-10-05',to:'2026-10-16',config:status.defaults})});const result=await poll(job.id),report=await request('/api/report?id='+result.id);// The staged 09:49 entries occur before trend confirmation and are blocked.
 assert.equal(status.defaults.trendFilter,true);assert.equal(report.config.trendFilter,true);
 assert.equal(report.summary.trades,1);assert.equal(report.trades[0].day,'2026-10-06');assert.equal(report.trades[0].trendAtSignal,'sideways');assert.equal(report.version,'0.5.0');assert.equal(report.rejections['trend filter: unclear'],10);
 assert.equal(report.trendHash.length,64);assert.equal(report.config.trendSlopeThreshold,.005);
 assert.equal(report.quality.length,10);assert.equal(report.summary.excluded,0);assert.ok(report.strategyHash.length===64);
 const chart1=await request('/api/chart?dataset=demo&day=2026-10-05&seconds=60&run='+result.id),chart5=await request('/api/chart?dataset=demo&day=2026-10-05&seconds=300&run='+result.id),chartS=await request('/api/chart?dataset=demo&day=2026-10-05&seconds=1&run='+result.id);assert.equal(chart1.bars.length,390);assert.equal(chart5.bars.length,78);assert.equal(chartS.bars.length,23400);assert.equal(chart1.trades.length,0);assert.deepEqual(chart1.trends,report.annotations['2026-10-05'].trends);assert.ok(chart1.zones.length>0);assert.deepEqual(chart1.zones,report.annotations['2026-10-05'].zones);assert.ok(report.engineHash.length===64);assert.equal(chart1.bars[0].v,chartS.bars.slice(0,60).reduce((a,b)=>a+b.v,0));
 assert.deepEqual(chart1.trends,chart5.trends);assert.deepEqual(chart1.trends,chartS.trends);
 assert.equal(chart1.trends[0].trend,'unclear');assert.equal(chart1.trends[1].t,chartS.bars[0].t+1800);
 assert.ok(chart1.trends.some(t=>t.trend==='up'));assert.ok(chart1.trends.some(t=>t.trend==='down'));
 const preview=await request('/api/chart?dataset=demo&day=2026-10-05&seconds=60&run='+result.id+'&trendSlopeThreshold=0.05');
 assert.equal(preview.trendPreview,true);assert.equal(preview.trendSlopeThreshold,.05);assert.deepEqual(preview.bars,chart1.bars);assert.deepEqual(preview.trades,chart1.trades);assert.notDeepEqual(preview.trends,chart1.trends);
 assert.ok(preview.trends.filter(t=>Number.isFinite(t.slope)).every(t=>t.threshold===.05));
 assert.deepEqual((await request('/api/report?id='+result.id)).annotations,report.annotations);
 for(const value of ['-1','NaN','0.051','']){const bad=await fetch(base+'/api/chart?dataset=demo&day=2026-10-05&trendSlopeThreshold='+value);assert.equal(bad.status,400);}
 for(const bar of chart5.bars)assert.equal(bar.vwap,chartS.bars.find(b=>b.t===bar.t+299).vwap);
 const exportResponse=await fetch(base+'/api/report?id='+result.id+'&format=csv');assert.match(exportResponse.headers.get('content-disposition'),/attachment/);assert.equal((await exportResponse.text()).split('\r\n').length,report.trades.length+1);assert.equal((await request('/api/runs')).length,1);
 const completed=await request('/api/jobs?id='+job.id);assert.equal(completed.progress.completed,10);assert.equal(completed.progress.total,10);assert.equal(completed.progress.phase,'finalizing');assert.equal(completed.kind,'run');assert.ok(completed.startedAt>0);
 const controlJob=await request('/api/run',{method:'POST',body:JSON.stringify({dataset:'demo',from:'2026-10-05',to:'2026-10-16',config:{...status.defaults,trendFilter:false,trendSlopeThreshold:.017}})});
 const control=await poll(controlJob.id),controlReport=await request('/api/report?id='+control.id);
 assert.equal(controlReport.summary.trades,8);assert.equal(controlReport.config.trendFilter,false);assert.equal(controlReport.config.trendSlopeThreshold,.017);assert.ok(controlReport.annotations['2026-10-05'].trends.filter(t=>Number.isFinite(t.slope)).every(t=>t.threshold===.017));
 const opening=controlReport.trades.filter(t=>t.signalTime===Date.parse(t.day+'T13:49:00Z')/1000);assert.equal(opening.length,6);
 for(const trade of opening){assert.equal(trade.trendAtSignal,'unclear');assert.equal(trade.triggerPrice,580.32);}
 for(const trade of controlReport.trades){assert.equal(trade.trendFilterApplied,false);assert.equal(trade.triggerPrice,Number((trade.confirmationClose+trade.dir*.02).toFixed(8)));assert.ok(trade.t>=trade.signalTime&&trade.t<trade.signalTime+10);}
 // Relaxed Z approach and zone-only confirmation also allow these later synthetic setups.
 assert.deepEqual(controlReport.trades.filter(t=>!opening.includes(t)).map(t=>t.day),['2026-10-06','2026-10-12']);
 const controlCsv=await (await fetch(base+'/api/report?id='+control.id+'&format=csv')).text();assert.match(controlCsv,/trendAtSignal/);assert.equal(controlCsv.split('\r\n').length,9);
 assert.deepEqual((await request('/api/report?id='+result.id)).trades,report.trades);
 const cancelJob=await request('/api/run',{method:'POST',body:JSON.stringify({dataset:'demo',from:'2026-10-05',to:'2026-10-16',config:status.defaults})});
 const stopped=await request('/api/jobs/cancel',{method:'POST',body:JSON.stringify({id:cancelJob.id})});assert.equal(stopped.status,'cancelled');assert.equal((await request('/api/jobs?id='+cancelJob.id)).status,'cancelled');assert.equal((await request('/api/status')).busy,false);assert.equal((await request('/api/runs')).length,2);
 const csv='ts_event,rtype,symbol,open,high,low,close,volume\n2025-01-06T14:30:00Z,32,SPY,580,581,579,580.5,10\n2025-01-06T14:30:01Z,32,SPY,580.5,581,580,580.7,20\n';job=await request('/api/import?name=fixture.csv',{method:'POST',body:csv});let imported=await poll(job.id);assert.equal(imported.rows,2);assert.equal((await request('/api/days?dataset=spy'))[0].day,'2025-01-06');
 job=await request('/api/import?name=fixture.csv',{method:'POST',body:csv});imported=await poll(job.id);assert.equal(imported.duplicates,2);assert.equal((await request('/api/status')).datasets.find(d=>d.id==='spy').rows,2);
 }finally{if(child.exitCode===null){child.kill();await once(child,'exit');}fs.rmSync(dir,{recursive:true,force:true});}
});
