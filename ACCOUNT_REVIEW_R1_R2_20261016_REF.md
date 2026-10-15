# Account review R1/R2 — 16 October 2026, Asia/Almaty

Author: psygames-codex-mac. Existing task bb2c9f30-d786-4fe6-b25c-4b2ace267d4b.
Shared coordination remains psygames-claude-mac / f27599dc-31c9-4638-946d-ccb3270079bb.
Checkout: /Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011.
Branch: codex/cloud-backup-20261015. LOCAL candidate only, no cloud release.

## Original evidence and independent baseline

Received via teamops-codex-mac, author smart-alarm-codex-mac:
/Users/denisonosov/dev/smart-alarm-photo-diary/smart-alarm-flutter/ACCOUNT_CONTRACT_REVIEW_A294.md
SHA256 e9d037dd583d58af42328f636e7abdd98dcb3f6424d28e29416fa122e8602524.
Original reproducer:
/Users/denisonosov/Documents/TeamOps/smart-alarm-ux/account-review-a294-20261016/packages/ecosystem_account/test/reviewer_boundaries_test.dart
SHA256 989e6e78ef2459532e3b3708e23a7df942c00c9e5aab3d1efb5911812979374c.
Original output SHA256 52043a426dd7e38c825d0ef107c2dfce592803f19adb70e0775130a6343388d6.

On unchanged a294-equivalent source, ran the original scenarios with only the
host import path adapted. Both FAIL independently confirmed: R1 dispatched one
synthetic request, R2 accepted a foreign-issuer cached session. A mock response
TypeError in R1 did not undo the confirmed dispatch. No server exploit claimed.
Baseline adapter retained at flutter/test/account_review_a294_reproducer.dart;
not *_test.dart because its old app-only v1 fixture is intentionally obsolete.
It is not silently rewritten into a passing v2 fixture. Original source above
remains unchanged. New semantic regressions use explicit v2 envelope fixtures.

## New candidate: ecosystem.account/1-draft.2 / package0.1.1

Source packages/ecosystem_account/lib/ecosystem_account.dart SHA256
a3ab11acf98d1148905fda11c83f8c35b09ad37963eabe839011b3edac5c2a1b.
CONTRACT.md SHA256
9387cb16380e3fadaefd364a4f67556c5c7c8f33daee84a9b8f646546cf87fcd.
pubspec.yaml SHA256
582b9ff0d77709aec9d49ce5130122ce5b42b1071ddcb89a2031fae1eaf1511e.

- R1: every resume retires the previous SDK/transport before reading storage;
  retained/prepared A queries cannot borrow B credentials. Concurrent late A
  recovery cannot override a newer completed B recovery.
- Host-bound consent: optional expectedAccountId is mandatory for automatic
  progress recovery; mismatch returns false with no auth/REST request. PsyGames
  backup start passes its stored owner. Missing owner or A receipt with B cache
  stays local; no second accounting or progress mutation added.
- R2: issuer-bound v2 namespace for both sessions and PKCE, strict envelope and
  JWT iss/sub/user.id consistency before SDK recovery or refresh. Old app-only
  values are never read/copied implicitly; explicit re-login required. Same
  issuer still recovers; another issuer, including expired foreign tokens, fails
  before forwarding credentials. Refresh cannot replace issuer or subject.
- REST requires securely persisted, scoped identity. Local JWT parsing is ONLY
  a scope guard; it does not authenticate signatures or replace server RLS.

## Executed checks

From /Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/flutter:

```
flutter pub get --offline
flutter test --no-pub test/account_identity_boundaries_test.dart test/ecosystem_account_test.dart test/cloud_backup_test.dart test/cloud_snapshot_test.dart test/cloud_restore_test.dart --reporter expanded
flutter analyze --no-pub
```

48 PASS:11 new identity/authority regressions +6 upstream account semantics
(only the session fixture format changed) +6 backup/host checks +12 snapshot
+13 restore checks. Analyzer clean. From
/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/packages/ecosystem_account:
flutter pub get --offline; flutter analyze --no-pub -> clean.
MockClient, synthetic tokens and local temporary/preferences fixtures only.
No real credentials/emails/remote changes/ACL/billing/store actions in this review.

## PsyGames response and remaining gates

As the PsyGames implementation author, I accept these shared-layer boundaries for
LOCAL preparation and explicitly bind the draft host adapter to the stored owner.
This is NOT formal owner approval on behalf of psygames-claude-mac, NOT approval
by Smart Alarm/Chess/TypeFree and NOT device/end-to-end cloud PASS.
Shared versus host responsibilities are specified in CONTRACT.md. The exact
immutable commit is published in the companion candidate receipt and TeamOps.
Four app-owner ACKs on that revision, backend owner/test authority, app consent UI,
history preview, callbacks, startup restore and account deletion remain gates.
Neither a queued delivery nor absence of a reply counts as acceptance. No new
native chat message was sent without a human-authorized address-specific send.

Independent urgent practice release remains separate. Its full Flutter run
38791114939 failed two old test expectations (hint confirmation; added practice
feedback field), not these cloud tests. No claim of store upload or successful CI.
