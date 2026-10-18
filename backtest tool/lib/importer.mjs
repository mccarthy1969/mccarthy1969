import fs from 'node:fs';
import readline from 'node:readline';
import {createGunzip,createZstdDecompress} from 'node:zlib';
import {marketTime} from './market.mjs';
export function csvFields(line){const a=[];let s='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){s+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){a.push(s);s='';}else s+=ch;}if(quoted)throw Error('Unterminated CSV quote (multiline fields unsupported)');a.push(s);return a.map(x=>x.trim());}
export function parseTimestamp(raw){if(/^\d+$/.test(raw)){let n=BigInt(raw);if(n>=100000000000000000n)n/=1000000000n;else if(n>=100000000000000n)n/=1000000n;else if(n>=100000000000n)n/=1000n;const t=Number(n);if(t<946684800||t>4102444800)throw Error('Timestamp outside 2000–2100');return t;}if(!/(Z|[+-]\d\d:\d\d)$/i.test(raw))throw Error('ISO timestamps must include Z or an explicit UTC offset');const t=Math.floor(Date.parse(raw)/1000);if(!Number.isFinite(t)||t<946684800||t>4102444800)throw Error('Invalid timestamp');return t;}
export async function importCsv(db,file,name,progress=()=>{}){let stream=fs.createReadStream(file);if(/\.gz$/i.test(name))stream=stream.pipe(createGunzip());else if(/\.zst$/i.test(name))stream=stream.pipe(createZstdDecompress());
 const rl=readline.createInterface({input:stream,crlfDelay:Infinity});let header,keys={},rows=0,duplicates=0,skipped=0,lineNo=0,nonSpy=0,lastBucket=-1,lastMinute;
 const insert=db.prepare('INSERT INTO bars VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(dataset,t) DO NOTHING');const existing=db.prepare('SELECT o,h,l,c,v FROM bars WHERE dataset=? AND t=?');
 db.exec('BEGIN IMMEDIATE');try{for await(const line of rl){lineNo++;if(!line.trim())continue;const values=csvFields(line.replace(/^\uFEFF/,''));if(!header){header=values.map(v=>v.toLowerCase());for(const [k,aliases] of Object.entries({t:['ts_event','timestamp','time','date'],o:['open','o'],h:['high','h'],l:['low','l'],c:['close','c'],v:['volume','v'],symbol:['symbol','ticker'],rtype:['rtype']})){keys[k]=header.findIndex(x=>aliases.includes(x));}if(['t','o','h','l','c','v'].some(k=>keys[k]<0))throw Error('CSV requires ts_event/timestamp, open, high, low, close, volume columns');continue;}
  if(values.length!==header.length)throw Error(`Line ${lineNo}: column count differs from header`);
  if(keys.symbol>=0&&values[keys.symbol].toUpperCase()!=='SPY'){nonSpy++;continue;}
  if(keys.rtype>=0&&!['32','ohlcv-1s','0x20'].includes(values[keys.rtype].toLowerCase()))throw Error(`Line ${lineNo}: expected OHLCV-1s records (rtype 32)`);
  const t=parseTimestamp(values[keys.t]),nums=['o','h','l','c','v'].map(k=>values[keys[k]]===''?NaN:Number(values[keys[k]]));const [o,h,l,c,v]=nums;
  if(nums.some(x=>!Number.isFinite(x))||Math.min(o,h,l,c)<=0||v<0||h<Math.max(o,l,c)||l>Math.min(o,h,c))throw Error(`Line ${lineNo}: invalid OHLCV values. Use decimal price output, not raw fixed-point integers.`);
  // Databento decimal strings are prices; raw integer-scaled prices must be converted first.
  if(Math.max(o,h,l,c)>100000)throw Error(`Line ${lineNo}: price looks integer-scaled; export decimal prices`);
  const bucket=Math.floor(t/60);if(bucket!==lastBucket){lastMinute=marketTime(t);lastBucket=bucket;}const mt=lastMinute;
  const result=insert.run('spy',t,mt.day,mt.minute,o,h,l,c,v);if(!result.changes){const old=existing.get('spy',t);if(['o','h','l','c','v'].some((k,i)=>old[k]!==nums[i]))throw Error(`Line ${lineNo}: conflicting record already exists at ${t}; import rolled back`);duplicates++;}else rows++;
  if((rows+duplicates)%100000===0){progress({rows,duplicates,nonSpy,lineNo});await new Promise(r=>setImmediate(r));}
 }
 if(!header||rows+duplicates===0)throw Error('No SPY records found');db.prepare("INSERT INTO datasets VALUES('spy','Imported SPY · OHLCV-1s',0,?) ON CONFLICT(id) DO UPDATE SET updated=excluded.updated").run(new Date().toISOString());db.prepare('INSERT INTO imports(dataset,filename,rows,duplicates,created) VALUES(?,?,?,?,?)').run('spy',name,rows,duplicates,new Date().toISOString());db.exec('COMMIT');return {rows,duplicates,skipped,nonSpy};
 }catch(e){db.exec('ROLLBACK');throw Error(`${e.message} (near line ${lineNo})`);}finally{rl.close();stream.destroy();}}
