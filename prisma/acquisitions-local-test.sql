-- SYNTHETIC fixtures only; temporary local test database.

INSERT INTO "AcquisitionMembership" VALUES ('SYNTHETIC-a','SYNTHETIC-l','SYNTHETIC-human','human_reviewer',TRUE);
INSERT INTO "AcquisitionSettings"(agency,location,"selectedBy","decisionReference",selected) VALUES ('SYNTHETIC-a','SYNTHETIC-l','SYNTHETIC-human','SYNTHETIC-owner-selection',TRUE);
INSERT INTO "AcquisitionAnalysis"(id,version,agency,location,"requestId","requestDigest",result) VALUES ('SYNTHETIC-1','v1','SYNTHETIC-a','SYNTHETIC-l','request1','digest1','{"propertyId":"SYNTHETIC-house","valueUsd":"200000"}');
INSERT INTO "AcquisitionAnalysis"(id,version,agency,location,"requestId","requestDigest",result) VALUES ('SYNTHETIC-2','v2','SYNTHETIC-a','SYNTHETIC-l','request2','digest2','{"propertyId":"SYNTHETIC-house","valueUsd":"205000"}');
INSERT INTO "AcquisitionReview"(id,agency,location,"humanActor","packetDigest","analysisId","analysisVersion","expiresAt") VALUES ('SYNTHETIC-review','SYNTHETIC-a','SYNTHETIC-l','SYNTHETIC-human','packet','SYNTHETIC-1','v1',CURRENT_TIMESTAMP+INTERVAL '1 hour');
DO $$ BEGIN
 IF (SELECT count(*) FROM "AcquisitionAnalysis" WHERE agency='SYNTHETIC-other')<>0 THEN RAISE EXCEPTION 'Tenant isolation failed';END IF;
 IF NOT EXISTS (SELECT 1 FROM "AcquisitionAnalysis" newer JOIN "AcquisitionAnalysis" old ON newer.agency=old.agency AND newer.location=old.location AND newer.result->>'propertyId'=old.result->>'propertyId' WHERE old.id='SYNTHETIC-1' AND newer."sequence">old."sequence") THEN RAISE EXCEPTION 'Stale review detection failed';END IF;
END $$;
INSERT INTO "AcquisitionAnalysis"(id,version,agency,location,"requestId","requestDigest",result) VALUES ('SYNTHETIC-retry','retry','SYNTHETIC-a','SYNTHETIC-l','request1','digest1','{}') ON CONFLICT(agency,location,"requestId") DO UPDATE SET "requestDigest"="AcquisitionAnalysis"."requestDigest" RETURNING id,version,result;
