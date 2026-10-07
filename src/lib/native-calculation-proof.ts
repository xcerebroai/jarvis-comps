/** Offline/standalone synthetic proof only. No HTTP, secrets, storage or tenant authentication. */
import {analyzeBundle} from './acquisition-bundle';
import {analyzeHouseValue} from './acquisition-analysis';
import type {AcquisitionPolicy} from './acquisition-analysis';
import type {AcquisitionBundle} from './acquisition-bundle';
import {validPacket,withinStandingPolicy} from './acquisition-packet-validation';
import type {StandingPolicy,Packet} from './acquisition-packet-validation';
export type NativeProofInput={synthetic:true;locationId:string;contactId:string;propertyRecordId:string;propertyId:string;analysisKey:string;policyVersion:string;currentPolicyVersion:string;now:string;policyExpiresAt:string;held:boolean;bundle:AcquisitionBundle;policy:AcquisitionPolicy&{maxIncomeSalesDifference?:number;crosscheckApprovalReference?:string};houseBasis?:'comparable_market_value'|'renovated_arv';proposal?:{packet:Packet;standing:StandingPolicy;approvedCeilingUsd:number}};
const LOCATION='SesCoVXlNu7qTSBol1gs';
export function nativeCalculationProof(inputData:{requestJson:unknown}){
 const fail=(status:string,reason:string)=>({status,reason,publicResult:null,proposalResult:null,synthetic:true,label:'SYNTHETIC — TEST ONLY',outboundEnabled:false,authorizationRecorded:false});
 try{
  if(typeof inputData.requestJson!=='string'||inputData.requestJson.length>250000)return fail('NEEDS_REVIEW','Invalid bounded proof input');
  const x=JSON.parse(inputData.requestJson) as NativeProofInput,now=new Date(x.now);
  if(x.synthetic!==true)return fail('NEEDS_REVIEW','Real execution is not enabled by this proof');
  if(x.locationId!==LOCATION||![x.contactId,x.propertyRecordId,x.propertyId,x.analysisKey,x.policyVersion].every(k=>typeof k==='string'&&k.startsWith('SYNTHETIC-'))||x.bundle?.subject?.id!==x.propertyId)return fail('NEEDS_REVIEW','Exact synthetic property/context identifiers required');
  if(!Number.isFinite(now.getTime())||Date.parse(x.policyExpiresAt)<=now.getTime()||!Number.isFinite(Date.parse(x.policyExpiresAt))||x.policyVersion!==x.currentPolicyVersion||typeof x.held!=='boolean')return fail('NEEDS_REVIEW','Current explicit policy/clock/hold required');
  if(x.held)return fail('HELD','Shared stop or takeover');
  // Reuse the source calculators; ordinary house market value does not require renovated comparability.
  const result=x.bundle.asset==='house'?analyzeHouseValue(x.bundle.subject,x.bundle.comps,x.policy,now,true,x.houseBasis??'comparable_market_value'):analyzeBundle(x.bundle,x.policy,now,true);
  if(result.status==='NEEDS_REVIEW')return fail('NEEDS_REVIEW','Income/sales difference outside approved sensitivity');
  const used='usedCompIds' in result?result.usedCompIds:[],excluded='excluded' in result?result.excluded:[];
  const valueUsd=Number('valueUsd' in result?result.valueUsd:'salesValueUsd' in result?result.salesValueUsd:result.netCapitalAdjustedValueUsd);
  const publicResult={status:'CALCULATION_READY',propertyId:x.propertyId,propertyRecordId:x.propertyRecordId,analysisKey:x.analysisKey,policyVersion:x.policyVersion,asset:x.bundle.asset,basis:result.method,valueUsd,usedCompIds:used,compCount:used.length,excluded,incomeExplanation:result.method==='commercial_multifamily_noi_cap'&&'noiUsd' in result?{noiUsd:result.noiUsd,capRate:result.calculation.capRate,incomeValueUsd:result.incomeValueUsd,capitalWorkUsd:result.calculation.immediateCapitalWork,netCapitalAdjustedValueUsd:result.netCapitalAdjustedValueUsd,sources:Object.fromEntries(['grossScheduledAnnualRent','vacancyRate','annualOperatingExpenses','capRate','immediateCapitalWork'].map(k=>[k,result.sources[k]]))}:null,synthetic:true,label:'SYNTHETIC — TEST ONLY',outboundEnabled:false};
  let proposalResult:{status:string;packet:Packet|null}={status:'NOT_REQUESTED',packet:null};
  if(x.proposal){const {packet,standing,approvedCeilingUsd}=x.proposal;
   const okay=validPacket(packet)&&packet.propertyId===x.propertyId&&packet.asset===x.bundle.asset&&packet.analysisId===x.analysisKey&&packet.analysisVersion===x.policyVersion&&withinStandingPolicy(packet,standing,now.getTime())&&standing.terms.closingDate>=x.now.slice(0,10)&&Number.isFinite(approvedCeilingUsd)&&approvedCeilingUsd>0&&packet.priceUsd<=approvedCeilingUsd;
   proposalResult={status:okay?'SYNTHETIC_POLICY_MATCH':'NEEDS_REVIEW',packet:okay?packet:null};
  }
  return {status:'SYNTHETIC_PROOF_READY',publicResult,proposalResult,synthetic:true,outboundEnabled:false,authorizationRecorded:false};
 }catch{return fail('NEEDS_REVIEW','Malformed or incomplete synthetic source/policy facts');}
}
