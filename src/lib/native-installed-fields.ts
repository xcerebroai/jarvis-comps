/** Exact newly installed scalar fields. Structured supplements still require native context
 * storage, version/authority binding and verified capacity; do not infer absent arrays/intake. */
import {z} from 'zod';
import {assert,policy as compPolicy,same} from './native/contracts';
import {wholesalePolicy} from './native/acquisition-policy';
import {offerKey,packet,offerRequest,standing,terms} from './native/offers';
import type {QuoteSnapshot} from './native-quote-contract';
import inventory from '../../native-deliverables/native-installed-schema.json';
export const INSTALLED={policy:'custom_objects.jarvis_acq_policies',offer:'custom_objects.jarvis_acq_offers',ceiling:'custom_objects.jarvis_acq_sourced_ceilings',event:'custom_objects.jarvis_acq_lifecycle_events'} as const;
type Properties=Record<string,unknown>;
const bool=(x:unknown)=>{assert(x==='true'||x==='false','NATIVE_BOOLEAN_INVALID');return x==='true';};
function project(schema:keyof typeof inventory.objects,raw:Properties){const fields=inventory.objects[schema].fields;return Object.fromEntries(Object.entries(raw).filter(([key])=>Object.hasOwn(fields,key)));}
const nullable=(x:unknown)=>x===''||x===null?null:x; // Missing remains undefined and fails required schema.
function nativeTerms(p:Properties){return terms.parse({closingDate:p.closing_date,depositUsd:p.deposit_usd,inspectionDays:p.inspection_days,assignmentAllowed:bool(p.assignment_allowed),financing:p.financing,sellerConcessionsUsd:p.seller_concessions_usd});}
export function decodeInstalledPolicy(recordId:string,raw:Properties,s:QuoteSnapshot,configurationScope:string){
 const p=project(INSTALLED.policy,raw);assert(p.configuration_scope===configurationScope&&configurationScope!=='REPAIR_DEFAULTS_ONLY_NO_OFFER_AUTHORITY','NATIVE_POLICY_CONFIGURATION_INCOMPLETE');assert(s.observed.operation==='reconcile','NATIVE_CONTEXT_INCOMPLETE');
 const common={recordId,version:p.version,approvalReference:p.approval_reference,approvedBy:p.approved_by,expiresAt:p.expires_at,revoked:bool(p.revoked)};
 const comp=compPolicy.parse({...s.observed.bound.policy,...common,maxIncomeSalesDifference:nullable(p.max_income_sales_difference),minComps:p.min_comps,sizeTolerance:p.size_tolerance,radiusMiles:p.radius_miles,maxSourceAgeHours:p.max_source_age_hours,maxAgeDays:p.max_age_days,houseBasis:p.house_basis,compPriceBasis:p.comp_price_basis,crosscheckApprovalReference:nullable(p.crosscheck_approval_reference),estimateAcceptanceReference:nullable(p.estimate_acceptance_reference)});
 const wholesale=wholesalePolicy.parse({...s.wholesale.policy,...common,estimateAcceptanceReference:nullable(p.estimate_acceptance_reference),repairModelVersion:p.repair_model_version,repairRatesReference:nullable(p.repair_rates_reference),repairRatesUsdPerSqft:{light:p.repair_light_usd_per_sqft,medium:p.repair_medium_usd_per_sqft,heavy:p.repair_heavy_usd_per_sqft},contingencyBps:{light:p.contingency_light_bps,medium:p.contingency_medium_bps,heavy:p.contingency_heavy_bps}});
 const offerStanding=standing.parse({...s.offer.standing,...common,propertyRecordId:p.property_record_id,recipientId:p.recipient_id,asset:p.asset,strategy:p.strategy,minPriceUsd:p.min_price_usd,maxPriceUsd:p.max_price_usd,estimateAcceptanceReference:nullable(p.estimate_acceptance_reference),terms:nativeTerms(p)});
 // Structured accepted bases/labels and intake live in the protected, version-bound context event.
 assert(same(comp,s.observed.bound.policy)&&same(wholesale,s.wholesale.policy)&&same(offerStanding,s.offer.standing),'NATIVE_POLICY_SUPPLEMENT_VERSION_MISMATCH');
 return {compPolicy:comp,wholesalePolicy:wholesale,standing:offerStanding,adoption:s.compPolicyAdoption};
}
export function decodeInstalledPacket(raw:Properties){const p=project(INSTALLED.offer,raw);const out=packet.parse({propertyRecordId:p.property_record_id,providerPropertyId:p.provider_property_id,propertyVersion:p.property_version,recipientId:p.recipient_id,asset:p.asset,strategy:p.strategy,analysisRecordId:p.analysis_record_id,analysisVersion:p.analysis_version,policyRecordId:p.policy_record_id,policyVersion:p.policy_version,priceUsd:p.price_usd,revision:p.revision,terms:nativeTerms(p)});assert(p.packet_key===offerKey(out),'NATIVE_PACKET_KEY_MISMATCH');return out;}
export function decodeInstalledCeiling(recordId:string,raw:Properties){const p=project(INSTALLED.ceiling,raw);return offerRequest.shape.ceiling.parse({recordId,sourceReference:p.source_reference,approvedBy:p.approved_by,propertyRecordId:p.property_record_id,analysisRecordId:p.analysis_record_id,analysisVersion:p.analysis_version,policyRecordId:p.policy_record_id,policyVersion:p.policy_version,expiresAt:p.expires_at,valuationBasis:p.valuation_basis,ceilingUsd:p.ceiling_usd});}
export function decodeInstalledOffer(raw:Properties,ceilingRecordId:string,ceiling:Properties,s:QuoteSnapshot,approvedStates:string[]){const state=z.string().min(1).parse(raw.approval_state);assert(approvedStates.includes(state),'NATIVE_OFFER_NOT_APPROVED');const out={...s.offer,packet:decodeInstalledPacket(raw),ceiling:decodeInstalledCeiling(ceilingRecordId,ceiling)};assert(same(out.packet,s.offer.packet)&&same(out.ceiling,s.offer.ceiling),'NATIVE_OFFER_SUPPLEMENT_VERSION_MISMATCH');return offerRequest.parse(out);}
