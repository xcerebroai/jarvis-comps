import {createHash,randomUUID} from 'node:crypto';
import {median} from './arv';
import {analyzeBundle} from './acquisition-bundle';
import type {AcquisitionBundle} from './acquisition-bundle';
import {AcquisitionReviewRequired} from './acquisition-analysis';
import type {StandingPolicy} from './headless-offer-policy';
import type {DmCompsResult,ResolvedProperty,ResolveFailure} from './dealmachine';
export const JARVIS_BUILD_LOCATION='SesCoVXlNu7qTSBol1gs';
export type Tenant={agency:string;location:string;actor:string};
export type Asset='house'|'land'|'small_multifamily'|'commercial_multifamily';
export type AssetEvidence={reference:string;retrievedAt:string;expiresAt:string;bundle:AcquisitionBundle};
export type OfferSettings={approvalReference:string;basis:string;valueMultiplier:number;costs:Record<string,{reference:string;repairsUsd:number;closingCostsUsd:number;targetProfitUsd:number;assignmentFeeUsd:number}>};
export type HousePolicy={assetPropertyTypes?:Partial<Record<Exclude<Asset,'house'>,string[]>>;assetEvidence?:Record<string,AssetEvidence>;assetOffers?:Partial<Record<Exclude<Asset,'house'>,OfferSettings>>;standingPolicy?:StandingPolicy;maxIncomeSalesDifference?:number;crosscheckApprovalReference?:string;approvalReference:string;expiresAt:string;housePropertyTypes:string[];saleTypes:string[];radiusMiles:number;maxAgeDays:number;sizeTolerance:number;minComps:number;maxSourceAgeHours:number;offer?:{approvalReference:string;basis:'comparable_market_value'|'renovated_arv';valueMultiplier:number;costs:Record<string,{reference:string;repairsUsd:number;closingCostsUsd:number;targetProfitUsd:number;assignmentFeeUsd:number}>}};
export interface Sql {query<T>(sql:string,parameters:unknown[]):Promise<T[]>;}
export interface Provider {resolveProperty(address:string):Promise<ResolvedProperty|ResolveFailureResult>;fetchComps(id:string):Promise<DmCompsResult|null>;}
type ResolveFailureResult={error:ResolveFailure};
export class CompReview extends Error{}
const positive=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const amount=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&Number.isSafeInteger(Math.round(n*100));
const normalized=(s:string)=>s.trim().toLowerCase();
function canonical(value:unknown):unknown{return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;}
export const policyDigest=(p:HousePolicy)=>createHash('sha256').update(JSON.stringify(canonical(p))).digest('hex');
export function policyValid(p:HousePolicy,now:Date){return Boolean(p?.approvalReference&&Number.isFinite(Date.parse(p.expiresAt))&&Date.parse(p.expiresAt)>now.getTime()&&Array.isArray(p.housePropertyTypes)&&p.housePropertyTypes.every(x=>typeof x==='string'&&x.trim())&&(p.housePropertyTypes.length+Object.values(p.assetPropertyTypes??{}).reduce((n,x)=>n+(Array.isArray(x)?x.length:0),0)>0)&&Object.values(p.assetPropertyTypes??{}).every(x=>Array.isArray(x)&&x.every(t=>typeof t==='string'&&t.trim()))&&Array.isArray(p.saleTypes)&&p.saleTypes.length&&p.saleTypes.every(x=>typeof x==='string'&&x.trim()&&!/estimated/i.test(x))&&positive(p.radiusMiles)&&p.radiusMiles<=1&&positive(p.maxAgeDays)&&p.maxAgeDays<=365&&amount(p.sizeTolerance)&&p.sizeTolerance<=.30&&Number.isInteger(p.minComps)&&p.minComps>=3&&positive(p.maxSourceAgeHours));}
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
 return {status:'COMPS_READY',asset:'house' as Asset,propertyId:subject.dm_property_id,property:{id:subject.dm_property_id,address:matchedAddress,type:subject.property_type,sqft:subject.sqft},valuation:{basis:'comparable_market_value',valueUsd,medianPricePerSqft:perSqft,arv:{status:'NOT_ESTABLISHED',valueUsd:null as number|null,reason:'Provider sold facts do not establish renovated condition; do not present market value as renovated ARV'}},comps:accepted.map(c=>({id:c.dm_property_id,address:c.display_line_1??c.address,salePriceUsd:c.sale_price,saleDate:c.sale_date,saleType:c.sale_type,sqft:c.sqft,distanceMiles:c.distance})),excluded,source:{provider:'DealMachine',retrievedAt:now.toISOString(),policyReference:p.approvalReference,policyDigest:policyDigest(p),coverage:{radiusMiles:1,maxAgeDays:365,sizeTolerance:.30}},offer:{...offer,approvalRequired:true,offerApproved:false},outboundEnabled:false};
}
export function analyzeAssetComps(raw:DmCompsResult,p:HousePolicy,now:Date,address:string){
 const type=normalized(raw.subject?.property_type??'');
 const assets:Asset[]=[];
 if(p.housePropertyTypes?.map(normalized).includes(type))assets.push('house');
 for(const asset of ['land','small_multifamily','commercial_multifamily'] as const)if(p.assetPropertyTypes?.[asset]?.map(normalized).includes(type))assets.push(asset);
 if(assets.length===2&&assets.includes('small_multifamily')&&assets.includes('commercial_multifamily')){const b=p.assetEvidence?.[raw.subject.dm_property_id]?.bundle;if(b&&(b.asset==='small_multifamily'||b.asset==='commercial_multifamily')&&b.subject.id===raw.subject.dm_property_id&&Number.isInteger(b.subject.units)&&((b.asset==='small_multifamily'&&b.subject.units>=2&&b.subject.units<=4)||(b.asset==='commercial_multifamily'&&b.subject.units>=5)))assets.splice(0,assets.length,b.asset);}
 if(assets.length!==1)throw new CompReview('Asset classification missing or ambiguous; establish house, land, 2–4 or 5+ method');
 const asset=assets[0];if(asset==='house'){
  const result=analyzeHouseComps(raw,p,now,address),e=p.assetEvidence?.[raw.subject.dm_property_id];
  if(e?.reference&&e.bundle.asset==='house'&&e.bundle.subject.id===raw.subject.dm_property_id&&e.bundle.subject.sqft===raw.subject.sqft&&normalized(e.bundle.subject.propertyType)===type&&Date.parse(e.expiresAt)>now.getTime()&&Number.isFinite(Date.parse(e.retrievedAt))&&Date.parse(e.retrievedAt)<=now.getTime()&&(now.getTime()-Date.parse(e.retrievedAt))/3600000<=p.maxSourceAgeHours){
   const bundle=structuredClone(e.bundle);let valid=true;
   for(const comp of bundle.comps){const sale=raw.comps.find(c=>c.dm_property_id===comp.id);if(!sale||sale.type!=='sale'||sale.sale_price!==comp.salePrice||sale.sale_date!==comp.saleDate||sale.sale_type!==comp.saleType||sale.sqft!==comp.sqft||!sale.property_type||normalized(sale.property_type)!==normalized(comp.propertyType)||!amount(sale.distance)){valid=false;break;}comp.distanceMiles=sale.distance;comp.propertyType=sale.property_type;comp.saleVerified=p.saleTypes.includes(comp.saleType)&&!/estimated/i.test(comp.saleType);comp.source={provider:'DealMachine',reference:'DealMachine:/comps/'+comp.id,retrievedAt:now.toISOString(),synthetic:false};}
   if(valid)try{bundle.subject.propertyType=raw.subject.property_type!;const analysis=analyzeBundle(bundle,{...p,verifiedSaleTypes:p.saleTypes},now,false);if('valueUsd' in analysis&&positive(Number(analysis.valueUsd))){result.valuation.arv={status:'ESTABLISHED',valueUsd:Number(analysis.valueUsd),reason:'Source-backed renovated comparability'} as typeof result.valuation.arv;const o=p.offer,c=o?.costs?.[raw.subject.dm_property_id];if(o?.basis==='renovated_arv'&&o.approvalReference&&positive(o.valueMultiplier)&&o.valueMultiplier<=1&&c?.reference&&[c.repairsUsd,c.closingCostsUsd,c.targetProfitUsd,c.assignmentFeeUsd].every(amount)){const cents=Math.floor((Number(analysis.valueUsd)*o.valueMultiplier-c.repairsUsd-c.closingCostsUsd-c.targetProfitUsd-c.assignmentFeeUsd)*100);if(Number.isSafeInteger(cents)&&cents>0)result.offer={status:'LIMIT_READY',maxPriceUsd:cents/100,missing:[],assumptions:{policyReference:o.approvalReference,costReference:c.reference,valueMultiplier:o.valueMultiplier,...c},approvalRequired:true,offerApproved:false};}}}catch{ /* Optional ARV evidence never blocks supported ordinary house comps. */ }
  }
  return result;
 }

 if(!policyValid(p,now)||!raw.found)throw new CompReview('Configured client policy and source property required');
 const e=p.assetEvidence?.[raw.subject.dm_property_id],age=e?(now.getTime()-Date.parse(e.retrievedAt))/3600000:NaN;
 if(!e?.reference||!Number.isFinite(age)||age<0||age>p.maxSourceAgeHours||!Number.isFinite(Date.parse(e.expiresAt))||Date.parse(e.expiresAt)<=now.getTime()||e.bundle.asset!==asset||e.bundle.subject.id!==raw.subject.dm_property_id)throw new CompReview(asset==='land'?'Source-backed zoning, access, utilities, flood and parcel boundaries required':asset==='small_multifamily'?'Source-backed 2–4 unit count, condition and rent-roll/income facts required':'Source-backed 5+ unit count, rent roll, operating expenses and cap-rate facts required');
 const bundle=structuredClone(e.bundle);
 if(bundle.asset==='land'&&raw.subject.lot_size!==bundle.subject.acres)throw new CompReview('Parcel acreage differs from source evidence');
 if(bundle.asset==='small_multifamily'&&raw.subject.sqft!==bundle.subject.sqft)throw new CompReview('2–4 unit size differs from source evidence');
 for(const comp of bundle.comps){const sale=raw.comps.find(c=>c.dm_property_id===comp.id);
  if(!sale||sale.type!=='sale'||!sale.sale_type||/estimated/i.test(sale.sale_type)||!p.saleTypes.includes(sale.sale_type)||sale.sale_price!==comp.salePrice||sale.sale_date!==comp.saleDate||!amount(sale.distance))throw new CompReview('Asset comp sale facts unsupported or changed');
  if(bundle.asset==='land'&&'acres' in comp&&comp.acres!==sale.lot_size)throw new CompReview('Land comparable acreage changed');
  if(bundle.asset==='small_multifamily'&&'sqft' in comp&&comp.sqft!==sale.sqft)throw new CompReview('2–4 comparable size changed');
  comp.distanceMiles=sale.distance;comp.saleVerified=true;comp.source={provider:'DealMachine',reference:'DealMachine:/comps/'+comp.id,retrievedAt:now.toISOString(),synthetic:false};
 }
 let analysis;try{analysis=analyzeBundle(bundle,{...p,verifiedSaleTypes:p.saleTypes},now,false);}catch(error){if(error instanceof AcquisitionReviewRequired)throw new CompReview(error.message);throw error;}
 if(analysis.status==='NEEDS_REVIEW')throw new CompReview('2–4 sales/income crosscheck exceeds approved sensitivity');
 const value=Number('valueUsd' in analysis?analysis.valueUsd:'salesValueUsd' in analysis?analysis.salesValueUsd:analysis.netCapitalAdjustedValueUsd);
 if(!positive(value))throw new CompReview('Asset valuation unavailable');
 const basis=asset==='land'?'land_market_value':asset==='small_multifamily'?'small_multifamily_sales_income':'commercial_income_value';
 const o=p.assetOffers?.[asset],cost=o?.costs?.[raw.subject.dm_property_id];
 let offer:{status:string;maxPriceUsd:number|null;missing:string[];assumptions?:unknown}={status:'NEEDS_INPUT',maxPriceUsd:null,missing:['Approved asset-specific property costs and offer policy']};
 if(o?.approvalReference&&o.basis===basis&&positive(o.valueMultiplier)&&o.valueMultiplier<=1&&cost?.reference&&[cost.repairsUsd,cost.closingCostsUsd,cost.targetProfitUsd,cost.assignmentFeeUsd].every(amount)){
  const cents=Math.floor((value*o.valueMultiplier-cost.repairsUsd-cost.closingCostsUsd-cost.targetProfitUsd-cost.assignmentFeeUsd)*100);
  if(Number.isSafeInteger(cents)&&cents>0)offer={status:'LIMIT_READY',maxPriceUsd:cents/100,missing:[],assumptions:{policyReference:o.approvalReference,costReference:cost.reference,valueMultiplier:o.valueMultiplier,...cost}};
 }
 return {status:'COMPS_READY',asset,propertyId:raw.subject.dm_property_id,property:{id:raw.subject.dm_property_id,address,type:raw.subject.property_type,sqft:raw.subject.sqft},valuation:{basis,valueUsd:value,medianPricePerSqft:null,arv:{status:'NOT_APPLICABLE',valueUsd:null,reason:'Distinct asset method; no house ARV fallback'},details:analysis},comps:('usedCompIds' in analysis?analysis.usedCompIds:[]).map(id=>raw.comps.find(c=>c.dm_property_id===id)!).map(c=>({id:c.dm_property_id,address:c.display_line_1??c.address,salePriceUsd:c.sale_price,saleDate:c.sale_date,saleType:c.sale_type,sqft:c.sqft,distanceMiles:c.distance})),excluded:'excluded' in analysis?analysis.excluded:[],source:{provider:asset==='commercial_multifamily'?'DealMachine property identity and sourced income facts':'DealMachine',retrievedAt:now.toISOString(),policyReference:p.approvalReference,policyDigest:policyDigest(p),assetEvidenceReference:e.reference,coverage:{radiusMiles:1,maxAgeDays:365,sizeTolerance:.30}},offer:{...offer,approvalRequired:true,offerApproved:false},outboundEnabled:false};
}
/** Seller-safe property income facts only; never copy the internal analysis object. */
function publicIncomeExplanation(details:unknown){
 if(!details||typeof details!=='object')return null;
 const d=details as Record<string,unknown>;
 if(d.method!=='commercial_multifamily_noi_cap')return null;
 const c=d.calculation as Record<string,unknown>,sources=d.sources as Record<string,{provider:string;reference:string;retrievedAt:string}>;
 if(!c||!sources)return null;
 const keys=['grossScheduledAnnualRent','vacancyRate','annualOperatingExpenses','capRate','immediateCapitalWork'];
 return {method:d.method,noiUsd:d.noiUsd,capRate:c.capRate,incomeValueUsd:d.incomeValueUsd,capitalWorkUsd:c.immediateCapitalWork,netCapitalAdjustedValueUsd:d.netCapitalAdjustedValueUsd,grossScheduledAnnualRentUsd:c.grossScheduledRent,vacancyRate:c.vacancyRate,effectiveIncomeUsd:c.effectiveIncome,annualOperatingExpensesUsd:c.operatingExpenses,sources:Object.fromEntries(keys.map(k=>[k,sources[k]?{provider:sources[k].provider,reference:sources[k].reference,retrievedAt:sources[k].retrievedAt}:null]))};
}
export function headlessCompHandler(sql:Sql,provider:Provider,enabled:boolean,clock=()=>new Date()){
 const reply=(body:unknown,status:number)=>{const b=body as Record<string,unknown>;const publicResult={status:b.status??'UNAVAILABLE',property:b.property??null,valuation:b.valuation?{basis:(b.valuation as Record<string,unknown>).basis,valueUsd:(b.valuation as Record<string,unknown>).valueUsd,arv:(b.valuation as Record<string,unknown>).arv,incomeExplanation:publicIncomeExplanation((b.valuation as Record<string,unknown>).details)}:null,excluded:Array.isArray(b.excluded)?b.excluded:[],compCount:Array.isArray(b.comps)?b.comps.length:0,comps:Array.isArray(b.comps)?b.comps:[],source:b.source?{provider:(b.source as Record<string,unknown>).provider,retrievedAt:(b.source as Record<string,unknown>).retrievedAt}:null,missing:b.missing??[],reason:b.reason??null,offerReadiness:b.offer?(b.offer as Record<string,unknown>).status:'UNAVAILABLE'};return Response.json({...publicResult,publicResult,analysisId:b.analysisId??null,analysisVersion:b.analysisVersion??null,requestId:b.requestId??null,approvalRequired:true,offerApproved:false,outboundEnabled:false},{status,headers:{'Cache-Control':'no-store'}});};
 return async(request:Request)=>{
  if(!enabled)return reply({status:'NEEDS_REVIEW',missing:['Comp service is not enabled'],outboundEnabled:false},503);
  try{
   const header=request.headers.get('authorization');if(!header?.startsWith('Bearer '))return reply({error:'Unauthorized'},401);
   const token=header.slice(7);if(token.length<32||token.length>512||/\s/.test(token))return reply({error:'Unauthorized'},401);
   const hash=createHash('sha256').update(token).digest('hex');
   const tenants=await sql.query<Tenant&{policy:HousePolicy}>(`SELECT c.agency,c.location,c.actor,s.policy FROM "AcquisitionCredential" c JOIN "AcquisitionMembership" m ON m.agency=c.agency AND m.location=c.location AND m.actor=c.actor JOIN "AcquisitionSettings" s ON s.agency=c.agency AND s.location=c.location WHERE c."tokenHash"=$1 AND c.location=$2 AND c.revoked=FALSE AND c."expiresAt">CURRENT_TIMESTAMP AND 'acquisitions:analyze'=ANY(c.scopes) AND m.enabled=TRUE AND m.role='analysis_machine' AND s.selected=TRUE`,[hash,JARVIS_BUILD_LOCATION]);
   const tenant=tenants[0];if(!tenant||tenant.location!==JARVIS_BUILD_LOCATION)return reply({error:'Unauthorized'},401);
   const now=clock();if(!policyValid(tenant.policy,now))throw new CompReview('Configured client comp policy required');
   let b:unknown;try{b=await request.json();}catch{return reply({error:'Invalid request'},400);}if(!b||typeof b!=='object'||Array.isArray(b))return reply({error:'Invalid request'},400);
   const body=b as Record<string,unknown>;
   if(Object.keys(body).some(k=>!['address','requestId','contactId','locationId'].includes(k))||(body.locationId!==undefined&&body.locationId!==JARVIS_BUILD_LOCATION)||typeof body.address!=='string'||body.address.trim().length<5||body.address.length>200||(body.requestId!==undefined&&(typeof body.requestId!=='string'||!/^[-A-Za-z0-9_]{8,100}$/.test(body.requestId)))||(body.contactId!==undefined&&(typeof body.contactId!=='string'||body.contactId.length>100||!body.contactId.trim())))return reply({error:'Invalid request'},400);
   const requestId=typeof body.requestId==='string'?body.requestId:createHash('sha256').update(JSON.stringify({agency:tenant.agency,location:tenant.location,contactId:body.contactId??null,address:body.address.trim().toLowerCase().replace(/\s+/g,' '),policy:policyDigest(tenant.policy),freshnessWindow:Math.floor(now.getTime()/(tenant.policy.maxSourceAgeHours*3600000))})).digest('hex');
   const digest=createHash('sha256').update(JSON.stringify({address:body.address.trim().toLowerCase().replace(/\s+/g,' ')})).digest('hex'),params=[tenant.agency,tenant.location,requestId];
   const stored=await sql.query<{id:string;version:string;requestDigest:string;result:ReturnType<typeof analyzeAssetComps>}>(`SELECT id,version,"requestDigest",result FROM "AcquisitionAnalysis" WHERE agency=$1 AND location=$2 AND "requestId"=$3`,params);
   let result:ReturnType<typeof analyzeAssetComps>,id:string,version:string;
   if(stored[0]){
    const prior=stored[0];if(prior.requestDigest!==digest)throw new CompReview('Request ID conflicts with another property; use a new request ID');
    if(!prior.result?.source?.retrievedAt||(now.getTime()-Date.parse(prior.result.source.retrievedAt))/3600000>tenant.policy.maxSourceAgeHours||prior.result.source.policyDigest!==policyDigest(tenant.policy)||!Number.isFinite(Date.parse(prior.result.source.retrievedAt))||Date.parse(prior.result.source.retrievedAt)>now.getTime())throw new CompReview('Stored analysis expired or policy changed; request fresh comps with a new request ID');
    result=prior.result;id=prior.id;version=prior.version;
   }else{
    const resolved=await provider.resolveProperty(body.address.trim());if('error' in resolved||!resolved.match.dm_property_id)throw new CompReview('Confirm exact property address and parcel');
    const held=await sql.query<{reason:string}>(`SELECT reason FROM "AcquisitionHold" WHERE agency=$1 AND location=$2 AND "propertyId"=$3`,[tenant.agency,tenant.location,resolved.match.dm_property_id]);if(held[0])return reply({status:'HELD',reason:held[0].reason,outboundEnabled:false},409);
    const raw=await provider.fetchComps(resolved.match.dm_property_id);if(!raw||raw.subject.dm_property_id!==resolved.match.dm_property_id)throw new CompReview('Source property match unavailable');
    result=analyzeAssetComps(raw,tenant.policy,now,resolved.matchedAddress);id=randomUUID();version=randomUUID();
   }
   const holds=await sql.query<{reason:string}>(`SELECT reason FROM "AcquisitionHold" WHERE agency=$1 AND location=$2 AND "propertyId"=$3`,[tenant.agency,tenant.location,result.property.id]);
   if(holds[0])return reply({status:'HELD',reason:holds[0].reason,outboundEnabled:false},409);
   if(!stored[0]){
    const saved=await sql.query<{id:string;version:string;requestDigest:string;result:typeof result}>(`INSERT INTO "AcquisitionAnalysis" (id,version,agency,location,"requestId","requestDigest",result) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(agency,location,"requestId") DO UPDATE SET "requestDigest"="AcquisitionAnalysis"."requestDigest" RETURNING id,version,"requestDigest",result`,[id,version,tenant.agency,tenant.location,requestId,digest,JSON.stringify(result)]);
    if(!saved[0]||saved[0].requestDigest!==digest)throw new CompReview('Request ID conflict');
    id=saved[0].id;version=saved[0].version;result=saved[0].result;
   }
   const stillAuthorized=await sql.query<Tenant&{policy:HousePolicy}>(`SELECT c.agency,c.location,c.actor,s.policy FROM "AcquisitionCredential" c JOIN "AcquisitionMembership" m ON m.agency=c.agency AND m.location=c.location AND m.actor=c.actor JOIN "AcquisitionSettings" s ON s.agency=c.agency AND s.location=c.location WHERE c."tokenHash"=$1 AND c.location=$2 AND c.revoked=FALSE AND c."expiresAt">CURRENT_TIMESTAMP AND 'acquisitions:analyze'=ANY(c.scopes) AND m.enabled=TRUE AND m.role='analysis_machine' AND s.selected=TRUE`,[hash,JARVIS_BUILD_LOCATION]);
   if(!stillAuthorized[0]||stillAuthorized[0].location!==JARVIS_BUILD_LOCATION||stillAuthorized[0].agency!==tenant.agency||stillAuthorized[0].location!==tenant.location||stillAuthorized[0].actor!==tenant.actor||policyDigest(stillAuthorized[0].policy)!==policyDigest(tenant.policy))throw new CompReview('Client authorization or policy changed during analysis');
   return reply({...result,analysisId:id,analysisVersion:version,requestId},200);
  }catch(error){if(error instanceof CompReview)return reply({status:'NEEDS_REVIEW',missing:[error.message],outboundEnabled:false},422);return reply({status:'NEEDS_REVIEW',missing:['Comp provider or persistence unavailable'],outboundEnabled:false},503);}
 };
}
