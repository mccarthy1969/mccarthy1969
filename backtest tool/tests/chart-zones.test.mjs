import test from 'node:test';
import assert from 'node:assert/strict';
import {displayZones} from '../public/zones.mjs';
const display=(zones,t=100)=>displayZones(zones,t);
const zone=(bottom,t,side='demand')=>({bottom,top:bottom+.05,t,side});
for(const side of ['demand','supply']){
 test(side+' retains all historical zones',()=>{
  const input=[zone(100,10,side),zone(101,20,side),zone(99,30,side),zone(102,40,side)];
  const result=display(input);
  assert.deepEqual(result.map(z=>[z.bottom,z.t,z.end]),[[100,10,null],[101,20,null],[99,30,null],[102,40,null]]);
  assert.deepEqual(display(input,25).map(z=>[z.bottom,z.end]),[[100,null],[101,null]]);
  assert.equal(input[0].end,undefined);
 });
 test(side+' keeps overlapping, touching, and interior zones',()=>{
  const input=[zone(100,10,side),zone(101,20,side),zone(100.03,30,side),zone(101.05,40,side),zone(100.5,50,side)];
  assert.deepEqual(display(input).map(z=>z.bottom),[100,101,100.03,101.05,100.5]);
 });
}
test('opposite sides may overlap and unordered input is chronological',()=>{
 assert.deepEqual(display([zone(101,20),zone(100,10),zone(100,10,'supply')]).map(z=>[z.side,z.bottom]),[['demand',100],['supply',100],['demand',101]]);
 assert.deepEqual(display([]),[]);
});
