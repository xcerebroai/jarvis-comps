# Local verification

Executed October 7, 2026 with the existing Node.js v26.7.0 runtime:

```sh
node --test observed-provider-adapter.test.mjs
```

Final result: **51 tests passed, 0 failed, 0 skipped**, exit code 0.

Inputs read:

- `../comps-response-projection.json`: one subject, three returned comp rows, matching observed counts, every sale type `Estimated Sales Price`.
- `../address-response-sanitized.json`: the unmatched full-address request.
- `../address-matched-projection.json`: the subsequent successful structured-address request.

The final run covers exact response/request identity, complete counts and required rows, duplicate/self rows, valid calendar dates, strict numeric types, null/missing/zero distinction, unchanged array order, category strings and numeric-array fixtures, separate sale amount/price fields, unmatched versus matched address responses, exact structured echo, credit debit versus returned-property counters and exclusion of unused financial/contact/image content. The address leakage regression injects estimate/listing-price, mortgage/lender and unobserved commercial-unit values and verifies that none reach output. The unmatched timestamp is tested as request sent time, with observation/retrieval time remaining null. Both positive and negative paths retain a null valuation and disabled outbound actions.

All three observed comps remain estimates; verified/eligible counts are zero. Unknown units/currency, sale verification, source reference, retrieval time and expiry are not filled in. `completeRenderedResponseParsed` and matching counts describe the projected response only; they do not authenticate provenance or establish full market coverage.

No provider requests, credentials, browser/native actions, dependencies, sibling repository files or native compile-time gates were used or changed by this implementation. This is local adapter verification, not native installation or live valuation acceptance.
