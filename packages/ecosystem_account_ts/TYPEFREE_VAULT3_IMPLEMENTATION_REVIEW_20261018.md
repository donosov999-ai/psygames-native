# TypeFree wire/3 implementation — independent review, 18 October 2026

Reviewer: `psygames-codex-mac`, Mac, Asia/Almaty. Existing correction task
`e63cc347-94c9-40f0-8fbe-ed20a9aeed5b`; review parent
`77ca8ea0-181c-4b8c-bd55-ba85f07a382e`.

**Decision: CHANGES REQUESTED. R1 remains OPEN.** The exact design2 ACK remains
valid; this is an implementation race, not a request for another architecture round.
Default native authority/provider acceptance and shared-account deletion stay OFF.

## Frozen input and integrity

Read-only source: `/Users/denisonosov/dev/typerighting-wt-account-20261016`,
branch `codex/typefree-account-ui-20261016`, base
`754e5715143de25bc7722e70f3e757eee1ebd69d`, uncommitted/unpushed, version2.60.3.
All **105 source hashes** matched the author's manifest before and after checks.
No foreign source files, index, task status, backend or configuration were changed.

- Author report: `/Users/denisonosov/Documents/TeamOps/typerighting-onboarding/ACCOUNT_VAULT3_R1_IMPLEMENTATION_20261018.md`,
  SHA256 `5e7974fb2b4649140cebefce326cc2c04cd6a17d92f26a18f8fb075a282770bb`.
- Manifest: `/Users/denisonosov/Documents/TeamOps/typerighting-onboarding/account-native-v3-evidence-20261018/vault3-source-receipt.json`,
  SHA256 `bb7bac8d3eb0099c2f1c234d382b8c99ed7337aef39a0e19da648c4f3165d05e`.
- Full105-file patch SHA256 `548ceabdbdce914a7c58566e87c2d6532fad609f2ef6f8ba27ddcf2c366e7540`.
- R1 delta46-file patch SHA256 `f610ff2fa66e3c7dddb079d0d75204348aed970e1a4d997b3f43a5ed75925c56`.
- Facade `/Users/denisonosov/dev/typerighting-wt-account-20261016/src/native-account-host.ts`
  SHA256 `3f2ca5efb14353779353744587709553f38c27b0668c3d06dc24c908a4a1d3e4`.

## P2 / V3-R1-1: OFF while awaiting prepare loses the native fence

Source: `src/native-account-host.ts:44`, with `begin` at37, `suspend` at48,
`resume` at52 and `completeCallback` at51.

`begin` clears `activeScope`. `prepare` awaits native preparation, then calls
`check(g)` **before retaining the returned exact scope**. `suspend` only sends
native pause when `activeScope` is already known. If OFF occurs while the IPC reply
is pending, it increments the JS generation but sends no native pause. When the
reply arrives, `check(g)` throws and drops the prepared scope. The outer catch
does not suspend again because its generation is already stale.

Actual native preparation may already have persisted a resume or callback state.
The JavaScript operation rejects, but native recovery remains possible:

1. **Cached resume:** establish fresh synthetic A; begin replacement-host resume;
   hold its real native prepare reply; call `suspend`; release reply. Old resume
   rejects. Another host then successfully resumes the cached A **without a second
   token exchange**, although OFF was explicitly requested.
2. **Cold callback:** finish actual synthetic OTP, adopt the matching callback on a
   new host; hold the real native callback-prepare reply; OFF then release. Old
   callback rejects, but a replacement runtime can exchange the same cancelled
   flow and activate A. No native flow-revocation marker was installed by OFF.

Both reproduced through **current real NativeAccountHost → strict IPC parser →
Rust worker/registry → loopback TLS fixture**, with Memory-store. Each recorded
`pauseSent:false`, recovery true, `tokenExchanges:1`, `restRequests:0`. This is not
the old public vault2/no-write commit route (which is retired), and not a proven
server-auth bypass, physical-device exploit, data upload or real-account incident.

### Required correction and regression checks

Retain/settle a pending prepare's native ownership even when its JS generation is
retired. A stale successful reply must conditionally cancel/retire **its returned
exact scope/operation**, not silently discard it. Ensure the native durable OFF
and flow-revocation semantics hold, including preparation/caller-drop failure paths.
Do not clear or pause whichever newer B happens to be current. No generic session
write, cached-session commit escape, JS receipt or second auth owner is acceptable.

Add tests for OFF/AbortSignal during delayed prepare for resume/start/cold callback;
late-A response after B's successful activation; repeated/cold recovery after OFF;
and ordinary successful replacement resume without OFF. The delayed bridge reply
is a valid deterministic race trigger, not a mocked native success.

Independent regression proof:
`/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/_local/ecosystem-cloud/typefree-v3-independent-IDgC6c/reproduce-prepare-off.mjs`,
SHA256 `d799490b22d4e1b1a2c5a6faeb52bf1e23e47950f4a65119a53564845c6c812a`.
Result beside it: `prepare-off-result.json`, SHA256
`13ea6c346465a010fcc01fdcc357068b28a523290f593ff90bef9d5751c0295e`.

Repeat from any directory:

```sh
TYPEFREE_EVIDENCE=/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/_local/ecosystem-cloud/typefree-v3-independent-IDgC6c node /Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/_local/ecosystem-cloud/typefree-v3-independent-IDgC6c/reproduce-prepare-off.mjs
```

The diagnostic currently asserts the demonstrated vulnerable result; turn it into
a fail-closed regression for the corrected candidate rather than treating its
exit0 as a security PASS.

## Main-reviewer checks actually executed

- `npx --no-install tsc --noEmit`: exit0.
- `npm test -- --reporter=dot`: **198 PASS /16 files**. Includes historical
  wire2 fixture coverage; not198 new native wire3 checks.
- Cached offline locked native crate tests: **47 PASS** (21 baseline +26 wire3).
- Cached offline locked conformance-example build: exit0 (0.13s).
- `tests/account-v3-native-conformance.mjs`: **8 current native/TLS scenarios PASS**,
  fresh independent output directory above, `v3-conformance-result.json`.
- Two additional independent prepare/OFF scenarios: **both demonstrate the defect**.

Main source review covered the native facade, controller, history-consent UI,
shared-provider/host mapping, wire/permissions and relevant native lifecycle paths.
Rust audit helper separately examines native state/worker/HTTP; any later finding
must be reported separately, not silently folded into completed main tests.
No compiled-app browser/device/actual Keychain/mobile/live provider acceptance is
claimed here. No real OTP, credentials, account data, remote writes or costs.

The accepted design's trusted-host consent assertion is retained exactly; it does
not promise OS-attested human presence. No shared contract/pin or provider config
change is requested. R1 closure requires a corrected frozen source and focused
independent retest; all-four readiness and public release remain separate gates.
