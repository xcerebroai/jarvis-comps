# Current local verification

Base `39248149252def9de874219838b1cd1b70443642`, branch `codex/acquisitions-native-proof`. All changes are in the isolated implementation. The original checkout, existing API routes, dependencies, old synthetic proof and 58-field analytical manifest remain unchanged.

| Check | Result | Evidence |
|---|---|---|
| Vitest aggregate | **522 passed, 22 files** | `../evidence/wiring-full-tests.txt` |
| Quote-specific coverage | **66 handler + 6 actual route + 36 concrete GHL adapter + 44 transport/configuration cases** included above | Handler, route and GHL adapter test files |
| Preserved observed mapper Node suite | **51 passed**, seven source files byte-identical | `../evidence/quote-upstream-tests.txt`, `observed-source/IMPORT-MANIFEST.json` |
| Standalone calculators | **12 passed** | `../evidence/quote-calculator-tests.txt` |
| TypeScript / ESLint | **Passed**, exit 0 | `../evidence/wiring-types.txt`, `../evidence/wiring-lint.txt` |
| Production build | **Passed**, including new `/api/acquisitions/quote`; clean environment and authorized public font access | `../evidence/wiring-build.txt` |
| Actual disposable PostgreSQL | **Legacy handlers and new dual-scope machine-auth query passed**; private Unix socket, no TCP; server stopped and cluster removed | `../evidence/postgres-integration-verified.txt`, `../evidence/postgres-integration-result.json` |
| Workflow packages | Eight prior standalone bundles and eight schemas retained; generated examples still tested by aggregate | `package-manifest.json` |
| HTTP contracts | Eight schemas plus inactive installed-binding review and inactive comp-policy proposal exported | `http/`, `../evidence/quote-export.txt` |
| Browser schema handoff | Nine objects, 179 fields and 16 UI relation IDs imported unchanged; API semantics/IDs remain unverified | `native-schema-source/IMPORT-MANIFEST.json`, `native-installed-schema.json` |
| Original integrity / packaging | Original clean; unchanged proof/inventory/existing routes; patch applicability checked | `../evidence/final-integrity.json`, parent delivery manifest |
| Local task live native E2E | **Not performed** | No hosted writes, provider requests, grants, calls, sends, signatures or deployment |

The concrete adapter tests use an HTTP-shaped simulated GHL server and the actual adapter, not a mocked loadSnapshot/finalizeQuote implementation. They cover installed scalar Policy/Offer/Ceiling fields, typed numbers/booleans, protected context/quote Event fields, exact packet key, repair-only policy refusal, repeated/partial pages, association membership, changed state, lost create responses, immutable receipt conflicts, duplicate create, process recreation and STOP after recording. Simulated uniqueness proves code handling only; it does not verify GHL API constraints, read-after-write consistency or concurrency.

Handler tests cover input limits, exact call/property/current-analysis bindings, two properties per seller, estimated-price eligibility, unadopted comp policy, formula/counter terms, receipt tampering, authentication rechecks, eight-second timeout and no internal ceiling disclosure. Estimated prices are permitted with the approved basis. Neither the $20/$40/$65 repair approval nor native repair-defaults-only record supplies offer authority.

The HTTP fixture combines sanitized observed prices with fabricated TEST_ONLY native/unit/capture/policy/offer bindings. It is not a live valuation or client offer. The real sanitized review example still returns no valuation without independent bindings. The old synthetic proof and generic normalized real-input guard are unchanged.

The browser separately reports a successful guarded native Property decode preserving empty pointers and literal true flags through JARVIS_TEXT: bindings; that evidence is copied in the handoff, not performed by this local task. It does not verify API representations or routine quote operation. The discarded Custom Action echo mapping does not prove actual quote mapping or same-call speech.

Sequential native rechecks and unique quote-record creation are not a multi-record transaction, approval reservation, revocation barrier or exactly-once speech. There is a race after the last read. Secure owner token binding, API field/relation/unique-key verification, protected context storage and client-adopted comp/offer rules remain installation gates. The route now composes the implemented secure transport and adapter from three explicit server settings. Configuration remains absent and fails closed. Owner scope expansion is applied per browser report. See `NATIVE-QUOTE-OWNER-ENTRY.md`.
