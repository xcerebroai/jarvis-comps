# Public documentation mapping review

**Historical public-doc review.** The later authorized sanitized observed pair now verifies the sample comps envelope and string-valued categories. See `OBSERVED-INTEGRATION.md` for the current integration. Statements below about incomplete retained-response schema describe the earlier state; the public-doc adapter remains separate and unchanged in purpose.

Reviewed 2026-10-07. This review used official public documentation and local source only. No provider API, authenticated console, credential, retained response, or native workflow was accessed. The executable result is `src/lib/native/property-adapter.ts`, exported as `code/property-adapter.js`, with two synthetic examples and strict `schemas/property.schema.json`.

## Documented property projection

| Boundary | Documented shape | Local implementation |
|---|---|---|
| Address enrichment | `POST /v1/enrichment/address`; body `data[]`, `fields[]`, `contact_audience`; response `data[]` plus submitted/matched/unmatched totals | Exactly one `full_address`, audience `none`, exact input echo and totals; unmatched or warned matches require review |
| Get property | `GET /v1/properties/{id}`; response `data` is an object; optional `enrich`, comma-separated `fields`, `contact_audience` | Exact requested/provider ID match; endpoint-specific object projection |
| Categories | `property_type`, `building_condition`, `last_sale_doc_type` are multi-select values | Retain numeric option IDs; labels require matching, fresh, typed metadata; labels do not establish asset class, renovation or sale verification |
| Source observations | JSON numbers, date strings and nullable fields | No numeric coercion; distinguish missing, null and zero; preserve endpoint path and measurement unit |

Sources: [address endpoint](https://api.docs.dealmachine.com/api-reference/enrichment/enrich-by-address), [get-property endpoint](https://api.docs.dealmachine.com/api-reference/properties/get-property), [property field catalog](https://api.docs.dealmachine.com/reference/property-fields), [response format](https://api.docs.dealmachine.com/concepts/response-format).

The catalog names sale history `last_sale_price`; the get-property endpoint names it `last_sale_amount`. The adapter preserves each endpoint's name and reports the inconsistency. It never silently aliases these fields or treats either as independently verified comp evidence. `estimated_value` and `mls_current_listing_price` remain separate estimate/list observations. Currency remains explicitly unverified. [Catalog](https://api.docs.dealmachine.com/reference/property-fields), [get-property response](https://api.docs.dealmachine.com/api-reference/properties/get-property).

`living_area_sqft`, `lot_size_acres` and endpoint-specific `lot_size_sqft` retain their units. `num_units` and `num_commercial_units` stay separate; neither establishes NOI. Category metadata exposes typed `option_id`/`label` pairs: string `"9001"` is not coerced into number `9001`. Synthetic dictionaries in fixtures are explicitly fictitious. No filter metadata request was made. [Catalog](https://api.docs.dealmachine.com/reference/property-fields), [filter metadata](https://api.docs.dealmachine.com/api-reference/filters/list-filters).

`responseProjection` is an already-authorized allowlisted projection, **not a full raw-response sanitizer**. Unknown fields, including contacts/owner/financial expansions, are rejected. The request shapes describe the contract only; this module cannot send a request. `LIVE_PROPERTY_BINDING_VERIFIED=false` makes real mode stop with `LIVE_PROPERTY_BINDING_UNVERIFIED`. Synthetic results explicitly return no asset classification, comps, valuation or authority. Documentation confirms field shapes; it does not prove any actual response or permission to inspect one.

## Existing source audit

The historical `src/lib/dealmachine.ts` remains untouched and is not imported by the new adapter. Its enrichment type includes `lot_size_sqft`, while this new address projection follows the catalog's `lot_size_acres`. Its comps declarations assume paths and units such as `sqft`, `lot_size` and `distance`. The public pages reviewed do not verify that complete comps contract. Historical interfaces and the partial sanitized first-comp observation cannot substitute for verified complete evidence.

The independent normalized Atlas boundary therefore remains `PROVIDER_MAPPING_AVAILABLE=false`. Real comps require a complete authorized schema/projection with array/envelope paths, source identity and date, explicit currency/units, sale classification/verification, selection completeness and per-row provenance. No positive real valuation is produced from the public property adapter. No new source facts, client policy, repair amount, cap rate or legal approval were invented.

## Native mapping review

The supplied manifest was preserved byte-for-byte. Runtime audit covers all three schema keys, 58 field names/types/merge keys, unique IDs and both association directions/cardinalities. The association definition IDs remain unverified. `decodeNativePropertyRecord` binds the 12 Property fields into the normalized snapshot and rejects missing/extra fields and nonliteral hold flags.

HighLevel documents record writes as a `locationId` plus a field-name-keyed `properties` object under `/objects/:schemaKey/records`; the schema key has the `custom_objects` prefix. Record reads return `record.id` and `record.properties`. Search documents `records[]`, total and paging inputs. These are **documented transport envelopes**, not evidence that this location's workflow bindings, pagination termination, associations, permissions or readback serialization have been tested. [Create record](https://marketplace.gohighlevel.com/docs/ghl/objects/create-object-record/), [read record](https://marketplace.gohighlevel.com/docs/ghl/objects/get-record-by-id/index.html), [search records](https://marketplace.gohighlevel.com/docs/ghl/objects/search-object-records/).

The local decoder takes an explicit normalized envelope `{locationId,schemaKey,recordId,properties}`; a future trusted binding must extract `record.id` and `record.properties` and supply verified location/schema context. The actual inventory contains Single line/Number fields, so generic monetary or other documented property types are not mapped. No API/SDK transport or atomic-write guarantee is implemented here.
