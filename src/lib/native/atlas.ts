import {analysisRequest,assert,current,date,dollars,failure,fresh,median,money,parseInput,same,type AnalysisRequest,type Comp,type Source} from './contracts';

// Generic caller-normalized real input stays disabled. The observed wrapper validates its own boundary.
export const PROVIDER_MAPPING_AVAILABLE = false;
export type Evidence = {key:string;kind:'SALE'|'SALE_FACT'|'SUBJECT'|'PARCEL'|'INCOME';selection:'ACCEPTED'|'REJECTED';codes:string[];source:Source;comp?:Comp;originComp?:{id:string;ordinal:number};fact?:{name:string;value:number|string;unit:string}};
export function validateNormalizedInput(raw:unknown){
 const x=analysisRequest.parse(raw),c=x.context,p=x.policy;
 current(c,false);
 assert(p.recordId===c.policyRecordId&&p.version===c.policyVersion&&!p.revoked&&Date.parse(p.expiresAt)>Date.parse(c.now),'POLICY_STALE_OR_MISMATCHED');
 assert(p.compPriceBasis==='provider_estimated_comps'?p.estimateAcceptanceReference&&p.estimatedSaleTypes.length:p.verifiedSaleTypes.length,'COMP_PRICE_POLICY_INCOMPLETE');
 assert(p.compPriceBasis!=='provider_estimated_comps'||p.houseBasis!=='renovated_arv','ESTIMATED_COMPS_NOT_VERIFIED_RENOVATED_ARV');
 assert(p.houseBasis!=='estimated_arv_proxy'||p.compPriceBasis==='provider_estimated_comps','ESTIMATED_ARV_POLICY_MISMATCH');
 assert(x.subject.providerPropertyId===c.property.providerPropertyId&&x.subject.asset===c.property.asset&&x.subject.canonicalAddress===c.property.canonicalAddress&&x.subject.identityReference===c.property.sourceIdentityReference,'SUBJECT_PROPERTY_MISMATCH');
 const synthetic=x.mode==='synthetic_fixture';
 if(synthetic)assert([c.property.providerPropertyId,...x.comps.map(row=>row.id),p.approvalReference].every(v=>v.startsWith('SYNTHETIC-')),'FIXTURE_IDENTITIES_REQUIRED');
 else assert(![c.contactId,c.property.recordId,c.property.providerPropertyId,c.analysisRecordId,p.recordId].some(v=>v.startsWith('SYNTHETIC-')),'SYNTHETIC_REAL_MIX');
 assert(x.subject.source.contractVersion===x.sourceContract.id&&fresh(x.subject.source,c.now,p.maxSourceAgeHours,synthetic),'SUBJECT_SOURCE_INVALID');
 assert(new Set(x.comps.map(r=>r.ordinal)).size===x.comps.length,'DUPLICATE_ROW_ORDINAL');
 assert(new Set(x.facts.map(f=>f.name)).size===x.facts.length,'DUPLICATE_INCOME_FACT');
 return x;
}
function compCodes(c:Comp,x:AnalysisRequest,seen:Set<string>){
 const p=x.policy,s=x.subject,n=Date.parse(x.context.now),sale=date.safeParse(c.saleDate),codes:string[]=[];
 if(c.id===s.providerPropertyId)codes.push('SUBJECT_SELF_SALE');
 if(seen.has(c.id))codes.push('DUPLICATE_SOURCE_ID');
 seen.add(c.id);
 if(!fresh(c.source,x.context.now,p.maxSourceAgeHours,x.mode==='synthetic_fixture')||c.source.contractVersion!==x.sourceContract.id)codes.push('INVALID_SOURCE');
 if(p.compPriceBasis==='provider_estimated_comps'){
  if(c.priceKind!=='ESTIMATED'||c.saleVerified||c.salePriceUsd!==null||!p.estimatedSaleTypes.includes(c.saleType))codes.push('OUTSIDE_ESTIMATED_PRICE_POLICY');
 }else if(c.priceKind!=='RECORDED'||!c.saleVerified||/estimated|non.?disclosure/i.test(c.saleType)||!p.verifiedSaleTypes.includes(c.saleType)||c.estimatedPriceUsd!=null)codes.push('UNVERIFIED_SALE');
 const price=selectedPrice(c,x);if(!money.safeParse(price).success||typeof price!=='number'||price<=0)codes.push('INVALID_PRICE');
 if(!sale.success||Date.parse(c.saleDate)>n||(n-Date.parse(c.saleDate))/86400000>=p.maxAgeDays)codes.push('STALE_OR_INVALID_SALE_DATE');
 if(c.distanceMiles>p.radiusMiles||c.propertyType!==s.propertyType)codes.push('OUTSIDE_POLICY');
 if(s.asset==='house'||s.asset==='small_multifamily'){
  if(!s.sqft||!c.sqft||Math.abs(c.sqft/s.sqft-1)>p.sizeTolerance)codes.push('SIZE_MISMATCH');
  if((p.houseBasis==='renovated_arv'&&s.asset==='house'||s.asset==='small_multifamily')&&!c.renovatedComparable)codes.push('RENOVATED_COMPARABILITY_UNVERIFIED');
  if(s.asset==='small_multifamily'&&c.units!==s.units)codes.push('UNIT_MISMATCH');
 }
 if(s.asset==='land'){
  if(!s.acres||!c.acres||Math.abs(c.acres/s.acres-1)>p.sizeTolerance)codes.push('ACREAGE_MISMATCH');
  if(!s.parcel||!c.parcel||!['zoning','legalAccess','utilities','floodStatus'].every(k=>s.parcel![k as keyof typeof s.parcel]===c.parcel![k as keyof typeof c.parcel]))codes.push('PARCEL_MISMATCH');
 }
 return codes;
}
class ReviewWithTrace extends Error {constructor(code:string,readonly reviewTrace:{id:string;ordinal:number;selection:string;codes:string[]}[]){super(code);}}
export function analysisFailure(error:unknown){return error instanceof ReviewWithTrace?{...failure(error),reviewTrace:error.reviewTrace}:failure(error);}
function selectedPrice(c:Comp,x:AnalysisRequest){return x.policy.compPriceBasis==='provider_estimated_comps'?c.estimatedPriceUsd:c.salePriceUsd;}
export function calculateNormalized(raw:unknown){
 const x=validateNormalizedInput(raw);
 assert(x.mode==='synthetic_fixture'||PROVIDER_MAPPING_AVAILABLE,'PROVIDER_MAPPING_UNAVAILABLE');
 return calculateValidatedCandidate(x);
}
/** Internal composition boundary: exposed only after observed-provider validates and binds its inputs. */
export function calculateValidatedCandidate(x:AnalysisRequest){
 const {subject:s,context:c,policy:p}=x,evidence:Evidence[]=[],seen=new Set<string>();
 const add=(name:string,value:number|string,unit:string,kind:Evidence['kind']='SUBJECT',source=s.source)=>evidence.push({key:`fact:${name}`,kind,selection:'ACCEPTED',codes:[],source,fact:{name,value,unit}});
 add('source_contract_verification',x.sourceContract.verificationReference,'text');add('canonical_address',s.canonicalAddress,'text');add('identity_reference',s.identityReference,'text');add('property_type',s.propertyType,'text');
 add('comp_price_basis',p.compPriceBasis,'text');if(p.estimateAcceptanceReference)add('estimate_acceptance_reference',p.estimateAcceptanceReference,'text');
 if(s.sqft!==null)add('subject_sqft',s.sqft,'sqft');if(s.acres!==null)add('subject_acres',s.acres,'acre');if(s.units!==null)add('unit_count',s.units,'count');
 if(s.parcel)for(const [k,v] of Object.entries(s.parcel))add(k,v,'text','PARCEL');
 const accepted:Comp[]=[];
 for(const row of x.comps){const codes=compCodes(row,x,seen);evidence.push({key:`sale:${row.ordinal}:${row.id}`,kind:'SALE',selection:codes.length?'REJECTED':'ACCEPTED',codes,source:row.source,comp:row});if(!codes.length)accepted.push(row);
  const facts:Record<string,string|number>={price_kind:row.priceKind,sale_verified:String(row.saleVerified),renovated_comparable:String(row.renovatedComparable)};
  if(row.units!==null)facts.unit_count=row.units;
  if(row.parcel)Object.assign(facts,row.parcel);
  for(const [name,value] of Object.entries(facts))evidence.push({key:`sale-fact:${row.ordinal}:${row.id}:${name}`,kind:'SALE_FACT',selection:codes.length?'REJECTED':'ACCEPTED',codes,source:row.source,originComp:{id:row.id,ordinal:row.ordinal},fact:{name,value,unit:typeof value==='number'?'count':'text'}});
  if(row.priceKind==='ESTIMATED'&&row.estimatedPriceUsd!=null)evidence.push({key:`sale-fact:${row.ordinal}:${row.id}:provider_estimated_price`,kind:'SALE_FACT',selection:codes.length?'REJECTED':'ACCEPTED',codes,source:row.source,originComp:{id:row.id,ordinal:row.ordinal},fact:{name:'provider_estimated_price',value:row.estimatedPriceUsd,unit:'USD'}});
 }
 const review=(ok:unknown,code:string):void=>{if(!ok)throw new ReviewWithTrace(code,evidence.filter(e=>e.kind==='SALE').map(e=>({id:e.comp!.id,ordinal:e.comp!.ordinal,selection:e.selection,codes:e.codes})));};
 review(s.asset==='commercial_multifamily'||accepted.length>=p.minComps,p.compPriceBasis==='provider_estimated_comps'?'INSUFFICIENT_POLICY_COMPS':'INSUFFICIENT_VERIFIED_COMPS');
 let value=0,basis='',incomeExplanation:null|{noiUsd:number;capRate:number;capitalWorkUsd:number;incomeValueUsd:number}=null;
 if(s.asset==='house'){assert(s.sqft&&s.sqft>0,'SUBJECT_SIZE_REQUIRED');value=dollars(median(accepted.map(r=>(selectedPrice(r,x) as number)/r.sqft!))*s.sqft);basis=p.compPriceBasis==='provider_estimated_comps'?(p.houseBasis==='estimated_arv_proxy'?'house_provider_estimated_arv':'house_provider_estimated_comps'):p.houseBasis==='renovated_arv'?'house_verified_renovated_sales':'house_verified_market_sales';assert(x.facts.length===0,'UNEXPECTED_INCOME_FACTS');}
 if(s.asset==='land'){assert(s.acres&&s.acres>0&&s.parcel,'PARCEL_FACTS_REQUIRED');value=dollars(median(accepted.map(r=>(selectedPrice(r,x) as number)/r.acres!))*s.acres);basis=p.compPriceBasis==='provider_estimated_comps'?'land_provider_estimated_comps_per_acre':'land_verified_sales_per_acre';assert(x.facts.length===0,'UNEXPECTED_INCOME_FACTS');}
 if(s.asset==='small_multifamily'||s.asset==='commercial_multifamily'){
  assert(s.units&&(s.asset==='small_multifamily'?s.units>=2&&s.units<=4:s.units>=5),'UNIT_COUNT_INVALID');
  assert(x.facts.length===5,'INCOME_FACTS_REQUIRED');
  const values:Record<string,number>={};
  for(const f of x.facts){const unit=['vacancyRate','capRate'].includes(f.name)?'ratio':f.name==='immediateCapitalWork'?'USD':'USD/year';assert(f.unit===unit&&fresh(f.source,c.now,p.maxSourceAgeHours,x.mode==='synthetic_fixture'),'INCOME_SOURCE_INVALID');assert(unit==='ratio'?f.value<1:money.safeParse(f.value).success,'INCOME_PRECISION_INVALID');values[f.name]=f.value;add(f.name,f.value,f.unit,'INCOME',f.source);}
  assert(values.capRate>0&&values.grossScheduledAnnualRent>0,'INCOME_RATE_INVALID');
  const noi=dollars(values.grossScheduledAnnualRent*(1-values.vacancyRate)-values.annualOperatingExpenses),income=dollars(noi/values.capRate),net=dollars(income-values.immediateCapitalWork);
  incomeExplanation={noiUsd:noi,capRate:values.capRate,capitalWorkUsd:values.immediateCapitalWork,incomeValueUsd:income};
  if(s.asset==='commercial_multifamily'){assert(x.comps.length===0,'COMMERCIAL_COMPS_UNSUPPORTED');value=net;basis='commercial_multifamily_noi_cap';}
  else{assert(s.sqft&&p.maxIncomeSalesDifference!==null&&p.crosscheckApprovalReference,'INCOME_CROSSCHECK_POLICY_REQUIRED');value=dollars(median(accepted.map(r=>(selectedPrice(r,x) as number)/r.sqft!))*s.sqft);review(Math.abs(value-income)/value<=p.maxIncomeSalesDifference,'INCOME_SALES_DIVERGENCE');basis=p.compPriceBasis==='provider_estimated_comps'?'small_multifamily_estimated_comps_and_income':'small_multifamily_matched_sales_and_income';}
 }
 const contributing=evidence.filter(e=>e.selection==='ACCEPTED');
 const expiresAt=[p.expiresAt,...contributing.map(e=>e.source.expiresAt),...contributing.map(e=>new Date(Date.parse(e.source.retrievedAt)+p.maxSourceAgeHours*3600000).toISOString()),...accepted.map(row=>new Date(Date.parse(row.saleDate)+p.maxAgeDays*86400000).toISOString())].sort()[0];
 const synthetic=x.mode==='synthetic_fixture',confidence={priceBasis:p.compPriceBasis,recordedSalesVerified:p.compPriceBasis==='verified_recorded_sales'&&s.asset!=='commercial_multifamily',score:null,limitations:p.compPriceBasis==='provider_estimated_comps'?['PROVIDER_ESTIMATES_NOT_RECORDED_SALES','RENOVATION_NOT_ESTABLISHED_BY_PRICE','MARKET_COVERAGE_NOT_ESTABLISHED']:[]};
 add('confidence_price_basis',confidence.priceBasis,'text');
 return {status:synthetic?'SYNTHETIC_NORMALIZED_CANDIDATE':'OBSERVED_POLICY_CANDIDATE',mode:x.mode,context:c,policy:{recordId:p.recordId,version:p.version},sourceVersion:c.sourceVersion,sourceReference:s.source.reference,retrievedAt:s.source.retrievedAt,expiresAt,valueUsd:value,basis,confidence,estimateAcceptanceReference:p.estimateAcceptanceReference,evidence,acceptedCount:accepted.length,rejectedCount:x.comps.length-accepted.length,publicResult:{propertyRecordId:c.property.recordId,providerPropertyId:s.providerPropertyId,analysisRecordId:c.analysisRecordId,analysisVersion:c.analysisVersion,asset:s.asset,valueUsd:value,basis,confidence,acceptedCompIds:accepted.map(r=>r.id),rejectedComps:evidence.filter(e=>e.kind==='SALE'&&e.selection==='REJECTED').map(e=>({id:e.comp!.id,ordinal:e.comp!.ordinal,codes:e.codes})),incomeExplanation,synthetic},outboundEnabled:false as const,authorizationRecorded:false as const};
}
export function atlasWorkflow(input:unknown){try{return calculateNormalized(parseInput(input));}catch(e){return analysisFailure(e);}}
export type Candidate=ReturnType<typeof calculateNormalized>;
export function exactCandidate(a:Candidate,b:Candidate){return same(a,b);}
