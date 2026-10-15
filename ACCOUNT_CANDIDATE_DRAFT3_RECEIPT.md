# Immutable account candidate — draft.3 — 16.10.2026, Asia/Almaty

Author:psygames-codex-mac. Task:bb2c9f30-d786-4fe6-b25c-4b2ace267d4b.
Parent:f27599dc-31c9-4638-946d-ccb3270079bb, owner unchanged:psygames-claude-mac.
Checkout:/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011.
Branch:codex/cloud-backup-20261015. LOCAL only; no push/merge/cloud release.

Immutable source revision:0040152c40a2eb26b1d75890884837804074d1a9.
Contract:ecosystem.account/1-draft.3. Package:ecosystem_account0.1.2.

| Path relative to checkout | SHA256 |
|---|---|
| packages/ecosystem_account/CONTRACT.md | 640febbb6347a356d78644e009c45124fde5e268945c49ca5300ed2a790a39d0 |
| packages/ecosystem_account/lib/ecosystem_account.dart | 8d850fdb81b07011e9b4dcacc10dfd1fd4202c7de367c4443bd63456ae86f60f |
| packages/ecosystem_account/pubspec.yaml | 74dd1e40cdbe2bedfdf1998116e98362eec1ae934effaa6c79f51cad5bfe70af |
| account-qa/20261016/r3-baseline-b6.txt | 4a1f028ff71387e12939ff357529a3b873ec66f3e8d6741695d2147f79c50d74 |
| account-qa/20261016/draft3-tests.txt | 60e37be728e40acdb5b3dd6e452c56d980f578ec7bea8093f4c9d9c8ec60045a |
| account-qa/20261016/draft3-package-analyze.txt | 217f3d2537b487e27a811bf557e79ffd64b9957577525dac7860653924d9ffc3 |

Review detail/exact commands:
/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/ACCOUNT_REVIEW_R3_20261016_REF.md.
Before:original R3 independently1FAIL on unchanged b6-equivalent SDK.
After:58focusedPASS/exit0 and host/package analyzers clean. R1/R2 tests retained.
Original R3 barrier sequencing is explicitly adapted for the chosen serialization
alternative: B cannot ACK while A is blocked; after release cacheB/restartB/zero
requests are required. Not claimed byte-for-byte unchanged original-test PASS.

PsyGames implementation response:shared credential protocol accepted for LOCAL
preparation only; no formal sign-off on behalf of psygames-claude-mac or other app
owners. Need new reviewer decisions on this exact revision, four app ACKs,
backend owner/test authority and runtime UI/consent/history/deletion/device gates.
The lane is in-isolate serialization, not cross-process CAS/physical OS-durability
or remote revocation proof. No server/ACL/foreign apps/paid API/cloud release changes.
