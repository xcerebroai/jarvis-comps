import {createHash,randomUUID} from 'node:crypto';
import {median} from './arv';
import type {DmCompsResult,ResolvedProperty,ResolveFailure} from './dealmachine';
export type Tenant={agency:string;location:string;actor:string};
export type HousePolicy={approvalReference:string;expiresAt:string;housePropertyTypes:string[];saleTypes:string[];radiusMiles:number;maxAgeDays:number;sizeTolerance:number;minComps:number;maxSourceAgeHours:number;offer?:{approvalReference:string;basis:'comparable_market_value';valueMultiplier:number;costs:Record<string,{reference:string;repairsUsd:number;closingCostsUsd:number;targetProfitUsd:number;assignmentFeeUsd:number}>}};
export interface Sql {query<T>(sql:string,parameters:unknown[]):Promise<T[]>;}
export interface Provider {resolveProperty(address:string):Promise<ResolvedProperty|ResolveFailureResult>;fetchComps(id:string):Promise<DmCompsResult|null>;}
type ResolveFailureResult={error:ResolveFailure};
export class CompReview extends Error{}
const positive=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const amount=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&Number.isSafeInteger(Math.round(n*100));
const normalized=(s:string)=>s.trim().toLowerCase();
function canonical(value:unknown):unknown{return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;}
const policyDigest=(p:HousePolicy)=>createHash('sha256').update(JSON.stringify(canonical(p))).digest('hex');
export function policyValid(p:HousePolicy,now:Date){return Boolean(p?.approvalReference&&Number.isFinite(Date.parse(p.expiresAt))&&Date.parse(p.expiresAt)>now.getTime()&&Array.isArray(p.housePropertyTypes)&&p.housePropertyTypes.length&&p.housePropertyTypes.every(x=>typeof x==='string'&&x.trim())&&Array.isArray(p.saleTypes)&&p.saleTypes.length&&p.saleTypes.every(x=>typeof x==='string'&&x.trim()&&!/estimated/i.test(x))&&positive(p.radiusMiles)&&p.radiusMiles<=1&&positive(p.maxAgeDays)&&p.maxAgeDays<=365&&amount(p.sizeTolerance)&&p.sizeTolerance<=.30&&Number.isInteger(p.minComps)&&p.minComps>=3&&positive(p.maxSourceAgeHours));}
/** Provider facts are evaluated directly. No login, uploaded reviewer bundle or
 * fabricated renovated-comparable flag is required for ordinary house comps. */
export function analyzeHouseComps(raw:DmCompsResult,p:HousePolicy,now:Date,matchedAddress:string){
 if(!policyValid(p,now))throw new CompReview('Configured client comp policy required');
 const subject=raw.subject;
 if(!raw.found||!subject?.dm_property_id||!positive(subject.sqft)||!subject.property_type||!p.housePropertyTypes.map(normalized).includes(normalized(subject.property_type)))throw new CompReview('Property identity/type/size unsupported; separate land or multifamily method required');
 const seen=new Set<string>(),accepted:typeof raw.comps=[],excluded:{id:string;reason:string}[]=[];
 for(const c of raw.comps){
  const days=(now.getTime()-Date.parse(c.sale_date??''))/86400000;
  const valid=c.dm_property_id&&!seen.has(c.dm_property_id)&&c.type==='sale'&&typeof c.sale_type==='string'&&!/estimated/i.test(c.sale_type)&&p.saleTypes.includes(c.sale_type)&&positive(c.sale_price)&&positive(c.sqft)&&amount(c.distance)&&c.distance<=p.radiusMiles&&Number.isFinite(days)&&days>=0&&days<=p.maxAgeDays&&typeof c.property_type==='string'&&normalized(c.property_type)===normalized(subject.property_type)&&Math.abs(c.sqft/subject.sqft-1)<=p.sizeTolerance;
  seen.add(c.dm_property_id);if(valid)accepted.push(c);else excluded.push({id:c.dm_property_id,reason:'Outside approved sale/source/type/size/date/distance policy'});
 }
 if(accepted.length<p.minComps)throw new CompReview('Insufficient supported actual sold comps');
 const perSqft=median(accepted.map(c=>c.sale_price!/c.sqft!)),cents=Math.round(perSqft*subject.sqft*100);
 if(!Number.isSafeInteger(cents)||cents<=0)throw new CompReview('Invalid valuation precision');
 const valueUsd=cents/100;
 let offer:{status:string;maxPriceUsd:number|null;missing:string[];assumptions?:unknown}={status:'NEEDS_INPUT',maxPriceUsd:null,missing:['Approved property repair reserve, transaction costs, profit and assignment fee']};
 const o=p.offer,c=o?.costs?.[subject.dm_property_id];
 if(o?.approvalReference&&o.basis==='comparable_market_value'&&positive(o.valueMultiplier)&&o.valueMultiplier<=1&&c?.reference&&[c.repairsUsd,c.closingCostsUsd,c.targetProfitUsd,c.assignmentFeeUsd].every(amount)){
  const maxCents=Math.floor((valueUsd*o.valueMultiplier-c.repairsUsd-c.closingCostsUsd-c.targetProfitUsd-c.assignmentFeeUsd)*100);
  if(Number.isSafeInteger(maxCents)&&maxCents>0)offer={status:'LIMIT_READY',maxPriceUsd:maxCents/100,missing:[],assumptions:{policyReference:o.approvalReference,costReference:c.reference,valueMultiplier:o.valueMultiplier,...c}};
  else offer={status:'NEEDS_REVIEW',maxPriceUsd:null,missing:['Configured costs leave no positive offer ceiling']};
 }
 return {status:'COMPS_READY',property:{id:subject.dm_property_id,address:matchedAddress,type:subject.property_type,sqft:subject.sqft},valuation:{basis:'comparable_market_value',valueUsd,medianPricePerSqft:perSqft,arv:{status:'NOT_ESTABLISHED',valueUsd:null,reason:'Provider sold facts do not establish renovated condition; do not present market value as renovated ARV'}},comps:accepted.map(c=>({id:c.dm_property_id,address:c.display_line_1??c.address,salePriceUsd:c.sale_price,saleDate:c.sale_date,saleType:c.sale_type,sqft:c.sqft,distanceMiles:c.distance})),excluded,source:{provider:'DealMachine',retrievedAt:now.toISOString(),policyReference:p.approvalReference,policyDigest:policyDigest(p),coverage:{radiusMiles:1,maxAgeDays:365,sizeTolerance:.30}},offer:{...offer,approvalRequired:true,offerApproved:false},outboundEnabled:false};
}
export function headlessCompHandler(sql:Sql,provider:Provider,enabled:boolean,clock=()=>new Date()){
 const reply=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 return async(request:Request)=>{
  if(!enabled)return reply({status:'NEEDS_REVIEW',missing:['Comp service is not enabled'],outboundEnabled:false},503);
  try{
   const header=request.headers.get('authorization');if(!header?.startsWith('Bearer '))return reply({error:'Unauthorized'},401);
   const token=header.slice(7);if(token.length<32||token.length>512||/\s/.test(token))return reply({error:'Unauthorized'},401);
   const hash=createHash('sha256').update(token).digest('hex');
   const tenants=await sql.query<Tenant&{policy:HousePolicy}>(`SELECT c.agency,c.location,c.actor,s.policy FROM "AcquisitionCredential" c JOIN "AcquisitionMembership" m ON m.agency=c.agency AND m.location=c.location AND m.actor=c.actor JOIN "AcquisitionSettings" s ON s.agency=c.agency AND s.location=c.location WHERE c."tokenHash"=$1 AND c.revoked=FALSE AND c."expiresAt">CURRENT_TIMESTAMP AND 'acquisitions:analyze'=ANY(c.scopes) AND m.enabled=TRUE AND m.role='analysis_machine' AND s.selected=TRUE`,[hash]);
   const tenant=tenants[0];if(!tenant)return reply({error:'Unauthorized'},401);
   const now=clock();if(!policyValid(tenant.policy,now))throw new CompReview('Configured client comp policy required');
   let b:unknown;try{b=await request.json();}catch{return reply({error:'Invalid request'},400);}if(!b||typeof b!=='object'||Array.isArray(b))return reply({error:'Invalid request'},400);
   const body=b as Record<string,unknown>;
   if(Object.keys(body).some(k=>!['address','requestId'].includes(k))||typeof body.address!=='string'||body.address.trim().length<5||body.address.length>200||typeof body.requestId!=='string'||!/^[-A-Za-z0-9_]{8,100}$/.test(body.requestId))return reply({error:'Invalid request'},400);
   const digest=createHash('sha256').update(JSON.stringify({address:body.address.trim()})).digest('hex'),params=[tenant.agency,tenant.location,body.requestId];
   const stored=await sql.query<{id:string;version:string;requestDigest:string;result:ReturnType<typeof analyzeHouseComps>}>(`SELECT id,version,"requestDigest",result FROM "AcquisitionAnalysis" WHERE agency=$1 AND location=$2 AND "requestId"=$3`,params);
   let result:ReturnType<typeof analyzeHouseComps>,id:string,version:string;
   if(stored[0]){
    const prior=stored[0];if(prior.requestDigest!==digest)throw new CompReview('Request ID conflicts with another property; use a new request ID');
    if(!prior.result?.source?.retrievedAt||(now.getTime()-Date.parse(prior.result.source.retrievedAt))/3600000>tenant.policy.maxSourceAgeHours||prior.result.source.policyDigest!==policyDigest(tenant.policy)||!Number.isFinite(Date.parse(prior.result.source.retrievedAt))||Date.parse(prior.result.source.retrievedAt)>now.getTime())throw new CompReview('Stored analysis expired or policy changed; request fresh comps with a new request ID');
    result=prior.result;id=prior.id;version=prior.version;
   }else{
    const resolved=await provider.resolveProperty(body.address.trim());if('error' in resolved||!resolved.match.dm_property_id)throw new CompReview('Confirm exact property address and parcel');
    const held=await sql.query<{reason:string}>(`SELECT reason FROM "AcquisitionHold" WHERE agency=$1 AND location=$2 AND "propertyId"=$3`,[tenant.agency,tenant.location,resolved.match.dm_property_id]);if(held[0])return reply({status:'HELD',reason:held[0].reason,outboundEnabled:false},409);
    const raw=await provider.fetchComps(resolved.match.dm_property_id);if(!raw||raw.subject.dm_property_id!==resolved.match.dm_property_id)throw new CompReview('Source property match unavailable');
    result=analyzeHouseComps(raw,tenant.policy,now,resolved.matchedAddress);id=randomUUID();version=randomUUID();
   }
   const holds=await sql.query<{reason:string}>(`SELECT reason FROM "AcquisitionHold" WHERE agency=$1 AND location=$2 AND "propertyId"=$3`,[tenant.agency,tenant.location,result.property.id]);
   if(holds[0])return reply({status:'HELD',reason:holds[0].reason,outboundEnabled:false},409);
   if(!stored[0]){
    const saved=await sql.query<{id:string;version:string;requestDigest:string;result:typeof result}>(`INSERT INTO "AcquisitionAnalysis" (id,version,agency,location,"requestId","requestDigest",result) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(agency,location,"requestId") DO UPDATE SET "requestDigest"="AcquisitionAnalysis"."requestDigest" RETURNING id,version,"requestDigest",result`,[id,version,tenant.agency,tenant.location,body.requestId,digest,JSON.stringify(result)]);
    if(!saved[0]||saved[0].requestDigest!==digest)throw new CompReview('Request ID conflict');
    id=saved[0].id;version=saved[0].version;result=saved[0].result;
   }
   const stillAuthorized=await sql.query<Tenant&{policy:HousePolicy}>(`SELECT c.agency,c.location,c.actor,s.policy FROM "AcquisitionCredential" c JOIN "AcquisitionMembership" m ON m.agency=c.agency AND m.location=c.location AND m.actor=c.actor JOIN "AcquisitionSettings" s ON s.agency=c.agency AND s.location=c.location WHERE c."tokenHash"=$1 AND c.revoked=FALSE AND c."expiresAt">CURRENT_TIMESTAMP AND 'acquisitions:analyze'=ANY(c.scopes) AND m.enabled=TRUE AND m.role='analysis_machine' AND s.selected=TRUE`,[hash]);
   if(!stillAuthorized[0]||stillAuthorized[0].agency!==tenant.agency||stillAuthorized[0].location!==tenant.location||stillAuthorized[0].actor!==tenant.actor||policyDigest(stillAuthorized[0].policy)!==policyDigest(tenant.policy))throw new CompReview('Client authorization or policy changed during analysis');
   return reply({...result,analysisId:id,analysisVersion:version,requestId:body.requestId},200);
  }catch(error){if(error instanceof CompReview)return reply({status:'NEEDS_REVIEW',missing:[error.message],outboundEnabled:false},422);return reply({status:'NEEDS_REVIEW',missing:['Comp provider or persistence unavailable'],outboundEnabled:false},503);}
 };
}
