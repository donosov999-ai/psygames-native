# TypeFree wire3 review corrections — independent retest, 18 October 2026

Reviewer `psygames-codex-mac`, Mac, Asia/Almaty. Existing R1 task
`e63cc347-94c9-40f0-8fbe-ed20a9aeed5b`, review parent
`77ca8ea0-181c-4b8c-bd55-ba85f07a382e`.

## Exact candidate

Read-only source `/Users/denisonosov/dev/typerighting-wt-account-20261016`,
branch `codex/typefree-account-ui-20261016`, base
`754e5715143de25bc7722e70f3e757eee1ebd69d`, version2.60.3,
still uncommitted/unpushed. Source owner `typerighting-codex-mac`.

Author report `/Users/denisonosov/Documents/TeamOps/typerighting-onboarding/ACCOUNT_VAULT3_REVIEW_FIXES_20261018.md`,
SHA256 `cd1736434dd165cb7fca21ab0f00842cc58a158d985d72511f1c8e3110d823cb`.
Evidence input directory
`/Users/denisonosov/Documents/TeamOps/typerighting-onboarding/account-native-v3-prepare-off-20261018`:

- `review-fixes-source-receipt.json` SHA256
  `5359c10957eb5023be5d2a4702887da699b352a9bc0f26aebf6d6f081c0452c4`.
- Five-file `review-fixes-delta.patch` SHA256
  `189de09aa901195101a75ff7ba92a41908f66b032bddcea417a4657c059e5a0c`.
- Full105-file `typefree-account-vault3-reviewed-fixes-full.patch` SHA256
  `e3180fc9a5cb88fcf79811ba74544b68c712eb9cdb930d9c96041d278175cdfe`.

All105 current source hashes match before/after main tests; exactly the stated five
paths differ from the previous manifest, the other100 match. Approved design2,
shared deletion/transport/snapshot pins and existing worker.rs remain unchanged.
No foreign source, index, task status or configuration was edited by this review.

## Main independent evidence

Fresh own result directory:
`/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/_local/ecosystem-cloud/typefree-v3-fixes-retest-Q5ToEZ`.

- TypeScript `npx --no-install tsc --noEmit`: exit0.
- App `npm test -- --reporter=dot`: **198 PASS /16 files**, `app-tests.log`.
  Includes historical wire2 fixtures, not198 new native wire3 checks.
- Current native crate offline/locked tests: **50 PASS**, `native-tests.log`.
  Actual TLS, new dropped-prepare and durable-store-only restart tests included.
- Small offline/locked current conformance example rebuilt from the actual crate
  path (11.44s). Its SHA256 equals the frozen manifest:
  `95fc180cfd79cae358de09a33a848d1b4640ad8579592a7445cd57abfbdb788a`.
- Current facade/controller/provider/native worker/TLS harness: **19 scenarios
  PASS**, `v3-conformance-result.json` and `conformance.log`.
- **Five original independent diagnostic triggers retested fail-closed**, not
  merely the author's added tests. Own wrapper `retest-independent-proofs.mjs`
  uses the original proof code in memory with corrected security expectations;
  original historical evidence and all foreign product files remain intact.
  Script SHA256 `7a0e57ca869230dc1a6981e3735a43e47eaf0ef99dc5a4bff976466442fc7ea1`.
  Results: `prepare-off-result.json`, `native-review-result.json`,
  `independent-regressions.log`.
- Compiled default native authority readback: one current build output found,
  JSON null. No configuration values or credentials were printed.

Commands run from the read-only source root:

```sh
npx --no-install tsc --noEmit
npm test -- --reporter=dot
CARGO_BUILD_JOBS=2 CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_DEV_INCREMENTAL=false cargo test --offline --locked --manifest-path src-tauri/plugins/account-vault/native-delete/Cargo.toml --target-dir src-tauri/target
CARGO_BUILD_JOBS=2 CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_DEV_INCREMENTAL=false cargo build --offline --locked --manifest-path src-tauri/plugins/account-vault/native-delete/Cargo.toml --features conformance-fixture --example conformance --target-dir src-tauri/target
TYPEFREE_EVIDENCE=/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/_local/ecosystem-cloud/typefree-v3-fixes-retest-Q5ToEZ node tests/account-v3-native-conformance.mjs
TYPEFREE_EVIDENCE=/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/_local/ecosystem-cloud/typefree-v3-fixes-retest-Q5ToEZ node /Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/_local/ecosystem-cloud/typefree-v3-fixes-retest-Q5ToEZ/retest-independent-proofs.mjs
```

## Focused results for the four findings

1. **V3-R1-1:** stale prepare after explicit OFF awaits conditional native pause
   of its exact returned Scope; ordinary replacement without OFF does not acquire
   a persistent pause. Main's original cached-resume/cold-callback triggers now
   record `pauseSent:true`, recovery false, no REST; cold callback exchange0.
   Current19 harness adds six OFF/AbortSignal prepare cases, late A/fresh B safety
   and successful ordinary replacement. Native blocked-prepare/drop test passes;
   this is not proof that a real Tauri window-close cancels the command.
2. **V3-R1-2:** cleanup checks the HTTP status of each fixed REST result, with
   existing exact consent representation validation preserved. Main's independent
   revoke503 and DELETE503 no-mutation fixtures now yield `cloud.error`, NOT
   `cloud.removed`; local history remains. Consent/copy left on the server is
   correctly treated as uncertain failure, not falsely announced as deleted.
   Current conformance also checks no DELETE after failed revoke.
3. **V3-R1-3:** production `v3_control_worker` retains a durable retirement job
   for the captured flow independent of original consume. Main's original raw
   pre-entry cancel → NO consume → claim → same callback now rejects, exchange0.
   The current native test also restarts a genuinely new Broker sharing only
   durable Memory data, and checks successor B safety. The low-level signal-only
   synchronous helper is not misrepresented as the production durable ACK.
4. **V3-R1-4:** prepareStart retires old durable flow after in-memory generation
   replacement, before new pending/flow writes. Main ran the new current native
   failure-checkpoint test: both targeted write failures reject old A after a
   store-only Broker restart, and fresh B succeeds. Main did NOT rerun the author's
   copied old-source RED crate; its RED log is author evidence, not ours. This
   avoids the reported mixed-origin Cargo target contamination. Main current
   native suite and rebuilt conformance example are recorded separately above.

No additional browser UI build, macOS Tauri check, actual protected OS store,
device/mobile/live provider check was executed by main in this focused retest.
Author's seven compiled-browser cases and Tauri check are received reports only.
All main Auth/REST data are synthetic loopback fixtures, store is volatile/fault-
injected Memory, no real OTP/accounts/credentials, remote changes or costs.

## Acceptance boundary

The exact four local source corrections pass main independent tests and review.
They do not activate shared-account deletion, close foreign task statuses, authorize
new builds/releases, or establish all-four-app readiness. Real Tauri IPC/secure
store, supported mobile devices, actual crash/fault/window lifecycle and controlled
provider/backend/query-bearing callback checks remain separate owner gates.
Memory-store tests cannot promise durable recovery if every protected OS write
and erase fails before a crash. Keep approved trusted-host assertion (not OS-
attested human presence), default authority null/provider acceptance false,
limited numeric snapshot allowlist and exact shared pins unchanged.
