import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acquisitionHandler} from './acquisition-handler';
import type {AcquisitionRuntime} from './acquisition-handler';
const request=(body:unknown)=>new Request('https://example.invalid/api/acquisitions/analyses',{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});
function mock():AcquisitionRuntime {
 return {lookup:async()=>null,authenticate:async()=>({agency:'SYNTHETIC-agency',location:'SYNTHETIC-location',actor:'SYNTHETIC-actor'}),
 settings:async()=>({selected:true,policy:{approvalReference:'SYNTHETIC-policy',maxAgeDays:365,maxSourceAgeHours:24,radiusMiles:1,sizeTolerance:.2,minComps:3,verifiedSaleTypes:['Verified Market Sale']}}),
 comps:async()=>{throw new Error('SYNTHETIC provider failure');},persist:async()=>({id:'SYNTHETIC-analysis',version:'SYNTHETIC-v1',result:{status:'SYNTHETIC'}})};
}
test('unconnected route fails closed without reading a provider',async()=>{
 assert.equal((await acquisitionHandler(null)(request({address:'SYNTHETIC House',requestId:'SYNTHETIC-1'}))).status,503);
});
test('auth denied and unselected clients cannot call provider',async()=>{
 const r=mock();let calls=0;r.comps=async()=>{calls++;throw new Error('unexpected');};
 r.authenticate=async()=>null;assert.equal((await acquisitionHandler(r)(request({}))).status,401);
 r.authenticate=async()=>({agency:'SYNTHETIC',location:'SYNTHETIC',actor:'SYNTHETIC'});r.settings=async()=>null;
 assert.equal((await acquisitionHandler(r)(request({}))).status,403);assert.equal(calls,0);
});
test('caller tenant/policy/pricing fields are rejected',async()=>{
 const r=mock();assert.equal((await acquisitionHandler(r)(request({address:'SYNTHETIC House',requestId:'SYNTHETIC-1',location:'other'}))).status,400);
});
test('provider failure yields review with no credential or fabricated value',async()=>{
 const response=await acquisitionHandler(mock())(request({address:'SYNTHETIC House',requestId:'SYNTHETIC-1'}));
 assert.equal(response.status,502);const json=await response.json();assert.equal(json.status,'NEEDS_REVIEW');assert.equal(json.valueUsd,undefined);assert.equal(json.outboundEnabled,false);
});

test('persisted replay returns canonical analysis without provider query',async()=>{
 const r=mock();const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({address:'SYNTHETIC House'})));const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 r.lookup=async()=>({id:'SYNTHETIC-id',version:'SYNTHETIC-v1',requestDigest:digest,result:{status:'INTERNAL_REVIEW',valueUsd:'123',synthetic:true}});
 const response=await acquisitionHandler(r)(request({address:'SYNTHETIC House',requestId:'SYNTHETIC-1'}));assert.equal(response.status,200);assert.equal((await response.json()).valueUsd,'123');
 r.lookup=async()=>({id:'SYNTHETIC-id',version:'SYNTHETIC-v1',requestDigest:'changed',result:{}});assert.equal((await acquisitionHandler(r)(request({address:'SYNTHETIC House',requestId:'SYNTHETIC-1'}))).status,422);
});
test('missing evidence persists resumable review with next action and unchanged replay',async()=>{
 const r=mock();let stored:unknown;
 r.comps=async()=>{throw new (await import('./acquisition-analysis')).AcquisitionReviewRequired('Candidate research needs condition evidence',{propertyId:'SYNTHETIC-property',label:'SYNTHETIC UNVERIFIED CANDIDATES'});};
 r.persist=async(_c,_id,_digest,result)=>{stored=result;return {id:'SYNTHETIC-review',version:'SYNTHETIC-v1',result};};
 const response=await acquisitionHandler(r)(request({address:'SYNTHETIC House',requestId:'SYNTHETIC-review-1'}));assert.equal(response.status,422);const json=await response.json();assert.equal(json.analysisId,'SYNTHETIC-review');assert.equal(json.humanNotified,false);assert.equal(json.offerApproved,false);assert.equal((stored as {status:string}).status,'NEEDS_REVIEW');assert.match(json.reviewItems[0].nextAction,/reviewer verify/);
});
