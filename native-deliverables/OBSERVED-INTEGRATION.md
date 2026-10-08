# Observed provider and owner-policy integration

This supersedes the earlier statement that no complete comps schema was available. The authorized task-3 sanitized pair establishes the observed `data[0]` envelope and all three `data[0].comps` rows. Seven explicitly named sanitized artifacts were imported unchanged; `observed-source/IMPORT-MANIFEST.json` records their hashes. No retained full response, credentials or provider service was accessed here. The request ledger is being reconciled separately and is not changed by this package.

## What changed

`code/observed-provider.js` has `review`, `analyze`, `prepare` and `reconcile` operations. It composes the preserved mapper with strict independent native/policy/semantic bindings. `review` works on the real sanitized pair and accepts all three rows' estimated price class under the owner's explicit selection; it returns no valuation because the required bindings are absent. The original mapper's recorded-sales-only eligibility is not imposed as the new business policy. No estimate is relabeled as a recorded sale.

The observation schema remains separate from the older public-documentation adapter. Actual property categories are strings; `num_units=0` stays a zero observation and normalizes to unknown units, never one. A sourced house-classification binding is required. `building_condition=null`, both independent sale-history keys, missing/null/zero distinctions, complete row counts and ordinals, raw dates, and source paths remain visible. A matched pair proves the observed identity and response representation, not market completeness.

`jarvis.normalized-analysis.v2` requires an explicit `compPriceBasis`, allowed labels and an estimate-acceptance reference. `provider_estimated_comps` uses `estimatedPriceUsd`; `salePriceUsd` remains null and `saleVerified` false. House estimated ARV is labeled `house_provider_estimated_arv`, with no confidence score or claim that price proves renovation. Recorded-only policy still excludes estimates. Price policy does not bypass identity, property type, area, distance, dates, freshness, duplicate/self-comp, hold or current-version checks.

The generic Atlas JSON entry remains closed to arbitrary real normalized input. Real composition is available only through the observed wrapper's validation and required bindings. Internal TypeScript composition functions are not authentication boundaries; the installed native caller must supply trusted data. No input flag creates approval.

## Known semantics versus missing bindings

| Item | Preserved observation | Required for computation |
|---|---|---|
| Prices | Three numeric provider estimates | Independent USD confirmation; exact estimated-price policy and labels |
| Area/distance | Raw numeric `sqft`/`distance`; units absent from the observed comps contract | Referenced square-foot and mile bindings; no assumed raw units or coordinate-derived substitute |
| Lot size | Raw value retained; unit remains unknown | Optional referenced acre/sqft binding; house calculations may leave normalized acres null because lot size is unused |
| Time | Request-sent timestamps, raw date-only/timestamp sale dates | Independently evidenced capture timestamp and policy eligibility deadline; capture cannot precede the request |
| Source update/expiry | Provider metadata absent | Remains unknown. Capture-based age is labeled separately and must be allowed by tenant freshness policy |
| Coverage | Three returned rows and matching counts | No claim of complete market coverage; tenant chooses minimum count/selection rules |
| Native state | No IDs, policies or capacities invented | Exact native Property/Analysis IDs and versions, seller association, current holds, authoritative policy and complete readback |

Timestamp sale dates normalize to UTC calendar dates only for date filtering; `sale_date_raw` retains the original. Future instants fail. Unknown category arrays cannot be silently mapped into the observed string classifier. Geometry contradictions between the address and comps subject fail.

## Native record evidence

The existing 58-field schema is unchanged. `Analysis.basis` holds the explicit estimated basis. Estimated prices use Evidence facts `fact_name=provider_estimated_price`, `fact_unit=USD`, `fact_value_number=<amount>` only after unit binding. They never populate `sale_price_usd`. `row_kind=SALE` denotes the provider's sale-type observation, not verified recorded-sale status. Price kind, false verification, confidence basis, acceptance reference, schema revision, raw date/path, unit references, capture-clock basis and unknown provider update/coverage are separate facts.

All pages and facts must reconcile exactly. Newly read Contact STOP/takeover and seller associations are checked again before a completion intent. Native records remain the system of record. No pointer, send or signature update is emitted; readback is not an atomic transaction or exactly-once guarantee.

## Owner-selected acquisition behavior

The house wholesale offer is exactly `0.70 × ARV − repairs`. Repairs include the selected whole-house scope base, nonoverlapping known extras and uncovered project costs, then contingency. Replaced allowances are removed before replacement costs are added. Financing, holding, selling and assignment costs are tracked separately and never silently deducted. Room-only or component-area scopes cannot use a whole-house living-area model.

`code/acquisition-policy.js` requires current analysis/policy bindings and rapport, seller motivation and repair-intake references. Unknown major costs and unresolved structural/foundation/fire/flood/full-gut/addition/code scope stop calculation. Estimates alone do not impose routine human approval. A house ARV wholesale opening packet must reproduce the formula through `offers.wholesalePreparation`; counters still require current explicit standing bounds, ceiling and exact terms.

Seller-reported mortgage plus low equity, free-and-clear ownership plus rejection of cash, or partnership interest produce subject-to, seller-financing or novation **exploration candidates**. Multiple candidates require selection. Unknown facts imply no route; contradictory mortgage/free-clear reports fail. No loan assumption, lender consent, verified equity, down payment, financing rate, monthly payment, term or legal enforceability is inferred.

## Repair model selection

The owner approved **$20/$40/$65 per living sqft with 10% contingency** in message `Sentinel_2a28f276b34c819190825f5f22111122`. The active version is `house-screening-2026-10-07-v2`. `admin-config/repair-models.json` now has `selectionPending:false` and the approved active model; `repair-policy-defaults.json` supplies the exact configurable policy fragment. The earlier $25/$50/$80 version and unapproved proposal version are superseded and rejected. Changing rates or contingency under the approved version fails; later custom policy versions still require actual trusted native authority. The approved screening model remains preliminary cost evidence, and synthetic test policies remain separate.

These are provisional screening choices, not validated nationwide averages or bids. ArvCalc supplies an educational scope model and broad ranges; the exact proposed rates are implementation choices under delegated research. The San Antonio contractor describes materially different ranges by partial, cosmetic and gut scope, so no regional multiplier is inferred. FlipperForce supports line-item validation and contingency planning. [ArvCalc](https://arvcalc.com/rehab-cost-estimator), [San Antonio scope guidance](https://asremodelingsa.com/whole-home-remodel-cost-san-antonio/), [FlipperForce](https://flipperforce.com/how-to-flip-houses-curriculum).

`agent-training/` contains only each agent's operational role and necessary seller-facing behavior. Jessica identifies herself as AI, uses a short adaptive intake, reuses volunteered facts and returns to motivation/timing/offer. Sparse acknowledgments belong at natural pauses; actual platform overlap/backchannel behavior is not live-verified.
