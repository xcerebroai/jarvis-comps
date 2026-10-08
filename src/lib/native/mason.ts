import {z} from 'zod';
import {assert,context,current,failure,id,instant,parseInput,same,text,canonical} from './contracts';
import {evaluateOffer,offerKey,offerRequest,packet} from './offers';
import {stableKey} from './storage';
export const signer=z.strictObject({id,role:z.enum(['buyer','seller']),legalName:text,authorityReference:text,contactId:id,email:z.string().email().max(254)});
export const contractFields=z.strictObject({jurisdiction:text,templateId:id,templateVersion:id,templateApprovalReference:text,buyerLegalEntity:text,buyerAuthorityReference:text,ownershipReference:text,legalDescription:text,parcelReference:text,titleEscrow:text,closingInstructionsReference:text,senderId:id,deliveryConsentReference:text});
const snapshot=z.strictObject({packet,fields:contractFields,signers:z.array(signer).min(2).max(20)});
export const preflight=z.strictObject({offer:offerRequest,fields:contractFields,signers:z.array(signer).min(2).max(20),draftReadback:snapshot});
export function prepareContract(raw:unknown){
 const x=preflight.parse(raw),offer=evaluateOffer(x.offer),p=offer.candidatePacket;
 assert(new Set(x.signers.map(s=>s.id)).size===x.signers.length,'DUPLICATE_SIGNER');
 assert(x.signers.some(s=>s.role==='buyer')&&x.signers.some(s=>s.role==='seller'&&s.contactId===p.recipientId),'SIGNER_ROUTING_INCOMPLETE');
 assert(same(x.draftReadback,{packet:p,fields:x.fields,signers:x.signers}),'DRAFT_FIELD_READBACK_MISMATCH');
 return {status:'EXACT_DRAFT_PREPARATION_ONLY',contractKey:stableKey([offer.packetKey,canonical(x.draftReadback)]),packetKey:offer.packetKey,snapshot:x.draftReadback,sendIntent:null,signatureIntent:null,blockers:['NATIVE_CONTRACT_STORAGE_UNAVAILABLE','DOCUMENT_REVISION_BINDING_UNVERIFIED','IDEMPOTENT_SEND_UNVERIFIED'],outboundEnabled:false,authorizationRecorded:false};
}
const state=z.enum(['DRAFT','SENT','VIEWED','PARTIALLY_SIGNED','COMPLETED','DECLINED','VOIDED','EXPIRED','CANCELLED']);
const document=z.strictObject({recordId:id,propertyRecordId:id,providerPropertyId:id,recipientId:id,packetKey:z.string().min(1).max(10000),packetRevision:z.number().int().positive(),documentId:id,documentRevision:id,templateId:id,templateVersion:id,requiredSignerIds:z.array(id).min(2).max(20),signedSignerIds:z.array(id).max(20),state,conditionsSatisfied:z.boolean(),sentAt:instant.nullable(),lastEventAt:instant.nullable(),events:z.array(z.strictObject({id,canonicalEvent:z.string().max(10000)})).max(200)});
const event=z.strictObject({id,locationId:context.shape.locationId,propertyRecordId:id,documentId:id,documentRevision:id,packetRevision:z.number().int().positive(),occurredAt:instant,type:z.enum(['SENT','VIEWED','SIGNED','COMPLETED','DECLINED','VOIDED','EXPIRED','CANCELLED']),signerId:id.nullable(),completedSignerIds:z.array(id).max(20),conditionsSatisfied:z.boolean(),reconciliationReference:text});
export const lifecycle=z.strictObject({context,currentPacket:packet,document,event});
export function reduceContractEvent(raw:unknown){
 const x=lifecycle.parse(raw),d=x.document,e=x.event,c=x.context,p=x.currentPacket;
 assert(d.propertyRecordId===c.property.recordId&&d.providerPropertyId===c.property.providerPropertyId&&d.recipientId===c.contactId&&p.propertyRecordId===d.propertyRecordId&&p.providerPropertyId===d.providerPropertyId&&p.asset===c.property.asset&&p.recipientId===d.recipientId&&offerKey(p)===d.packetKey&&p.revision===d.packetRevision,'CONTRACT_PROPERTY_OR_PACKET_MISMATCH');
 assert(new Set(d.requiredSignerIds).size===d.requiredSignerIds.length&&new Set(d.signedSignerIds).size===d.signedSignerIds.length&&d.signedSignerIds.every(s=>d.requiredSignerIds.includes(s)),'CONTRACT_SIGNER_STATE_INVALID');
 assert(new Set(d.events.map(e=>e.id)).size===d.events.length,'EVENT_LEDGER_INVALID');
 assert(d.state!=='DRAFT'||(d.sentAt===null&&d.signedSignerIds.length===0),'CONTRACT_STATE_INVALID');
 assert(!['SENT','VIEWED','PARTIALLY_SIGNED','COMPLETED'].includes(d.state)||d.sentAt!==null,'CONTRACT_STATE_INVALID');
 assert(d.state!=='COMPLETED'||(d.conditionsSatisfied&&same([...d.signedSignerIds].sort(),[...d.requiredSignerIds].sort())),'CONTRACT_STATE_INVALID');
 if(e.propertyRecordId!==d.propertyRecordId||e.documentId!==d.documentId||e.documentRevision!==d.documentRevision||e.packetRevision!==d.packetRevision)return {status:'IGNORED_FOREIGN_OR_SUPERSEDED_EVENT',document:d,outboundEnabled:false,propertyTransition:null};
 assert(Date.parse(e.occurredAt)<=Date.parse(c.now),'FUTURE_DOCUMENT_EVENT');
 const prior=d.events.find(row=>row.id===e.id),serialized=canonical(e);
 if(prior){assert(prior.canonicalEvent===serialized,'EVENT_ID_CONFLICT');return {status:'EXACT_EVENT_REPLAY',document:d,outboundEnabled:false,propertyTransition:null};}
 if(d.lastEventAt&&Date.parse(e.occurredAt)<Date.parse(d.lastEventAt))return {status:'OUT_OF_ORDER_RECONCILIATION_REQUIRED',document:d,outboundEnabled:false,propertyTransition:null};
 assert(d.events.length<200,'EVENT_LEDGER_CAP_REQUIRES_NATIVE_PAGING');
 if(['COMPLETED','DECLINED','VOIDED','EXPIRED','CANCELLED'].includes(d.state))return {status:'TERMINAL_DOCUMENT_PRESERVED',document:d,outboundEnabled:false,propertyTransition:null};
 assert(e.type==='SIGNED'?e.signerId!==null&&d.requiredSignerIds.includes(e.signerId):e.signerId===null,'EVENT_SIGNER_INVALID');
 assert(e.type==='COMPLETED'||(e.completedSignerIds.length===0&&!e.conditionsSatisfied),'EVENT_COMPLETION_FIELDS_INVALID');
 assert(new Set(e.completedSignerIds).size===e.completedSignerIds.length&&e.completedSignerIds.every(s=>d.requiredSignerIds.includes(s)),'EVENT_SIGNER_SET_INVALID');
 let next=d.state,signed=[...d.signedSignerIds],sentAt=d.sentAt;
 if(e.type==='SENT'){assert(d.state==='DRAFT','SEND_STATE_CONFLICT');next='SENT';sentAt=e.occurredAt;}
 if(e.type==='VIEWED'){assert(d.sentAt,'DOCUMENT_NOT_SENT');if(d.state==='SENT')next='VIEWED';}
 if(e.type==='SIGNED'){assert(d.sentAt,'DOCUMENT_NOT_SENT');signed=Array.from(new Set([...signed,e.signerId!]));next='PARTIALLY_SIGNED';}
 if(e.type==='COMPLETED'){assert(d.sentAt,'DOCUMENT_NOT_SENT');assert(same([...e.completedSignerIds].sort(),[...d.requiredSignerIds].sort())&&e.conditionsSatisfied,'SIGNATURES_OR_CONDITIONS_INCOMPLETE');signed=[...e.completedSignerIds];next='COMPLETED';}
 if(['DECLINED','VOIDED','EXPIRED','CANCELLED'].includes(e.type))next=e.type as z.infer<typeof state>;
 const updated={...d,state:next,signedSignerIds:signed,sentAt,lastEventAt:e.occurredAt,conditionsSatisfied:e.type==='COMPLETED'?e.conditionsSatisfied:d.conditionsSatisfied,events:[...d.events,{id:e.id,canonicalEvent:serialized}]};
 // Holds block operational automation, but never erase a legally completed document.
 let sharedStateClear=true;try{current(c);assert(p.analysisRecordId===c.analysisRecordId&&p.analysisVersion===c.analysisVersion&&p.propertyVersion===c.property.propertyVersion&&p.policyRecordId===c.policyRecordId&&p.policyVersion===c.policyVersion,'CONTRACT_CONTEXT_STALE');}catch{sharedStateClear=false;}
 return {status:'EVENT_RECONCILED',document:updated,underContractCandidate:next==='COMPLETED'&&sharedStateClear,propertyTransition:null,transitionBlocker:next==='COMPLETED'?(sharedStateClear?'NATIVE_ATOMIC_TRANSITION_UNVERIFIED':'HELD_OR_STALE_CONTEXT'):null,outboundEnabled:false};
}
export const revision=z.strictObject({context,document,replacementPacket:packet,voidReconciliationReference:text.nullable()});
export function prepareRevision(raw:unknown){const x=revision.parse(raw),d=x.document,p=x.replacementPacket,c=x.context;current(c);
 assert(p.propertyRecordId===c.property.recordId&&p.providerPropertyId===c.property.providerPropertyId&&p.recipientId===c.contactId&&p.asset===c.property.asset&&p.propertyVersion===c.property.propertyVersion&&p.analysisRecordId===c.analysisRecordId&&p.analysisVersion===c.analysisVersion&&p.policyRecordId===c.policyRecordId&&p.policyVersion===c.policyVersion,'REPLACEMENT_CONTEXT_MISMATCH');
 assert(d.state!=='COMPLETED','EXECUTED_AGREEMENT_REQUIRES_AMENDMENT');
 assert(p.propertyRecordId===d.propertyRecordId&&p.providerPropertyId===d.providerPropertyId&&p.recipientId===d.recipientId&&p.revision===d.packetRevision+1,'REPLACEMENT_PACKET_MISMATCH');
 assert(d.state==='DRAFT'||(['VOIDED','CANCELLED','EXPIRED','DECLINED'].includes(d.state)&&x.voidReconciliationReference),'SENT_DOCUMENT_REQUIRES_VERIFIED_CLOSURE');
 return {status:'REVALIDATE_REPLACEMENT_PACKET',oldDocumentPreserved:true,oldAuthorizationReusable:false,newPacket:p,sendIntent:null,outboundEnabled:false};}
export const masonInput=z.discriminatedUnion('operation',[z.strictObject({operation:z.literal('prepare'),request:preflight}),z.strictObject({operation:z.literal('event'),request:lifecycle}),z.strictObject({operation:z.literal('revise'),request:revision})]);
export function masonWorkflow(input:unknown){try{const x=masonInput.parse(parseInput(input));return x.operation==='prepare'?prepareContract(x.request):x.operation==='event'?reduceContractEvent(x.request):prepareRevision(x.request);}catch(e){return failure(e);}}
