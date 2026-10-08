/** Normalized adapter contract. These are NOT claimed DealMachine response paths. */
import {z} from 'zod';
export const LOCATION = 'SesCoVXlNu7qTSBol1gs';
export const id = z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:-]+$/);
export const text = z.string().trim().min(1).max(500);
export const instant = z.string().datetime({offset:false}).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v, 'Canonical UTC timestamp required');
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v);
export const nonnegative = z.number().finite().nonnegative();
export const money = nonnegative.refine(v => Number.isSafeInteger(Math.round(v*100)) && Math.abs(v*100-Math.round(v*100))<1e-6);
export const positiveMoney = money.refine(v => v>0);
export const asset = z.enum(['house','land','small_multifamily','commercial_multifamily']);
export const source = z.strictObject({provider:text,reference:text,retrievedAt:instant,expiresAt:instant,contractVersion:id,synthetic:z.boolean()});
export const parcel = z.strictObject({zoning:text,legalAccess:text,utilities:text,floodStatus:text,boundaryReference:text});
export const subject = z.strictObject({providerPropertyId:id,identityReference:text,canonicalAddress:text,propertyType:text,asset,sqft:nonnegative.nullable(),acres:nonnegative.nullable(),units:z.number().int().positive().nullable(),parcel:parcel.nullable(),source});
export const comp = z.strictObject({id,ordinal:z.number().int().nonnegative(),displayAddress:text,propertyType:text,salePriceUsd:z.union([z.number(),z.string().max(100),z.null()]),estimatedPriceUsd:money.nullable().optional(),priceKind:z.enum(['RECORDED','ESTIMATED','UNKNOWN']),saleDate:z.string().max(40),saleType:text,saleVerified:z.boolean(),renovatedComparable:z.boolean(),distanceMiles:nonnegative,sqft:nonnegative.nullable(),acres:nonnegative.nullable(),units:z.number().int().positive().nullable(),parcel:parcel.nullable(),source});
export const fact = z.strictObject({name:z.enum(['grossScheduledAnnualRent','vacancyRate','annualOperatingExpenses','capRate','immediateCapitalWork']),value:nonnegative,unit:z.enum(['USD/year','USD','ratio']),source});
export const property = z.strictObject({recordId:id,propertyKey:id,providerPropertyId:id,propertyVersion:id,canonicalAddress:text,sourceIdentityReference:text,asset,currentAnalysisId:id.or(z.literal('')),currentAnalysisVersion:id.or(z.literal('')),held:z.enum(['true','false']),humanTakeover:z.enum(['true','false']),status:z.enum(['UNQUALIFIED','READY','HELD','UNDER_CONTRACT']),holdReason:z.string().max(500)});
export const context = z.strictObject({locationId:z.literal(LOCATION),now:instant,contactId:id,associatedPropertyRecordIds:z.array(id).min(1).max(100),contactDnd:z.boolean(),contactTakeover:z.boolean(),property,analysisRecordId:id,analysisKey:z.string().min(1).max(4000),analysisVersion:id,expectedPropertyVersion:id,expectedCurrentAnalysisId:id.or(z.literal('')),expectedCurrentAnalysisVersion:id.or(z.literal('')),policyRecordId:id,policyVersion:id,sourceVersion:id,eventId:id});
export const compPriceBasis=z.enum(['verified_recorded_sales','provider_estimated_comps']);
export const valuationBasis=z.enum(['house_verified_market_sales','house_verified_renovated_sales','house_provider_estimated_comps','house_provider_estimated_arv','land_verified_sales_per_acre','land_provider_estimated_comps_per_acre','small_multifamily_matched_sales_and_income','small_multifamily_estimated_comps_and_income','commercial_multifamily_noi_cap']);
export const policy = z.strictObject({recordId:id,version:id,approvalReference:text,approvedBy:id,expiresAt:instant,revoked:z.boolean(),compPriceBasis,estimateAcceptanceReference:text.nullable(),estimatedSaleTypes:z.array(text).max(50),maxAgeDays:z.number().positive(),maxSourceAgeHours:z.number().positive(),radiusMiles:z.number().positive(),sizeTolerance:nonnegative.max(0.999999),minComps:z.number().int().min(1).max(100),verifiedSaleTypes:z.array(text).max(50),houseBasis:z.enum(['comparable_market_value','renovated_arv','estimated_arv_proxy']),maxIncomeSalesDifference:nonnegative.max(0.999999).nullable(),crosscheckApprovalReference:text.nullable()});
export const analysisRequest = z.strictObject({contract:z.literal('jarvis.normalized-analysis.v2'),mode:z.enum(['real','synthetic_fixture']),context,policy,sourceContract:z.strictObject({id,verificationReference:text}),subject,comps:z.array(comp).max(100),facts:z.array(fact).max(5)});
export type Context = z.infer<typeof context>;
export type AnalysisRequest = z.infer<typeof analysisRequest>;
export type Comp = z.infer<typeof comp>;
export type Source = z.infer<typeof source>;
export function canonical(value:unknown):string {
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
}
export function same(a:unknown,b:unknown){return canonical(a)===canonical(b);}
export function assert(ok:unknown,code:string):asserts ok{if(!ok)throw new Error(code);}
export function snapshotGates(c:Omit<Context,'analysisRecordId'|'analysisKey'>){
 assert(Boolean(c.property.currentAnalysisId)===Boolean(c.property.currentAnalysisVersion)&&Boolean(c.expectedCurrentAnalysisId)===Boolean(c.expectedCurrentAnalysisVersion),'INCOMPLETE_ANALYSIS_POINTER');
 assert(!c.contactDnd&&!c.contactTakeover&&c.property.held==='false'&&c.property.humanTakeover==='false'&&!c.property.holdReason&&c.property.status==='READY','HELD_OR_NOT_READY');
 assert(c.associatedPropertyRecordIds.includes(c.property.recordId),'SELLER_PROPERTY_ASSOCIATION_MISSING');
 assert(c.property.propertyVersion===c.expectedPropertyVersion,'PROPERTY_VERSION_CHANGED');
 assert(c.property.currentAnalysisId===c.expectedCurrentAnalysisId&&c.property.currentAnalysisVersion===c.expectedCurrentAnalysisVersion,'POINTER_SNAPSHOT_CHANGED');
}
export function current(c:Context,requireAnalysisCurrent=true){
 snapshotGates(c);
 if(requireAnalysisCurrent)assert(c.property.currentAnalysisId===c.analysisRecordId&&c.property.currentAnalysisVersion===c.analysisVersion,'CURRENT_ANALYSIS_MISMATCH');
}
export function fresh(s:Source,now:string,hours:number,synthetic:boolean){const n=Date.parse(now),r=Date.parse(s.retrievedAt),e=Date.parse(s.expiresAt);return s.synthetic===synthetic&&r<=n&&n<e&&e>r&&(n-r)/3600000<=hours;}
export function dollars(n:number){const cents=Math.round(n*100);assert(Number.isSafeInteger(cents)&&cents>0,'INVALID_VALUE_PRECISION');return cents/100;}
export function median(v:number[]){const s=[...v].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}
export function parseInput(input:unknown):unknown {
 const envelope=z.strictObject({requestJson:z.string().min(1).max(250000)}).parse(input);
 return JSON.parse(envelope.requestJson);
}
export function failure(error:unknown){return {status:'NEEDS_REVIEW' as const,reason:error instanceof z.ZodError?'INPUT_SCHEMA_INVALID':error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'INVALID_INPUT',outboundEnabled:false as const,authorizationRecorded:false as const};}
