# TypeFree R2 delta and private wire/3 design1 — separate review decisions

18.10.2026 · psygames-codex-mac · existing review77ca8ea0;
R1 task `e63cc347-94c9-40f0-8fbe-ed20a9aeed5b` stays OPEN.

## A. R2 accepted as a local source-level robustness correction

Exact delta SHA256
`66c26bc2090d303a17fee5383d7fc7cc82fcd2283ba5e1952ecd602f2c7ae763`,
against original91-file patch
`731e10d2e1d572ec81b74267b1675a5eb2b7fc78cb3dbfbc11caeb6e82e91463`.
Files in `/Users/denisonosov/dev/typerighting-wt-account-20261016`:

| File | Independently matched SHA256 |
|---|---|
|src-tauri/plugins/account-vault/native-delete/src/registry.rs|0b0b553b7a61c3dfff1bc41af909c2f5d3a9b36ca235f2d9284f89d7e2f20527|
|src-tauri/plugins/account-vault/native-delete/src/registry/tests.rs|d55013dba4978a907e03827893d48b80b4e122402eded97790fa599ed4e48aee|

Main independently ran21 native Rust tests PASS, rebuilt the small existing
TEST-ONLY conformance example offline/locked and repeated6 native subprocess
checks PASS. Read-only parallel code audit confirmed the OwnedHttp guard drops
its pinned owned sender future/socket before transitioning only its own Reserved
lease to Settled, on both ready poll and task drop. It adds no detached driver.
New tests cover abort/socket close/retirement/replay/reclaim and successor B.

Own conformance result/log:
`/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/_local/ecosystem-cloud/typefree-r2-review-ZxYRRm/native-conformance-result.json`
and `native-conformance.log`.
Store/Auth setup is synthetic; TLS/socket and native code are real. Actual
Tauri window-close-trigger reachability, Keychain/crash/mobile/device remain
unverified. No independent macOS Tauri-check result is claimed by this reviewer.
This acceptance addresses R2 only, not R1, full implementation or availability.

## B. Exact wire/3 design1: changes requested before boundary implementation

Reviewed all231 lines of
`/Users/denisonosov/Documents/TeamOps/typerighting-onboarding/account-native-review-fixes-20261018/VAULT3_WIRE_DESIGN_1.md`,
SHA256 **e83d7977a6fff6db15785628e05aa8140c615ffa98e25d47144635c4ebe0e762**.
Architecture ACK proposal1/9ff934ce remains valid. **No exact wire/migration ACK
yet**: resolve the following three bounded protocol points in design revision2.
These are specification gaps, not observed product vulnerabilities.

### D1. Explicit history-read permission is missing from the native scope model

Design lines90–103 specify active Scope and consent for mutations, but no
separate history/preview permission for listVersions/download/lookupReceipt.
Lines32–33 leave consent in the controller; the exact native actions do not show
how that explanation/decision becomes a native-bound capability. A freshly
authenticated Scope plus control.allocate is therefore underspecified for reads.

Frozen connector `third_party/ecosystem_cloud_ts/client.ts` starts with
`#history=false`, exposes explicit allowHistoryRead after the host explanation,
and its guard rejects reads without that grant (lines142,162–166,194). Moving
all token-bearing transport into native must not silently turn authentication
alone into history access or rely on an unmentioned JS flag at the raw IPC seam.

Specify the explicit app+issuer+subject+generation-bound history/preview grant,
who may mint it after the separate host explanation, which reads require it,
its terminal revocation on OFF/cleanup/A→B and tests of raw native reads before
and after the grant. It is not server storage consent or public sharing. An
exact readConsent-only exception can be specified separately if needed. Preserve
the shared client pin; define its host mapping rather than changing its code.
If a deliberate JS-only trust boundary is intended instead, state and reconcile
that narrower guarantee explicitly before claiming native scope enforcement.

### D2. A valid callback must not be lost while OTP start is still pending

Design lines65–66 say BUSY if callback arrives before start settles, but define
no safe retention/re-delivery transition. Email delivery/user opening the link
can beat completion of the OTP HTTP response. The current host explicitly handles
this race (`src/account-host.ts:191`). BUSY alone can discard the only URL event
or leave the user waiting indefinitely.

Specify one bounded, current-flow-bound queued callback or another deterministic
handoff that runs only after start has actually settled. No duplicate OTP,
parallel exchange, borrowing another flow's verifier, automatic re-exchange of
a consumed code, unprotected callback-code persistence or stale A→B callback.
Define failure/abort/expiry/cold-restart handling and add early-callback tests.

### D3. Operation-kind binding is inconsistent with the allocation DTO

Design control.allocate lines105–107 receives only Scope. Lines113–114 require
consume to match an immutable prepared kind, but no data operation was supplied
at allocation. Clarify one exact model:

- allocation captures the typed operation/intent before returning the handle; or
- allocation is explicitly only a Scope-bound cancellation reservation, with
  operation+arguments immutably captured at the first atomic data consume.

In either case reject second/replayed/cross-scope consume and known-handle
pre-entry cancellation must prevent HTTP. Auth/cleanup prepare continues to
capture its immutable intent before network. Include wrong-kind/replay tests;
do not claim pre-allocation kind binding if the wire cannot encode it.

## Retained accepted constraints and next step

The design correctly keeps sole native credential ownership, private PKCE and
fresh receipt, fixed provider operations, no generic URL/headers/token IPC,
separate Auth limits and deletion's unchanged1KiB/70s boundary, reserved cleanup
instead of OFF→hidden resume, and fail-closed old-vault migration/local-data/B
preservation. Pinned SDK OTP/PKCE request semantics were checked against local
GoTrueClient.ts2290–2311 and2018–2070, not guessed from memory.

Return only the amended exact private-wire/migration document+hash addressing
D1–D3; no new architectural round or human decision is requested. Then review
revision2 before coding the R1 boundary as the author originally proposed.
Real provider acceptance of query-bearing callback remains a separate live gate;
do not widen redirect registration or settings to assume it works.

Shared ea404/e1be/057c sources remain unchanged; no server/credentials/config/
Origin/CORS, real-user operation, release or heavy build performed. Keep final
action OFF. R2 source acceptance is not all4 readiness or permission to close R1.
