# Secure binding destination — code wired; publication and live acceptance pending

The concrete Node route now composes `nativeQuoteRuntimeFromEnvironment` → fixed-origin `createGhlNativeTransport` → `createGhlNativeQuoteRuntime`. No source edit is needed to connect the runtime after the verified configuration and existing credential are securely bound. Missing configuration returns unavailable. This document contains names only, never credential values.

## Exact destination

- Host: **Vercel**, existing project **jarvis-comps**, project ID `prj_ys4scGuUFNnN3NzRZk35TnDc3769`, account ID `team_x5LipbWeQrp3d3sohlvRcieQ`.
- Intended environment: **Production**. Do not copy these credentials into Development or generic Preview. A staged production deployment uses the production bindings and must be validated before domain promotion.
- Existing production: `dpl_9mW5aCk84qr6ye6SzCeEgtbCPEEX`, READY, commit `74e394548186986198baa0bddab787b294d21f0f`, branch `codex/acquisitions-headless`, Node `24.x`.
- Verified aliases: `comps.xcerebro.ai`, `jarvis-comps.vercel.app`. Intended final action URL: `https://comps.xcerebro.ai/api/acquisitions/quote` **after** release validation and promotion.
- [Existing production inspector](https://vercel.com/deftones420xs-projects/jarvis-comps/9mW5aCk84qr6ye6SzCeEgtbCPEEX). [Verified secure entry screen](https://vercel.com/deftones420xs-projects/jarvis-comps/settings/environment-variables), select Production.

Correct project-ID/default-scope reads succeeded. The earlier explicit-team-selector 403 was a scope-selection failure; it is resolved for read-only inspection. No access grant, login, deployment or environment change occurred in this local task.

## Minimal configuration

| Name | Type / destination | Required input and current state |
|---|---|---|
| `JARVIS_GHL_PRIVATE_INTEGRATION_TOKEN` | Sensitive, server-only, Production | Owner securely binds the **existing** XCEREBRO private-integration token for `SesCoVXlNu7qTSBol1gs`. Do not rotate/create a credential or paste it into chat/code. This name is absent in verified Vercel metadata. |
| `JARVIS_NATIVE_QUOTE_BINDINGS_JSON` | Nonsecret operational configuration, server-only, Production | Complete JSON matching `http/ghl-bindings.schema.json`, `storageMode=installed_fields`, `apiVersion=v3`; maximum 16 KiB. Must contain verified mappings and references below. Absent in metadata. |
| `JARVIS_NATIVE_QUOTE_ENABLED` | Nonsecret switch, Production | Keep absent or `false` until configuration and coordinated release acceptance are ready. Only literal `true` enables this route. Absent in metadata. |
| `DATABASE_URL` | Existing sensitive server binding, Production | Already present. Reuse unchanged for existing machine authentication. No new database or migration. |
| `JARVIS_ACQUISITIONS_ENABLED` | Existing legacy endpoint switch | Keep absent/false. Verified metadata lists no such setting. The new route no longer uses this flag, so enabling quotes cannot activate the older comps/proposals routes. |

`SESSION_SECRET` and `DEALMACHINE_API_KEY` exist in Production and are not used by the quote runtime; leave them unchanged. Environment enumeration used `decrypt=false`, projected names/type/environment only, with zero hidden production entries. Values were not inspected. No extra provider key, new machine token, API-host setting or public `NEXT_PUBLIC_*` setting is required.

Incoming authorization remains the existing GHL action's machine bearer credential backed by `AcquisitionCredential`, `AcquisitionMembership`, and `AcquisitionSettings`. It requires both `acquisitions:analyze` and `acquisitions:propose`, matching agency/actor and selected exact location. That incoming token is separate from the outbound GHL private-integration token. Its live state/scopes were not inspected or changed here.

## Nonsecret facts still needed

1. Existing machine agency and actor identifiers, matching the DB membership and protected native context.
2. API-verified seller↔Property, Analysis↔Property and Evidence↔Analysis association IDs, relation response envelope/keys, and pagination/query behavior. UI relation IDs alone are not sufficient.
3. Contact global/voice DND paths and explicit takeover custom-field ID/value mapping, including actual null/missing behavior.
4. Searchable context/quote keys, Lifecycle Event `canonical_event` byte capacity, native API unique-key conflict/readback proof and restricted-writer evidence. Single-record uniqueness does not establish multi-record atomicity.
5. Full adopted comp/offer/repair Policy configuration scope and approved Offer state values. The repair-defaults-only record is not offer authority. Supply exact Policy/Offer/Ceiling/context records and current Property/Analysis/version; no invented client terms.
6. Protected Context population by the browser-owned native workflow, including approved structured comp labels, source units/capture, discovery and repair supplements. The HTTP caller cannot inject these facts.

The owner-approved six custom-object/association scopes plus the original three scopes were applied and reload-verified by browser worker `01a117b4`, as reported by the parent. Scope approval is resolved. This task did not read the token or call live GHL.

`http/installed-binding-review.json` is an inactive mapping worksheet, **not** valid runtime configuration. The factory intentionally refuses it. A syntactically valid JSON config does not itself prove the referenced browser/admin checks occurred.

## Ordered release steps

1. Finish verified nonsecret bindings and native context preparation. The browser owns GHL writes; agents remain Draft/Off. Owner enters the existing token directly into the destination above, outside chat.
2. Keep the quote flag disabled while reviewing branch `codex/acquisitions-native-quote-release` and its local release commit and nonsecret configuration. Preserve the legacy endpoint flag absent/false. Recheck remote and current production revisions before publication.
3. Coordinate publication of the reviewed local release branch. Current remote `main` is `c0f6722c60e1dfdd908ed4b1d870a35b7adeeb50`; current production is the later `74e3945` headless branch. The prepared release includes both, plus the local native-proof commits and implementation. No merge should discard those later changes.
4. Once authorized and configured, build a **staged production** deployment without assigning production domains; record its exact commit and deployment ID. Test that exact deployment behind the existing protected machine boundary. Do not describe a build or HTTP 503 as live functionality.
5. Browser/parent execute bounded native acceptance: exact quote then same-request replay, two properties for one seller, stale analysis, STOP/takeover, revoked authority, revised counter terms, uncertain create, malformed/estimated pricing, and no stale action variables. Any allowed test writes remain native audit records. No seller sends, voice presentation or signatures are authorized by this local handoff.
6. Promote the same verified staged production artifact only through the parent's publication coordination. Bind the GHL action to the verified URL, clear previous outputs before each call, and release an amount only for the fresh current `QUOTE_READY` receipt. On rollback, disable only the quote flag; preserve native receipts for reconciliation. A Vercel environment change applies to a new deployment, so it is not an instantaneous kill switch for an existing build; native STOP/authority revocation and disabling the GHL action remain the immediate operational controls.

Transport targets only `https://services.leadconnectorhq.com`, uses `Version: v3`, disallows redirect following and arbitrary paths, reads bounded JSON, honors cancellation and never retries a create internally. [Official private-integration authentication](https://marketplace.gohighlevel.com/docs/Authorization/PrivateIntegrationsToken/index.html) and [API versioning](https://marketplace.gohighlevel.com/docs/Versioning/index.html) document that host/header convention. Exact relation shape and installed API behavior still require live verification.
