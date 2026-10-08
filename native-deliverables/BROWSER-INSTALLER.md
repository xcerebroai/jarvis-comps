# Exact files for browser installer 01a117b4

Root: `/Users/quentinflores/Documents/Codex/2026-10-07/task-2/implementation/native-deliverables/`.

Repair approval is resolved. Use active model **`house-screening-2026-10-07-v2`**, $20 light / $40 medium / $65 heavy per living sqft, with **10% contingency for all three scopes**. Owner approval reference: `owner:Sentinel_2a28f276b34c819190825f5f22111122`. This approval selects the repair defaults; it does not populate missing native policy IDs, expiry, seller facts, offer terms or contract authority.

## Configuration and training

| Destination | Exact file | Use |
|---|---|---|
| Logical house repair policy configuration | `admin-config/repair-policy-defaults.json` | Use its four normalized keys and values: model version, rates, contingency basis points and rate source reference; bind them only to verified native Policy fields |
| Administrative model inventory | `admin-config/repair-models.json` | Active approved model, scope packages and superseded versions; no pending rate approval |
| Jessica agent training | `agent-training/jessica.md` | Concise adaptive repair intake, honest AI identity, sparse acknowledgments at pauses, approved defaults and exact offer/alternative behavior |
| Alex agent training | `agent-training/alex.md` | Text/nurture ownership and exact-property facts/holds |
| Atlas agent training | `agent-training/atlas.md` | Separate estimated valuation basis and deterministic approved cost rules |
| Mason agent training | `agent-training/mason.md` | Exact approved document, delivery/revision/signature lifecycle |

Install only the role's training file as conversational instruction. Keep manifests, research, test fixtures, account context and administrative handoff text outside agent prompts. The rates are approved screening assumptions, not contractor bids. The arithmetic remains `(whole-house base − replaced allowances + nonoverlapping add-ons + uncovered project costs) × 1.10`, then `offer = 0.70 × ARV − repairs`. Do not silently deduct separate financing/holding/selling/assignment costs.

## Custom Code packages

Each file is a complete standalone script. Input is exactly one property, `requestJson`, containing a JSON string; the script assigns `output`. Use the named schema and the ordered bindings in `INSTALLATION.md`.

| Exact script | Input schema | Operations |
|---|---|---|
| `code/acquisition-policy.js` | `schemas/acquisitionPolicy.schema.json` | `calculate_wholesale`, `explore_alternatives` |
| `code/observed-provider.js` | `schemas/observed.schema.json` | `review`, `analyze`, `prepare`, `reconcile` |
| `code/storage.js` | `schemas/storage.schema.json` | `decode_property`, `allocate`, `prepare`, `reconcile` |
| `code/atlas.js` | `schemas/atlas.schema.json` | Synthetic/normalized v2 calculation; real observed data uses the observed-provider wrapper |
| `code/offers.js` | `schemas/offers.schema.json` | Exact offer/counter evaluation, including wholesale preparation and ceiling |
| `code/mason.js` | `schemas/mason.schema.json` | `prepare`, `event`, `revise` |
| `code/routing.js` | `schemas/routing.schema.json` | Exact property and role routing |
| `code/property-adapter.js` | `schemas/property.schema.json` | Historical public-doc property projection; do not route the observed string-category pair through it |

The changed repair logic is bundled into `acquisition-policy.js`, `offers.js` and `mason.js`; refresh all three together. `package-manifest.json` gives exact bundle bytes and SHA-256 hashes. `field-map.csv` and `schema-manifest.json` remain the actual 58-field inventory. Do not replace the original synthetic proof action.

For a bounded local example of the approved model, use `fixtures/house-wholesale-approved-defaults.json`, its `.expected.json` and `.test-field-literal.txt`. The property, ARV, intake and authority in that example remain synthetic. Existing synthetic cases are indexed separately from the actual sanitized review in `observed-examples/index.json`. New native tests and live acceptance have not been executed by this local task.

## Remaining installation gates

Follow `INSTALLATION.md` in order and use `READINESS.md` for unresolved bindings: currency/area/distance and source capture evidence, actual tenant comp/freshness rules and policy records, native associations/capacities/ACL/paging, exact standing/counter terms and legal facts, and atomic pointer/authorization/delivery/lifecycle behavior. Do not clear these because the repair defaults are now approved. Unknown major costs and structural/full-gut exceptions still go to review. Routine estimates alone are not a review trigger.

All hosted writes belong to browser task `01a117b4`. This local package does not claim native installation, six live acceptance suites, real offer authorization, delivery or signatures.

## Synchronous quote route follow-up

Use `HTTP-QUOTE-ADAPTER.md`, `HTTP-DEPLOYMENT-MANIFEST.json`, `http/request.schema.json`, `http/response.schema.json`, and `BROWSER-INPUTS-NEEDED.md`. The implementation includes concrete GHL read/create/reconcile code and the nine-object field decoder. `http/installed-binding-review.json` stays inactive until API/authority/access checks are complete. It does not install credentials or change grants. Preserve the older synthetic proof and do not point Jessica at the legacy `/comps` estimate-rejecting handler.
