/** Pure write intents and reconciliation. There is no native CRUD, lock, or transaction here. */
import {z} from 'zod';
import {auditNativeManifest,decodeNativePropertyRecord,nativePropertyInput,NATIVE_SCHEMAS} from './native-fields';
import manifest from '../../../native-deliverables/schema-manifest.json';
import {calculateNormalized,analysisFailure,type Candidate} from './atlas';
import {analysisRequest,assert,canonical,current,id,parseInput,same,snapshotGates,context,policy,type AnalysisRequest} from './contracts';
const schemas=manifest.objects;
export const PROPERTY=NATIVE_SCHEMAS.property,ANALYSIS=NATIVE_SCHEMAS.analysis,EVIDENCE=NATIVE_SCHEMAS.evidence;
export type Properties=Record<string,string|number>;
export type Intent={schemaKey:string;recordId:string|null;uniqueKey:string;parentRecordId:string;properties:Properties};
export const limits=z.strictObject({verificationReference:z.string().min(1).max(500),maxTextBytes:z.number().int().positive().max(100000),maxKeyBytes:z.number().int().positive().max(100000)});
// Length-prefixing is collision-free, unlike concatenation with an unescaped delimiter.
export function stableKey(parts:string[]){return parts.map(p=>`${p.length}:${p}`).join('');}
function utf8Bytes(v:string){return new TextEncoder().encode(v).length;}
function check(intent:Intent,l:z.infer<typeof limits>){
 auditNativeManifest();
 const schema=schemas.find(s=>s.schemaKey===intent.schemaKey)!;
 for(const [key,value] of Object.entries(intent.properties)){
  const field=Object.entries(schema.fields).find(([name])=>name===key)?.[1];assert(field,'UNMAPPED_NATIVE_FIELD');
  assert(field.uiType==='Number'?typeof value==='number'&&Number.isFinite(value):typeof value==='string','NATIVE_FIELD_TYPE_MISMATCH');
  if(typeof value==='string')assert(utf8Bytes(value)<=l.maxTextBytes,'NATIVE_TEXT_CAP_EXCEEDED');
 }
 assert(utf8Bytes(intent.uniqueKey)<=l.maxKeyBytes,'NATIVE_KEY_CAP_EXCEEDED');
 return intent;
}
export const allocationInput=z.strictObject({context:context.omit({analysisRecordId:true,analysisKey:true}),policy,mode:z.enum(['synthetic_fixture','real'])});
export function allocateAnalysis(raw:unknown,rawLimits:unknown){
 const x=allocationInput.parse(raw),c=x.context,p=x.policy,l=limits.parse(rawLimits);snapshotGates(c);
 if(x.mode==='synthetic_fixture')assert(c.property.providerPropertyId.startsWith('SYNTHETIC-')&&p.approvalReference.startsWith('SYNTHETIC-'),'FIXTURE_IDENTITIES_REQUIRED');
 else assert(/^prop_[0-9]+$/.test(c.property.providerPropertyId)&&![c.property.recordId,c.contactId,p.recordId,p.approvalReference].some(v=>v.startsWith('SYNTHETIC-')),'SYNTHETIC_REAL_MIX');
 assert(p.recordId===c.policyRecordId&&p.version===c.policyVersion&&!p.revoked&&Date.parse(p.expiresAt)>Date.parse(c.now),'POLICY_STALE_OR_MISMATCHED');
 const key=stableKey([c.locationId,c.property.recordId,c.property.providerPropertyId,c.property.propertyVersion,c.analysisVersion,c.policyRecordId,c.policyVersion,c.sourceVersion,c.eventId]);
 return {status:'ALLOCATE_PENDING_ONLY',mode:x.mode,analysis:check({schemaKey:ANALYSIS,recordId:null,uniqueKey:key,parentRecordId:c.property.recordId,properties:{analysis_key:key,analysis_version:c.analysisVersion,property_record_id:c.property.recordId,property_key:c.property.propertyKey,provider_property_id:c.property.providerPropertyId,policy_id:c.policyRecordId,policy_version:c.policyVersion,source_version:c.sourceVersion,status:'PENDING',completion_state:'INCOMPLETE'}},l),pointerUpdate:null,outboundEnabled:false};
}
export function prepareStorage(raw:unknown,rawLimits:unknown){
 const input=analysisRequest.parse(raw);return prepareCandidateStorage(input,calculateNormalized(input),rawLimits);
}
/** Internal observed-adapter composition; not a request-controlled bypass of the generic workflow. */
export function prepareCandidateStorage(input:AnalysisRequest,result:Candidate,rawLimits:unknown){
 const c=result.context,l=limits.parse(rawLimits);assert(same(c,input.context),'CANDIDATE_CONTEXT_MISMATCH');
 const analysisKey=stableKey([c.locationId,c.property.recordId,c.property.providerPropertyId,c.property.propertyVersion,c.analysisVersion,c.policyRecordId,c.policyVersion,c.sourceVersion,c.eventId]);
 assert(c.analysisKey===analysisKey,'ANALYSIS_KEY_MISMATCH');
 const common={property_record_id:c.property.recordId,analysis_key:analysisKey,analysis_version:c.analysisVersion};
 const analysis=check({schemaKey:ANALYSIS,recordId:c.analysisRecordId,uniqueKey:analysisKey,parentRecordId:c.property.recordId,properties:{...common,property_key:c.property.propertyKey,provider_property_id:c.property.providerPropertyId,policy_id:c.policyRecordId,policy_version:c.policyVersion,expected_evidence_count:result.evidence.length,accepted_count:result.acceptedCount,rejected_count:result.rejectedCount,public_value_usd:result.valueUsd,basis:result.basis,status:'PENDING',completion_state:'INCOMPLETE',expires_at:result.expiresAt,retrieved_at:result.retrievedAt,source_reference:result.sourceReference,source_version:c.sourceVersion}},l);
 const evidence=result.evidence.map(e=>{
  const key=stableKey([analysisKey,e.key]),p:Properties={...common,analysis_record_id:c.analysisRecordId,evidence_key:key,row_kind:e.kind,selection:e.selection,exclusion_codes:e.codes.join('|'),source_provider:e.source.provider,source_reference:e.source.reference,retrieved_at:e.source.retrievedAt,expires_at:e.source.expiresAt,endpoint_contract_version:e.source.contractVersion,source_property_id:e.comp?.id??e.originComp?.id??c.property.providerPropertyId,sale_type:'',sale_date:'',property_type:'',display_address:'',lot_unit:'',fact_name:'',fact_unit:'',fact_value_text:''};
  if(e.comp){const row=e.comp;Object.assign(p,{provider_row_ordinal:row.ordinal,sale_type:row.saleType,sale_date:row.saleDate,property_type:row.propertyType,display_address:row.displayAddress,distance_miles:row.distanceMiles});
   // Never persist an estimated or malformed price as recorded sale evidence.
   if(row.priceKind==='RECORDED'&&row.saleVerified&&!e.codes.includes('UNVERIFIED_SALE')&&typeof row.salePriceUsd==='number'&&Number.isFinite(row.salePriceUsd)&&row.salePriceUsd>0&&!e.codes.includes('INVALID_PRICE'))p.sale_price_usd=row.salePriceUsd;
   if(row.sqft!==null)p.sqft=row.sqft;if(row.acres!==null){p.lot_size=row.acres;p.lot_unit='acre';}
  }
  if(e.originComp)p.provider_row_ordinal=e.originComp.ordinal;
  if(e.fact){p.fact_name=e.fact.name;p.fact_unit=e.fact.unit;if(typeof e.fact.value==='number')p.fact_value_number=e.fact.value;else p.fact_value_text=e.fact.value;}
  return check({schemaKey:EVIDENCE,recordId:null,uniqueKey:key,parentRecordId:c.analysisRecordId,properties:p},l);
 });
 return {status:'WRITE_PLAN_ONLY',mode:input.mode,analysis,evidence,expectedPropertySnapshot:input.context.property,expectedPolicySnapshot:input.policy,publicResult:result.publicResult,outboundEnabled:false,authorizationRecorded:false,pointerUpdate:null,atomicity:'UNVERIFIED_NO_POINTER_UPDATE'};
}
const stored=z.strictObject({schemaKey:z.string(),recordId:id,uniqueKey:z.string(),parentRecordId:id,properties:z.record(z.string(),z.union([z.string(),z.number().finite()]))});
export type Stored=z.infer<typeof stored>;
export function classifyReplay(expected:Intent,raw:unknown){const record=stored.parse(raw);return record.schemaKey===expected.schemaKey&&record.uniqueKey===expected.uniqueKey&&record.parentRecordId===expected.parentRecordId&&(expected.recordId===null||record.recordId===expected.recordId)&&same(record.properties,expected.properties)?'EXACT_REPLAY':'CONFLICT';}
export const contactReadback=z.strictObject({contactId:id,associatedPropertyRecordIds:z.array(id).min(1).max(100),contactDnd:z.boolean(),contactTakeover:z.boolean()});
export const readback=z.strictObject({contact:contactReadback,allPagesRead:z.literal(true),analysis:stored,evidence:z.array(stored).max(1500),property:analysisRequest.shape.context.shape.property,policy:analysisRequest.shape.policy});
export function reconcileStorage(raw:unknown,rawLimits:unknown,rawReadback:unknown){
 const input=analysisRequest.parse(raw);return reconcileCandidateStorage(input,prepareStorage(input,rawLimits),rawReadback);
}
export function reconcileCandidateStorage(input:AnalysisRequest,plan:ReturnType<typeof prepareCandidateStorage>,rawReadback:unknown){
 const read=readback.parse(rawReadback);
 assert(read.contact.contactId===input.context.contactId,'CONTACT_READBACK_MISMATCH');
 current({...input.context,...read.contact,property:read.property},false);
 assert(same(read.property,plan.expectedPropertySnapshot)&&same(read.policy,plan.expectedPolicySnapshot),'STORAGE_SNAPSHOT_CHANGED');
 const complete={...plan.analysis,properties:{...plan.analysis.properties,status:'READY',completion_state:'COMPLETE'}};
 const alreadyComplete=classifyReplay(complete,read.analysis)==='EXACT_REPLAY';
 assert(alreadyComplete||classifyReplay(plan.analysis,read.analysis)==='EXACT_REPLAY','ANALYSIS_READBACK_CONFLICT');
 assert(read.evidence.length===plan.evidence.length&&new Set(read.evidence.map(r=>r.recordId)).size===read.evidence.length&&new Set(read.evidence.map(r=>r.uniqueKey)).size===read.evidence.length,'EVIDENCE_CARDINALITY_MISMATCH');
 for(const expected of plan.evidence){const rows=read.evidence.filter(r=>r.uniqueKey===expected.uniqueKey);assert(rows.length===1&&classifyReplay(expected,rows[0])==='EXACT_REPLAY','EVIDENCE_READBACK_CONFLICT');}
 return {status:alreadyComplete?'EXACT_COMPLETE_REPLAY':'EXACT_READBACK_MATCH',completionIntent:alreadyComplete?null:complete,outboundEnabled:false,authorizationRecorded:false,pointerUpdate:null,atomicity:'READBACK_IS_NOT_TRANSACTION_OR_CAS'};
}
export const storageInput=z.discriminatedUnion('operation',[z.strictObject({operation:z.literal('decode_property'),request:nativePropertyInput}),z.strictObject({operation:z.literal('allocate'),request:allocationInput,fieldLimits:limits}),z.strictObject({operation:z.literal('prepare'),request:analysisRequest,fieldLimits:limits}),z.strictObject({operation:z.literal('reconcile'),request:analysisRequest,fieldLimits:limits,readback})]);
export function storageWorkflow(input:unknown){try{const x=storageInput.parse(parseInput(input));if(x.operation==='decode_property')return {status:'NATIVE_PROPERTY_SNAPSHOT_DECODED',property:decodeNativePropertyRecord(x.request),verification:'NORMALIZED_READBACK_ONLY',outboundEnabled:false,authorizationRecorded:false};return x.operation==='allocate'?allocateAnalysis(x.request,x.fieldLimits):x.operation==='prepare'?prepareStorage(x.request,x.fieldLimits):reconcileStorage(x.request,x.fieldLimits,x.readback);}catch(e){return analysisFailure(e);}}
// Useful for exact native record comparison, never a cryptographic digest/authorization.
export const recordComparison=canonical;
