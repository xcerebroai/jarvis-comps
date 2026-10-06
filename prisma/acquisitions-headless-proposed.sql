-- Headless comp and proposal service only. Review and target-verify before applying; no auto-migration.
-- Existing seven-table sandbox schema already satisfies this subset; never rerun CREATE TABLE there.
BEGIN;
CREATE TABLE "AcquisitionMembership" (agency TEXT NOT NULL,location TEXT NOT NULL,actor TEXT NOT NULL,role TEXT NOT NULL,enabled BOOLEAN NOT NULL DEFAULT FALSE,PRIMARY KEY(agency,location,actor));
CREATE TABLE "AcquisitionSettings" (agency TEXT NOT NULL,location TEXT NOT NULL,selected BOOLEAN NOT NULL DEFAULT FALSE,"selectedBy" TEXT NOT NULL,"decisionReference" TEXT NOT NULL,policy JSONB,"offerPolicy" JSONB,PRIMARY KEY(agency,location));
CREATE TABLE "AcquisitionCredential" (id TEXT PRIMARY KEY,"tokenHash" TEXT UNIQUE,agency TEXT NOT NULL,location TEXT NOT NULL,actor TEXT NOT NULL,scopes TEXT[] NOT NULL,"expiresAt" TIMESTAMPTZ NOT NULL,revoked BOOLEAN NOT NULL DEFAULT FALSE,FOREIGN KEY(agency,location,actor) REFERENCES "AcquisitionMembership"(agency,location,actor));
CREATE TABLE "AcquisitionAnalysis" (id TEXT PRIMARY KEY,"sequence" BIGSERIAL UNIQUE NOT NULL,version TEXT NOT NULL,agency TEXT NOT NULL,location TEXT NOT NULL,"requestId" TEXT NOT NULL,"requestDigest" TEXT NOT NULL,result JSONB NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(agency,location,"requestId"));
CREATE TABLE "AcquisitionHold" (agency TEXT NOT NULL,location TEXT NOT NULL,"propertyId" TEXT NOT NULL,reason TEXT NOT NULL CHECK(reason IN('opt_out','human_takeover')),PRIMARY KEY(agency,location,"propertyId"));
CREATE INDEX ON "AcquisitionAnalysis"(agency,location,id);
CREATE TABLE "AcquisitionReview" (id TEXT PRIMARY KEY,agency TEXT NOT NULL,location TEXT NOT NULL,"humanActor" TEXT NOT NULL,"packetDigest" TEXT NOT NULL,"analysisId" TEXT NOT NULL,"analysisVersion" TEXT NOT NULL,"expiresAt" TIMESTAMPTZ NOT NULL,"usedAt" TIMESTAMPTZ,revoked BOOLEAN NOT NULL DEFAULT FALSE,"approvedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,"standingPolicyId" TEXT,"standingPolicyVersion" TEXT,UNIQUE(agency,location,"packetDigest","analysisVersion"),FOREIGN KEY(agency,location,"humanActor") REFERENCES "AcquisitionMembership"(agency,location,actor));
CREATE INDEX ON "AcquisitionReview"(agency,location,id);
COMMIT;
