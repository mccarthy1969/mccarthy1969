import fs from 'node:fs';import path from 'node:path';
function file(root,id){if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Invalid optimization ID');return path.join(root,'optimizations',id+'.json');}
export function readOptimization(root,id){const name=file(root,id),valid=[];for(const suffix of ['', '.backup'])try{const r=JSON.parse(fs.readFileSync(name+suffix,'utf8'));if(r.id===id)valid.push(r);}catch{}if(!valid.length)throw Error('Search checkpoint not found or unreadable');return valid.sort((a,b)=>(b.revision||0)-(a.revision||0))[0];}
// Alternating complete snapshots keep the preceding checkpoint readable even if a worker
// is terminated mid-write. No rename is needed on Windows filesystems.
export function writeOptimization(root,state){const name=file(root,state.id);fs.mkdirSync(path.dirname(name),{recursive:true});state.revision=(state.revision||0)+1;fs.writeFileSync(name+(state.revision%2?'':'.backup'),JSON.stringify(state));}
