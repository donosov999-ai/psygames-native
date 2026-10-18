# TypeFree shared-account review — current pointers, 18 October 2026

- Original native candidate: `TYPEFREE_NATIVE_REVIEW_20261018.md`.
  R1 recovery-fence bypass is independently reproduced and **OPEN**.
  Real TeamOps correction task `e63cc347-94c9-40f0-8fbe-ed20a9aeed5b`.
- R2 owned-future lifetime delta is **accepted only as a local source correction**:
  `VAULT3_DESIGN1_AND_R2_REVIEW_20261018.md`, exact two-file delta66c26bc2…,
  reviewer21 native tests +6 actual native subprocess checks PASS. No demonstrated
  Tauri window-close trigger, device or protected-store acceptance.
- Architecture proposal1 accepted in `FRESH_AUTH_PROPOSAL1_REVIEW_20261018.md`.
- Wire design1 had D1–D3 gaps; its review remains historical, not the latest veto.
- **Exact private wire/migration design2 now accepted for local implementation**:
  `VAULT3_DESIGN2_ACK_20261018.json`, source document SHA256
  `ed57bcd6bb676cfcd7081be2172af33b4613eb21dc11da12df5bbed14dac0870`.
  All392 lines read. This is NOT implementation or availability acceptance.

App owner proceeds with bounded local implementation/synthetic checks, not a new
architecture discussion or a new human decision. Shared runtime package pins do
not change; availability stays OFF. No live Auth, provider/config/server/ACL/
real-user, release, heavy build or cost authority follows from design ACK.
Keep R1, app/device gates and the common all4 task open until actual evidence.

## Current implementation review (after design2 ACK)

Historical original freeze: `TYPEFREE_VAULT3_IMPLEMENTATION_REVIEW_20261018.md`:
**CHANGES REQUESTED**, now superseded for these four fixes by the exact new freeze
below. The old report remains an immutable evidence record, not the latest veto.
Frozen105-file source matched; main47 native/198 app/8 actual native TLS checks
PASS, but two extra independent delayed-prepare/OFF scenarios reproduce missing
native fencing/revocation. P2 `V3-R1-1`, facade line44/48: stale prepare reply drops
the only returned scope; cached resume and a cancelled cold callback can recover.
Exact design ACK remains valid; fix the implementation and retest in existing
R1 task, no new architecture loop or feature activation.
Follow-up native audit: `V3-R1-2` non-2xx cleanup false-success (two actual
loopback503 cases); `V3-R1-3` unconsumed callback cancel survives claim (actual
native reproduction); `V3-R1-4` superseded flow retained on new-flow write failure
(source-confirmed risk, no independent fault-injection run). All remain in the
same R1 correction/review task. Shared-account deletion protocol is unchanged.

## Latest: exact five-file correction accepted locally

`TYPEFREE_VAULT3_FIXES_RETEST_20261018.md` and
`TYPEFREE_VAULT3_FIXES_ACK_20261018.json`: **PERSONAL FOCUSED LOCAL SOURCE FIXES
ACCEPTED** for V3-R1-1..4. Manifest5359c109… / delta189de09a… /
fullpatche3180fc9…;105hashes matched,100 unchanged. Main50 native/198 app/19
current actual TLS +5 original independent triggers fail-closed PASS. Current
compiled default authority null. Shared contract/design/pins unchanged.

This resolves the four identified local findings on that exact candidate, not
OS/device/provider acceptance or all-four readiness. Foreign task statuses not
changed; default provider/deletion gates stay OFF. App owner handles task
disposition/source preservation and remaining acceptance within existing scope.
