-- Review-only rollback. Never auto-run. Export acquisition records first.
-- Disable acquisition route and revoke acquisition credentials before applying.
-- Existing User, Session, InviteCode and billing tables are untouched.
BEGIN;
DROP TABLE "AcquisitionEvidence";
DROP TABLE "AcquisitionReview";
DROP TABLE "AcquisitionHold";
DROP TABLE "AcquisitionAnalysis";
DROP TABLE "AcquisitionCredential";
DROP TABLE "AcquisitionSettings";
DROP TABLE "AcquisitionMembership";
COMMIT;
