import copy
import unittest
from core import ReviewRequired,Context
from simulated_outbox import SimulatedOutbox
import test_orchestration as fixtures
class OutboxTests(unittest.TestCase):
    def setUp(self):
        fixtures.FlowTests.setUp(self);self.outbox=SimulatedOutbox(self.store);fixtures.FlowTests.qualify(self)
        self.proposed=self.flow.process(self.ctx,'SYNTHETIC-house','simulate_offer','SYNTHETIC-offer',{'packet':self.packet,'policy':self.policy})
    def test_queue_exact_content_and_deduplicate(self):
        first=self.outbox.queue(self.ctx,'SYNTHETIC-send',self.proposed)
        self.assertEqual(first,self.outbox.queue(self.ctx,'SYNTHETIC-send',self.proposed))
        changed=copy.deepcopy(self.proposed);changed['seller_text']+='changed'
        with self.assertRaises(ReviewRequired):self.outbox.queue(self.ctx,'SYNTHETIC-send',changed)
    def test_restart_uncertainty_never_resends(self):
        self.outbox.queue(self.ctx,'SYNTHETIC-send',self.proposed);self.outbox.advance(self.ctx,'SYNTHETIC-send','begin')
        restarted=SimulatedOutbox(self.store);self.assertEqual(restarted.advance(self.ctx,'SYNTHETIC-send','restart')['status'],'UNCERTAIN_SIMULATION')
        with self.assertRaises(ReviewRequired):restarted.advance(self.ctx,'SYNTHETIC-send','begin')
        r=restarted.advance(self.ctx,'SYNTHETIC-send','provider_accept','SYNTHETIC-provider-proof');self.assertFalse(r['seller_accepted']);self.assertFalse(r['signed'])
        self.assertEqual(restarted.advance(self.ctx,'SYNTHETIC-send','delivery_confirmed','SYNTHETIC-delivery-proof')['status'],'DELIVERED_SIMULATION')
    def test_hold_and_real_delivery_disabled(self):
        self.outbox.queue(self.ctx,'SYNTHETIC-send',self.proposed);self.assertEqual(self.outbox.advance(self.ctx,'SYNTHETIC-send','begin',held=True)['status'],'CANCELLED_SIMULATION')
        real=copy.deepcopy(self.proposed);real['synthetic']=False
        with self.assertRaises(ReviewRequired):self.outbox.queue(self.ctx,'SYNTHETIC-real',real)
        with self.assertRaises(PermissionError):self.outbox.queue(Context('SYNTHETIC-other','SYNTHETIC-location','SYNTHETIC-reviewer'),'x',self.proposed)
