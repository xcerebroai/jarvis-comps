# Reviewer controls release

Local implementation extends published d08d9bf; no platform migration or delivery is performed by these files.

## Preview isolation

The app consumes `DATABASE_URL` through Prisma for both existing User/Session/InviteCode and new acquisition SQL. It does not consume a separate acquisition database variable. No `DIRECT_URL` is currently configured in Prisma. Manual SQL execution must use the explicitly verified target through authorized host tooling; it does not discover a target itself. `DEALMACHINE_API_KEY` remains the existing protected server provider key. Do not copy production rows, sessions, password hashes or credentials into a schema-only preview.

Use the approved isolated Neon branch database, bound to Preview only. Provision fresh synthetic existing-app User records through authorized normal account tooling: an active owner test account and a distinct active reviewer test account. Supply private test passwords yourself; this build contains no password fixture or credential generator for accounts. Match their actual User IDs to separately provisioned enabled memberships. Owner must have owner_admin; reviewer must have human_reviewer. The analysis machine membership is separate. No UI can grant roles, select new tenants or change billing.

Set `JARVIS_ACQUISITIONS_ENABLED` only in the isolated test environment after schema/provisioning checks. Configure `JARVIS_ACQUISITIONS_TRUSTED_ORIGINS` as a comma-separated list of exact HTTPS origins, e.g. the single verified preview origin. Wildcards, paths, credentials, HTTP and malformed entries fail closed. Production origin remains explicitly allowed. Never infer trusted origins from arbitrary request headers.

## Safe migration sequence

New table proposal includes standingPolicyId/standingPolicyVersion and a unique exact packet digest/analysis-version constraint on AcquisitionReview. Apply the current complete proposal on a fresh database; do not apply an older proposal and assume these columns exist. If acquisition tables already exist, inspect their actual schema first and prepare a separately reviewed additive migration; never run CREATE TABLE blindly. No acquisition tables were reported in the verified production public schema at inspection time.

Use transaction plus ON_ERROR_STOP-equivalent. Verify seven tables, foreign keys, replay constraint and policy columns before enabling. Existing app schema/models are not modified. For production, confirm exact branch/database and a usable recovery checkpoint before applying anything. Disable feature and revoke credentials first on rollback; retain/export records. The drop script is a last reviewed step and must not be automatically invoked.

## Installed in source only

`/acquisitions/review` lists only already enabled selected Jarvis Premium memberships for the authenticated active user. POST `/api/acquisitions/review` derives actor from the existing session, fixed verified location and approved tenant membership. Owner can update explicit comp policy; reviewer can save sourced expiring evidence, approve an exact packet, approve/revoke a property/recipient bounded standing policy, and authorize a matching packet. No client actor, role, selected flag or arbitrary tenant grant is accepted. Expired/revoked policy, changed terms, stale analysis, opt-out/human hold, disabled membership and exact-packet replay fail closed. Approval stores no delivery success claim. Policy version and approver validity are rechecked atomically when approval is saved and when consumed.

The reviewer interface currently requires complete reviewed JSON and source references. It does not independently certify uploaded market facts; the analysis provider refresh performs that verification. The standing-policy authorization endpoint requires a human reviewer session. Native analysis credentials have analysis-only scope and cannot call these session routes. This does not yet provide autonomous machine offer authorization.

## External integration still required

`acquisition-delivery-contract.ts` is an interface only, with deliveryInstalled=false. Implement and verify a supported GHL event receiver: provider signature/authorization, exact tenant/contact/property mapping, event timestamp and stable dedupe ID, opt-out precedence, durable shared hold, pending cancellation and human takeover. Never trust unsigned event bodies or clear an opt-out on retry.

Before a provider dispatch, use a durable outbox and transactionally recheck newest analysis, exact packet digest, current policy version/expiry/approver, consent/DND/local-time eligibility and shared holds. Consume approval once with the dispatch reservation; provider acceptance differs from delivery. Timeout/restart must produce uncertain state and reconciliation, never blind resend. Signatures/contracts/payments remain outside this implementation. No GHL sender, webhook, trigger or live number is configured here.

Acceptance: disabled503; untrusted-origin403; unselected/cross-tenant403; expired/revoked key401; explicit missing-evidence422; immutable analysis replay; changed-packet/digest/policy/hold refusals; controlled owner-private credential setup; synthetic UI walkthrough; then approved real read-only property provenance check. Listen to voice in isolated preview. Native action saves and any live-channel acceptance require the existing controlled owner handoff. A READY deployment alone is not acceptance.
