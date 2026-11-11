import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readSettings,writeSettings,restoreSettings} from '../lib/settings.mjs';
import {defaults} from '../lib/strategy.mjs';
test('last run settings survive reload and merge new defaults without resetting old choices',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'spy-settings-'));
 try{
  assert.equal(readSettings(root),null);
  const settings={dataset:'spy',from:'2025-01-01',to:'2026-10-16',config:{tradeBothDirections:true,minRR:.5,minZonePower:.35,allowUptrend:false,exitStrategy:{name:'Runner',exits:[{type:'cents',cents:20,percent:80,moveStop:{type:'breakEven'}},{type:'noLimit',percent:20,moveStop:{type:'trailing',amount:.2}}]}}};
  writeSettings(root,settings);const saved=readSettings(root);assert.equal(saved.config.minRR,.5);assert.equal(saved.config.tradeBothDirections,true);assert.equal(saved.config.trendFilter,false);assert.equal(saved.config.minZonePower,.35);assert.equal(saved.config.allowUptrend,false);assert.equal(saved.config.tradingStart,defaults.tradingStart);assert.deepEqual(saved.config.exitStrategy,settings.config.exitStrategy);assert.equal(saved.from,settings.from);assert.equal(saved.to,settings.to);assert.equal(saved.dataset,'spy');
  const updated={...settings,config:{...settings.config,minRR:2}};writeSettings(root,updated);assert.equal(readSettings(root).config.minRR,2);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('existing latest saved run seeds settings and removed attributes are ignored',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'spy-settings-'));
 try{
  fs.mkdirSync(path.join(root,'runs'));
  for(const [name,created,minRR] of [['old','2026-10-01',1],['new','2026-11-01',3]])fs.writeFileSync(path.join(root,'runs',name+'.json'),JSON.stringify({created,dataset:{id:'spy'},from:'2025-01-01',to:'2026-10-16',config:{minRR,obsolete:true}}));
  const saved=readSettings(root);assert.equal(saved.config.minRR,3);assert.equal(saved.config.minZonePower,0);assert.ok(!Object.hasOwn(saved.config,'obsolete'));
  fs.writeFileSync(path.join(root,'last-settings.json'),'broken');assert.equal(readSettings(root).config.minRR,3);
  assert.equal(restoreSettings({dataset:'bad'}),null);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
