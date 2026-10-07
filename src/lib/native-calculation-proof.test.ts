import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {nativeCalculationProof} from './native-calculation-proof';
import type {NativeProofInput} from './native-calculation-proof';
import type {AcquisitionBundle} from './acquisition-bundle';
const source={provider:'SYNTHETIC source',reference:'SYNTHETIC-ref',retrievedAt:'2026-10-07T00:00:00Z',synthetic:true};
function fixture(asset:AcquisitionBundle['asset']='house',propertyId='SYNTHETIC-property-A'):NativeProofInput{
 const sales=[100000,120000,140000].map((salePrice,i)=>({id:`SYNTHETIC-comp-${i}`,salePrice,saleDate:'2026-06-01',saleType:'SYNTHETIC-recorded',distanceMiles:.2,saleVerified:true,source}));
 const income={unitCount:asset==='commercial_multifamily'?6:2,grossScheduledAnnualRent:20000,vacancyRate:.1,annualOperatingExpenses:6000,annualDebtService:5000,immediateCapitalWork:0,capRate:.1,rentRollReference:'SYNTHETIC-rent',operatingStatementReference:'SYNTHETIC-opex',occupancyReference:'SYNTHETIC-occupancy',capitalWorkReference:'SYNTHETIC-capital',sources:Object.fromEntries(['grossScheduledAnnualRent','vacancyRate','annualOperatingExpenses','annualDebtService','immediateCapitalWork','capRate'].map(k=>[k,source]))};
 let bundle:AcquisitionBundle;
 if(asset==='house')bundle={asset,subject:{id:propertyId,identityVerified:true,asset,sqft:1000,propertyType:'SYNTHETIC-house'},comps:sales.map(s=>({...s,sqft:1000,propertyType:'SYNTHETIC-house',renovatedComparable:false}))};
 else if(asset==='land'){const facts={id:propertyId,identityVerified:true,acres:1,zoning:'SYNTHETIC-R',legalAccess:'SYNTHETIC-road',utilities:'SYNTHETIC-utilities',floodStatus:'SYNTHETIC-clear',boundaryReference:'SYNTHETIC-boundary'};bundle={asset,subject:facts,comps:sales.map(s=>({...facts,...s}))};}
 else if(asset==='small_multifamily')bundle={asset,subject:{id:propertyId,identityVerified:true,units:2,sqft:1000},comps:sales.map(s=>({...s,sqft:1000,units:2,renovatedComparable:true})),income};
 else bundle={asset,subject:{id:propertyId,identityVerified:true,units:6},comps:[],income};
 return {synthetic:true,locationId:'SesCoVXlNu7qTSBol1gs',contactId:'SYNTHETIC-seller',propertyRecordId:'SYNTHETIC-record-'+propertyId,propertyId,analysisKey:'SYNTHETIC-analysis-'+propertyId,policyVersion:'SYNTHETIC-policy-v1',currentPolicyVersion:'SYNTHETIC-policy-v1',now:'2026-10-07T01:00:00Z',policyExpiresAt:'2026-10-08T01:00:00Z',held:false,bundle,policy:{approvalReference:'SYNTHETIC-approval',maxAgeDays:365,maxSourceAgeHours:24,radiusMiles:1,sizeTolerance:.2,minComps:3,verifiedSaleTypes:['SYNTHETIC-recorded'],maxIncomeSalesDifference:.2,crosscheckApprovalReference:'SYNTHETIC-crosscheck'}};
}
const call=(x:NativeProofInput)=>nativeCalculationProof({requestJson:JSON.stringify(x)});
it('standalone inputData/return artifact runs all four methods identically to local adapter',()=>{
 const artifact=readFileSync('../jarvis-acquisitions-draft/native-first/custom-code-synthetic-proof.js','utf8');
 expect(artifact).not.toMatch(/node:crypto|fetch\(|process\.env|console\./);
 const execute=new Function('inputData',artifact);
 for(const asset of ['house','land','small_multifamily','commercial_multifamily'] as const){const x=fixture(asset),out=call(x);expect(out.status).toBe('SYNTHETIC_PROOF_READY');expect(out.publicResult?.valueUsd).toBe(120000);expect(execute({requestJson:JSON.stringify(x)})).toEqual(out);}
});
it('two properties for one seller retain exact property and analysis identity',()=>{
 const a=call(fixture()),b=call(fixture('house','SYNTHETIC-property-B'));
 expect(a.publicResult?.propertyId).not.toBe(b.publicResult?.propertyId);expect(a.publicResult?.analysisKey).not.toBe(b.publicResult?.analysisKey);
 const wrong=fixture();wrong.propertyId='SYNTHETIC-other';expect(call(wrong).status).toBe('NEEDS_REVIEW');
});
it('fails closed for foreign location, real payload, held, expired or changed policy and malformed data',()=>{
 for(const mutate of [(x:NativeProofInput)=>{x.locationId='other';},(x:NativeProofInput)=>{Object.assign(x,{synthetic:false});},(x:NativeProofInput)=>{x.policyExpiresAt='2020-01-01';},(x:NativeProofInput)=>{x.currentPolicyVersion='changed';}]){const x=fixture();mutate(x);expect(call(x).status).toBe('NEEDS_REVIEW');}
 const x=fixture();x.held=true;expect(call(x).status).toBe('HELD');expect(nativeCalculationProof({requestJson:'bad'}).status).toBe('NEEDS_REVIEW');
});
it('ordinary market house does not pretend renovated condition; explicit ARV requires it',()=>{
 const x=fixture();expect(call(x).publicResult?.basis).toBe('house_verified_market_sales');x.houseBasis='renovated_arv';expect(call(x).status).toBe('NEEDS_REVIEW');
});
it('property-specific complete synthetic proposal match is not recorded authorization or delivery',()=>{
 const x=fixture(),terms={closingDate:'2026-11-01',depositUsd:1000,inspectionDays:10,assignmentAllowed:true,financing:'SYNTHETIC cash',sellerConcessionsUsd:0};
 x.proposal={packet:{propertyId:x.propertyId,recipientId:'SYNTHETIC-recipient',asset:'house',strategy:'wholesale',priceUsd:65000,terms,analysisId:x.analysisKey,analysisVersion:x.policyVersion},standing:{id:'SYNTHETIC-standing',version:'SYNTHETIC-standing-v1',approvedBy:'SYNTHETIC-owner',expiresAt:'2026-11-01T00:00:00Z',revoked:false,propertyId:x.propertyId,recipientId:'SYNTHETIC-recipient',asset:'house',strategy:'wholesale',minPriceUsd:60000,maxPriceUsd:70000,terms},approvedCeilingUsd:68000};
 const out=call(x);expect(out.proposalResult?.status).toBe('SYNTHETIC_POLICY_MATCH');expect(out.authorizationRecorded).toBe(false);expect(out.outboundEnabled).toBe(false);
 x.proposal.packet.priceUsd=69000;expect(call(x).proposalResult?.status).toBe('NEEDS_REVIEW');x.proposal.packet.priceUsd=65000;x.proposal.packet.recipientId='SYNTHETIC-wrong';expect(call(x).proposalResult?.status).toBe('NEEDS_REVIEW');
});
it('5+ safe source explanation excludes debt and private ceiling/policy packet',()=>{
 const out=call(fixture('commercial_multifamily'));expect(out.publicResult?.incomeExplanation?.noiUsd).toBe('12000.00');const text=JSON.stringify(out.publicResult);for(const key of ['annualDebtService','cashFlowUsd','dscr','approvedCeilingUsd','minPriceUsd','maxPriceUsd','targetProfitUsd'])expect(text).not.toContain(key);
});
