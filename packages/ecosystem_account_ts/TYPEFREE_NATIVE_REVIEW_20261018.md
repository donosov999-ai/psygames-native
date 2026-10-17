# TypeFree native candidate — independent review, 18 October 2026

Reviewer: psygames-codex-mac. Shared-account parent
`bb2c9f30-d786-4fe6-b25c-4b2ace267d4b`; existing TypeFree review task
`77ca8ea0-181c-4b8c-bd55-ba85f07a382e` (no foreign status change).

Verdict: **changes requested; keep availability gate OFF**. One independently
reproduced native-interface defect and one conditional lifecycle robustness
finding below. This is NOT a reported real-user exploit, device acceptance,
server JWT bypass, or permission to enable/release the implementation.

## Exact source and boundaries

- App worktree `/Users/denisonosov/dev/typerighting-wt-account-20261016`, branch
  `codex/typefree-account-ui-20261016`, base
  `754e5715143de25bc7722e70f3e757eee1ebd69d`; candidate uncommitted/unpushed.
- Author report
  `/Users/denisonosov/Documents/TeamOps/typerighting-onboarding/ACCOUNT_NATIVE_CANDIDATE_20261018.md`,
  SHA256 `e53afab4e95d07efd404552970034e341f9b4ddc1d9e08daab7a6ec5ebf5566c`.
  Full91-file patch SHA256
  `731e10d2e1d572ec81b74267b1675a5eb2b7fc78cb3dbfbc11caeb6e82e91463`.
  Reviewer verified both hashes and all91 current file hashes against the
  author's native-candidate-receipt.json: no differences.
- Six shared package files compared byte-for-byte with frozen
  `ea404f50b70d7c7cc8dc7296402bf39a4aecadc4`; addendum hash/source
  `e1be4ce4b80f2c7481a119be34783574d7c220a0` unchanged.
- Review covered app AuthHost/provider/controller/protected-vault/Tauri wiring
  and a parallel read-only native Rust transport/registry audit. It is not a
  complete logic review of every accumulated change in the91-file patch.
- No foreign source edits, commits, release, live backend, real credentials,
  OS Keychain mutation, heavy app build, device or server/config/ACL changes.
  Cached local Rust crate tests compiled a small target; no dependency download.

## R1 — P2: raw native commit can remove the recovery fence using cached session

Source: `src-tauri/plugins/account-vault/native-delete/src/registry.rs`,
`begin` lines167–184; `commit` lines294–316.

`begin(explicit=true)` can pass an existing paused/blocked state. The new writer
then calls `commit(expected)` without a session write or fresh authentication.
`commit` reads the *previous* durable session, removes `.paused`/`.delete-blocked`
and issues a new deletion lease. Subsequent implicit recovery is allowed.
The comment that the same host already verified a new sign-in is a precondition,
not a registry-enforced transition for a raw native caller.

**Reviewer independently reproduced** via the existing conformance executable's
actual `VaultWire`/Broker, synthetic Memory store and vault-only IPC:

1. claim → explicit beginA → one synthetic session write → commitA;
2. closeA preserves session and blocks implicit begin (confirmed rejection);
3. explicit beginB, **no new write, login or server verification** → commit same
   subject succeeds and returns a fresh lease;
4. claim another runtime → implicit begin succeeds: marker has been cleared.

No network request was dispatched. This is a native recovery-fence defect under
the agreed raw-IPC contract, not evidence of a compromised JWT/server, normal UI
reachability, real user data loss or completed account deletion.

Local reproducible proof and result:
`/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/_local/ecosystem-cloud/typefree-native-review-KAcIef/reproduce-paused-lease.mjs`
and `paused-lease-result.json`. The script uses a disposable synthetic test CA
and the existing TEST-ONLY native conformance executable; it never calls HTTP.

Requested fix: make lifting a blocked generation a distinct, native-enforced
fresh-auth transition, rather than trusting the caller's `explicit` boolean.
At minimum reject commit with no verified current-generation session change;
define precisely how the existing trusted AuthHost proves fresh authentication
to native, since simply rewriting identical cached bytes is not fresh sign-in.
Do not solve this with another auth backend, generic HTTP, secrets in IPC, or
loosening the common contract. Add negative tests for no-write commit and
same-cached-session replay after pause/ambiguous delete, plus the valid fresh
sign-in path. Keep server/API-token semantics separate from this local fence.

## R2 — P2 conditional: dropped execute future leaves Reserved forever

Source: the same registry, `execute` lines383–457, especially452–455;
`retire` lines461–471; retained reservations in claim/begin lines160/194–201.

`Settled` is set only *after* awaiting the owned HTTP sender. There is no drop
guard for an externally cancelled/destroyed execute future. Dropping it closes
its owned network future but skips the state transition, so retire returns Busy
and claim/begin retain the Reserved record. Accumulation can hit the128 limit.

This is a source-confirmed conditional Rust API lifecycle problem, **not an
independently reproduced Tauri/window-close hang**. Reachability from actual
Tauri task/window lifecycle remains unverified and must not be presented as an
observed application defect.

Requested fix/test: poll execute into native wait, abort/drop that task/future,
verify actual socket termination and eventual safe settlement/retirement,
single-use fencing and preservation of a successor B. Use an appropriate
lifetime guard/native operation ownership mechanism; never mark Settled while
an actual detached HTTP operation can still run. Show whether Tauri can trigger
the case before treating it as a product-release blocker.

## Independently executed checks — not cumulative scores

| Check | Reviewer result | Boundary |
|---|---|---|
| Four focused app test files |92 PASS|AuthHost/vault/provider/controller tests|
| TypeScript `tsc --noEmit` |exit0|No native/device proof|
| Pinned shared adapter |52 PASS|TS doubles, unchanged frozen package|
| Native crate, offline/locked |19 PASS|Real loopback TLS; synthetic Memory store|
| Existing native conformance harness |6 checks PASS|Actual TS→wire→native→TLS, synthetic Auth/setup/store|
| Additional raw-vault proof |R1 reproduced|No HTTP, no real account, no Keychain|

The author's broader194 tests/17 browser scenarios/macOS check were not rerun
or adopted as this reviewer's results. Existing tests passing do not cover R1.
Conformance result/log in the review directory above; its mode explicitly says
`REAL_NATIVE_SUBPROCESS_LOOPBACK_TLS_SYNTHETIC_VOLATILE_VAULT`.

Transport audit found no additional concrete defect in fixed endpoint/body,
TLS validation, Origin/redirect/retry or ACK bounds. DNS/connect/TLS-stall
coverage remains incomplete compared with the exercised header/body stalls;
that is a test gap, not proof of a continuing HTTP request after cancellation.

Default provider acceptance=false and compile-time authority=null remain in
place; final action must stay unavailable. Actual Tauri IPC, protected-store
crash/fault/restart, mobile targets, a signed artifact, live controlled backend
and device acceptance are separate remaining gates. Common all4 task stays open.

Supabase review checklist was used for server-vs-local authorization and token
revocation boundaries. No server change is needed for these app-local findings.
Current TLS notice (CBC removal earliest10 November2026) was checked; no claim of
production TLS/device acceptance is inferred from the loopback tests:
https://supabase.com/changelog/cbc-tls-ciphers-deprecated .
