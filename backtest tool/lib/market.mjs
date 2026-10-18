const fmt = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function marketTime(t){const p=Object.fromEntries(fmt.formatToParts(new Date(t*1000)).map(x=>[x.type,x.value]));return {day:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute),second:Number(p.second)};}
export function aggregate(rows,seconds=60){const out=[];for(const r of rows){const t=Math.floor(r.t/seconds)*seconds;let a=out.at(-1);if(!a||a.t!==t){a={t,o:r.o,h:r.h,l:r.l,c:r.c,v:r.v,n:1};out.push(a);}else{a.h=Math.max(a.h,r.h);a.l=Math.min(a.l,r.l);a.c=r.c;a.v+=r.v;a.n++;}}return out;}
export const round=x=>Math.round((x+Number.EPSILON)*100)/100;
