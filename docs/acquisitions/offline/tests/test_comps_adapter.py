import copy
import unittest
from datetime import date
from comps_adapter import house_analysis
from core import ReviewRequired


class ExistingCompsAdapterTests(unittest.TestCase):
    def setUp(self):
        self.policy = {'approved':True,'approval_reference':'SYNTHETIC-policy','radius_miles':1,
                       'max_age_days':365,'size_tolerance':.2,'min_comps':3,
                       'verified_sale_types':['Verified Market Sale']}
        self.envelope = {'synthetic':True,'analysis_version':'SYNTHETIC-v1',
                         'subject':{'asset':'house','dm_property_id':'SYNTHETIC-house',
                                    'identity_verified':True,'sqft':1000,'propertyType':'House'},
                         'comps':[{'id':f'SYNTHETIC-{i}','saleType':'Verified Market Sale',
                                   'sale_verified':True,'renovated_comparable':True,
                                   'propertyType':'House','salePrice':p,'saleDate':'2026-06-01',
                                   'sqft':1000,'distanceMiles':.3,
                                   'source':{'synthetic':True,'provider':'SYNTHETIC fixture',
                                             'reference':f'SYNTHETIC-source-{i}',
                                             'retrieved_at':'2026-10-01T00:00:00+00:00'}}
                                  for i,p in enumerate([200000,210000,220000])]}

    def run_analysis(self):
        return house_analysis(self.envelope,self.policy,date(2026,10,6))

    def test_synthetic_trace_value_and_model_ignored(self):
        self.envelope['dmReferenceEstimate']=9999999
        self.envelope['outcome']={'result':{'arv':9999999,'confidence':'high'}}
        r=self.run_analysis()
        self.assertEqual(r['value'],'210000.00')
        self.assertEqual(len(r['sources']),3)
        self.assertEqual(r['label'],'SYNTHETIC — TEST ONLY')

    def test_existing_public_response_insufficient(self):
        with self.assertRaises(ReviewRequired):
            house_analysis({'subject':{'sqft':1000},'outcome':{'result':{'arv':210000}}},self.policy,date(2026,10,6))

    def test_estimated_sale_price_refused_even_allowlisted(self):
        self.envelope['comps'][0]['saleType']='Estimated Sales Price'
        self.policy['verified_sale_types'].append('Estimated Sales Price')
        with self.assertRaises(ReviewRequired): self.run_analysis()

    def test_no_land_or_multi_sqft_fallback(self):
        for asset in ['land','multifamily']:
            self.envelope['subject']['asset']=asset
            with self.assertRaises(ReviewRequired): self.run_analysis()

    def test_two_comp_result_requires_review(self):
        self.envelope['comps'].pop()
        with self.assertRaises(ReviewRequired): self.run_analysis()

    def test_condition_missing_and_duplicate_fail_closed(self):
        self.envelope['comps'][0].pop('renovated_comparable')
        with self.assertRaises(ReviewRequired): self.run_analysis()
        self.envelope['comps'][0]['renovated_comparable']=True
        self.envelope['comps'][1]['id']=self.envelope['comps'][0]['id']
        with self.assertRaises(ReviewRequired): self.run_analysis()

    def test_finite_distance_and_version_required(self):
        for bad in ['NaN','Infinity',-1]:
            candidate=copy.deepcopy(self.envelope)
            candidate['comps'][0]['distanceMiles']=bad
            with self.assertRaises(ReviewRequired): house_analysis(candidate,self.policy,date(2026,10,6))
        self.envelope.pop('analysis_version')
        with self.assertRaises(ReviewRequired): self.run_analysis()

    def test_real_source_does_not_accept_synthetic_fixture(self):
        self.envelope['synthetic']=False
        with self.assertRaises(ReviewRequired): self.run_analysis()


if __name__=='__main__': unittest.main()
