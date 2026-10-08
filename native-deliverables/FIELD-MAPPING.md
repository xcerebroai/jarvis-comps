# Verified fields and normalized bindings

Current observed integration and v2 price-policy changes are documented in `OBSERVED-INTEGRATION.md`. The native inventory still contains exactly the same 58 fields. New facts use existing typed Evidence fields; no undocumented field IDs are added.

`field-map.csv` contains all **58** actual field IDs, keys, merge keys and observed UI types, copied from the supplied native schema manifest. Runtime writes use `properties.<field_key>`; merge keys are for native dynamic values. `recordId` is a native record ID, not the object definition ID below.

| Role | Object definition ID | Actual schema key | Fields |
|---|---|---|---:|
| Property | `6ac5a3fd9c2e1ab4b33524ca` | `custom_objects.jarvis_acq_properties` | 12 |
| Analysis | `6ac5a4b55637e713b2f0bdaf` | `custom_objects.jarvis_acq_analyses` | 18 |
| Evidence | `6ac5a54987e0869402700fa2` | `custom_objects.jarvis_acq_analysis_evidence_rows` | 28 |

Associations observed: **ACQ Property Analysis**, Analysis→Property max 1 / reverse many; **ACQ Analysis Evidence**, Evidence→Analysis max 1 / reverse many. Definition IDs are null/unexposed; no IDs are invented here. The normalized readback `parentRecordId` must come from an actual verified association read, not merely a duplicated field value.

## Property inputs (no Property writes emitted)

| Native key | Normalized field |
|---|---|
| `source_identity_ref` | `context.property.sourceIdentityReference` and exact `subject.identityReference` |
| `asset` | `context.property.asset` and `subject.asset` |
| `canonical_address` | `context.property.canonicalAddress` and exact `subject.canonicalAddress` |
| `provider_property_id` | `context.property.providerPropertyId` and `subject.providerPropertyId` |
| `property_key` | `context.property.propertyKey` |
| `held` / `human_takeover` | exact text `true`/`false` on matching normalized fields |
| `property_version` | `context.property.propertyVersion`; matches `expectedPropertyVersion` |
| `current_analysis_id` / `current_analysis_version` | `currentAnalysisId` / `currentAnalysisVersion`; expected snapshot pair and current result checked separately |
| `hold_reason` | `holdReason`; must be empty to progress |
| `status` | `status`: explicit READY required by gated actions; UNQUALIFIED/HELD/UNDER_CONTRACT do not authorize them |

Contact ID, contact DND/takeover, contact→Property associations, and trusted runtime location/clock are separate normalized inputs; none is claimed to exist in these 12 fields.

`decodeNativePropertyRecord` in `src/lib/native/native-fields.ts` binds all 12 keys strictly. It is executable through `storage` operation `decode_property`, with `{operation:"decode_property",request:{locationId,schemaKey,recordId,properties}}` serialized once into `requestJson`. See `fixtures/storage-decode-property.json`. A decoded snapshot preserves holds and is not authorization. HighLevel documents the read transport as `record.id` and `record.properties`; the trusted native binding must normalize that envelope and verify location/schema context. No transport call is implemented. [Official record read](https://marketplace.gohighlevel.com/docs/ghl/objects/get-record-by-id/index.html).

First allocation may use `current_analysis_id=""` and `current_analysis_version=""` together, with the expected pair also empty. Partial pairs fail, and an empty pair never authorizes an offer or contract. `storage.reconcile` additionally requires fresh `readback.contact = {contactId,associatedPropertyRecordIds,contactDnd,contactTakeover}`; do not reuse the calculation-time contact snapshot. Changed STOP/takeover or removed seller association blocks completion. This reduces stale-input errors but does not eliminate races after the read.

`native-mapping-audit.json` records the passing local inventory audit. The audit validates schema names, all 58 keys/types/merge paths, unique IDs and both association directions/cardinalities. It is not a live schema refresh or association-ID discovery.

## Analysis output properties

| Native keys | Source |
|---|---|
| `property_record_id`, `property_key`, `provider_property_id` | Exact context native/provider identity |
| `analysis_key`, `analysis_version` | Length-prefixed logical identity and explicit version |
| `policy_id`, `policy_version` | Exact trusted policy record/version reference; Policy object still absent |
| `source_version`, `source_reference`, `retrieved_at` | Normalized bundle version and subject source reference/time |
| `expires_at` | Earliest approved policy/source/accepted-sale freshness deadline |
| `basis`, `public_value_usd` | Validated asset method and numeric USD, two-decimal precision |
| `accepted_count`, `rejected_count` | SALE row counts only, not fact-row counts |
| `expected_evidence_count` | All SALE, SALE_FACT, SUBJECT, PARCEL and INCOME children |
| `status`, `completion_state` | Initial PENDING/INCOMPLETE; exact reconciled intent READY/COMPLETE |

No unbounded blob or private buyer economics is mapped to Analysis. The initial allocation shell intentionally omits uncomputed fields; later writes are not allowed to overwrite an already-completed record blindly.

## Evidence output properties

| Native keys | Source |
|---|---|
| `evidence_key` | Analysis key + kind/row ordinal/provider ID/fact identity, length-prefixed |
| `analysis_record_id`, `analysis_key`, `analysis_version`, `property_record_id` | Exact native parent linkage and immutable logical version |
| `row_kind` | Controlled local runtime enum SALE / SALE_FACT / SUBJECT / PARCEL / INCOME (Single line field, not a verified UI dropdown) |
| `selection`, `exclusion_codes` | ACCEPTED/REJECTED and bounded `|`-joined controlled reasons; facts on rejected comps inherit the rejection |
| `source_provider`, `source_reference`, `retrieved_at`, `expires_at`, `endpoint_contract_version` | Per-row source provenance, source expiry and normalized source contract version |
| `source_property_id`, `provider_row_ordinal` | Subject/comp provider identity, plus original comp occurrence ordinal for SALE and SALE_FACT |
| `sale_price_usd` | Positive valid numeric RECORDED price with `saleVerified=true` and no unverified-sale rejection; omit estimated/malformed/unverified prices; no coercion |
| `sale_date`, `sale_type`, `property_type`, `display_address` | Sanitized normalized comp facts; never raw provider payload |
| `distance_miles`, `sqft` | Explicit normalized numeric units |
| `lot_size`, `lot_unit` | Explicit normalized acres and literal `acre`; no inference from a raw provider field name |
| `fact_name`, `fact_unit`, `fact_value_number`, `fact_value_text` | Exactly one typed fact value; no arbitrary JSON string blob |

Subject facts: `source_contract_verification`, `canonical_address`, `identity_reference`, `property_type`, `subject_sqft`, `subject_acres`, `unit_count`. Parcel facts: `zoning`, `legalAccess`, `utilities`, `floodStatus`, `boundaryReference`. SALE_FACT preserves `price_kind`, `sale_verified`, `renovated_comparable`, optional `unit_count` and each comp parcel field. Income facts: `grossScheduledAnnualRent`, `vacancyRate`, `annualOperatingExpenses`, `capRate`, `immediateCapitalWork`, with `USD/year`, `ratio` or `USD` units.

Estimated-policy additions: `comp_price_basis`, `confidence_price_basis`, `estimate_acceptance_reference`; `provider_estimated_price` uses `fact_value_number` and explicit `USD` after independent currency binding. It never uses `sale_price_usd`. Observed-source additions preserve `observed_schema_revision`, `freshness_clock`, `provider_updated_at=UNKNOWN`, `market_coverage=UNKNOWN`, classification/unit references, the raw observed unit count, original timestamp `sale_date_raw` and `price_response_path`. Rejected rows' extra provenance facts retain their rejection state. Analysis `basis` explicitly distinguishes estimated house ARV, estimated market comps and recorded-sale methods.

The supplied native schema does not contain repair-policy, cost-item, discovery, offer authority or alternative-financing fields. Those remain required native Policy/Offer-related bindings. Do not pack the complete repair plan, private buying rules or conversational history into a public Analysis field. `admin-config/repair-models.json` is configuration for review, not native state.

Unsupported optional numeric values are **omitted**, never coerced to zero/null/string. Nonapplicable text fields use empty strings. Strict readback expects the emitted property set exactly; any platform null/default/omission behavior that differs requires a verified normalization contract before use. Number precision and serialization have not been tested live.

The maximum local comps input is 100 with no silent slicing. Fact rows increase the child count beyond comp count. Reconciliation accepts up to 1,500 normalized children but the input envelope also has a 250,000-character local safety bound; a large full readback may exceed it and fail closed. No native capacity/pagination/looping guarantee follows from these local bounds. A future bounded-page reconciliation protocol would need persistent trusted checks and is not simulated here.

## Missing native storage — required before activation

The following are **logical contracts only**; no native object/field IDs, records or write actions exist for them in this package. Typed contracts are in `schemas/offers.schema.json` and `schemas/mason.schema.json`. Do not substitute a contact field, KB text, or output variable for authoritative state.

| Proposed native record family | Minimum authoritative primitive fields / relationships |
|---|---|
| Policy | Unique policy key; version, approver/ref, expiry/revocation, exact property/recipient/asset/strategy scope, explicit comp rules and standing bounds, six terms; restricted ACL; immutable version/readback |
| Sourced ceiling | Exact property + analysis + policy versions; approved source/ref/approver and expiry; USD ceiling. May be a separately reviewed restricted Policy/Evidence design; no public Analysis field |
| Offer | Unique exact packet key; native/provider Property, property version, recipient, asset/strategy, price, all six terms, analysis/policy IDs/versions, packet revision, approval/reservation/delivery state |
| Contract | Unique contract key; exact packet key/revision, native/provider Property, recipient, template ID/version/approval, jurisdiction/buyer/ownership/legal/parcel/title/closing/sender/consent refs, document ID/revision, state, sent/last-event times, conditions |
| Contract signer child | Contract/document/revision + signer identity, buyer/seller role, legal name/contact/email, authority reference and factual completion; one row per required signer |
| Lifecycle event child | Exact document/revision + provider event ID, occurrence time/type/signer, reconciliation reference and canonical normalized content sufficient to detect conflicting reuse; unique event key; complete paging |

The current reducer uses bounded normalized signer/event arrays so it can be tested locally. They are not durable storage and are not claimed to fit a native text field. Canonical event strings are comparison material, not signatures or cryptographic authorization. A production native mapper must persist these facts as verified typed records and reconstruct the bounded snapshot without losing older dedup state; the 200-event cap currently stops with review rather than silently forgetting events.

The contract key contains the canonical full draft snapshot as length-prefixed comparison material, including legal facts, authority, sender and all signers. Changes to those facts cannot reuse the same key. Its native capacity and access restrictions remain unverified; do not expose it to seller-facing agents, truncate it, or place it in an arbitrary text field. No Contract storage mapping is claimed by the 58-field audit.
