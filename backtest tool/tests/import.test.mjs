import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gzipSync,zstdCompressSync} from 'node:zlib';
import {openStore} from '../lib/store.mjs';
import {importCsv,parseTimestamp,csvFields} from '../lib/importer.mjs';
test('timestamp parser supports ISO, seconds, milliseconds, microseconds and nanoseconds without precision loss',()=>{const t=1736173800;for(const x of [String(t),t+'000',t+'000000',t+'000000000','2025-01-06T14:30:00.000000000Z'])assert.equal(parseTimestamp(x),t);assert.throws(()=>parseTimestamp('2025-01-06 09:30:00'));});
test('quoted CSV fields',()=>assert.deepEqual(csvFields('"SPY",1,"a,b","a""b"'),['SPY','1','a,b','a"b']));
test('atomic import, duplicates, conflicts, symbol filter, gzip and zstd',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spy-test-')),db=openStore(dir);try{const content='ts_event,rtype,symbol,open,high,low,close,volume\n2025-01-06T14:30:00Z,32,SPY,100,101,99,100.5,1000\n2025-01-06T14:30:01Z,32,AAPL,100,101,99,100.5,1000\n';const file=path.join(dir,'a.csv');fs.writeFileSync(file,content);let r=await importCsv(db,file,'a.csv');assert.equal(r.rows,1);assert.equal(r.nonSpy,1);r=await importCsv(db,file,'a.csv');assert.equal(r.duplicates,1);fs.writeFileSync(file,content.replace('100.5','100.6'));await assert.rejects(importCsv(db,file,'a.csv'),/conflicting/);assert.equal(db.prepare('SELECT c FROM bars').get().c,100.5);
 const invalid=content.replace('2025-01-06T14:30:00Z','2025-01-06T14:30:02Z')+'2025-01-06T14:30:03Z,32,SPY,100,99,98,100,1\n';fs.writeFileSync(file,invalid);await assert.rejects(importCsv(db,file,'a.csv'),/invalid OHLCV/);assert.equal(db.prepare('SELECT count(*) n FROM bars').get().n,1);
 for(const [ext,compress] of [['gz',gzipSync],['zst',zstdCompressSync]]){fs.writeFileSync(file,compress(Buffer.from(content)));r=await importCsv(db,file,'a.csv.'+ext);assert.equal(r.duplicates,1);}
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}});
