/** Owner-selected house wholesale formula and seller-situation routing; explicit versioned repair configuration. */
import {z} from 'zod';
import {assert,context,current,failure,id,instant,money,parseInput,positiveMoney,snapshotGates,text} from './contracts';
import {repairBudget,repairPlan,APPROVED_REPAIR_MODEL,SUPERSEDED_REPAIR_MODEL_VERSIONS} from './repair-model';
const repairScope=z.enum(['light','medium','heavy']);
const arvBasis=z.enum(['house_verified_renovated_sales','house_provider_estimated_arv']);
export const discovery=z.strictObject({contactId:id,propertyRecordId:id,rapportReference:text,sellerWhy:text,sellerWhyReference:text,repairScope,repairScopeReference:text,repairDescription:text});
export const wholesalePolicy=z.strictObject({recordId:id,version:id,approvalReference:text,approvedBy:id,expiresAt:instant,revoked:z.boolean(),formula:z.literal('0.70*ARV-repairs'),allowedArvBases:z.array(arvBasis).min(1),estimateAcceptanceReference:text.nullable(),repairModelVersion:id,repairRatesUsdPerSqft:z.strictObject({light:money.nullable(),medium:money.nullable(),heavy:money.nullable()}),contingencyBps:z.strictObject({light:z.number().int().min(0).max(10000),medium:z.number().int().min(0).max(10000),heavy:z.number().int().min(0).max(10000)}),repairRatesReference:text.nullable()});
export const wholesaleRequest=z.strictObject({context,policy:wholesalePolicy,discovery,repairPlan,subject:z.strictObject({areaBasis:z.literal('living_floor_area'),sqft:z.number().finite().positive(),sourceReference:text}),analysis:z.strictObject({recordId:id,propertyRecordId:id,providerPropertyId:id,version:id,policyRecordId:id,policyVersion:id,arvUsd:positiveMoney,basis:arvBasis,estimateAcceptanceReference:text.nullable(),expiresAt:instant,evidenceReadbackReference:text})});
export function calculateWholesale(raw:unknown){
 const x=wholesaleRequest.parse(raw),c=x.context,p=x.policy,a=x.analysis,d=x.discovery;current(c);
 assert(c.property.asset==='house','HOUSE_WHOLESALE_ONLY');
 assert(p.recordId===c.policyRecordId&&p.version===c.policyVersion&&!p.revoked&&Date.parse(p.expiresAt)>Date.parse(c.now),'WHOLESALE_POLICY_STALE_OR_MISMATCHED');
 assert(d.propertyRecordId===c.property.recordId&&d.contactId===c.contactId,'DISCOVERY_PROPERTY_MISMATCH');
 assert(a.recordId===c.analysisRecordId&&a.version===c.analysisVersion&&a.propertyRecordId===c.property.recordId&&a.providerPropertyId===c.property.providerPropertyId&&a.policyRecordId===p.recordId&&a.policyVersion===p.version&&Date.parse(a.expiresAt)>Date.parse(c.now),'WHOLESALE_ANALYSIS_STALE_OR_MISMATCHED');
 assert(p.allowedArvBases.includes(a.basis),'ARV_BASIS_OUTSIDE_POLICY');
 if(a.basis==='house_provider_estimated_arv')assert(a.estimateAcceptanceReference&&p.estimateAcceptanceReference===a.estimateAcceptanceReference,'ESTIMATED_ARV_ACCEPTANCE_REQUIRED');
 const rate=p.repairRatesUsdPerSqft[d.repairScope];assert(rate!==null&&p.repairRatesReference,'REPAIR_RATE_NOT_CONFIGURED');
 assert(!SUPERSEDED_REPAIR_MODEL_VERSIONS.includes(p.repairModelVersion),'REPAIR_MODEL_SUPERSEDED');
 if(p.repairModelVersion===APPROVED_REPAIR_MODEL.version)assert((['light','medium','heavy'] as const).every(scope=>p.repairRatesUsdPerSqft[scope]===APPROVED_REPAIR_MODEL.ratesUsdPerSqft[scope]&&p.contingencyBps[scope]===APPROVED_REPAIR_MODEL.contingencyBps[scope]),'REPAIR_MODEL_VERSION_CONFLICT');
 const budget=repairBudget(x.repairPlan,x.subject.sqft,rate,p.contingencyBps[d.repairScope]);
 const arvCents=Math.round(a.arvUsd*100),repairCents=budget.totalCents;
 assert(Number.isSafeInteger(arvCents*7)&&Number.isSafeInteger(repairCents),'FORMULA_PRECISION_INVALID');
 const seventyPercentCents=Math.round(arvCents*7/10),offerCents=seventyPercentCents-repairCents;
 assert(Number.isSafeInteger(offerCents)&&offerCents>0,'NONPOSITIVE_WHOLESALE_OFFER');
 return {status:'WHOLESALE_FORMULA_CANDIDATE',propertyRecordId:c.property.recordId,providerPropertyId:c.property.providerPropertyId,contactId:c.contactId,analysisRecordId:a.recordId,analysisVersion:a.version,policyRecordId:p.recordId,policyVersion:p.version,formula:p.formula,arvUsd:a.arvUsd,arvBasis:a.basis,confidence:{label:a.basis==='house_provider_estimated_arv'?'PROVIDER_ESTIMATED_ARV':'VERIFIED_RENOVATED_COMPARABLES',score:null,repairs:'PROVISIONAL_SCOPE_ESTIMATE'},subjectSqft:x.subject.sqft,repairScope:d.repairScope,repairRateUsdPerSqft:rate,repairModelVersion:p.repairModelVersion,repairBudget:budget,repairsUsd:repairCents/100,seventyPercentArvUsd:seventyPercentCents/100,requestedOfferUsd:offerCents/100,additionalDeductionsUsd:0,expiresAt:[p.expiresAt,a.expiresAt].sort()[0],sourceReferences:{analysis:a.evidenceReadbackReference,sqft:x.subject.sourceReference,rates:p.repairRatesReference,scope:d.repairScopeReference},nextStep:'VALIDATE_EXACT_TERMS_STANDING_RANGE_AND_SOURCED_CEILING',sellerFacingPacket:null,outboundEnabled:false,authorizationRecorded:false};
}
const answer=z.enum(['yes','no','unknown']);
export const alternativesRequest=z.strictObject({context,sellerFacts:z.strictObject({propertyRecordId:id,contactId:id,reportReference:text,existingMortgage:answer,lowEquity:answer,ownsFreeAndClear:answer,rejectedWholesaleCash:answer,willingPartnershipToSell:answer})});
export function exploreAlternatives(raw:unknown){const x=alternativesRequest.parse(raw),c=x.context,s=x.sellerFacts;snapshotGates(c);
 assert(c.property.asset==='house','HOUSE_STRATEGY_ROUTING_ONLY');
 assert(s.propertyRecordId===c.property.recordId&&s.contactId===c.contactId,'SELLER_SITUATION_PROPERTY_MISMATCH');
 assert(!(s.existingMortgage==='yes'&&s.ownsFreeAndClear==='yes'),'CONFLICTING_SELLER_REPORTS');
 const candidates:string[]=[];
 if(s.existingMortgage==='yes'&&s.lowEquity==='yes')candidates.push('SUBJECT_TO_EXPLORATION');
 if(s.ownsFreeAndClear==='yes'&&s.rejectedWholesaleCash==='yes')candidates.push('SELLER_FINANCING_MONTHLY_PAYMENTS_EXPLORATION');
 if(s.willingPartnershipToSell==='yes')candidates.push('NOVATION_PARTNERSHIP_EXPLORATION');
 return {status:'SELLER_SITUATION_CANDIDATES',propertyRecordId:c.property.recordId,candidates,selectionRequired:candidates.length>1,evidenceClass:'SELLER_REPORTED_UNVERIFIED',reportReference:s.reportReference,loanAssumable:null,lenderConsent:null,equityVerified:false,enforceableTerms:null,financingTerms:null,authorizationRecorded:false,outboundEnabled:false};}
export const acquisitionPolicyInput=z.discriminatedUnion('operation',[z.strictObject({operation:z.literal('calculate_wholesale'),request:wholesaleRequest}),z.strictObject({operation:z.literal('explore_alternatives'),request:alternativesRequest})]);
export function acquisitionPolicyWorkflow(input:unknown){try{const x=acquisitionPolicyInput.parse(parseInput(input));return x.operation==='calculate_wholesale'?calculateWholesale(x.request):exploreAlternatives(x.request);}catch(e){return failure(e);}}
