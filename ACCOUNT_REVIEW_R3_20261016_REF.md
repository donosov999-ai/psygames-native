# R3 credential storage review — 16 October 2026, Asia/Almaty

Author:psygames-codex-mac. Existing task:bb2c9f30-d786-4fe6-b25c-4b2ace267d4b.
Parent:f27599dc-31c9-4638-946d-ccb3270079bb remains psygames-claude-mac.
Checkout:/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011.
Branch:codex/cloud-backup-20261015. LOCAL candidate only; no cloud release.

## Independent before/after evidence

Chess author:chess-go-codex-mac, task798a3063-c6db-4d57-889c-33db68447ca7.
Report:/Users/denisonosov/dev/chessgo-wt-synapse/ACCOUNT_CONTRACT_REVIEW_B6DE.md,
SHA2563fdd40b972a93a654ae2bd1c261f9a87aca6604864923be7ea4c2947aa6e6c01.
Original test:/Users/denisonosov/dev/psygames-checkpoints/chessgo-account-draft2-20261016.DL41o2/flutter/test/chessgo_slow_vault_test.dart,
SHA256e3af2ca775443af3316dde12ab389847413d13108d49df37d64eb9ee6ef3350f.
Original log SHA2560a11ae481153df54ac298f9c42db3abcaca1c9eb5c39e9dbd0af0d37296c1cab.
All three read completely and hashes independently recomputed.

Copied original test into this checkout before source edits, with only provenance
comments/lint exemption for its synthetic diagnostic. Original assertions and
sequence unchanged. Independently reproduced FAIL/exit1 on b6-equivalent SDK:
active=B, persisted=A, requests=0. Baseline output is retained at
account-qa/20261016/r3-baseline-b6.txt, relative to the checkout above.
This was a local storage race, not proof of server access or disclosure.
Chess17PASS is separate from its R3FAIL; R1/R2 are not reopened.

## Fix: ecosystem.account/1-draft.3, package0.1.2

ONE serialized, lifecycle-aware credential lane per app+issuer namespace in the
host isolate. All SDK-owned session writes, final flush, removal and PKCE
mutations go through it. A generation check after an already-started write cannot
undo the write; therefore the newer credential ACK waits until older mutations
settle and its own write completes. No compensating A/B/C overwrite is used.
Vault errors do not poison subsequent queue operations.

Activation of a replacement instance retires the previous in-isolate owner and
uses the same lane. Old-instance disposal cannot suspend the new instance.
Late logout completion cannot remove/suspend B; failed removal does not ACK
success. PKCE reads wait for prior mutations, writes/removals are generation
fenced, and late OTP responses cannot ACK a superseded login.

Serialization intentionally changes the original reproducer's sequencing:
the old test awaited B's success BEFORE releasing A. That early ACK is now
forbidden, so the local retest first asserts NO B ACK/session-ready while A is
blocked, then releases A and checks B ACK/cache, zero requests and restart B.
This is the reviewer's explicitly proposed drain-before-ACK alternative, not a
claim that the original early-ACK ordering passed unchanged. Source fixture,
persisted-B and zero-request assertions retained; restart assertion added.

Candidate fingerprints:
- packages/ecosystem_account/CONTRACT.md SHA256
  640febbb6347a356d78644e009c45124fde5e268945c49ca5300ed2a790a39d0.
- packages/ecosystem_account/lib/ecosystem_account.dart SHA256
  8d850fdb81b07011e9b4dcacc10dfd1fd4202c7de367c4443bd63456ae86f60f.
- packages/ecosystem_account/pubspec.yaml SHA256
  74dd1e40cdbe2bedfdf1998116e98362eec1ae934effaa6c79f51cad5bfe70af.
Full immutable source commit is recorded in the companion receipt and TeamOps.

## Executed current checks

Working directory:/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/flutter.

```
flutter pub get --offline
flutter test --no-pub test/account_credential_serialization_test.dart test/chessgo_slow_vault_test.dart test/account_identity_boundaries_test.dart test/ecosystem_account_test.dart test/cloud_backup_test.dart test/cloud_snapshot_test.dart test/cloud_restore_test.dart --reporter expanded
flutter analyze --no-pub
```

58PASS/exit0 = previous48 + R3 retest1 + new credential/lifecycle cases9:
A-B-C; replacement instance; delayed write failure; slow removal/B; slow final
write/signout/restart; late logout HTTP; removal failure/retry; delayed PKCE;
late OTP response. R1/R2 upstream17 are included in58, not a second count.
Host analyzer clean. Package directory
/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/packages/ecosystem_account:
flutter pub get --offline; flutter analyze --no-pub -> clean/exit0.
Logs:account-qa/20261016/draft3-tests.txt and draft3-package-analyze.txt.
All HTTP injected mocks, all identities/tokens synthetic; no real emails,
credentials, server mutations, ACL, paid APIs, foreign apps or cloud store changes.

## Scope and remaining gates

Shared layer owns transport, identity and credential serialization. Hosts own
app-specific versioned consent, expected account binding and history decisions.
This is NOT cross-process/independent-isolate CAS, OS crash/disk-durability proof,
device Keychain/Keystore acceptance or remote logout-revocation proof. Credential
waits must not enter the alarm stop/snooze safety path. Already-sent HTTP and OS
mutations cannot be unsent; the next successful credential ACK waits safely.

PsyGames implementation response:accept these shared boundaries for LOCAL
preparation, not on behalf of formal PsyGames owner or other three app owners.
Need fresh reviewer decisions on the new exact commit/hashes. Four ACKs,
backend owner/test authority, runtime UI/consent/history-link/deletion/startup
restore and device testing remain gates. Queued/no reply is not acceptance.
Task bb2c9f30 remains in_progress, parent and executor unchanged.
