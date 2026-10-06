import {createHash} from 'node:crypto';
import {packetDigest,validPacket,withinStandingPolicy} from './headless-offer-policy';
import type {Packet,StandingPolicy} from './headless-offer-policy';
import {policyDigest,policyValid,JARVIS_BUILD_LOCATION} from './headless-acquisitions';
import type {HousePolicy,Sql,Tenant} from './headless-acquisitions';
export function headlessProposalHandler(sql:Sql,enabled:boolean,clock=()=>new Date()){
 return async(request:Request)=>{
  const reply=(body:unknown,status:number)=>{const b=body as Record<string,unknown>;const publicResult={status:b.status??'UNAVAILABLE',proposal:b.proposal??null,missing:b.missing??[],nonbindingOnly:true,deliveryInstalled:false,outboundEnabled:false};return Response.json({...b,publicResult},{status,headers:{'Cache-Control':'no-store'}});};
  if(!enabled)return reply({status:'NEEDS_REVIEW',missing:['Proposal service disabled'],outboundEnabled:false},503);
  try{
   const header=request.headers.get('authorization');if(!header?.startsWith('Bearer '))return reply({error:'Unauthorized'},401);
   const token=header.slice(7);if(token.length<32||token.length>512||/\s/.test(token))return reply({error:'Unauthorized'},401);
   const hash=createHash('sha256').update(token).digest('hex');
   const tenants=await sql.query<Tenant&{policy:HousePolicy}>(`SELECT c.agency,c.location,c.actor,s.policy FROM "AcquisitionCredential" c JOIN "AcquisitionMembership" m ON m.agency=c.agency AND m.location=c.location AND m.actor=c.actor JOIN "AcquisitionSettings" s ON s.agency=c.agency AND s.location=c.location WHERE c."tokenHash"=$1 AND c.location=$2 AND c.revoked=FALSE AND c."expiresAt">CURRENT_TIMESTAMP AND 'acquisitions:propose'=ANY(c.scopes) AND m.enabled=TRUE AND m.role='analysis_machine' AND s.selected=TRUE`,[hash,JARVIS_BUILD_LOCATION]);
   const c=tenants[0],now=clock();if(!c||c.location!==JARVIS_BUILD_LOCATION)return reply({error:'Unauthorized'},401);
   if(!policyValid(c.policy,now))return reply({status:'NEEDS_REVIEW',missing:['Current client policy required'],outboundEnabled:false},422);
   let b:unknown;try{b=await request.json();}catch{return reply({error:'Invalid request'},400);}
   if(!b||typeof b!=='object'||Array.isArray(b))return reply({error:'Invalid request'},400);
   const body=b as Record<string,unknown>;
   if(Object.keys(body).some(k=>!['analysisId','analysisVersion','priceUsd'].includes(k))||typeof body.analysisId!=='string'||typeof body.analysisVersion!=='string')return reply({error:'Invalid request'},400);
   const rows=await sql.query<{id:string;version:string;result:{status:string;asset:string;property:{id:string};source:{retrievedAt:string;policyDigest:string};offer:{status:string;maxPriceUsd:number|null}}}>(`SELECT id,version,result FROM "AcquisitionAnalysis" WHERE agency=$1 AND location=$2 AND id=$3`,[c.agency,c.location,body.analysisId]);
   const a=rows[0],s=c.policy.standingPolicy as (StandingPolicy&{initialPriceUsd?:number})|undefined;
   if(!a||a.version!==body.analysisVersion||a.result.status!=='COMPS_READY'||a.result.source.policyDigest!==policyDigest(c.policy)||!Number.isFinite(Date.parse(a.result.source.retrievedAt))||Date.parse(a.result.source.retrievedAt)>now.getTime()||(now.getTime()-Date.parse(a.result.source.retrievedAt))/3600000>c.policy.maxSourceAgeHours||!s)return reply({status:'NEEDS_REVIEW',missing:['Current analysis and complete configured standing policy required'],outboundEnabled:false},422);
   const packet:Packet={propertyId:a.result.property.id,recipientId:s.recipientId,asset:a.result.asset,strategy:s.strategy,priceUsd:(body.priceUsd??s.initialPriceUsd) as number,terms:s.terms,analysisId:a.id,analysisVersion:a.version};
   if(!validPacket(packet)||!withinStandingPolicy(packet,s,now.getTime())||s.terms.closingDate<now.toISOString().slice(0,10)||a.result.offer.status!=='LIMIT_READY'||a.result.offer.maxPriceUsd===null||packet.priceUsd>a.result.offer.maxPriceUsd)return reply({status:'NEEDS_REVIEW',missing:['Exact proposal exceeds or lacks property/recipient/terms/price authorization'],outboundEnabled:false},422);
   const expiresAt=new Date(Math.min(Date.parse(s.expiresAt),Date.parse(c.policy.expiresAt),Date.parse(a.result.source.retrievedAt)+c.policy.maxSourceAgeHours*3600000)).toISOString();
   const digest=packetDigest(packet),id=createHash('sha256').update(JSON.stringify({agency:c.agency,location:c.location,digest,policyId:s.id,policyVersion:s.version})).digest('hex');
   // Atomic readiness reservation: no sender. Approver is a trusted tenant/GHL
   // identity membership, not a customer-dashboard User prerequisite.
   const saved=await sql.query<{id:string}>(`INSERT INTO "AcquisitionReview" (id,agency,location,"humanActor","packetDigest","analysisId","analysisVersion","expiresAt","standingPolicyId","standingPolicyVersion") SELECT $1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9,$10 WHERE $8::timestamptz>CURRENT_TIMESTAMP AND EXISTS (SELECT 1 FROM "AcquisitionMembership" approver WHERE approver.agency=$2 AND approver.location=$3 AND approver.actor=$4 AND approver.enabled=TRUE AND approver.role IN('owner_admin','human_reviewer','client_owner')) AND EXISTS (SELECT 1 FROM "AcquisitionSettings" st JOIN "AcquisitionCredential" cr ON cr.agency=st.agency AND cr.location=st.location JOIN "AcquisitionMembership" caller ON caller.agency=cr.agency AND caller.location=cr.location AND caller.actor=cr.actor WHERE st.agency=$2 AND st.location=$3 AND st.selected=TRUE AND st.policy=$11::jsonb AND cr."tokenHash"=$12 AND cr.revoked=FALSE AND cr."expiresAt">CURRENT_TIMESTAMP AND 'acquisitions:propose'=ANY(cr.scopes) AND caller.enabled=TRUE AND caller.role='analysis_machine') AND EXISTS (SELECT 1 FROM "AcquisitionAnalysis" a WHERE a.agency=$2 AND a.location=$3 AND a.id=$6 AND a.version=$7 AND a.result->>'propertyId'=$13 AND NOT EXISTS (SELECT 1 FROM "AcquisitionHold" h WHERE h.agency=a.agency AND h.location=a.location AND h."propertyId"=$13) AND NOT EXISTS (SELECT 1 FROM "AcquisitionAnalysis" newer WHERE newer.agency=a.agency AND newer.location=a.location AND newer.result->>'propertyId'=$13 AND newer.sequence>a.sequence)) ON CONFLICT(id) DO UPDATE SET id="AcquisitionReview".id WHERE "AcquisitionReview"."usedAt" IS NULL AND "AcquisitionReview".revoked=FALSE AND "AcquisitionReview"."expiresAt">CURRENT_TIMESTAMP RETURNING id`,[id,c.agency,c.location,s.approvedBy,digest,a.id,a.version,expiresAt,s.id,s.version,JSON.stringify(c.policy),hash,packet.propertyId]);
   if(!saved[0])return reply({status:'NEEDS_REVIEW',missing:['Approval membership, analysis, policy or hold changed'],outboundEnabled:false},422);
   return reply({status:'PROPOSAL_AUTHORIZED',proposal:packet,authorizationId:saved[0].id,policyVersion:s.version,expiresAt,nonbindingOnly:true,deliveryInstalled:false,outboundEnabled:false},200);
  }catch{return reply({status:'NEEDS_REVIEW',missing:['Proposal authorization unavailable'],outboundEnabled:false},503);}
 };
}
