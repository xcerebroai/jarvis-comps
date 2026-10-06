import unittest, sqlite3
from datetime import date, datetime, timezone, timedelta
from copy import deepcopy
from core import *

class Gates(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:'); self.store=Store(self.db)
        self.a=Context('agency','tenant-a','reviewer'); self.b=Context('agency','tenant-b','reviewer')
        for ctx in (self.a,self.b):
            self.db.execute('INSERT INTO membership VALUES(?,?,?)',(ctx.agency,ctx.location,ctx.actor))
            self.db.execute('INSERT INTO selected_client VALUES(?,?,?,?,?)',(ctx.agency,ctx.location,1,'SYNTHETIC owner','SYNTHETIC selection'))
        self.db.commit()
    def test_tenant_data_isolation(self):
        self.store.put(self.a,'same','analysis',{'tenant':'a'})
        self.assertIsNone(self.store.get(self.b,'same'))
        self.store.put(self.b,'same','settings',{'tenant':'b'})
        self.assertEqual(self.store.get(self.a,'same'),{'tenant':'a'})
    def test_membership_and_owner_selection_are_both_required(self):
        with self.assertRaises(PermissionError): self.store.get(Context('agency','tenant-a','stranger'),'same')
        self.db.execute("UPDATE selected_client SET enabled=0 WHERE location='tenant-a'")
        with self.assertRaises(PermissionError): self.store.get(self.a,'same')
    def test_removed_selection_reference(self):
        self.db.execute("UPDATE selected_client SET decision_reference=''")
        with self.assertRaises(PermissionError): self.store.get(self.a,'same')
    def test_no_default_client_enablement(self):
        with self.assertRaises(PermissionError): self.store.get(Context('agency','missing','reviewer'),'x')
    def test_missing_outreach_gates(self):
        self.assertFalse(outreach_gate({})['eligible'])
        self.assertFalse(outreach_gate({})['outbound_enabled'])
    def test_opt_out_overrides(self):
        self.assertEqual(outreach_gate({'opt_out':True})['status'],'STOP_OPT_OUT')
    def test_asset_routes(self):
        self.assertNotEqual(asset_route('multifamily',4),asset_route('multifamily',5))
        self.assertEqual(asset_route('land'),'land_sales_per_acre')
        with self.assertRaises(ReviewRequired): asset_route('multifamily',1)

class Analysis(unittest.TestCase):
    def setUp(self):
        self.subject={'asset':'house','sqft':1000}
        self.policy={'approved':True,'approval_reference':'SYNTHETIC policy','radius_miles':1,'max_age_days':365,'size_tolerance':'.2','min_comps':3}
        self.comps=[{'id':str(i),'asset':'house','sqft':1000,'sale_price':p,'sale_date':'2026-09-01','distance_miles':'.2','sale_verified':True,'renovated_comparable':True,'source':{'reference':'SYNTHETIC fixture '+str(i),'retrieved_at':'2026-10-01T00:00:00+00:00','provider':'fixture','synthetic':True}} for i,p in enumerate((190000,200000,210000))]
    def test_deterministic_median_fixture(self):
        r=valuation(self.subject,self.comps,self.policy,date(2026,10,6),True)
        self.assertEqual(r['value'],'200000.00'); self.assertTrue(r['synthetic'])
        self.assertEqual(r,valuation(self.subject,self.comps,self.policy,date(2026,10,6),True))
    def test_synthetic_never_accepted_as_real(self):
        with self.assertRaises(ReviewRequired): valuation(self.subject,self.comps,self.policy,date(2026,10,6))
    def test_missing_policy_gates(self):
        with self.assertRaises(ReviewRequired): valuation(self.subject,self.comps,{},date(2026,10,6),True)
    def test_duplicate_future_and_bad_comps_gate(self):
        for key,value in (('id','0'),('sale_date','2027-01-01'),('distance_miles',-1),('sqft',float('nan')),('renovated_comparable',False)):
            c=deepcopy(self.comps); c[1][key]=value
            with self.assertRaises(ReviewRequired): valuation(self.subject,c,self.policy,date(2026,10,6),True)
    def test_land_requires_distinct_evidence(self):
        s={'asset':'land','acres':1,'zoning':'residential','access':'road','utilities':'connected','flood_status':'clear'}
        c=deepcopy(self.comps)
        for comp in c: comp.update(asset='land',acres=1)
        with self.assertRaises(ReviewRequired): valuation(s,c,self.policy,date(2026,10,6),True)
        for comp in c: comp.update({k:s[k] for k in ('zoning','access','utilities','flood_status')})
        self.assertEqual(valuation(s,c,self.policy,date(2026,10,6),True)['method'],'land_sales_per_acre')
    def test_five_plus_never_uses_house_method(self):
        with self.assertRaises(ReviewRequired): valuation({'asset':'multifamily','units':5,'sqft':1000},self.comps,self.policy,date(2026,10,6),True)
    def test_missing_strategy_inputs_gate(self):
        with self.assertRaises(ReviewRequired): strategies(200000,{}, {'approved':True,'reference':'fixture'},'house_sales')
    def test_explicit_strategy_math(self):
        facts=dict(repairs=20000,holding=5000,purchase_closing=3000,selling=12000,profit=30000,risk_buffer=5000,assignment_fee=10000,annual_rent=24000,vacancy_rate='.05',annual_operating_expenses=6000,annual_debt_service=12000,cap_rate='.08')
        r=strategies(200000,facts,{'approved':True,'reference':'SYNTHETIC assumptions'},'house_sales')
        self.assertEqual(r['wholesale_ceiling'],'115000.00'); self.assertEqual(r['rental_noi'],'16800.00')
        self.assertEqual(r['income_value'],'210000.00'); self.assertFalse(r['outbound_enabled'])

class Offers(unittest.TestCase):
    def setUp(self):
        self.ctx=Context('agency','tenant-a','human')
        self.packet=dict(agency='agency',location='tenant-a',property_id='fixture',property_address='SYNTHETIC property',recipient_id='synthetic-recipient',recipient_destination='nobody@example.invalid',price='100000',currency='USD',terms={'closing_days':30},analysis_id='fixture',analysis_version='v1',buy_box_approval_reference='fixture',synthetic=False,analysis_reviewed=True)
        self.now=datetime.now(timezone.utc)
        self.approval=dict(digest=offer_digest(self.packet),human_actor='human',agency='agency',location='tenant-a',explicit=True,used=False,approved_at=(self.now-timedelta(seconds=1)).isoformat(),expires=(self.now+timedelta(minutes=5)).isoformat())
    def test_exact_review_still_cannot_send(self):
        r=review_offer(self.ctx,self.packet,self.approval,self.now)
        self.assertEqual(r['status'],'HUMAN_REVIEWED_DRAFT'); self.assertFalse(r['outbound_enabled']); self.assertFalse(r['execution_implemented'])
    def test_changes_invalidate_review(self):
        for key,val in (('property_id','other'),('recipient_destination','other@example.invalid'),('price','100001'),('terms',{'closing_days':31}),('analysis_version','v2')):
            p=deepcopy(self.packet); p[key]=val
            self.assertEqual(review_offer(self.ctx,p,self.approval,self.now)['status'],'NEEDS_REVIEW')
    def test_replay_expiry_and_synthetic_gate(self):
        for key,val in (('used',True),('explicit',False),('human_actor','other'),('expires',self.now.isoformat())):
            a=deepcopy(self.approval); a[key]=val
            self.assertEqual(review_offer(self.ctx,self.packet,a,self.now)['status'],'NEEDS_REVIEW')
        p=deepcopy(self.packet); p['synthetic']=True
        self.assertEqual(review_offer(self.ctx,p,self.approval,self.now)['status'],'NEEDS_REVIEW')
    def test_cross_tenant_review_rejected(self):
        with self.assertRaises(PermissionError): review_offer(Context('agency','tenant-b','human'),self.packet,self.approval,self.now)
    def test_incomplete_packet(self):
        del self.packet['terms']
        with self.assertRaises(ReviewRequired): offer_digest(self.packet)

if __name__=='__main__': unittest.main()

class PropertySpecific(unittest.TestCase):
    def test_each_asset_missing_evidence_gates(self):
        for subject in ({'asset':'house'}, {'asset':'land'}, {'asset':'multifamily','units':4}, {'asset':'multifamily','units':5}):
            self.assertEqual(property_gate(subject)['status'],'NEEDS_REVIEW')
    def test_multifamily_distinct_requirements(self):
        small=property_gate({'asset':'multifamily','units':4})['missing']
        large=property_gate({'asset':'multifamily','units':5})['missing']
        self.assertIn('cap_rate_source',large); self.assertNotIn('cap_rate_source',small)
    def test_trusted_service_denies_unselected_tenant(self):
        store=Store(sqlite3.connect(':memory:'))
        with self.assertRaises(PermissionError): underwrite(store,Context('a','b','c'),{})
    def test_commercial_income_method(self):
        facts=dict(repairs=20000,holding=5000,purchase_closing=3000,selling=12000,profit=30000,risk_buffer=5000,assignment_fee=10000,annual_rent=240000,vacancy_rate='.05',annual_operating_expenses=60000,annual_debt_service=120000,cap_rate='.08')
        result=strategies(None,facts,{'approved':True,'reference':'SYNTHETIC'},'commercial_multifamily_noi_cap')
        self.assertEqual(result['primary_value'],'2100000.00')
        self.assertEqual(result['wholesale_ceiling'],'2015000.00')
        self.assertIsNone(result['flip_ceiling'])
