# PsyGames 2.56.29 — самостоятельный выпуск по ТЗ Дениса

16.10.2026 · psygames-codex-mac.
TeamOps release task: a44a3d53-3676-4ca2-8e4e-9a7e3c4b518b;
cloud parent: bb2c9f30-d786-4fe6-b25c-4b2ace267d4b.
User explicitly requests implementation/upload without waiting for his manual test.

## Scope and authorization

- Own PsyGames only. Do not change another app, live user or server service by implication.
- Working tree: /Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011,
  branch codex/cloud-release-2-56-29. Main checkout remains read-only.
- GitHub https://github.com/donosov999-ai/psygames-native/pull/349.
- Released main d960f40204eeb9ad88c6904344684b5b5270da57 was merged into this branch;
  practice/hint safeguards retained. Ten overlay conflicts were empty incoming hunks:
  retained both cloud strings and the shared released sudokuPracticeBadge.
- Explicit authorized HTTPS push, original origin push URL stays DISABLED.

## Shipped feature boundary

Normal builds retain PSY_CLOUD_PILOT=false and no cloud credentials/activation.
This prepares the native shared backup code; it is NOT public cloud readiness.
G1 service prerequisite584a68fd, G2 account deletion and real Auth/device acceptance
remain open. No real login/email/user upload used for this release preparation.
Backend G3 exact callback registration is already complete separately.

Own pilot additions since ed35: protected session recovery only with exact persisted
app/issuer/account consent and matching server consent. Pending PKCE takes precedence.
Owner/issuer-scoped durable pending writes persist BEFORE POST; response loss/restart
reuses exact UUID/base/payload. Own ACK, not a newer metadata list, determines base.
The ACK content identifies the actual uploaded old snapshot, never pretends newer
local progress was uploaded. Optional debounced changes/background dispatch never
replays rewards or forces overwrite after conflict. Restore still needs explicit
preview/confirmation, preserves a local before-image and runs before gameplay.

Independent bounded review found three P2s, fixed before release:
re-enable after offline progress; pendingB when currentA equals previousACKA;
cold URI arriving while startup recovery is busy. Exact regression tests added.

## Verification

- Initial scoped 176 Flutter tests PASS/analyzer clean; final frozen-source rerun:
  180 PASS, zero failures/skips; analyzer clean. Log:
  _local/ecosystem-cloud/release-2.56.29-final-tests.txt,
  SHA256 9e47776c6f890d5c7e1893986fbcf4dbb82549b94bc1c1c4d6ef574d7b4d57ae.
- Real SDK + synthetic HTTP/vault,
  NOT physical devices or live backend.
- Frontend tsc and RU/EN release-notes gate PASS before final source update.
- Full final-head PR CI must pass; old-head runs are not final evidence.
  Dispatch sequence adjusted after merge: main/green-PR Git trees exactly match
  f88b7bfa09a244725e7f3a9993a04a9cb017f07e. Signed workflows run in parallel
  with duplicate main CI and rerun their own Flutter tests; no gates weakened.
- CI38879608176 caught an internal host address in CLOUD_PUBLIC_ROLLOUT_GATES.md.
  Removed both full address and prefix from the public document; the no-infra
  guard remains unchanged. Earlier public commits are not scrubbed by this edit;
  no credentials were involved. Final-head full CI must rerun after the correction.
- No local native heavy build: disk headroom is small and shared. Signed artifacts
  use existing GitHub Actions runners/workflows.

## Delivery — verified in both store systems

Source main bb97a35834c434990237598840e6f434d52b2ad6; PR349 merged2026-10-16T10:02:09Z.
Final PR CI38880729618/38880729830 and main CI38884522088/38884522054 SUCCESS.
PR Flutter:4225 PASS/5 skipped; practice_kit24 PASS; analyzers and Android build PASS.
Main and green PR share exact tree f88b7bfa09a244725e7f3a9993a04a9cb017f07e.
Signed workflows ran in parallel with duplicate main CI; all main gates passed before upload.

Google Play: signed upload38884905270 SUCCESS; production2.56.29/versionCode2056029.
Independent readback38888991964 SUCCESS, job116933620963 at2026-10-16T10:42:50.113Z:
production release2.56.29 / statuscompleted /2056029.
Artifact flutter-hybrid-aab12040253386 zip SHA256
c7a311c8aa9c108105260795828c44120a63acb52a96eb7a494f168b2ff0c22f (not AAB hash).

TestFlight: signed workflow38884901390; version2.56.29/build69.
Independent Apple GET readback 2026-10-16T11:07:34.196Z: build 6811db76-4708-4168-9212-9fa15e3d031d,
processingState=VALID; existing internal group «Свои» contains this exact build.
Apple uploadedDate=2026-10-16T04:03:56-07:00. No tester additions/re-invites.

Cloud runtime remains OFF. G1 service cutover/security, G2 account deletion and
real Auth/device acceptance remain open; cloud parent bb2c9f30 is not closed.
User explicitly waived waiting for manual device testing. Store/API receipt does
not prove physical-device acceptance or instant public storefront propagation.
Structured receipt: CLOUD_RELEASE_2_56_29_RECEIPT.json.

[Runtime](PSYGAMES_CLOUD_RUNTIME_REF.md) · [Gates](CLOUD_PUBLIC_ROLLOUT_GATES.md) ·
[Shared integration](ECOSYSTEM_CLOUD_V1_REF.md).
