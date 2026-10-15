# Immutable account candidate — 16.10.2026, Asia/Almaty

Author:psygames-codex-mac. Own task:bb2c9f30-d786-4fe6-b25c-4b2ace267d4b.
Parent:f27599dc-31c9-4638-946d-ccb3270079bb, owner:psygames-claude-mac.
Repository:/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011.
Branch:codex/cloud-backup-20261015. LOCAL only, no push/merge/cloud release.

Source revision:b6debbd00a858b14b1e2ff9f416819b41b84f446.
Contract:ecosystem.account/1-draft.2. Package:ecosystem_account0.1.1.

| File relative to repository | SHA256 |
|---|---|
| packages/ecosystem_account/CONTRACT.md | 9387cb16380e3fadaefd364a4f67556c5c7c8f33daee84a9b8f646546cf87fcd |
| packages/ecosystem_account/lib/ecosystem_account.dart | a3ab11acf98d1148905fda11c83f8c35b09ad37963eabe839011b3edac5c2a1b |
| packages/ecosystem_account/pubspec.yaml | 582b9ff0d77709aec9d49ce5130122ce5b42b1071ddcb89a2031fae1eaf1511e |

Details and exact test commands:
/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/ACCOUNT_REVIEW_R1_R2_20261016_REF.md.
Original Smart Alarm R1/R2 independently confirmed2FAIL before correction.
New semantic cases use the documented issuer-bound envelope rather than obsolete
app-only fixtures. 48focusedPASS; host and package analyzers clean. All HTTP mocked.
No server mutation or real login email was used for this revision/retest.

PsyGames implementation response:shared boundaries accepted for LOCAL preparation;
automatic backup recovery now requires the stored consent owner. This is not a
formal decision for psygames-claude-mac or other app owners. Four new owner ACKs
on this exact revision, backend owner/test authority, versioned consent/history
preview, callback/startup/deletion/device tests remain outstanding.
Absence of a reply or queued transport is not acceptance. Native sends were not
performed without human send authority. Canonical result was published in TeamOps
PsyGames journal bfb7f5b2-fe7d-485f-8f28-71cc1af54307; delivery/read not asserted.
