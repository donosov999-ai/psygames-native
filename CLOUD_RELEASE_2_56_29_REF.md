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
- Full PR and merged-main CI must pass before dispatch; old-head runs are not final evidence.
- CI38879608176 caught an internal host address in CLOUD_PUBLIC_ROLLOUT_GATES.md.
  Removed both full address and prefix from the public document; the no-infra
  guard remains unchanged. Earlier public commits are not scrubbed by this edit;
  no credentials were involved. Final-head full CI must rerun after the correction.
- No local native heavy build: disk headroom is small and shared. Signed artifacts
  use existing GitHub Actions runners/workflows.

## Delivery — pending, do not claim uploaded

Version2.56.29, Android expected2056029. iOS number comes from workflow run_number,
do not hardcode/reserve69. Existing internal TestFlight group «Свои», no re-invites.
Existing workflows: flutter-testflight.yml, flutter-play.yml production/yes-100;
after upload play-status.yml independently reads the production track.
No workflow dispatch/upload/processing/group/store acceptance is claimed by this file yet.
Append exact final source/run/version/build/readback outcomes after completion.

[Runtime](PSYGAMES_CLOUD_RUNTIME_REF.md) · [Gates](CLOUD_PUBLIC_ROLLOUT_GATES.md) ·
[Shared integration](ECOSYSTEM_CLOUD_V1_REF.md).
