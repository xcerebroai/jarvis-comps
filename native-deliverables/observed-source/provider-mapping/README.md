# Observed DealMachine evidence adapter

This dependency-free local module validates the sanitized response shape observed on October 7, 2026. It performs no HTTP requests, logging, native writes or valuation. All results remain `NEEDS_REVIEW`, `synthetic:false`, `valuation:null`, `outboundEnabled:false`, and `authorizationRecorded:false`.

## Use

```js
import {adaptCompsProjection, adaptAddressProjection} from './observed-provider-adapter.mjs';

const result = adaptCompsProjection(sanitizedProjection, {
  expectedPropertyId: 'prop_125714946',
  expectedSubjectAddress: '11311 Begonia Rock',
});

const match = adaptAddressProjection(sanitizedAddressProjection, {
  expectedAddress: {street: '11311 Begonia Rock', city: 'San Antonio', state: 'TX', zip: '78245'},
  expectedPropertyId: 'prop_125714946', // Independently bound, never inferred by adapter.
});
```

Inputs may be plain objects or JSON strings (maximum 250,000 characters for the string boundary). This is an adapter for an already authorized, allowlisted projection, not permission to capture a full response. Unknown input fields are discarded without recursion. Only named property observations, machine status, approved source metadata and numeric credit counters can reach output; arbitrary metadata prose, mortgage/lender/contact/image/model-valuation fields are excluded. The address allowlist also excludes `estimated_value`, `mls_current_listing_price` and the unobserved `num_commercial_units` field. Caller metadata cannot establish authorization or independent verification.

Comp observation values preserve presence (`MISSING`, `NULL`, `VALUE`), actual type, raw value, provider identity and array ordinal. Required keys must exist; null observations remain null. Numeric strings are rejected rather than coerced. Dates are validated but preserved unchanged. A required null value never becomes evidence of a measured value. Unknown property categories remain unresolved; no asset classification is inferred.

The successful observed comps response contains three rows, each labelled `Estimated Sales Price`. The adapter retains these as estimates with zero verified or eligible sales. A future `Recorded Sale` label alone still remains unverified. Units, currency, retrieval time, source reference, update time and expiry stay null when not independently established. Request sent time is kept distinct from retrieval time. Matching returned counts establishes representation of the response only, never completeness of the underlying market.

No-match address observations mean the provider did not match this request; they do not establish that the property does not exist. Address request echoes support either one `full_address` (also accepted as a context string) or the exact four-component `street/city/state/zip` input. No punctuation normalization, extra keys or silently changed components are accepted. Matched envelopes require exact totals and optional existing provider-ID binding.

The later observed structured-address request matched the same provider ID. Its projection confirms category strings (`Single Family`, `Vendor’s Lien`), `building_condition:null`, and `num_units:0`; zero is preserved and cannot establish a valid positive unit count. Both `last_sale_price` and `last_sale_amount` appear and are retained separately, even if equal. No semantic equivalence or verified sale is inferred. Tests cover this actual projection plus a separately identified fabricated numeric-category example.

## Credit evidence

The three observed response `credits.used` counters are 0 (unmatched address), 1 (comps) and 0 (matched enrichment), totaling one reported new credit. The matched enrichment reports `properties:1`, `people:0`, `deduplicated:1`; a returned-property counter is not a new-credit debit. These observations do not establish GHL execution billing.

A base `GET /v1/properties/{id}?enrich=false&contact_audience=none` is documented as a free, non-enriched property lookup. It was not executed in this sequence. The enrichment call supplied expanded fields for mapping; its zero new-credit counter reflects deduplication, not a general claim that enrichment is free. See the [official MCP lookup-cost documentation](https://api.docs.dealmachine.com/ai-assistants/mcp-server) and [credit semantics](https://api.docs.dealmachine.com/concepts/credits).

## Integration boundary

Keep `LIVE_PROPERTY_BINDING_VERIFIED=false` and `PROVIDER_MAPPING_AVAILABLE=false` in the sibling native implementation. This output deliberately does not satisfy `jarvis.normalized-analysis.v1`; do not feed it to Atlas as though it were verified sales. It has no native record IDs, trusted policy, unit conversion, source expiry or verified-sale evidence. Do not set `saleVerified:true`, alias an estimated price into `salePriceUsd`, or assign units from field names to make that contract pass.

The useful integration is a draft review branch consuming `status`, `observationStatus`, controlled `reasons`, identities and estimated/verified counts. Preserve `held=false AND human_takeover=false` and fallback END in the existing workflow. The module grants no authorization to publish, enroll, send, change holds, or update the current analysis pointer. A later reviewed mapper needs documented currency/units, trustworthy sale classifications/provenance, native property binding and policy before real Atlas calculations can be added.

## Verification

Run from this folder using existing Node.js; no installation is required:

```sh
node --test observed-provider-adapter.test.mjs
```

Tests load the actual sanitized comps, no-match address and structured-address match artifacts one directory above. They cover response completeness/counts, identity, duplicates/self-comps, invalid numbers/dates/categories, null/missing/zero preservation, estimated/recorded/listing distinctions, independent sale keys, credit accounting, blocked valuation, parser bounds and exclusion of unrelated data. No provider requests or metered native tests run.
