import {test} from 'node:test';
import assert from 'node:assert/strict';
import {composeAcquisitionRuntime} from './acquisition-runtime';
import type {BoundSql} from './acquisition-repository';
const c={agency:'SYNTHETIC-a',location:'SYNTHETIC-l',actor:'SYNTHETIC-m'};
test('missing reviewer evidence permits bounded candidate research but refuses unresolved identity',async()=>{let calls=0;const sql:BoundSql={query:async<T>()=>[] as T[]};const runtime=composeAcquisitionRuntime(sql,{resolveProperty:async()=>{calls++;return {error:'unrecognized'};},fetchComps:async()=>{calls++;return null;}});await assert.rejects(runtime.comps(c,'SYNTHETIC property'),/Property identity unresolved/);assert.equal(calls,1);});
test('synthetic evidence cannot enter real provider path',async()=>{let calls=0;const sql:BoundSql={query:async<T>()=>[{bundle:{asset:'house',subject:{id:'SYNTHETIC-house'}}}] as T[]};const runtime=composeAcquisitionRuntime(sql,{resolveProperty:async()=>{calls++;return {error:'unrecognized'};},fetchComps:async()=>null});await assert.rejects(runtime.comps(c,'SYNTHETIC property'),/Invalid real property evidence/);assert.equal(calls,0);});
// SIMULATED provider-shaped fixtures only, no actual provider requests.
test('candidate research preserves unverified sale facts and coverage without returning value',async()=>{
 const sql:BoundSql={query:async<T>()=>[] as T[]};
 const runtime=composeAcquisitionRuntime(sql,{resolveProperty:async()=>({match:{matched:true,input:{},dm_property_id:'SIMULATED-house'},matchedAddress:'SIMULATED address',normalized:false}),fetchComps:async()=>({found:true,subject:{dm_property_id:'SIMULATED-house',sqft:1000,property_type:'House',lot_size:.2},comps:[{dm_property_id:'SIMULATED-comp',sale_price:200000,sale_date:'2026-06-01',sale_type:'Estimated Sales Price'}]} as unknown as import('./dealmachine').DmCompsResult)});
 await assert.rejects(runtime.comps(c,'SIMULATED address'),error=>{const e=error as import('./acquisition-analysis').AcquisitionReviewRequired;assert.match(e.message,/Candidate research/);assert.equal(e.details?.valueUsd,undefined);const rows=e.details?.candidateComps as {saleVerified:boolean;saleType:string}[];assert.equal(rows[0].saleVerified,false);assert.equal(rows[0].saleType,'Estimated Sales Price');return true;});
});
test('fresh changed comp size is rejected before provenance is refreshed',async()=>{
 const bundle={asset:'house',subject:{id:'SIMULATED-house',sqft:1000,propertyType:'House'},comps:[{id:'SIMULATED-comp',sqft:1000,propertyType:'House',salePrice:200000,saleDate:'2026-06-01',saleType:'Verified Market Sale',source:{provider:'DealMachine',synthetic:false,reference:'SIMULATED-proof'}}]};
 const sql:BoundSql={query:async<T>()=>[{bundle}] as T[]};const runtime=composeAcquisitionRuntime(sql,{resolveProperty:async()=>({match:{matched:true,input:{},dm_property_id:'SIMULATED-house'},matchedAddress:'SIMULATED address',normalized:false}),fetchComps:async()=>({subject:{dm_property_id:'SIMULATED-house',sqft:1000,property_type:'House'},comps:[{dm_property_id:'SIMULATED-comp',type:'sale',sqft:1500,property_type:'House',sale_price:200000,sale_date:'2026-06-01',sale_type:'Verified Market Sale'}]} as unknown as import('./dealmachine').DmCompsResult)});await assert.rejects(runtime.comps(c,'SIMULATED address'),/Comparable size\/type changed/);
});
