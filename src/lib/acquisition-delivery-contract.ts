import type {Packet} from './acquisition-controls';
/** Integration contracts only. No provider or external sender is installed. */
export interface CrmHoldEvent {eventId:string;agency:string;location:string;propertyId:string;contactId:string;reason:'opt_out'|'human_takeover';occurredAt:string;}
export interface VerifiedCrmEvent {event:CrmHoldEvent;verifiedSignature:true;}
export interface DeliveryGateway {
 // Must verify authenticated provider webhook, tenant/contact/property binding,
 // stable dedupe ID, apply shared hold first and cancel pending deliveries.
 applyHold(event:VerifiedCrmEvent):Promise<{persisted:boolean;pendingCancelled:boolean}>;
 // Must atomically recheck exact approval, tenant/policy version, expiry,
 // newest analysis, DND/consent/human hold immediately before dispatch.
 // Provider timeout/restart means uncertain; never blindly resend.
 dispatch(packet:Packet,reviewId:string,idempotencyKey:string):Promise<{state:'accepted'|'delivered'|'uncertain'|'rejected';providerReference?:string}>;
}
export const deliveryInstalled=false;
