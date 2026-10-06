import copy
from datetime import datetime,timezone
import sqlite3
import unittest
from core import Context,Store,ReviewRequired
from orchestration import OfflineFlow,simulate_offer

class FlowTests(unittest.TestCase):
    def setUp(self):
        self.store=Store(sqlite3.connect(':memory:'))
        self.ctx=Context('SYNTHETIC-agency','SYNTHETIC-location','SYNTHETIC-reviewer')
        self.store.db.execute('INSERT INTO membership VALUES(?,?,?)',(self.ctx.agency,self.ctx.location,self.ctx.actor))
        self.store.db.execute('INSERT INTO selected_client VALUES(?,?,1,?,?)',(self.ctx.agency,self.ctx.location,'SYNTHETIC-owner','SYNTHETIC-selection'))
        self.flow=OfflineFlow(self.store)
        self.evidence={k:True for k in ('consent_channel_verified','dnd_checked','opt_out_checked','local_time_policy_approved','within_local_time_window','property_verified','owner_authority_verified','buy_box_approved')}
        self.evidence.update(dnd=False,opt_out=False)
        terms={'closing':'30 days','inspection':'10 days','earnest_money':'1000 USD','contingencies':'inspection and title','assignment':'permitted','financing':'cash'}
        self.packet={'agency':self.ctx.agency,'location':self.ctx.location,'property_id':'SYNTHETIC-house','property_address':'SYNTHETIC Example House','recipient_id':'SYNTHETIC-owner','recipient_destination':'owner@example.invalid','price':'200000','currency':'USD','terms':terms,'analysis_id':'SYNTHETIC-analysis','analysis_version':'SYNTHETIC-v1','buy_box_approval_reference':'SYNTHETIC-buybox','asset':'house','strategy':'wholesale','synthetic':True,'analysis_reviewed':True,'evidence_quality_approved':True}
        self.policy={'id':'SYNTHETIC-policy','agency':self.ctx.agency,'location':self.ctx.location,'approved_by':'SYNTHETIC-human','approval_reference':'SYNTHETIC-approval','property_ids':['SYNTHETIC-house'],'recipient_ids':['SYNTHETIC-owner'],'asset':'house','strategy':'wholesale','minimum_price':'180000','maximum_price':'210000','allowed_terms':{k:[v] for k,v in terms.items()},'analysis_versions':['SYNTHETIC-v1'],'approved_at':'2026-10-01T00:00:00+00:00','expires':'2027-01-01T00:00:00+00:00','revoked':False,'synthetic':True}

    def qualify(self): return self.flow.process(self.ctx,'SYNTHETIC-house','qualify','SYNTHETIC-q',self.evidence)

    def test_bounded_simulated_presentation_and_counteroffer(self):
        self.qualify()
        r=self.flow.process(self.ctx,'SYNTHETIC-house','simulate_offer','SYNTHETIC-offer',{'packet':self.packet,'policy':self.policy})
        self.assertEqual(r['status'],'SIMULATED_OFFER_PRESENTATION')
        self.assertIn('$200000.00',r['seller_text']);self.assertFalse(r['outbound_enabled'])
        self.packet['price']='211000'
        r=self.flow.process(self.ctx,'SYNTHETIC-house','simulate_offer','SYNTHETIC-counter',{'packet':self.packet,'policy':self.policy})
        self.assertEqual(r['status'],'NEEDS_REVIEW')

    def test_stop_holds_and_suppression_failure_never_claimed(self):
        self.qualify()
        r=self.flow.process(self.ctx,'SYNTHETIC-house','stop','SYNTHETIC-stop',{})
        self.assertFalse(r['suppression_confirmed'])
        self.assertEqual(self.qualify()['status'],'HELD')
        self.assertEqual(self.flow.process(self.ctx,'SYNTHETIC-house','qualify','SYNTHETIC-retry',self.evidence)['status'],'HELD')

    def test_human_takeover_holds_offer(self):
        self.qualify();self.flow.process(self.ctx,'SYNTHETIC-house','human_takeover','SYNTHETIC-human',{})
        r=self.flow.process(self.ctx,'SYNTHETIC-house','simulate_offer','SYNTHETIC-offer',{'packet':self.packet,'policy':self.policy})
        self.assertEqual(r['status'],'HELD')

    def test_idempotent_retry_and_conflicting_payload(self):
        first=self.qualify();self.assertEqual(first,self.qualify())
        self.evidence['opt_out']=True
        with self.assertRaises(ReviewRequired): self.qualify()
        self.evidence['opt_out']=False
        self.assertEqual(self.flow.process(self.ctx,'SYNTHETIC-house','qualify','SYNTHETIC-new',self.evidence)['status'],'HELD')

    def test_missing_qualification_or_real_offer_stops(self):
        r=self.flow.process(self.ctx,'SYNTHETIC-house','simulate_offer','SYNTHETIC-offer',{'packet':self.packet,'policy':self.policy})
        self.assertEqual(r['status'],'NEEDS_REVIEW')
        self.packet['synthetic']=False
        with self.assertRaises(ReviewRequired):simulate_offer(self.ctx,self.packet,self.policy)

    def test_policy_scope_terms_version_revocation_expiry(self):
        for field,value in [('recipient_id','SYNTHETIC-other'),('analysis_version','SYNTHETIC-v2'),('asset','land')]:
            packet=copy.deepcopy(self.packet);packet[field]=value
            with self.assertRaises(ReviewRequired):simulate_offer(self.ctx,packet,self.policy)
        self.packet['terms']['inspection']='waived'
        with self.assertRaises(ReviewRequired):simulate_offer(self.ctx,self.packet,self.policy)
        for expires in ['2026-01-01T00:00:00+00:00','2027-01-01']:
            policy=copy.deepcopy(self.policy);policy['expires']=expires
            with self.assertRaises(ReviewRequired):simulate_offer(self.ctx,self.packet,policy)

    def test_tenant_mismatch_fails_closed(self):
        policy=copy.deepcopy(self.policy);policy['location']='SYNTHETIC-other'
        with self.assertRaises(PermissionError):simulate_offer(self.ctx,self.packet,policy)

if __name__=='__main__':unittest.main()
