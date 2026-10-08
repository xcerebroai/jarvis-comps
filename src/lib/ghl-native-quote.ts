/** Concrete GHL record IO and sequential quote reconciliation. No credentials, fetch, grants,
 * provider requests, outbounds or simulated transaction. Inject an already-authorized transport.
 * API sources and the missing installation bindings are documented in HTTP-QUOTE-ADAPTER.md. */
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {assert,canonical,id,LOCATION,policy,same,text} from './native/contracts';
import {decodeNativePropertyRecord,NATIVE_SCHEMAS} from './native/native-fields';
import {wholesalePolicy} from './native/acquisition-policy';
import {offerRequest} from './native/offers';
import {evaluateNativeQuote} from './headless-native-quote';
import {quoteReceipt,quoteSnapshot,type NativeQuoteRuntime,type QuoteIdentity,type QuoteRequest} from './native-quote-contract';
import manifest from '../../native-deliverables/schema-manifest.json';
import {decodeInstalledPolicy,decodeInstalledOffer,INSTALLED} from './native-installed-fields';

export type GhlRequest={method:'GET'|'POST';path:string;query?:Record<string,string|number|string[]>;body?:unknown;version:string;signal:AbortSignal};
export type GhlResponse={status:number;body:unknown};
/** Transport owns host/version-prefix/auth; caller cannot select an arbitrary URL or add auth headers. */
export type AuthorizedGhlTransport=(request:GhlRequest)=>Promise<GhlResponse>;
const field=z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const path=z.array(field).min(1).max(6);
const objectBinding=z.strictObject({schemaKey:z.string().regex(/^custom_objects\.[a-z0-9_]+$/),payloadField:field});
export const ghlQuoteBindings=z.strictObject({
 locationId:z.literal(LOCATION),agency:id,actor:id,apiVersion:text,
 storageMode:z.enum(['json_envelopes','installed_fields']),
 context:objectBinding.extend({keyField:field}),policy:objectBinding.partial({payloadField:true}),offer:objectBinding.partial({payloadField:true}),
 installedFields:z.strictObject({policyConfigurationScope:text,approvedOfferStates:z.array(text).min(1),ceilingSchema:z.literal(INSTALLED.ceiling),contextEventType:z.literal('QUOTE_CONTEXT_SNAPSHOT'),quoteEventType:z.literal('QUOTE_DECISION_RECORDED')}).nullable(),
 quote:objectBinding.extend({keyField:field,uniqueRequestKeyVerified:z.literal(true),uniqueConstraintReference:text,maxPayloadBytes:z.number().int().min(1024).max(100000)}),
 contact:z.strictObject({dndPath:path,voiceDndPath:path.nullable(),takeoverCustomFieldId:id,customFieldsPath:path,customFieldIdKey:field,customFieldValueKey:field}),
 relations:z.strictObject({sellerPropertyAssociationId:id,analysisPropertyAssociationId:id,evidenceAnalysisAssociationId:id,arrayPath:path,associationIdKey:field,firstRecordIdKey:field,secondRecordIdKey:field}),
 verification:z.strictObject({fieldMappingReference:text,readScopeReference:text,writeScopeReference:text,restrictedWritersReference:text,searchAndPagingReference:text,contactHoldReference:text,relationShapeReference:text}),
});
export type GhlQuoteBindings=z.infer<typeof ghlQuoteBindings>;
const principalSchema=z.strictObject({agency:id,location:z.literal(LOCATION),actor:id});
export const nativeQuoteContextEnvelope=z.strictObject({principal:principalSchema,policyRecordId:id,offerRecordId:id,ceilingRecordId:id.optional(),snapshot:quoteSnapshot});
export const nativeQuotePolicyEnvelope=z.strictObject({principal:principalSchema,compPolicy:policy,adoption:quoteSnapshot.shape.compPolicyAdoption,wholesalePolicy});
export const nativeQuoteOfferEnvelope=z.strictObject({principal:principalSchema,offer:offerRequest});
const apiRecord=z.object({id,properties:z.record(z.string(),z.unknown()),locationId:z.string().optional(),objectKey:z.string().optional()});
type ApiRecord=z.infer<typeof apiRecord>;
const hash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
export const nativeCallKey=(principal:QuoteIdentity,r:QuoteRequest)=>hash({principal,call:r.call_id,contact:r.contact_id,property:r.property_record_id,analysis:r.analysis_id,version:r.analysis_version});
export const nativeRequestKey=(principal:QuoteIdentity,r:QuoteRequest)=>hash({principal,requestId:r.request_id});
function at(value:unknown,keys:string[]):unknown{let out=value;for(const key of keys){assert(out!==null&&typeof out==='object'&&Object.hasOwn(out,key),'NATIVE_RESPONSE_SHAPE_UNKNOWN');out=(out as Record<string,unknown>)[key];}return out;}
function boolean(value:unknown):boolean{assert(value===true||value===false||value==='true'||value==='false','NATIVE_HOLD_VALUE_UNKNOWN');return value===true||value==='true';}
function payload(record:ApiRecord,key:string){const raw=record.properties[key];assert(typeof raw==='string'&&Buffer.byteLength(raw)<=100000,'NATIVE_JSON_FIELD_INVALID');return JSON.parse(raw);}
function project(record:ApiRecord,schemaKey:string){const fields=manifest.objects.find(o=>o.schemaKey===schemaKey)?.fields;assert(fields,'NATIVE_SCHEMA_UNKNOWN');return Object.fromEntries(Object.entries(record.properties).filter(([k])=>Object.hasOwn(fields,k)));}
function stored(record:ApiRecord,schemaKey:string,parentField:string,keyField:string){const properties=project(record,schemaKey);return {schemaKey,recordId:record.id,parentRecordId:properties[parentField],uniqueKey:properties[keyField],properties};}

/** Every invocation reads native state. The only write is create-one immutable quote decision.
 * A unique request-key constraint provides single-record dedup, never multi-record atomicity. */
export function createGhlNativeQuoteRuntime(transport:AuthorizedGhlTransport,rawBindings:unknown,clock=()=>new Date()):NativeQuoteRuntime{
 const b=ghlQuoteBindings.parse(rawBindings);
 if(b.storageMode==='json_envelopes')assert(b.policy.payloadField&&b.offer.payloadField,'NATIVE_JSON_FIELDS_REQUIRED');
 if(b.storageMode==='installed_fields')assert(b.installedFields&&b.policy.schemaKey===INSTALLED.policy&&b.offer.schemaKey===INSTALLED.offer&&b.context.schemaKey===INSTALLED.event&&b.quote.schemaKey===INSTALLED.event&&b.context.keyField==='event_key'&&b.quote.keyField==='event_key'&&b.context.payloadField==='canonical_event'&&b.quote.payloadField==='canonical_event','INSTALLED_SCHEMA_BINDING_MISMATCH');
 const tenant={agency:b.agency,location:b.locationId,actor:b.actor};
 const allowedSchemas=new Set([NATIVE_SCHEMAS.property,NATIVE_SCHEMAS.analysis,NATIVE_SCHEMAS.evidence,b.context.schemaKey,b.policy.schemaKey,b.offer.schemaKey,b.quote.schemaKey,...(b.installedFields?[b.installedFields.ceilingSchema]:[])]);
 const base=(schema:string)=>{assert(allowedSchemas.has(schema),'NATIVE_SCHEMA_NOT_BOUND');return `/objects/${encodeURIComponent(schema)}/records`;};
 async function call(request:Omit<GhlRequest,'version'>){request.signal.throwIfAborted();const result=await transport({...request,version:b.apiVersion});request.signal.throwIfAborted();return result;}
 function record(raw:unknown,schema:string){const r=apiRecord.parse(raw);assert((r.locationId===undefined||r.locationId===LOCATION)&&(r.objectKey===undefined||r.objectKey===schema),'NATIVE_RECORD_TENANT_MISMATCH');return r;}
 async function get(schema:string,recordId:string,signal:AbortSignal){id.parse(recordId);const response=await call({method:'GET',path:`${base(schema)}/${encodeURIComponent(recordId)}`,signal});assert(response.status===200,'NATIVE_READ_UNAVAILABLE');const r=record(at(response.body,['record']),schema);assert(r.id===recordId,'NATIVE_RECORD_ID_MISMATCH');return r;}
 async function search(schema:string,key:string,value:string,signal:AbortSignal){field.parse(key);assert(/^[A-Za-z0-9_-]+$/.test(value),'NATIVE_SEARCH_VALUE_INVALID');const rows:ApiRecord[]=[],seen=new Set<string>();let total:number|undefined;
  // Documented page/pageLimit, with strict totals and duplicate-page detection. No partial proof.
  for(let page=1;page<=16;page++){const response=await call({method:'POST',path:`${base(schema)}/search`,body:{locationId:LOCATION,page,pageLimit:100,query:`${key}:${value}`,searchAfter:[]},signal});assert(response.status===200,'NATIVE_SEARCH_UNAVAILABLE');const data=z.object({records:z.array(apiRecord).max(100),total:z.number().int().nonnegative().max(1500)}).parse(response.body);assert(total===undefined||total===data.total,'NATIVE_SEARCH_CHANGED');total=data.total;for(const raw of data.records){const r=record(raw,schema);assert(!seen.has(r.id),'NATIVE_SEARCH_PAGE_REPEATED');seen.add(r.id);rows.push(r);}assert(rows.length<=total,'NATIVE_SEARCH_COUNT_MISMATCH');if(rows.length===total)return rows.filter(r=>r.properties[key]===value);assert(data.records.length>0,'NATIVE_SEARCH_INCOMPLETE');}
  throw Error('NATIVE_SEARCH_LIMIT');
 }
 async function related(recordId:string,associationId:string,signal:AbortSignal){const out:string[]=[],seen=new Set<string>();for(let skip=0;skip<1600;skip+=100){const response=await call({method:'GET',path:`/associations/relations/${encodeURIComponent(recordId)}`,query:{locationId:LOCATION,skip,limit:100,associationIds:[associationId]},signal});assert(response.status===200,'NATIVE_RELATION_UNAVAILABLE');const rows=z.array(z.record(z.string(),z.unknown())).max(100).parse(at(response.body,b.relations.arrayPath));for(const row of rows){assert(row[b.relations.associationIdKey]===associationId,'NATIVE_RELATION_SCOPE_MISMATCH');const first=id.parse(row[b.relations.firstRecordIdKey]),second=id.parse(row[b.relations.secondRecordIdKey]);assert(first===recordId||second===recordId,'NATIVE_RELATION_RECORD_MISMATCH');const target=first===recordId?second:first;assert(!seen.has(target),'NATIVE_RELATION_PAGE_REPEATED');seen.add(target);out.push(target);}if(rows.length<100)return out.sort();}throw Error('NATIVE_RELATION_LIMIT');}
 const load:NativeQuoteRuntime['loadSnapshot']=async input=>{
  assert(same(input.principal,tenant),'NATIVE_PRINCIPAL_NOT_BOUND');
  const {request:r,signal}=input,contexts=await search(b.context.schemaKey,b.context.keyField,nativeCallKey(tenant,r),signal);if(contexts.length===0)return null;assert(contexts.length===1,'NATIVE_CONTEXT_DUPLICATE');
  const contextRecord=await get(b.context.schemaKey,contexts[0].id,signal);assert(contextRecord.properties[b.context.keyField]===nativeCallKey(tenant,r),'NATIVE_CONTEXT_KEY_CHANGED');
  const envelope=nativeQuoteContextEnvelope.parse(payload(contextRecord,b.context.payloadField));assert(same(envelope.principal,tenant),'NATIVE_CONTEXT_TENANT_MISMATCH');
  const s=envelope.snapshot;assert(s.observed.operation==='reconcile','COMPLETE_NATIVE_ANALYSIS_REQUIRED');
  const policyRecord=await get(b.policy.schemaKey,envelope.policyRecordId,signal),offerRecord=await get(b.offer.schemaKey,envelope.offerRecordId,signal);
  let p:z.infer<typeof nativeQuotePolicyEnvelope>,o:z.infer<typeof nativeQuoteOfferEnvelope>,ceilingRecord:ApiRecord|undefined;
  if(b.storageMode==='installed_fields'){
   const cfg=b.installedFields!;assert(contextRecord.properties.event_type===cfg.contextEventType&&contextRecord.properties.event_location_id===LOCATION&&contextRecord.properties.property_record_id===r.property_record_id,'NATIVE_CONTEXT_EVENT_MISMATCH');assert(envelope.ceilingRecordId,'NATIVE_CEILING_RECORD_REQUIRED');ceilingRecord=await get(cfg.ceilingSchema,envelope.ceilingRecordId,signal);
   const decoded=decodeInstalledPolicy(policyRecord.id,policyRecord.properties,s,cfg.policyConfigurationScope);p={principal:tenant,...decoded};
   o={principal:tenant,offer:decodeInstalledOffer(offerRecord.properties,ceilingRecord.id,ceilingRecord.properties,s,cfg.approvedOfferStates)};
  }else{p=nativeQuotePolicyEnvelope.parse(payload(policyRecord,b.policy.payloadField!));o=nativeQuoteOfferEnvelope.parse(payload(offerRecord,b.offer.payloadField!));}
  assert(same(p.principal,tenant)&&envelope.policyRecordId===s.observed.bound.context.policyRecordId,'NATIVE_POLICY_SCOPE_MISMATCH');assert(same(o.principal,tenant),'NATIVE_OFFER_TENANT_MISMATCH');
  const propertyRecord=await get(NATIVE_SCHEMAS.property,r.property_record_id,signal),analysisRecord=await get(NATIVE_SCHEMAS.analysis,r.analysis_id,signal);
  const nativeProperty=decodeNativePropertyRecord({locationId:LOCATION,schemaKey:NATIVE_SCHEMAS.property,recordId:propertyRecord.id,properties:project(propertyRecord,NATIVE_SCHEMAS.property)});
  const evidence=await search(NATIVE_SCHEMAS.evidence,'analysis_record_id',r.analysis_id,signal);
  const response=await call({method:'GET',path:`/contacts/${encodeURIComponent(r.contact_id)}`,signal});assert(response.status===200,'NATIVE_CONTACT_UNAVAILABLE');const contact=z.object({id,locationId:z.literal(LOCATION)}).parse(at(response.body,['contact']));assert(contact.id===r.contact_id,'NATIVE_CONTACT_ID_MISMATCH');
  const rawContact=at(response.body,['contact']),contactDnd=boolean(at(rawContact,b.contact.dndPath))||(b.contact.voiceDndPath!==null&&boolean(at(rawContact,b.contact.voiceDndPath)));
  const custom=z.array(z.record(z.string(),z.unknown())).parse(at(rawContact,b.contact.customFieldsPath)).filter(f=>f[b.contact.customFieldIdKey]===b.contact.takeoverCustomFieldId);assert(custom.length===1,'NATIVE_TAKEOVER_VALUE_MISSING');const contactTakeover=boolean(custom[0][b.contact.customFieldValueKey]);
  const associated=await related(r.contact_id,b.relations.sellerPropertyAssociationId,signal);assert(associated.includes(r.property_record_id),'NATIVE_SELLER_PROPERTY_UNASSOCIATED');
  const analysisProperties=await related(r.analysis_id,b.relations.analysisPropertyAssociationId,signal);assert(same(analysisProperties,[r.property_record_id]),'NATIVE_ANALYSIS_ASSOCIATION_MISMATCH');
  const associatedEvidence=await related(r.analysis_id,b.relations.evidenceAnalysisAssociationId,signal);assert(same(associatedEvidence,evidence.map(e=>e.id).sort()),'NATIVE_EVIDENCE_ASSOCIATION_MISMATCH');
  // Persisted authority contexts must already agree; refreshing a clock/hold must not fix bad IDs.
  const old=s.observed.bound.context;assert(same(s.wholesale.context,old)&&same(o.offer.context,old),'NATIVE_CONTEXT_VERSION_MISMATCH');
  assert(p.compPolicy.recordId===envelope.policyRecordId&&p.wholesalePolicy.recordId===envelope.policyRecordId,'NATIVE_POLICY_RECORD_MISMATCH');
  s.observed.bound.policy=p.compPolicy;s.compPolicyAdoption=p.adoption;s.wholesale.policy=p.wholesalePolicy;s.offer=o.offer;
  const c={...old,now:input.now,property:nativeProperty,associatedPropertyRecordIds:associated,contactDnd,contactTakeover};
  s.observed.bound.context=c;s.wholesale.context=c;
  assert(same(s.offer.wholesalePreparation?.policy,p.wholesalePolicy),'NATIVE_OFFER_REPAIR_POLICY_MISMATCH');
  s.offer.context=c;if(s.offer.wholesalePreparation)s.offer.wholesalePreparation.context=c;
  s.observed.readback={contact:{contactId:r.contact_id,associatedPropertyRecordIds:associated,contactDnd,contactTakeover},allPagesRead:true,property:nativeProperty,policy:p.compPolicy,analysis:stored(analysisRecord,NATIVE_SCHEMAS.analysis,'property_record_id','analysis_key'),evidence:evidence.map(e=>stored(e,NATIVE_SCHEMAS.evidence,'analysis_record_id','evidence_key')).sort((a,b)=>a.recordId.localeCompare(b.recordId))} as typeof s.observed.readback;
  // Revision excludes the request clock and API envelope timestamps; actual persisted bytes are bound.
  s.revision=hash({context:contextRecord.properties,policy:policyRecord.properties,offer:offerRecord.properties,ceiling:ceilingRecord?.properties??null,property:project(propertyRecord,NATIVE_SCHEMAS.property),analysis:project(analysisRecord,NATIVE_SCHEMAS.analysis),evidence:s.observed.readback.evidence,contact:{id:contact.id,associated,contactDnd,contactTakeover}});
  s.nativeReadReference=`ghl:${b.context.schemaKey}:${contextRecord.id}`;
  return quoteSnapshot.parse(s);
 };
 const finalize:NativeQuoteRuntime['finalizeQuote']=async input=>{
  async function revalidate(){const now=clock().toISOString();assert(Date.parse(now)>=Date.parse(input.now),'NATIVE_CLOCK_MOVED_BACKWARD');const raw=await load({...input,now});assert(raw,'NATIVE_CONTEXT_MISSING');const candidate=evaluateNativeQuote(raw,input.request,input.principal,now);assert(candidate.snapshot.revision===input.expectedNativeRevision&&candidate.decisionDigest===input.decisionDigest&&candidate.amount===input.offerAmountUsd&&candidate.expiresAt===input.expiresAt,'NATIVE_DECISION_CHANGED');return candidate;}
  try{
   const candidate=await revalidate(),key=nativeRequestKey(input.principal,input.request);
   const expected={agency:input.principal.agency,location:LOCATION,actor:input.principal.actor,requestId:input.request.request_id,requestDigest:input.requestDigest,decisionDigest:input.decisionDigest,callId:input.request.call_id,contactId:input.request.contact_id,propertyRecordId:input.request.property_record_id,analysisRecordId:input.request.analysis_id,analysisVersion:input.request.analysis_version,nativeRevision:input.expectedNativeRevision,offerAmountUsd:input.offerAmountUsd,expiresAt:input.expiresAt,calculatorVersion:input.calculatorVersion,authorizationReference:candidate.snapshot.offer.standing.approvalReference};
   const serialized=canonical(expected);assert(Buffer.byteLength(serialized)<=b.quote.maxPayloadBytes,'NATIVE_QUOTE_PAYLOAD_TOO_LARGE');
   const extra=b.storageMode==='installed_fields'?{event_type:b.installedFields!.quoteEventType,event_location_id:LOCATION,property_record_id:input.request.property_record_id,occurred_at:input.now}:{};
   let records=await search(b.quote.schemaKey,b.quote.keyField,key,input.signal),created=false;
   if(records.length===0){
    try{const response=await call({method:'POST',path:base(b.quote.schemaKey),body:{locationId:LOCATION,properties:{[b.quote.keyField]:key,[b.quote.payloadField]:serialized,...extra}},signal:input.signal});
     if(response.status===201){records=[record(at(response.body,['record']),b.quote.schemaKey)];created=true;}
     else if(response.status===401||response.status===403)return {state:'UNAVAILABLE'};
     // Any other status may be a duplicate or uncertain write: resolve via the unique key.
    }catch{if(input.signal.aborted)return {state:'IN_PROGRESS'};}
    if(records.length===0)records=await search(b.quote.schemaKey,b.quote.keyField,key,input.signal);
    if(records.length===0)return {state:'IN_PROGRESS'};
   }
   if(records.length!==1)return {state:'CONFLICT'};
   const saved=await get(b.quote.schemaKey,records[0].id,input.signal);
   if(b.storageMode==='installed_fields'&&(saved.properties.event_type!==b.installedFields!.quoteEventType||saved.properties.event_location_id!==LOCATION||saved.properties.property_record_id!==input.request.property_record_id))return {state:'CONFLICT'};
   if(saved.properties[b.quote.keyField]!==key||!same(payload(saved,b.quote.payloadField),expected))return {state:'CONFLICT'};
   // Final re-read catches observed STOP, revocation, changed facts/terms and stale pointers.
   // There is still a race AFTER this read: this API has no proven cross-record transaction.
   await revalidate();
   const receipt=quoteReceipt.parse({...expected,quoteId:saved.id,durableReadbackReference:`ghl:${b.quote.schemaKey}:${saved.id}`});
   return {state:created?'COMMITTED':'REPLAY',receipt};
  }catch(error){if(input.signal.aborted)return {state:'IN_PROGRESS'};if(error instanceof Error&&error.message==='HELD_OR_NOT_READY')return {state:'HELD'};if(error instanceof Error&&error.message==='NATIVE_DECISION_CHANGED')return {state:'STATE_CHANGED'};return {state:'UNAVAILABLE'};}
 };
 return {loadSnapshot:load,finalizeQuote:finalize};
}
