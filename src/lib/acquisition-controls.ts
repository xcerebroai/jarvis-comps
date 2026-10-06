import {createHash,randomUUID} from 'node:crypto';
import {AcquisitionRepository} from './acquisition-repository';
import type {BoundSql} from './acquisition-repository';
import {credentialOriginAllowed,JARVIS_PREMIUM_LOCATION} from './acquisition-issuance';
import {analyzeBundle} from './acquisition-bundle';
import type {AcquisitionBundle} from './acquisition-bundle';
import type {AcquisitionPolicy} from './acquisition-analysis';
export type Terms={closingDate:string;depositUsd:number;inspectionDays:number;assignmentAllowed:boolean;financing:string;sellerConcessionsUsd:number};
export type Packet={propertyId:string;recipientId:string;asset:string;strategy:string;priceUsd:number;terms:Terms;analysisId:string;analysisVersion:string};
export type StandingPolicy={id:string;version:string;approvedBy:string;expiresAt:string;revoked:boolean;propertyId:string;recipientId:string;asset:string;strategy:string;minPriceUsd:number;maxPriceUsd:number;terms:Terms};
const object=(x:unknown):x is Record<string,unknown>=>Boolean(x&&typeof x==='object'&&!Array.isArray(x));
const exact=(x:Record<string,unknown>,keys:string[])=>Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const text=(x:unknown):x is string=>typeof x==='string'&&x.trim().length>0&&x.length<=200;
const money=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&Number.isSafeInteger(Math.round(x*100))&&Math.abs(x*100-Math.round(x*100))<1e-6;
export function validTerms(x:unknown):x is Terms{return object(x)&&exact(x,['closingDate','depositUsd','inspectionDays','assignmentAllowed','financing','sellerConcessionsUsd'])&&typeof x.closingDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.closingDate)&&Number.isFinite(Date.parse(x.closingDate))&&new Date(x.closingDate).toISOString().slice(0,10)===x.closingDate&&money(x.depositUsd)&&Number.isInteger(x.inspectionDays)&&Number(x.inspectionDays)>=0&&typeof x.assignmentAllowed==='boolean'&&text(x.financing)&&money(x.sellerConcessionsUsd);}
export function validPacket(x:unknown):x is Packet{return object(x)&&exact(x,['propertyId','recipientId','asset','strategy','priceUsd','terms','analysisId','analysisVersion'])&&['propertyId','recipientId','analysisId','analysisVersion'].every(k=>text(x[k]))&&['house','land','small_multifamily','commercial_multifamily'].includes(String(x.asset))&&['wholesale','flip','rental','creative'].includes(String(x.strategy))&&money(x.priceUsd)&&x.priceUsd>0&&validTerms(x.terms);}
export function packetDigest(p:Packet){return createHash('sha256').update(JSON.stringify({propertyId:p.propertyId,recipientId:p.recipientId,asset:p.asset,strategy:p.strategy,priceUsd:p.priceUsd,terms:{closingDate:p.terms.closingDate,depositUsd:p.terms.depositUsd,inspectionDays:p.terms.inspectionDays,assignmentAllowed:p.terms.assignmentAllowed,financing:p.terms.financing,sellerConcessionsUsd:p.terms.sellerConcessionsUsd},analysisId:p.analysisId,analysisVersion:p.analysisVersion})).digest('hex');}
export function withinStandingPolicy(p:Packet,s:StandingPolicy,now=Date.now()){
 return validPacket(p)&&s.revoked===false&&text(s.id)&&text(s.version)&&text(s.approvedBy)&&Number.isFinite(Date.parse(s.expiresAt))&&Date.parse(s.expiresAt)>now&&money(s.minPriceUsd)&&money(s.maxPriceUsd)&&s.minPriceUsd>0&&s.minPriceUsd<=s.maxPriceUsd&&validTerms(s.terms)&&['propertyId','recipientId','asset','strategy'].every(k=>p[k as keyof Packet]===s[k as keyof StandingPolicy])&&p.priceUsd>=s.minPriceUsd&&p.priceUsd<=s.maxPriceUsd&&Object.keys(p.terms).every(k=>p.terms[k as keyof Terms]===s.terms[k as keyof Terms]);
}
type User={id:string;entitlement:string};
export function controlsHandler(sql:BoundSql,session:()=>Promise<User|null>,enabled:boolean){
 const repo=new AcquisitionRepository(sql);
 return async(request:Request)=>{
  const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  if(!enabled)return reply({error:'Acquisition controls disabled'},503);
  if(!credentialOriginAllowed(request.headers.get('origin')))return reply({error:'Origin denied'},403);
  const user=await session();if(!user||user.entitlement!=='active')return reply({error:'Active session required'},401);
  try{
   const b:unknown=await request.json();if(!object(b)||!exact(b,['agency','action','payload'])||!text(b.agency)||!text(b.action)||!object(b.payload))return reply({error:'Invalid request'},400);
   const c={agency:b.agency,location:JARVIS_PREMIUM_LOCATION,actor:user.id};
   const members=await sql.query<{role:string}>(`SELECT m.role FROM "AcquisitionMembership" m JOIN "AcquisitionSettings" s ON s.agency=m.agency AND s.location=m.location WHERE m.agency=$1 AND m.location=$2 AND m.actor=$3 AND m.enabled=TRUE AND s.selected=TRUE`,[c.agency,c.location,c.actor]);
   const role=members[0]?.role;if(!role)return reply({error:'Approved selected membership required'},403);
   if(b.action==='settings'){
    if(role!=='owner_admin')return reply({error:'Owner membership required'},403);
    if(!exact(b.payload,['policy'])||!object(b.payload.policy))return reply({error:'Explicit policy required'},400);
    const p=b.payload.policy as unknown as AcquisitionPolicy;
    if(!text(p.approvalReference)||!Number.isFinite(p.maxAgeDays)||p.maxAgeDays<=0||!Number.isFinite(p.maxSourceAgeHours)||p.maxSourceAgeHours<=0||!Number.isFinite(p.radiusMiles)||p.radiusMiles<=0||p.radiusMiles>1||!Number.isFinite(p.sizeTolerance)||p.sizeTolerance<0||p.sizeTolerance>.30||!Number.isInteger(p.minComps)||p.minComps<3||!Array.isArray(p.verifiedSaleTypes)||!p.verifiedSaleTypes.length||!p.verifiedSaleTypes.every(text)||p.maxAgeDays>365)return reply({error:'Approved policy and supported coverage required'},422);
    const changed=await sql.query(`UPDATE "AcquisitionSettings" s SET policy=$4::jsonb WHERE s.agency=$1 AND s.location=$2 AND s.selected=TRUE AND EXISTS(SELECT 1 FROM "AcquisitionMembership" m WHERE m.agency=s.agency AND m.location=s.location AND m.actor=$3 AND m.enabled=TRUE AND m.role='owner_admin') RETURNING agency`,[c.agency,c.location,c.actor,JSON.stringify(p)]);if(!changed.length)return reply({error:'Authorization changed; nothing saved'},403);return reply({saved:true,outboundEnabled:false});
   }
   if(role!=='human_reviewer')return reply({error:'Human reviewer membership required'},403);
   if(b.action==='evidence'){
    const e=b.payload;if(!exact(e,['address','bundle','reviewReference','expiresAt'])||!text(e.address)||!text(e.reviewReference)||!text(e.expiresAt)||Date.parse(e.expiresAt)<=Date.now()||!Number.isFinite(Date.parse(e.expiresAt))||!object(e.bundle))return reply({error:'Explicit expiring evidence required'},400);
    const settings=await repo.settings(c);if(!settings?.policy)return reply({error:'Approved policy missing'},422);
    const bundle=e.bundle as unknown as AcquisitionBundle;analyzeBundle(bundle,settings.policy as AcquisitionPolicy,new Date(),false);
    const changed=await sql.query(`INSERT INTO "AcquisitionEvidence" (agency,location,"normalizedAddress",bundle,"reviewedBy","reviewReference","expiresAt") SELECT $1,$2,$3,$4::jsonb,$5,$6,$7::timestamptz WHERE EXISTS(SELECT 1 FROM "AcquisitionMembership" m JOIN "AcquisitionSettings" s ON s.agency=m.agency AND s.location=m.location WHERE m.agency=$1 AND m.location=$2 AND m.actor=$5 AND m.enabled=TRUE AND m.role='human_reviewer' AND s.selected=TRUE) ON CONFLICT(agency,location,"normalizedAddress") DO UPDATE SET bundle=EXCLUDED.bundle,"reviewedBy"=EXCLUDED."reviewedBy","reviewReference"=EXCLUDED."reviewReference","reviewedAt"=CURRENT_TIMESTAMP,"expiresAt"=EXCLUDED."expiresAt",revoked=FALSE RETURNING agency`,[c.agency,c.location,e.address.trim().toLowerCase(),JSON.stringify(bundle),c.actor,e.reviewReference,e.expiresAt]);if(!changed.length)return reply({error:'Authorization changed; nothing saved'},403);return reply({saved:true,outboundEnabled:false});
   }
   if(b.action==='revoke-policy'){
    if(!exact(b.payload,['id','version'])||!text(b.payload.id)||!text(b.payload.version))return reply({error:'Exact policy identity required'},400);
    const changed=await sql.query(`UPDATE "AcquisitionSettings" s SET "offerPolicy"=jsonb_set(s."offerPolicy",'{revoked}','true'::jsonb) WHERE s.agency=$1 AND s.location=$2 AND s.selected=TRUE AND s."offerPolicy"->>'id'=$4 AND s."offerPolicy"->>'version'=$5 AND EXISTS(SELECT 1 FROM "AcquisitionMembership" m WHERE m.agency=s.agency AND m.location=s.location AND m.actor=$3 AND m.enabled=TRUE AND m.role='human_reviewer') RETURNING agency`,[c.agency,c.location,c.actor,b.payload.id,b.payload.version]);return reply({revoked:changed.length>0,outboundEnabled:false},changed.length?200:422);
   }
   if(b.action==='standing-policy'){
    const s=b.payload;if(!exact(s,['propertyId','recipientId','asset','strategy','minPriceUsd','maxPriceUsd','terms','expiresAt']))return reply({error:'Complete bounded policy required'},400);
    const policy={...s,id:randomUUID(),version:randomUUID(),approvedBy:c.actor,revoked:false} as StandingPolicy;
    const sample={propertyId:policy.propertyId,recipientId:policy.recipientId,asset:policy.asset,strategy:policy.strategy,priceUsd:policy.minPriceUsd,terms:policy.terms,analysisId:'policy-validation',analysisVersion:'policy-validation'};
    if(!withinStandingPolicy(sample,policy))return reply({error:'Explicit property, recipient, price bounds, six terms and expiry required'},422);
    const changed=await sql.query(`UPDATE "AcquisitionSettings" s SET "offerPolicy"=$4::jsonb WHERE s.agency=$1 AND s.location=$2 AND s.selected=TRUE AND EXISTS(SELECT 1 FROM "AcquisitionMembership" m WHERE m.agency=s.agency AND m.location=s.location AND m.actor=$3 AND m.enabled=TRUE AND m.role='human_reviewer') RETURNING agency`,[c.agency,c.location,c.actor,JSON.stringify(policy)]);if(!changed.length)return reply({error:'Authorization changed; nothing saved'},403);return reply({policy,outboundEnabled:false});
   }
   if(b.action==='approve'||b.action==='authorize'){
    if(!exact(b.payload,['packet','expiresAt'])||!validPacket(b.payload.packet)||!text(b.payload.expiresAt))return reply({error:'Exact packet and expiry required'},400);
    const packet=b.payload.packet,analysis=await repo.loadAnalysis(c,packet.analysisId);
    if(!analysis||analysis.version!==packet.analysisVersion||!object(analysis.result)||analysis.result.propertyId!==packet.propertyId||analysis.result.status!=='INTERNAL_REVIEW'||analysis.result.method!==({house:'house_verified_renovated_sales',land:'land_verified_sales_per_acre',small_multifamily:'small_multifamily_matched_sales_and_income',commercial_multifamily:'commercial_multifamily_noi_cap'} as Record<string,string>)[packet.asset]||await repo.isHeld(c,packet.propertyId))return reply({error:'Current successful unheld analysis required'},422);
    let standing:{id:string;version:string}|undefined;
    if(b.action==='authorize'){
     const rows=await sql.query<{offerPolicy:StandingPolicy}>(`SELECT s."offerPolicy" FROM "AcquisitionSettings" s JOIN "AcquisitionMembership" m ON m.agency=s.agency AND m.location=s.location AND m.actor=s."offerPolicy"->>'approvedBy' WHERE s.agency=$1 AND s.location=$2 AND s.selected=TRUE AND m.enabled=TRUE AND m.role='human_reviewer'`,[c.agency,c.location]);
     if(!rows[0]||!withinStandingPolicy(packet,rows[0].offerPolicy)||Date.parse(b.payload.expiresAt)>Date.parse(rows[0].offerPolicy.expiresAt))return reply({error:'Outside current approved standing policy'},422);
     standing={id:rows[0].offerPolicy.id,version:rows[0].offerPolicy.version};
    }
    const digest=packetDigest(packet),saved=await repo.saveReview(c,digest,packet.analysisId,packet.analysisVersion,b.payload.expiresAt,standing);
    return reply({reviewId:saved.id,packetDigest:digest,analysisVersion:packet.analysisVersion,outboundEnabled:false,deliveryInstalled:false});
   }
   return reply({error:'Unsupported action'},400);
  }catch{return reply({error:'Review required; no change or approval confirmed'},422);}
 };
}
