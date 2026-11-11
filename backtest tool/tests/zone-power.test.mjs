import test from 'node:test';
import assert from 'node:assert/strict';
import {rateZonePower,zonePowerAt,activeZones} from '../public/zones.mjs';
for(const dir of [1,-1]){
 const zone={t:600,side:dir===1?'demand':'supply',bottom:dir===1?100:99.95,top:dir===1?100.05:100};
 const rows=[[100,100.1],[100.1,100.3],[100.3,100.3],[100.3,100.6],[100.6,100.4],[100.4,102]].map(([o,c],i)=>({t:300+i*60,o:100+dir*(o-100),c:100+dir*(c-100),h:999,l:0}));
 test('power uses initial body run and locks on opposite candle '+dir,()=>{
  const rated=rateZonePower(zone,rows);assert.ok(Math.abs(rated.power-.6)<1e-9);assert.equal(rated.powerConfirmedAt,600);
  assert.equal(zonePowerAt(rated,359).power,0);assert.ok(Math.abs(zonePowerAt(rated,420).power-.3)<1e-9);assert.equal(zonePowerAt(rated,599).confirmed,false);assert.equal(zonePowerAt(rated,600).confirmed,true);
  assert.deepEqual(rateZonePower(zone,rows.slice(0,5)),rated);
 });
 test('power excludes unfinished candles and does not bridge missing minutes '+dir,()=>{
  assert.ok(Math.abs(rateZonePower(zone,rows,419).power-.1)<1e-9);
  assert.ok(Math.abs(rateZonePower(zone,[rows[0],rows[2],rows[3]]).power-.1)<1e-9);
  assert.equal(rateZonePower(zone,[]).power,0);
 });
 test('all confirmed zones including overlaps remain active '+dir,()=>{
  const newer={...zone,t:660};assert.deepEqual(activeZones([zone,newer],659),[zone]);assert.deepEqual(activeZones([zone,newer],1000),[zone,newer]);
 });
}
import {validateConfig} from '../lib/strategy.mjs';
test('zone power timeframe defaults to 1m and accepts only 1m or 5m',()=>{
 assert.equal(validateConfig({}).zonePowerTimeframe,'1m');assert.equal(validateConfig({zonePowerTimeframe:'5m'}).zonePowerTimeframe,'5m');
 for(const value of [null,'15m',300,true])assert.throws(()=>validateConfig({zonePowerTimeframe:value}));
});
for(const dir of [1,-1])test('5m power uses completed session-aligned bodies and ignores internal 1m reversal '+dir,()=>{
 const zone={t:600,side:dir===1?'demand':'supply',bottom:dir===1?100:99.95,top:dir===1?100.05:100};
 const specs=[[100,100.1],[100.1,100.05],[100.05,100.2],[100.2,100.3],[100.3,100.5]];
 for(let i=0;i<5;i++)specs.push([100.5+i*.1,100.6+i*.1]);
 for(let i=0;i<5;i++)specs.push([101-i*.1,100.9-i*.1]);
 const rows=specs.map(([o,c],i)=>({t:300+i*60,o:100+dir*(o-100),c:100+dir*(c-100)}));
 const one=rateZonePower(zone,rows,Infinity,'1m'),five=rateZonePower(zone,rows,Infinity,'5m');
 assert.ok(Math.abs(one.power-.1)<1e-8);assert.equal(five.power,1);assert.equal(five.powerConfirmedAt,1200);assert.equal(five.powerTimeframe,'5m');
 assert.equal(rateZonePower(zone,rows,599,'5m').power,0);assert.equal(rateZonePower(zone,rows,600,'5m').power,.5);
 assert.equal(zonePowerAt(five,899).power,.5);assert.equal(zonePowerAt(five,900).power,1);assert.equal(zonePowerAt(five,1199).confirmed,false);
 const missing=rows.filter(b=>b.t!==720);assert.equal(rateZonePower(zone,missing,Infinity,'5m').power,.5);
 const shifted=rateZonePower({...zone,t:zone.t+120},rows.map(b=>({...b,t:b.t+120})),Infinity,'5m');assert.equal(shifted.power,1);assert.equal(shifted.powerConfirmedAt,1320);
});
