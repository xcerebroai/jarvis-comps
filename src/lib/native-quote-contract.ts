import {z} from 'zod';
import {id,instant,LOCATION,positiveMoney,text} from './native/contracts';
import {observedInput} from './native/observed-provider';
import {wholesaleRequest} from './native/acquisition-policy';
import {offerRequest} from './native/offers';

export const CALCULATOR_VERSION='jarvis-native-quote-2026-10-08-v1';
/** Identifiers come from trusted native call/property context; no model-supplied economics. */
export const quoteRequest=z.strictObject({request_id:id,call_id:id,contact_id:id,property_record_id:id,analysis_id:id,analysis_version:id,location_id:z.literal(LOCATION).optional()});
export type QuoteRequest=z.infer<typeof quoteRequest>;
export const blockedQuoteStatus=z.enum(['MISSING_INPUT','NEEDS_REVIEW','HELD','UNAUTHORIZED','UNAVAILABLE','INVALID_REQUEST','REPLAY_CONFLICT','IN_PROGRESS']);
export const sellerQuoteResponse=z.union([
 z.strictObject({status:z.literal('QUOTE_READY'),quote_id:id,currency:z.literal('USD'),offer_amount:positiveMoney,speak_text:text,calculator_version:z.literal(CALCULATOR_VERSION)}),
 z.strictObject({status:blockedQuoteStatus,quote_id:z.null(),currency:z.null(),speak_text:text,calculator_version:z.literal(CALCULATOR_VERSION)}),
]);
export const quoteSnapshot=z.strictObject({
 revision:id,nativeReadReference:text,
 callBinding:z.strictObject({callId:id,contactId:id,propertyRecordId:id,analysisRecordId:id,analysisVersion:id,locationId:z.literal(LOCATION),expiresAt:instant,reference:text}),
 compPolicyAdoption:z.strictObject({status:z.enum(['ADOPTED','PROPOSED']),policyRecordId:id,policyVersion:id,approvalReference:text,approvedBy:id,adoptedAt:instant,revoked:z.boolean()}),
 observed:observedInput,
 wholesale:wholesaleRequest,
 offer:offerRequest,
});
export type QuoteSnapshot=z.infer<typeof quoteSnapshot>;
export const quoteReceipt=z.strictObject({quoteId:id,agency:id,location:z.literal(LOCATION),actor:id,requestId:id,requestDigest:z.string().regex(/^[a-f0-9]{64}$/),decisionDigest:z.string().regex(/^[a-f0-9]{64}$/),callId:id,contactId:id,propertyRecordId:id,analysisRecordId:id,analysisVersion:id,nativeRevision:id,offerAmountUsd:positiveMoney,expiresAt:instant,calculatorVersion:z.literal(CALCULATOR_VERSION),authorizationReference:text,durableReadbackReference:text});
export type QuoteReceipt=z.infer<typeof quoteReceipt>;
export const finalizeResult=z.discriminatedUnion('state',[
 z.strictObject({state:z.literal('COMMITTED'),receipt:quoteReceipt}),
 z.strictObject({state:z.literal('REPLAY'),receipt:quoteReceipt}),
 z.strictObject({state:z.enum(['CONFLICT','HELD','STATE_CHANGED','IN_PROGRESS','UNAVAILABLE'])}),
]);
export type QuoteIdentity={agency:string;location:string;actor:string};
export type FinalizeQuote={principal:QuoteIdentity;request:QuoteRequest;requestDigest:string;decisionDigest:string;expectedNativeRevision:string;offerAmountUsd:number;expiresAt:string;calculatorVersion:typeof CALCULATOR_VERSION;now:string;signal:AbortSignal};
/** Server-installed native adapter only. JSON flags or caller snapshots cannot supply this capability. */
export interface NativeQuoteRuntime {
 loadSnapshot(input:{principal:QuoteIdentity;request:QuoteRequest;now:string;signal:AbortSignal}):Promise<unknown|null>;
 /** Persist a unique immutable tenant/actor/request decision or revalidate its durable receipt.
  * Compare current call binding, native revision, holds/associations, policy adoption/
  * revocation, analysis pointer/expiry, exact packet/terms and authority BEFORE release.
  * Different digest => CONFLICT; an uncertain write => IN_PROGRESS, never create anew.
  * GHL implementation uses sequential rechecks and unique-record create, NOT a transaction.
  * It cannot guarantee an atomic last-state check plus spoken delivery. */
 finalizeQuote(input:FinalizeQuote):Promise<unknown>;
}
