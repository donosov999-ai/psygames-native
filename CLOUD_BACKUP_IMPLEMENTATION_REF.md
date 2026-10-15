# PsyGames cloud backup — implementation checkpoint

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
server DDL has been applied. SQL draft was created with pinned Supabase CLI
2.121.0 migration new; new owner-private immutable snapshots, ten-version retention,
no access to unrelated project tables. Auth/session code, settings UI, safe restore,
RLS runtime tests, actual email delivery and public release remain unfinished.
Dependencies supabase2.16.5 and flutter_secure_storage11.2.0 resolved with lockfile.

Denis supplied his address for ONE test login email; request result and inbox
confirmation must be recorded separately. Do not print tokens/codes or treat HTTP
acceptance as delivery/sign-in. Do not create four independent auth systems.

## Urgent independent release

2.56.28 practice warning/status is isolated in PR348:
https://github.com/donosov999-ai/psygames-native/pull/348.
It excludes this incomplete cloud branch and excludes local migration candidatef5.
Full CI found a missing overlay translation for the new badge; fix all ten
canonical overlay dictionaries and rerun, never weaken the coverage gate.
No claim of store upload yet. Release task9e865178-e150-436e-a96d-775160840081.
