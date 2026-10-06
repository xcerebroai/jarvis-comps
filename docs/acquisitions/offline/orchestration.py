"""Persistent offline acquisition state machine. No external adapters or delivery.

Context/policy arguments in tests are SYNTHETIC. Production authentication and
approved-policy loading must be supplied by a trusted service before deployment.
"""
from datetime import datetime, timezone
import hashlib
import json
from core import ReviewRequired, number, offer_digest, outreach_gate, underwrite


def simulate_offer(ctx, packet, policy, now=None):
    """Exercise bounded standing approval; refuses ALL real presentation requests."""
    now=now or datetime.now(timezone.utc)
    offer_digest(packet)  # complete exact packet still required
    if packet.get('agency')!=ctx.agency or packet.get('location')!=ctx.location:
        raise PermissionError('offer tenant mismatch')
    if packet.get('synthetic') is not True or policy.get('synthetic') is not True:
        raise ReviewRequired('real presentation adapter disabled')
    required=('id','approved_by','approval_reference','property_ids','recipient_ids',
              'strategy','asset','minimum_price','maximum_price','allowed_terms',
              'approved_at','expires','analysis_versions')
    if any(policy.get(k) in (None,'',[],{}) for k in required):
        raise ReviewRequired('complete approved policy required')
    try:
        approved=datetime.fromisoformat(policy['approved_at'])
        expires=datetime.fromisoformat(policy['expires'])
        time_ok=approved.tzinfo is not None and expires.tzinfo is not None and approved<=now<expires
    except (ValueError,TypeError): time_ok=False
    if not time_ok or policy.get('revoked') is not False:
        raise ReviewRequired('policy expired, revoked or unverified')
    if policy.get('agency')!=ctx.agency or policy.get('location')!=ctx.location:
        raise PermissionError('policy tenant mismatch')
    if packet['property_id'] not in policy['property_ids'] or packet['recipient_id'] not in policy['recipient_ids']:
        raise ReviewRequired('outside property or audience scope')
    if packet.get('strategy')!=policy['strategy'] or packet.get('asset')!=policy['asset']:
        raise ReviewRequired('outside asset or strategy scope')
    if packet['analysis_version'] not in policy['analysis_versions'] or packet.get('analysis_reviewed') is not True or packet.get('evidence_quality_approved') is not True:
        raise ReviewRequired('analysis evidence or version unapproved')
    low=number(policy['minimum_price'],'minimum_price',True)
    high=number(policy['maximum_price'],'maximum_price',True)
    price=number(packet['price'],'price',True)
    if low>high or not low<=price<=high:
        raise ReviewRequired('price outside approved negotiation range')
    term_keys=('closing','inspection','earnest_money','contingencies','assignment','financing')
    if set(packet['terms'])!=set(term_keys) or set(policy['allowed_terms'])!=set(term_keys):
        raise ReviewRequired('complete permitted terms required')
    if any(packet['terms'][k] not in policy['allowed_terms'][k] for k in term_keys):
        raise ReviewRequired('terms outside approved policy')
    return {'status':'SIMULATED_OFFER_PRESENTATION','synthetic':True,'policy_id':policy['id'],
            'packet_digest':offer_digest(packet),'outbound_enabled':False,'binding_acceptance':False,
            'seller_text':f"SYNTHETIC — TEST ONLY. For {packet['property_address']}, the proposed price is ${price:.2f}, with these proposed terms: {json.dumps(packet['terms'],sort_keys=True)}. This is nonbinding and subject to final review. Would you like a person to review these terms with you?"}


class OfflineFlow:
    def __init__(self, store): self.store=store

    def process(self, ctx, property_id, event, idempotency_key, payload):
        self.store.authorize(ctx)
        if not property_id or not idempotency_key: raise ReviewRequired('property and request ID required')
        if event not in ('stop','human_takeover','qualify','analysis','simulate_offer'):
            raise ReviewRequired('unknown event')
        digest=hashlib.sha256(json.dumps({'property':property_id,'event':event,'payload':payload},sort_keys=True,allow_nan=False).encode()).hexdigest()
        key='flow-request:'+idempotency_key
        state_key='flow-state:'+property_id
        state=self.store.get(ctx,state_key) or {'held':False,'qualified':False}
        # A newly received stop wins even if a caller reused an old request ID.
        incoming_stop=event=='qualify' and (payload.get('opt_out') is True or payload.get('dnd') is True)
        if incoming_stop:
            state.update(held=True,qualified=False,hold_reason='stop')
            self.store.put(ctx,state_key,'flow_state',state)
        previous=self.store.get(ctx,key)
        if previous:
            if previous['digest']!=digest: raise ReviewRequired('idempotency conflict')
            if state['held'] and event not in ('stop','human_takeover'):
                return {'status':'HELD','reason':state['hold_reason'],'outbound_enabled':False}
            return previous['result']
        if event in ('stop','human_takeover') or incoming_stop:
            state.update(held=True,qualified=False,hold_reason='stop' if incoming_stop else event)
            result={'status':'STOP_OPT_OUT' if event=='stop' or incoming_stop else 'HUMAN_TAKEOVER',
                    'outbound_enabled':False,'suppression_confirmed':False,
                    'missing':['CRM suppression connection'] if event=='stop' or incoming_stop else []}
        elif state['held']:
            result={'status':'HELD','reason':state['hold_reason'],'outbound_enabled':False}
        elif event=='qualify':
            result=outreach_gate(payload)
            state['qualified']=result['eligible']
            if result['status']=='STOP_OPT_OUT': state.update(held=True,hold_reason='stop')
        elif not state['qualified']:
            result={'status':'NEEDS_REVIEW','missing':['verified qualification'],'outbound_enabled':False}
        elif event=='analysis':
            if payload.get('subject',{}).get('property_id')!=property_id:
                raise ReviewRequired('analysis property mismatch')
            result=underwrite(self.store,ctx,payload)
        else:
            if payload.get('packet',{}).get('property_id')!=property_id:
                raise ReviewRequired('offer property mismatch')
            try: result=simulate_offer(ctx,payload['packet'],payload['policy'])
            except ReviewRequired as error:
                result={'status':'NEEDS_REVIEW','missing':[str(error)],'outbound_enabled':False}
        self.store.put(ctx,state_key,'flow_state',state)
        self.store.put(ctx,key,'flow_request',{'digest':digest,'result':result})
        return result
