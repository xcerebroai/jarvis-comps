/** Observed sanitized contract integration. No transport, raw response access or implicit unit assumptions. */
import {z} from 'zod';
import {adaptAddressProjection,adaptCompsProjection,OBSERVED_CONTRACT} from '../../../native-deliverables/observed-source/provider-mapping/observed-provider-adapter.mjs';
import {analysisRequest,assert,compPriceBasis,context,failure,id,instant,parseInput,policy,text,type AnalysisRequest,type Source} from './contracts';
import {analysisFailure,calculateValidatedCandidate,validateNormalizedInput,type Candidate} from './atlas';
import {limits,prepareCandidateStorage,readback,reconcileCandidateStorage} from './storage';
export const OBSERVED_SAMPLE_SCHEMA_VERIFIED=true;
export const OBSERVED_SCHEMA_REVISION='observed-2026-10-07';
const expectedAddress=z.union([z.strictObject({full_address:text}),z.strictObject({street:text,city:text,state:text,zip:text})]);
const selection=z.strictObject({basis:compPriceBasis,acceptanceReference:text});
const pair=z.strictObject({expectedPropertyId:id,expectedSubjectAddress:text,expectedAddress,addressProjection:z.unknown(),compsProjection:z.unknown(),pricingSelection:selection.nullable()});
const observation=z.object({presence:z.enum(['MISSING','NULL','VALUE']),type:z.string(),value:z.union([z.string(),z.number(),z.array(z.number()),z.null()])});
const provenance=z.object({provider:z.string(),endpoint:z.string(),responsePath:z.string(),requestSentAt:z.string().nullable(),observedAt:z.string().nullable(),retrievedAt:z.null(),providerSourceReference:z.null(),providerUpdatedAt:z.null(),expiresAt:z.null()}).passthrough();
const mappedAddress=z.object({observationStatus:z.literal('ADDRESS_MATCHED_UNVERIFIED'),providerPropertyId:z.string(),canonicalAddress:z.string(),observations:z.record(z.string(),observation),source:provenance}).passthrough();
const mappedComps=z.object({observationStatus:z.literal('VALIDATED_UNVERIFIED'),subject:z.object({providerPropertyId:z.string(),observations:z.record(z.string(),observation),source:provenance}).passthrough(),comps:z.array(z.object({providerPropertyId:z.string(),providerRowOrdinal:z.number(),responsePath:z.string(),priceKind:z.enum(['ESTIMATED','UNKNOWN','LISTING_OR_PENDING']),observations:z.record(z.string(),observation),source:provenance}).passthrough()),completeness:z.object({observedRowCount:z.number(),allReturnedRowsRepresented:z.literal(true),marketCompletenessVerified:z.literal(false)}).passthrough()}).passthrough();
const verifiedUnit=<T extends string>(value:T)=>z.strictObject({value:z.literal(value),reference:text});
const captured=z.strictObject({reference:text,capturedAt:instant,eligibleUntil:instant});
const bindings=z.strictObject({classification:z.strictObject({asset:z.literal('house'),propertyType:text,reference:text}),currency:verifiedUnit('USD'),livingArea:verifiedUnit('sqft'),distance:verifiedUnit('mile'),lot:z.strictObject({value:z.enum(['acre','sqft']),reference:text}).nullable(),addressCapture:captured,compsCapture:captured});
const bound=z.strictObject({context,policy,bindings});
export const observedInput=z.discriminatedUnion('operation',[
 z.strictObject({operation:z.literal('review'),pair}),
 z.strictObject({operation:z.literal('analyze'),pair,bound}),
 z.strictObject({operation:z.literal('prepare'),pair,bound,fieldLimits:limits}),
 z.strictObject({operation:z.literal('reconcile'),pair,bound,fieldLimits:limits,readback}),
]);
function validatePair(input:z.infer<typeof pair>){
 const addressResult=adaptAddressProjection(input.addressProjection,{expectedAddress:input.expectedAddress,expectedPropertyId:input.expectedPropertyId});
 const compsResult=adaptCompsProjection(input.compsProjection,{expectedPropertyId:input.expectedPropertyId,expectedSubjectAddress:input.expectedSubjectAddress});
 const address=mappedAddress.safeParse(addressResult),comps=mappedComps.safeParse(compsResult);
 if(!address.success||!comps.success)return {ok:false as const,address:addressResult,comps:compsResult};
 assert(address.data.providerPropertyId===comps.data.subject.providerPropertyId,'OBSERVED_PAIR_ID_MISMATCH');
 if('street' in input.expectedAddress)assert(input.expectedAddress.street===input.expectedSubjectAddress,'OBSERVED_PAIR_ADDRESS_MISMATCH');
 return {ok:true as const,address:address.data,comps:comps.data};
}
function numberFact(facts:Record<string,z.infer<typeof observation>>,key:string){const x=facts[key];assert(x?.presence==='VALUE'&&typeof x.value==='number'&&Number.isFinite(x.value),'REQUIRED_OBSERVED_NUMBER_MISSING');return x.value;}
function textFact(facts:Record<string,z.infer<typeof observation>>,key:string){const x=facts[key];assert(x?.presence==='VALUE'&&typeof x.value==='string','REQUIRED_OBSERVED_TEXT_MISSING');return x.value;}
export function reviewObservedPair(raw:unknown){
 const input=pair.parse(raw),result=validatePair(input);
 if(!result.ok)return {status:'NEEDS_REVIEW',reason:'OBSERVED_PAIR_INVALID',...result,synthetic:false,valuation:null,outboundEnabled:false,authorizationRecorded:false};
 const estimatesSelected=input.pricingSelection?.basis==='provider_estimated_comps';
 const mappedReview={...result.comps,reasons:estimatesSelected?['UNITS_AND_CURRENCY_UNVERIFIED','SOURCE_PROVENANCE_INCOMPLETE','TENANT_POLICY_NOT_BOUND']:result.comps.reasons,comps:result.comps.comps.map(row=>({...row,eligibleForSelectedPricePolicy:estimatesSelected&&row.priceKind==='ESTIMATED'&&row.observations.type?.value==='sale',eligibleForValuation:false,exclusionReasons:['UNITS_AND_CURRENCY_UNVERIFIED','SOURCE_PROVENANCE_INCOMPLETE','TENANT_POLICY_NOT_BOUND']}))};
 const priceAccepted=result.comps.comps.filter(row=>input.pricingSelection?.basis==='provider_estimated_comps'&&row.priceKind==='ESTIMATED'&&row.observations.type?.value==='sale').length;
 return {status:'OBSERVED_PAIR_REQUIRES_BINDINGS',schemaRevision:OBSERVED_SCHEMA_REVISION,schemaVerifiedForObservedSample:true,address:result.address,comps:mappedReview,pricingSelection:input.pricingSelection,priceSelection:{estimatedCount:result.comps.comps.filter(r=>r.priceKind==='ESTIMATED').length,acceptedPriceTypeCount:priceAccepted,verifiedRecordedSaleCount:0,valuationEligibleCount:0},blockers:[...(!input.pricingSelection?['COMP_PRICE_POLICY_NOT_SELECTED']:[]),'TRUSTED_NATIVE_CONTEXT_REQUIRED','TENANT_SELECTION_AND_FRESHNESS_POLICY_REQUIRED','CURRENCY_AREA_DISTANCE_BINDINGS_REQUIRED','TRUSTED_CAPTURE_FRESHNESS_REQUIRED','HOUSE_CLASSIFICATION_BINDING_REQUIRED'],confidence:{label:'PROVIDER_ESTIMATED_PRICES',score:null,providerUpdatedAt:null,marketCoverage:'UNKNOWN'},synthetic:false,valuation:null,outboundEnabled:false,authorizationRecorded:false};
}
function captureSource(x:z.infer<typeof captured>,observed:z.infer<typeof provenance>,now:string,path:string):Source{
 assert(Date.parse(x.capturedAt)<=Date.parse(now)&&Date.parse(x.capturedAt)<Date.parse(x.eligibleUntil),'CAPTURE_FRESHNESS_INVALID');
 if(observed.requestSentAt)assert(Date.parse(x.capturedAt)>=Date.parse(observed.requestSentAt),'CAPTURE_PRECEDES_REQUEST');
 return {provider:'DealMachine',reference:`${x.reference} ${path}`,retrievedAt:x.capturedAt,expiresAt:x.eligibleUntil,contractVersion:OBSERVED_CONTRACT,synthetic:false};
}
export function bindObservedAnalysis(rawPair:unknown,rawBound:unknown){
 const input=pair.parse(rawPair),b=bound.parse(rawBound),observed=validatePair(input);assert(observed.ok,'OBSERVED_PAIR_INVALID');
 const {context:c,policy:p,bindings:v}=b;
 assert(input.pricingSelection?.basis==='provider_estimated_comps'&&p.compPriceBasis===input.pricingSelection.basis&&p.estimateAcceptanceReference===input.pricingSelection.acceptanceReference,'ESTIMATED_POLICY_BINDING_MISMATCH');
 assert(c.property.providerPropertyId===input.expectedPropertyId&&c.property.canonicalAddress===observed.address.canonicalAddress,'NATIVE_OBSERVED_IDENTITY_MISMATCH');
 assert(c.property.asset==='house'&&v.classification.asset==='house','OBSERVED_ASSET_MAPPING_UNAVAILABLE');
 const a=observed.address.observations,s=observed.comps.subject.observations;
 assert(textFact(a,'property_type')===v.classification.propertyType&&textFact(s,'property_type')===v.classification.propertyType,'SUBJECT_CLASSIFICATION_MISMATCH');
 const sqft=numberFact(a,'living_area_sqft');assert(sqft>0&&sqft===numberFact(s,'sqft'),'SUBJECT_GEOMETRY_MISMATCH');
 const units=a.num_units?.value;assert(units===null||units===0||units===1,'HOUSE_UNIT_COUNT_CONFLICT');
 const subjectSource=captureSource(v.addressCapture,observed.address.source,c.now,'$.data[0]');
 const compSource=captureSource(v.compsCapture,observed.comps.subject.source,c.now,'$.data[0].subject');
 const toAcres=(facts:Record<string,z.infer<typeof observation>>)=>v.lot&&facts.lot_size?.presence==='VALUE'?numberFact(facts,'lot_size')/(v.lot.value==='sqft'?43560:1):null;
 const normalized:AnalysisRequest=analysisRequest.parse({contract:'jarvis.normalized-analysis.v2',mode:'real',context:c,policy:p,sourceContract:{id:OBSERVED_CONTRACT,verificationReference:OBSERVED_SCHEMA_REVISION},subject:{providerPropertyId:input.expectedPropertyId,identityReference:c.property.sourceIdentityReference,canonicalAddress:observed.address.canonicalAddress,propertyType:v.classification.propertyType,asset:'house',sqft,acres:null,units:units===1?1:null,parcel:null,source:subjectSource},comps:observed.comps.comps.map(row=>{
  const facts=row.observations,rawDate=textFact(facts,'sale_date');
  assert(row.priceKind==='ESTIMATED'&&textFact(facts,'type')==='sale','OBSERVED_COMP_PRICE_CLASS_UNSUPPORTED');
  return {id:row.providerPropertyId,ordinal:row.providerRowOrdinal,displayAddress:textFact(facts,'address'),propertyType:textFact(facts,'property_type'),salePriceUsd:null,estimatedPriceUsd:numberFact(facts,'sale_price'),priceKind:'ESTIMATED',saleDate:Date.parse(rawDate)>Date.parse(c.now)?rawDate:rawDate.slice(0,10),saleType:textFact(facts,'sale_type'),saleVerified:false,renovatedComparable:false,distanceMiles:numberFact(facts,'distance'),sqft:numberFact(facts,'sqft'),acres:toAcres(facts),units:null,parcel:null,source:{...compSource,reference:`${v.compsCapture.reference} ${row.responsePath}`}};
 }),facts:[]});
 return {request:validateNormalizedInput(normalized),observed,bindings:v};
}
function addObservedEvidence(result:Candidate,b:ReturnType<typeof bindObservedAnalysis>){
 const add=(name:string,value:string|number,unit='text',source=b.request.subject.source,originComp?:{id:string;ordinal:number})=>result.evidence.push({key:`observed:${originComp?.ordinal??'subject'}:${name}`,kind:originComp?'SALE_FACT':'SUBJECT',selection:originComp?result.evidence.find(e=>e.kind==='SALE'&&e.comp?.ordinal===originComp.ordinal)!.selection:'ACCEPTED',codes:originComp?result.evidence.find(e=>e.kind==='SALE'&&e.comp?.ordinal===originComp.ordinal)!.codes:[],source,originComp,fact:{name,value,unit}});
 add('observed_schema_revision',OBSERVED_SCHEMA_REVISION);add('freshness_clock','INDEPENDENT_CAPTURE_NOT_PROVIDER_UPDATE');add('provider_updated_at','UNKNOWN');add('market_coverage','UNKNOWN');add('classification_reference',b.bindings.classification.reference);add('currency_verification',b.bindings.currency.reference);add('area_unit_verification',b.bindings.livingArea.reference);add('distance_unit_verification',b.bindings.distance.reference);add('lot_unit_verification',b.bindings.lot?.reference??'UNKNOWN_NOT_USED_FOR_HOUSE');
 add('address_num_units_observed',String(b.observed.address.observations.num_units?.value??'UNKNOWN'));
 for(const row of b.observed.comps.comps){const comp=b.request.comps[row.providerRowOrdinal];add('sale_date_raw',textFact(row.observations,'sale_date'),'provider_date',comp.source,{id:comp.id,ordinal:comp.ordinal});add('price_response_path',`${row.responsePath}.sale_price`,'text',comp.source,{id:comp.id,ordinal:comp.ordinal});}
 result.confidence.limitations.push('PROVIDER_UPDATE_TIME_UNKNOWN','MARKET_COVERAGE_UNKNOWN','FRESHNESS_USES_INDEPENDENT_CAPTURE');
 return result;
}
export function observedWorkflow(input:unknown){try{
 const x=observedInput.parse(parseInput(input));if(x.operation==='review')return reviewObservedPair(x.pair);
 const boundResult=bindObservedAnalysis(x.pair,x.bound),candidate=addObservedEvidence(calculateValidatedCandidate(boundResult.request),boundResult);
 if(x.operation==='analyze')return {...candidate,observedSchemaRevision:OBSERVED_SCHEMA_REVISION,providerMetadata:{updatedAt:null,sourceExpiry:null,marketCoverage:'UNKNOWN'},normalizationBindings:boundResult.bindings};
 const plan=prepareCandidateStorage(boundResult.request,candidate,x.fieldLimits);
 return x.operation==='prepare'?plan:reconcileCandidateStorage(boundResult.request,plan,x.readback);
}catch(error){return error instanceof z.ZodError?failure(error):analysisFailure(error);}}
