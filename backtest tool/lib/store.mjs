import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
export function openStore(root){mkdirSync(root,{recursive:true});const db=new DatabaseSync(path.join(root,'spy.sqlite'));db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;
 CREATE TABLE IF NOT EXISTS datasets(id TEXT PRIMARY KEY,name TEXT NOT NULL,synthetic INTEGER NOT NULL DEFAULT 0,updated TEXT);
 CREATE TABLE IF NOT EXISTS bars(dataset TEXT NOT NULL,t INTEGER NOT NULL,day TEXT NOT NULL,minute INTEGER NOT NULL,o REAL NOT NULL,h REAL NOT NULL,l REAL NOT NULL,c REAL NOT NULL,v REAL NOT NULL,PRIMARY KEY(dataset,t)) WITHOUT ROWID;
 CREATE INDEX IF NOT EXISTS bars_day ON bars(dataset,day,t);
 CREATE TABLE IF NOT EXISTS imports(id INTEGER PRIMARY KEY,dataset TEXT,filename TEXT,rows INTEGER,duplicates INTEGER,created TEXT);
 `);return db;}
export function listData(db){return db.prepare(`SELECT d.*, count(b.t) AS rows, min(b.day) AS firstDay,max(b.day) AS lastDay,count(DISTINCT b.day) AS days FROM datasets d LEFT JOIN bars b ON b.dataset=d.id GROUP BY d.id`).all();}
export const listDays=(db,id)=>db.prepare('SELECT day,count(*) AS rows FROM bars WHERE dataset=? GROUP BY day ORDER BY day').all(id);
export const dayBars=(db,id,day)=>db.prepare('SELECT t,minute,o,h,l,c,v FROM bars WHERE dataset=? AND day=? ORDER BY t').all(id,day);
