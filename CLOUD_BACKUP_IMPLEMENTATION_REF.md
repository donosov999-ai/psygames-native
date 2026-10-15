# PsyGames cloud backup — implementation checkpoint

CURRENT shared candidate:ecosystem.account/1-draft.2 / ecosystem_account0.1.1.
Supersedes draft.1 locally after independently reproduced Smart Alarm R1/R2.
Full review/evidence:ACCOUNT_REVIEW_R1_R2_20261016_REF.md. 48 focused tests pass,
host/package analyzers clean. Not four-app accepted, not runtime-connected or released.
Historical draft.1/hash checkpoints below are retained as history, not current approval.

Owner: psygames-codex-mac. Task bb2c9f30-d786-4fe6-b25c-4b2ace267d4b.
Checkout: /Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011.
Branch codex/cloud-backup-20261015. NOT released or runtime-connected yet.

Denis explicitly authorized implementation and store release on 15 October 2026,
then approved Supabase Auth as the shared identity authority for PsyGames,
Smart Alarm, Chess & Go and TypeFree. Users sign in inside our products, not in
the Supabase dashboard. This is not permission to change the other apps now.
Canonical ecosystem plan: /Users/denisonosov/dev/psygames-game-lab/ECOSYSTEM_INTEGRATION_PLAN.md.
Existing coordination task f27599dc-31c9-4638-946d-ccb3270079bb; Smart Alarm
participation f3dffc9c-f961-40ce-b0bc-a641b9f57f3e. Shared stable account_id is
separate from app_id/install_id/profile_id. Local profiles remain modes.

## Data and privacy

Opt-in only, default local/offline. Include mascot name/look, point purchases,
inventory, earned points/tokens/bonuses, achievements, history and progress.
Denis clarified there are NO real-money purchases currently. Restore is a whole
consistent replacement, never adding balances or replaying purchases/rewards.
No shared four-app wallet implied. App data/consents remain separate.

CloudSnapshot copies gameplay values verbatim and includes language and
psygames.* records; excludes credentials, device, consent, cloud and transport
metadata/outbox. Decode is strict, 5MiB/10,000 entries. 12 focused tests pass.

WEB API cloud sends, migration and outbox retries now check explicit consent,
including revocation between entries. 11 focused tests across three suites pass.
These changes are local to this branch; missing consent prevents network sends.

## Server/account boundary

Read-only Supabase discovery verified existing project iuvvheeocobhiothfgei,
personal-nzt. auth.users count was zero before the requested email test. No
server DDL had been applied at the first checkpoint. The SQL was created with pinned Supabase CLI
2.121.0 migration new; new owner-private immutable snapshots, ten-version retention,
no access to unrelated project tables. See the dated checkpoint below for live
DDL/SQL test and email evidence. Settings UI, startup restore, app callback wiring
and public release remain unfinished.
Dependencies supabase2.16.5 and flutter_secure_storage11.2.0 resolved with lockfile.

Denis supplied his address for ONE test login email; request result and inbox
confirmation must be recorded separately. Do not print tokens/codes or treat HTTP
acceptance as delivery/sign-in. Do not create four independent auth systems.

### 16 October 2026: delivery and redirect confirmed

Denis confirmed actual receipt of the ONE requested test email: it contains a
login link, not an OTP code. No app login/session has been verified from it.
After Denis signed into the developer dashboard and explicitly approved this
exact change, added only `com.psygames.app://auth/callback` to Authentication >
URL Configuration > Redirect URLs in project iuvvheeocobhiothfgei. UI readback
shows this exact entry and Total URLs: 1. Site URL remains unchanged. Screenshot:
/Users/denisonosov/dev/psygames-game-lab/supabase-redirect-20261016.jpg.

Dashboard also displays an outstanding-invoices/service-disruption warning.
No billing actions taken. Developer must resolve/check billing before relying
on this project for a public sync release; this warning does not establish a
current service outage.

Local restore helper completed 13 tests: flushed before/after journal, validation
before any replacement, local-only keys preserved, interrupted restore retry,
safety copy retained. It is NOT connected to startup yet. Account package and
backup service remain unconnected drafts; no end-to-end cloud claim.

### Server migration and package review checkpoint

Applied psygames_private_cloud_snapshots to project iuvvheeocobhiothfgei via MCP.
Live migration ledger version:20261015191442. CLI-created draft filename was
aligned to supabase/migrations/20261015191442_psygames_private_cloud_snapshots.sql
after application, so a future CLI push does not try to create the same table
again under the earlier draft timestamp20261015190024. SQL semantics unchanged.
Owner RLS enabled, three policies, authenticated UPDATE and anon SELECT forbidden.
Column INSERT grants allow owner_id/payload only; timestamps/revisions are server
assigned. Null schema is rejected. SQL test in
supabase/tests/psygames_cloud_snapshots_rls.sql passed owner/foreign/anon access,
immutability, retention10 and deletion checks; all synthetic rows rolled back.
Readback persisted_rows=0. Existing sequence may have gaps from the rolled-back test.
Advisor has no findings for the new table/function, but reports pre-existing
project-wide issues; those unrelated objects were not changed.

Shared candidate contract: packages/ecosystem_account/CONTRACT.md,
ecosystem.account/1-draft.1, package0.1.0. No raw SDK export; old REST builders
are fenced at HTTP transport even after later opt-in; callbacks also have
generation/client-identity fences. Secure-vault failure cannot acknowledge login
and does not poison the next retry. Expired encrypted sessions refresh only after
consent. Credentials stay in OS secure storage, not SharedState/backups.
Focused tests:35 PASS (6account,4backup,12snapshot,13restore), flutter analyze clean.
This is mock/local+SQL evidence, NOT a real app login/device/cloud roundtrip.

Readiness received through teamops-codex-mac: Chess task798a3063 and Smart
taskf3dffc9c. Their apps are NOT changed. Shared parentf27599dc still belongs to
psygames-claude-mac; four approvals on one immutable revision remain outstanding.

## Urgent independent release

2.56.28 practice warning/status is isolated in PR348:
https://github.com/donosov999-ai/psygames-native/pull/348.
It excludes this incomplete cloud branch and excludes local migration candidatef5.
Full CI found a missing overlay translation for the new badge; fix all ten
canonical overlay dictionaries and rerun, never weaken the coverage gate.
No claim of store upload yet. Release task9e865178-e150-436e-a96d-775160840081.
Signed Play build_only requested on exact release head
f9812dbbdb56134e2079266e5ad45e7e3d414aa5:
https://github.com/donosov999-ai/psygames-native/actions/runs/38793174360.
This run does NOT upload/publish to Play; later upload must use its exact artifact
after CI/merge checks. Cloud changes are excluded from this release.
Full WEB workflow38791114992 completed SUCCESS on exact headf9812dbbd.
Flutter workflow38791114939 is still running; PR348 remains unmerged.

Frozen common candidate source commit:a294c575e1791cb925bd98f897804eb74538a5e7.
Contract SHA256:bf1f323718fb922d5086adcb917fa60a6108bee7a394e076cb33bdd91afab18c.
Source SHA256:6489950ff92a7406f17fd2a3bf9d9b67fe1edb09da487614b87148b2b5dc82dc.
The dated server filename/evidence maintenance does not change that package.
