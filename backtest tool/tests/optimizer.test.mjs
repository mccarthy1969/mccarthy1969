import test from 'node:test';import assert from 'node:assert/strict';
import {validateSearch,assertCoverage,stats,resultStats,makeCandidate,ranking,optimize,exhaustiveCandidates,combinationCount,runtimeEstimate} from '../lib/optimizer.mjs';
import {tradingDay} from '../lib/calendar.mjs';
const input={dataset:'spy',startYear:2022,years:4,budget:6,minEntries:10,seed:42,stress:true,space:{minRR:[.5,1,1.5,2],clearPath:[false,true]}};
test('search validation freezes execution and rejects unsafe paths and invalid settings',()=>{const s=validateSearch(input);assert.equal(s.baseline.shares,100);for(const extra of [{budget:501},{years:2},{minEntries:0},{space:{shares:[100,1000]}},{space:{'__proto__.bad':[1]}},{space:{stackedCandleMarginCents:[1.5]}}])assert.throws(()=>validateSearch({...input,...extra}));});
test('complete calendar coverage is required per year',()=>{const spec=validateSearch(input),days=[];for(let t=Date.UTC(2022,0,1);t<Date.UTC(2026,0,1);t+=86400000){const d=new Date(t).toISOString().slice(0,10);if(tradingDay(d))days.push(d);}assert.doesNotThrow(()=>assertCoverage(days,spec));assert.throws(()=>assertCoverage(days.filter(d=>!d.startsWith('2024')),spec),/Incomplete data for 2024/);});
test('annual minimum cannot be satisfied by concentrating entries into one year',()=>{const spec=validateSearch(input),records=[{day:'2022-02-01',trades:Array.from({length:40},()=>({pnl:1,exitTime:1}))}];const r=resultStats(records,spec);assert.equal(r.total.entries,40);assert.equal(r.eligible,false);assert.equal(r.trainEligible,false);});
test('partial exits count once and excluded trades do not improve results',()=>{const s=stats([{pnl:20,exitTime:1},{pnl:-10,exitTime:2},{pnl:999,excluded:true}]);assert.equal(s.entries,2);assert.equal(s.average,5);assert.equal(s.withoutBest,-10);assert.equal(s.maxDrawdown,-10);});
test('candidate generation is repeatable and leaves baseline untouched',()=>{const spec=validateSearch(input),a=makeCandidate(spec,1,[]),b=makeCandidate(spec,1,[]);assert.deepEqual(a,b);assert.equal(spec.baseline.minRR,1);assert.equal(a.shares,spec.baseline.shares);});
test('shortlist is frozen before validation; holdout never affects selection; checkpoint resumes without replay',async()=>{
 const spec=validateSearch(input),state={spec,phase:'search',status:'running',candidates:[]},days=['2022-06-01','2023-06-01','2024-06-01','2025-06-01'];let phase='search',calls=0,checkpoint,firstIds;
 const evaluator=async(day,c)=>{calls++;if(!day.startsWith('2022')&&!day.startsWith('2023')){assert.equal(phase,'validation');firstIds??=[...state.shortlist];}return {trades:Array.from({length:10},(_,i)=>({pnl:day.startsWith('2025')?-1000*c.minRR:c.minRR,exitTime:i})),quality:{}};};
 const save=s=>{phase=s.phase;checkpoint=structuredClone(s);};await optimize(state,days,evaluator,save,()=>{});assert.equal(state.status,'complete');assert.deepEqual(state.shortlist,firstIds);assert.equal(state.candidates[0].stats.eligible,true);assert.ok(state.candidates[0].stats.holdout.average<0);assert.deepEqual(state.shortlist,ranking(state.candidates).slice(0,5).map(c=>c.index));const before=calls;await optimize(checkpoint,days,evaluator,save,()=>{});assert.equal(calls,before);
});
test('interrupted search resumes at next session and preserves baseline',async()=>{
 const spec=validateSearch({...input,budget:2,stress:false}),days=['2022-06-01','2023-06-01','2024-06-01','2025-06-01'],state={spec,phase:'search',candidates:[]};let checkpoint,calls=[];
 const evaluate=async(day,c)=>{calls.push(JSON.stringify(c)+':'+day);return {trades:[],quality:{}};};
 await assert.rejects(optimize(state,days,evaluate,s=>{checkpoint=structuredClone(s);if(s.candidates[0].records.length===1)throw Error('pause');},()=>{}),/pause/);const first=calls[0];await optimize(checkpoint,days,evaluate,()=>{},()=>{});assert.equal(calls.filter(c=>c===first).length,1);assert.equal(checkpoint.status,'complete');assert.deepEqual(checkpoint.candidates[0].config,spec.baseline);
});

test('every chosen exit plan gets a baseline-entry trial before random search',()=>{
 const plans=[{name:'Fixed 20 cents',exits:[{type:'cents',cents:20,percent:100}]},{name:'Scale and trail',exits:[{type:'cents',cents:30,percent:80},{type:'noLimit',percent:20,moveStop:{type:'trailing',amount:.2}}]}];
 const spec=validateSearch({...input,budget:3,space:{exitStrategy:plans,minRR:[.5,2]}});const candidates=[];for(let i=0;i<3;i++){const config=makeCandidate(spec,i,candidates);candidates.push({config});assert.equal(config.minRR,spec.baseline.minRR);assert.equal(config.shares,spec.baseline.shares);}
 assert.deepEqual(candidates.slice(1).map(c=>c.config.exitStrategy),plans);assert.equal(spec.baseline.exitStrategy,null);
 assert.throws(()=>validateSearch({...input,budget:2,space:{exitStrategy:plans}}),/baseline plus each selected/);
});

test('exhaustive enumerates the complete unique Cartesian product plus baseline',()=>{
 const spec=validateSearch({...input,mode:'exhaustive',budget:2,space:{minRR:[.5,2,2],clearPath:[false,true]}}),r=exhaustiveCandidates(spec);assert.equal(combinationCount(spec.space),4);assert.equal(r.candidates.length,5);assert.equal(r.invalid,0);const grid=r.candidates.slice(1).map(c=>c.minRR+':'+c.clearPath);assert.deepEqual(grid,['0.5:false','0.5:true','2:false','2:true']);assert.equal(new Set(r.candidates.map(c=>JSON.stringify(c))).size,5);
 assert.throws(()=>validateSearch({...input,mode:'exhaustive',space:{minRR:Array.from({length:30},(_,i)=>i),minZonePower:Array.from({length:30},(_,i)=>i),cooldownMinutes:Array.from({length:30},(_,i)=>i)}}),/20,000/);
});
test('exhaustive skips invalid exit percentage combinations without truncation',()=>{
 const config={exitStrategy:{name:'Two',exits:[{type:'cents',cents:10,percent:50},{type:'cents',cents:20,percent:50}]}},spec=validateSearch({...input,mode:'exhaustive',config,space:{'exitStrategy.exits.0.percent':[20,50,80],'exitStrategy.exits.1.percent':[20,50,80]}});const r=exhaustiveCandidates(spec);assert.equal(r.invalid,6);assert.equal(r.candidates.length,3);assert.ok(r.candidates.every(c=>c.exitStrategy.exits.reduce((n,e)=>n+e.percent,0)===100));
});
test('exhaustive workflow evaluates every valid grid candidate regardless of sampled budget',async()=>{
 const spec=validateSearch({...input,mode:'exhaustive',budget:2,stress:false,space:{minRR:[.5,1,2],clearPath:[false,true]}}),state={spec,phase:'search',candidates:[]},seen=new Set();await optimize(state,['2022-01-03','2023-01-03','2024-01-03','2025-01-03'],async(day,c)=>{if(day.startsWith('2022'))seen.add(c.minRR+':'+c.clearPath);return {trades:[],quality:{}};},()=>{},()=>{});assert.equal(seen.size,6);assert.equal(state.candidates.length,6);assert.equal(state.spec.budget,6);
});
test('runtime projection includes training, frozen finalists, and optional stress',()=>{
 const spec=validateSearch({...input,budget:10}),days=['2022-01-03','2023-01-03','2024-01-03','2025-01-03'];const r=runtimeEstimate(spec,days,100);assert.equal(r.sessions,44);assert.equal(r.seconds,4.4);assert.equal(runtimeEstimate({...spec,stress:false},days,100).sessions,32);
});

test('exhaustive resume completes all combinations without replaying completed sessions',async()=>{
 const spec=validateSearch({...input,mode:'exhaustive',stress:false,space:{minRR:[.5,1,2]}}),days=['2022-01-03','2023-01-03','2024-01-03','2025-01-03'],state={spec,phase:'search',candidates:[]};let snapshot,calls=[];
 const evaluate=async(day,c)=>{calls.push(c.minRR+':'+day);return {trades:[],quality:{}};};
 await assert.rejects(optimize(state,days,evaluate,s=>{snapshot=structuredClone(s);if(s.candidates[0].records.length===1)throw Error('pause');},()=>{}),/pause/);await optimize(snapshot,days,evaluate,()=>{},()=>{});assert.equal(snapshot.candidates.length,3);assert.equal(calls.filter(c=>c==='1:2022-01-03').length,1);assert.equal(snapshot.exhaustivePlan,undefined);
});
