import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {savedReports,pruneSavedRuns,describeRunChanges} from '../lib/runs.mjs';
test('run retention preserves newest ten reports by creation time and leaves other files alone',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'spy-retention-'));try{
  const dir=path.join(root,'runs');fs.mkdirSync(dir);fs.writeFileSync(path.join(root,'last-settings.json'),'settings');fs.writeFileSync(path.join(dir,'notes.txt'),'keep');fs.writeFileSync(path.join(dir,'broken.json'),'broken');
  const ids=[];for(let i=0;i<13;i++){const id=crypto.randomUUID();ids.push(id);fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify({id,created:new Date(Date.UTC(2026,0,i+1)).toISOString(),summary:{net:i}}));}
  const retained=pruneSavedRuns(root);assert.equal(retained.length,10);assert.deepEqual(retained.map(r=>r.id),ids.slice(3).reverse());
  for(const [i,id] of ids.entries())assert.equal(fs.existsSync(path.join(dir,id+'.json')),i>=3);
  assert.equal(savedReports(root).length,10);assert.equal(fs.readFileSync(path.join(root,'last-settings.json'),'utf8'),'settings');assert.equal(fs.readFileSync(path.join(dir,'notes.txt'),'utf8'),'keep');assert.ok(fs.existsSync(path.join(dir,'broken.json')));
  assert.deepEqual(pruneSavedRuns(root).map(r=>r.id),retained.map(r=>r.id));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('missing run directory and incomplete reports are safe during retention',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'spy-retention-'));try{
  assert.deepEqual(pruneSavedRuns(root),[]);fs.mkdirSync(path.join(root,'runs'));const id=crypto.randomUUID();fs.writeFileSync(path.join(root,'runs',id+'.json'),'partial');assert.deepEqual(pruneSavedRuns(root),[]);assert.ok(fs.existsSync(path.join(root,'runs',id+'.json')));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

const baseline={id:'previous',dataset:{id:'spy'},from:'2025-01-01',to:'2025-12-31',version:'1',config:{minRR:1}};
test('run changes compare values and ignore object key ordering and newly defaulted settings',()=>{
 const same=describeRunChanges({...baseline,config:{stackedCandles:false,minRR:1}},baseline);assert.deepEqual(same.items,[]);assert.match(same.text,/No settings changes/);
 const result=describeRunChanges({...baseline,from:'2024-01-01',config:{minRR:2,stackedCandles:true}},baseline);
 assert.equal(result.previousRunId,'previous');assert.deepEqual(result.items,['From: 2025-01-01 → 2024-01-01','Minimum R/R: 1 → 2','Stacked candles: Off → On']);
 assert.equal(describeRunChanges(baseline,null).previousRunId,null);
});
test('exit changes identify individual exit percentages and stop distance',()=>{
 const plan={name:'Plan',exits:[{type:'cents',cents:20,percent:80},{type:'noLimit',percent:20,moveStop:{type:'trailing',amount:.2}}]};
 const before={...baseline,config:{exitStrategy:plan}},after=structuredClone(before);after.config.exitStrategy.exits[1].moveStop.amount=.3;
 assert.deepEqual(describeRunChanges(after,before).items,['Exit 2 · Move Stop · Amount: 0.2 → 0.3']);
});
test('stored comparison survives metadata loading and pruning of predecessor',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'spy-changes-'));try{
 fs.mkdirSync(path.join(root,'runs'));const a={...baseline,id:crypto.randomUUID(),created:'2025-01-01T00:00:00Z',summary:{net:0}};
 const b={...a,id:crypto.randomUUID(),created:'2025-01-02T00:00:00Z',config:{minRR:2}};b.changes=describeRunChanges(b,a);
 for(const r of [a,b])fs.writeFileSync(path.join(root,'runs',r.id+'.json'),JSON.stringify(r));
 pruneSavedRuns(root,1);assert.deepEqual(savedReports(root)[0].report.changes,b.changes);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
