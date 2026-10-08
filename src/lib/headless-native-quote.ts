import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Sql} from './headless-acquisitions';
import {authenticateMachine,machineTokenHash,type MachinePrincipal} from './acquisition-machine-auth';
import {assert,canonical,current,same} from './native/contracts';
import {observedWorkflow} from './native/observed-provider';
import {calculateWholesale} from './native/acquisition-policy';
import {evaluateOffer} from './native/offers';
import {CALCULATOR_VERSION,finalizeResult,quoteRequest,quoteSnapshot,type NativeQuoteRuntime,type QuoteIdentity,type QuoteRequest,type QuoteSnapshot} from './native-quote-contract';

type Status='QUOTE_READY'|'MISSING_INPUT'|'NEEDS_REVIEW'|'HELD'|'UNAUTHORIZED'|'UNAVAILABLE'|'INVALID_REQUEST'|'REPLAY_CONFLICT'|'IN_PROGRESS';
export const QUOTE_RESPONSE_BUDGET_MS=8000;
const safeSpeech:Record<Exclude<Status,'QUOTE_READY'>,string>={MISSING_INPUT:'I need a little more information before I can give you an offer.',NEEDS_REVIEW:'I need to check a detail before giving you a reliable offer.',HELD:"Understood. I'll pause here.",UNAUTHORIZED:"I can't get a confirmed offer right now.",UNAVAILABLE:"I can't get a confirmed offer right now.",INVALID_REQUEST:'I need to confirm the property details before continuing.',REPLAY_CONFLICT:'I need to verify the current property details before continuing.',IN_PROGRESS:"I'm still checking the offer."};
const digest=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
const principalIdentity=(p:MachinePrincipal):QuoteIdentity=>({agency:p.agency,location:p.location,actor:p.actor});
function blocked(status:Exclude<Status,'QUOTE_READY'>,http=200){return Response.json({status,quote_id:null,currency:null,speak_text:safeSpeech[status],calculator_version:CALCULATOR_VERSION},{status:http,headers:{'Cache-Control':'no-store'}});}
class InvalidBody extends Error{}
class NativeRuntimeUnavailable extends Error{}
async function runtimeCall<T>(call:()=>Promise<T>):Promise<T>{try{return await call();}catch{throw new NativeRuntimeUnavailable();}}
async function readRequest(request:Request,signal:AbortSignal){
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new InvalidBody();
 const reader=request.body?.getReader();if(!reader)throw new InvalidBody();let bytes=0;const chunks:Uint8Array[]=[];
 const cancel=()=>{void reader.cancel().catch(()=>undefined);};signal.addEventListener('abort',cancel,{once:true});
 try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>8192){await reader.cancel();throw new InvalidBody();}chunks.push(value);}}finally{signal.removeEventListener('abort',cancel);reader.releaseLock();}
 const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}
 try{return quoteRequest.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined)));}catch{throw new InvalidBody();}
}
function requireCallBinding(s:QuoteSnapshot,r:QuoteRequest,now:string){const b=s.callBinding;assert(b.callId===r.call_id&&b.contactId===r.contact_id&&b.propertyRecordId===r.property_record_id&&b.analysisRecordId===r.analysis_id&&b.analysisVersion===r.analysis_version&&Date.parse(b.expiresAt)>Date.parse(now),'CALL_BINDING_MISMATCH');}
export function evaluateNativeQuote(raw:unknown,request:QuoteRequest,principal:QuoteIdentity,now:string){
 const s=quoteSnapshot.parse(raw);requireCallBinding(s,request,now);
 assert(s.observed.operation==='reconcile','COMPLETE_NATIVE_ANALYSIS_REQUIRED');
 const {bound}=s.observed,c=bound.context,a=s.compPolicyAdoption;current(c);
 assert(c.now===now&&c.contactId===request.contact_id&&c.property.recordId===request.property_record_id&&c.analysisRecordId===request.analysis_id&&c.analysisVersion===request.analysis_version,'NATIVE_CONTEXT_MISMATCH');
 assert(c.locationId===principal.location&&s.callBinding.locationId===principal.location,'NATIVE_TENANT_MISMATCH');
 assert(a.status==='ADOPTED'&&!a.revoked&&a.policyRecordId===c.policyRecordId&&a.policyVersion===c.policyVersion&&a.approvalReference===bound.policy.approvalReference&&a.approvedBy===bound.policy.approvedBy&&Date.parse(a.adoptedAt)<=Date.parse(now),'COMP_POLICY_NOT_ADOPTED');
 const reconciled=observedWorkflow({requestJson:JSON.stringify(s.observed)});
 if('reason' in reconciled&&reconciled.reason==='HELD_OR_NOT_READY')throw new Error('HELD_OR_NOT_READY');
 assert(reconciled.status==='EXACT_COMPLETE_REPLAY','NATIVE_ANALYSIS_NOT_COMPLETE_OR_CHANGED');
 const calculated=observedWorkflow({requestJson:JSON.stringify({operation:'analyze',pair:s.observed.pair,bound})});
 assert('valueUsd' in calculated&&calculated.status==='OBSERVED_POLICY_CANDIDATE','OBSERVED_ANALYSIS_UNAVAILABLE');
 const w=s.wholesale;
 assert(same(w.context,c)&&same(s.offer.context,c)&&same(s.offer.wholesalePreparation,w),'QUOTE_CONTEXT_OR_PREPARATION_MISMATCH');
 assert(w.analysis.arvUsd===calculated.valueUsd&&w.analysis.basis===calculated.basis&&w.analysis.estimateAcceptanceReference===calculated.estimateAcceptanceReference&&w.analysis.expiresAt===calculated.expiresAt&&w.subject.sqft===s.observed.readback.evidence.find(row=>row.properties.fact_name==='subject_sqft')?.properties.fact_value_number,'VALUATION_REPAIR_BINDING_MISMATCH');
 assert(s.offer.analysis.valuationBasis===calculated.basis&&s.offer.analysis.expiresAt===calculated.expiresAt&&s.offer.analysis.estimateAcceptanceReference===calculated.estimateAcceptanceReference,'OFFER_ANALYSIS_BINDING_MISMATCH');
 const formula=calculateWholesale(w),offer=evaluateOffer(s.offer);
 assert(offer.candidatePacket.strategy==='wholesale'&&offer.candidatePacket.asset==='house','QUOTE_METHOD_UNSUPPORTED');
 // Opening formula and counter-specific authority are enforced by evaluateOffer; expose the exact packet amount only.
 const amount=offer.candidatePacket.priceUsd;
 const expiresAt=[formula.expiresAt,offer.expiresAt,s.callBinding.expiresAt,calculated.expiresAt].sort()[0];
 const stateForDigest={nativeRevision:s.revision,callBinding:s.callBinding,adoption:a,analysis:{id:c.analysisRecordId,version:c.analysisVersion,sourceVersion:c.sourceVersion,value:calculated.valueUsd,basis:calculated.basis,expiresAt:calculated.expiresAt,evidence:calculated.evidence},property:c.property,wholesale:{...w,context:{...c,now:undefined}},offer:{...s.offer,context:{...c,now:undefined},wholesalePreparation:undefined},calculatorVersion:CALCULATOR_VERSION};
 // JSON normalization removes intentionally excluded clocks; authoritative versions/facts remain bound.
 return {snapshot:s,amount,expiresAt,decisionDigest:digest(JSON.parse(JSON.stringify(stateForDigest))),estimated:calculated.basis.includes('estimated')};
}
export function headlessNativeQuoteHandler(sql:Sql,native:NativeQuoteRuntime|null,enabled:boolean,clock=()=>new Date()){
 return async(request:Request)=>{
  if(!enabled)return blocked('UNAVAILABLE',503);
  const abort=new AbortController(),signal=abort.signal;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<Response>(resolve=>{timer=setTimeout(()=>{abort.abort();resolve(blocked('IN_PROGRESS'));},QUOTE_RESPONSE_BUDGET_MS);});
  const execute=async()=>{
  try{
   const hash=machineTokenHash(request);if(!hash)return blocked('UNAUTHORIZED',401);
   const scopes=['acquisitions:analyze','acquisitions:propose'] as const;
   const authenticated=await authenticateMachine(sql,hash,scopes);if(!authenticated)return blocked('UNAUTHORIZED',401);
   signal.throwIfAborted();
   const body=await readRequest(request,signal),principal=principalIdentity(authenticated),now=clock().toISOString();
   if(!native)return blocked('UNAVAILABLE',503);
   signal.throwIfAborted();
   const snapshot=await runtimeCall(()=>native.loadSnapshot({principal,request:body,now,signal}));signal.throwIfAborted();if(snapshot===null)return blocked('MISSING_INPUT');
   const candidate=evaluateNativeQuote(snapshot,body,principal,now);
   const recheck=await authenticateMachine(sql,hash,scopes);if(!recheck||!same(principalIdentity(recheck),principal))return blocked('UNAUTHORIZED',401);
   signal.throwIfAborted();
   const requestDigest=digest({principal,request:body});
   const final=finalizeResult.parse(await runtimeCall(()=>native.finalizeQuote({principal,request:body,requestDigest,decisionDigest:candidate.decisionDigest,expectedNativeRevision:candidate.snapshot.revision,offerAmountUsd:candidate.amount,expiresAt:candidate.expiresAt,calculatorVersion:CALCULATOR_VERSION,now:clock().toISOString(),signal})));signal.throwIfAborted();
   if(final.state==='CONFLICT')return blocked('REPLAY_CONFLICT',409);
   if(final.state==='HELD')return blocked('HELD');
   if(final.state==='STATE_CHANGED')return blocked('NEEDS_REVIEW');
   if(final.state==='IN_PROGRESS')return blocked('IN_PROGRESS');
   if(final.state==='UNAVAILABLE')return blocked('UNAVAILABLE',503);
   if(!('receipt' in final))return blocked('UNAVAILABLE',503);
   const r=final.receipt;
   assert(r.agency===principal.agency&&r.location===principal.location&&r.actor===principal.actor&&r.requestId===body.request_id&&r.requestDigest===requestDigest&&r.decisionDigest===candidate.decisionDigest&&r.callId===body.call_id&&r.contactId===body.contact_id&&r.propertyRecordId===body.property_record_id&&r.analysisRecordId===body.analysis_id&&r.analysisVersion===body.analysis_version&&r.nativeRevision===candidate.snapshot.revision&&r.offerAmountUsd===candidate.amount&&r.expiresAt===candidate.expiresAt&&Date.parse(r.expiresAt)>clock().getTime(),'DURABLE_QUOTE_RECEIPT_MISMATCH');
   const lastAuth=await authenticateMachine(sql,hash,scopes);if(!lastAuth||!same(principalIdentity(lastAuth),principal))return blocked('UNAUTHORIZED',401);
   signal.throwIfAborted();
   const amountText=r.offerAmountUsd.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
   const speak=candidate.estimated?`Based on our preliminary property and repair estimates, we can offer $${amountText} for the property. How does that work for you?`:`We can offer $${amountText} for the property. How does that work for you?`;
   return Response.json({status:'QUOTE_READY',quote_id:r.quoteId,currency:'USD',offer_amount:r.offerAmountUsd,speak_text:speak,calculator_version:CALCULATOR_VERSION},{headers:{'Cache-Control':'no-store'}});
  }catch(error){if(signal.aborted)return blocked('IN_PROGRESS');if(error instanceof NativeRuntimeUnavailable)return blocked('UNAVAILABLE',503);if(error instanceof InvalidBody)return blocked('INVALID_REQUEST',400);if(error instanceof z.ZodError)return blocked('MISSING_INPUT');if(error instanceof Error&&['HELD_OR_NOT_READY'].includes(error.message))return blocked('HELD');if(error instanceof Error&&/^[A-Z_]+$/.test(error.message))return blocked('NEEDS_REVIEW');return blocked('UNAVAILABLE',503);}
  };
  try{return await Promise.race([execute(),timeout]);}finally{clearTimeout(timer);abort.abort();}
 };
}
