"""Persistent delivery-uncertainty simulation. No network or real delivery adapter."""
import hashlib
import json
from core import ReviewRequired

class SimulatedOutbox:
    def __init__(self, store): self.store = store

    def queue(self, ctx, request_id, proposed):
        self.store.authorize(ctx)
        if proposed.get('synthetic') is not True or proposed.get('status') != 'SIMULATED_OFFER_PRESENTATION':
            raise ReviewRequired('only approved synthetic proposal fixtures may be queued')
        if proposed.get('outbound_enabled') is not False or not proposed.get('packet_digest'):
            raise ReviewRequired('simulation must remain outbound disabled')
        digest=hashlib.sha256(json.dumps(proposed,sort_keys=True,allow_nan=False).encode()).hexdigest()
        key='simulated-outbox:'+request_id
        row=self.store.get(ctx,key)
        if row:
            if row['content_digest']!=digest: raise ReviewRequired('outbox content conflict')
            return row
        row={'request_id':request_id,'content_digest':digest,'proposal':proposed,
             'status':'QUEUED_SIMULATION','outbound_enabled':False,'history':[],
             'seller_accepted':False,'signed':False}
        self.store.put(ctx,key,'simulated_outbox',row)
        return row

    def advance(self,ctx,request_id,event,reference=None,held=False):
        self.store.authorize(ctx)
        key='simulated-outbox:'+request_id
        row=self.store.get(ctx,key)
        if not row: raise ReviewRequired('outbox request missing')
        state=row['status']
        if held and state in ('QUEUED_SIMULATION','DISPATCHING_SIMULATION'):
            target='CANCELLED_SIMULATION' if state=='QUEUED_SIMULATION' else 'UNCERTAIN_SIMULATION'
        elif event=='begin' and state=='QUEUED_SIMULATION': target='DISPATCHING_SIMULATION'
        elif event in ('timeout','restart') and state=='DISPATCHING_SIMULATION': target='UNCERTAIN_SIMULATION'
        elif event=='provider_accept' and state in ('DISPATCHING_SIMULATION','UNCERTAIN_SIMULATION') and reference:
            target='PROVIDER_ACCEPTED_SIMULATION'
        elif event=='delivery_confirmed' and state=='PROVIDER_ACCEPTED_SIMULATION' and reference:
            target='DELIVERED_SIMULATION'
        elif event=='confirmed_failure' and state in ('DISPATCHING_SIMULATION','UNCERTAIN_SIMULATION') and reference:
            target='FAILED_SIMULATION'
        else: raise ReviewRequired('invalid transition; reconcile uncertainty rather than resend')
        row['status']=target;row['history'].append({'event':event,'reference':reference,'held':held})
        self.store.put(ctx,key,'simulated_outbox',row)
        return row
