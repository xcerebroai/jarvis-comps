import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHouseValue, AcquisitionReviewRequired} from './acquisition-analysis';
import type {AcquisitionComp,AcquisitionPolicy,AcquisitionSubject} from './acquisition-analysis';
const now = new Date('2026-10-06T00:00:00Z');
const subject:AcquisitionSubject={id:'SYNTHETIC-house',asset:'house',sqft:1000,propertyType:'House',identityVerified:true};
const policy:AcquisitionPolicy={approvalReference:'SYNTHETIC-approved-policy',maxAgeDays:365,maxSourceAgeHours:168,radiusMiles:1,sizeTolerance:.2,minComps:3,verifiedSaleTypes:['Verified Market Sale']};
const fixtures=():AcquisitionComp[]=>[200000,210000,220000].map((p,i)=>({id:`SYNTHETIC-${i}`,salePrice:p,saleDate:'2026-06-01',saleType:'Verified Market Sale',sqft:1000,distanceMiles:.3,propertyType:'House',saleVerified:true,renovatedComparable:true,source:{provider:'SYNTHETIC fixture',reference:`SYNTHETIC-source-${i}`,retrievedAt:'2026-10-01T00:00:00Z',synthetic:true}}));
test('deterministic traced value remains internal synthetic review',()=>{
 const r=analyzeHouseValue(subject,fixtures(),policy,now,true);
 assert.equal(r.valueUsd,'210000.00'); assert.equal(r.sources.length,3); assert.equal(r.offerApproved,false); assert.equal(r.outboundEnabled,false);
});
test('two comps and missing approved policy are blocked',()=>{
 assert.throws(()=>analyzeHouseValue(subject,fixtures().slice(0,2),policy,now,true),AcquisitionReviewRequired);
 assert.throws(()=>analyzeHouseValue(subject,fixtures(),{...policy,approvalReference:''},now,true),AcquisitionReviewRequired);
});
test('estimated sale types are never accepted even if allowlisted',()=>{
 const rows=fixtures(); rows[0].saleType='Estimated Sales Price';
 assert.throws(()=>analyzeHouseValue(subject,rows,{...policy,verifiedSaleTypes:['Estimated Sales Price','Verified Market Sale']},now,true),AcquisitionReviewRequired);
});
test('finite facts, duplicate ids and condition verification required',()=>{
 for(const bad of [NaN,Infinity,-1]) {const rows=fixtures();rows[0].distanceMiles=bad;assert.throws(()=>analyzeHouseValue(subject,rows,policy,now,true));}
 const rows=fixtures();rows[1].id=rows[0].id;assert.throws(()=>analyzeHouseValue(subject,rows,policy,now,true));
 const condition=fixtures();condition[0].renovatedComparable=false;assert.throws(()=>analyzeHouseValue(subject,condition,policy,now,true));
});
test('land and multifamily never use house fallback',()=>{
 for(const asset of ['land','multifamily'] as const)assert.throws(()=>analyzeHouseValue({...subject,asset},fixtures(),policy,now,true));
});
test('source freshness, timezone, real provider and synthetic separation',()=>{
 for(const retrievedAt of ['2026-01-01T00:00:00Z','2027-01-01T00:00:00Z','2026-10-01T00:00:00']) {const rows=fixtures();rows[0].source.retrievedAt=retrievedAt;assert.throws(()=>analyzeHouseValue(subject,rows,policy,now,true));}
 assert.throws(()=>analyzeHouseValue(subject,fixtures(),policy,now,false));
});
