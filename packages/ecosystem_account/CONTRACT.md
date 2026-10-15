# Unified account — ecosystem.account/1-draft.1

Status: candidate for owner review, NOT four-app acceptance or a public release.
Package: ecosystem_account 0.1.0. Current implementation is not runtime-connected.
Owner of shared coordination: psygames-claude-mac, task
f27599dc-31c9-4638-946d-ccb3270079bb. PsyGames implementation:
psygames-codex-mac, bb2c9f30-d786-4fe6-b25c-4b2ace267d4b.

## Identity, consent and scope

Denis chose Supabase Auth for all four products. Users sign in inside the apps,
not in the developer dashboard. Stable identity is the pair issuer + subject
(account_id); app_id, install/device/event IDs and gameplay profile are separate.
No identity merging by mascot name, nickname, PIN or device name.

| Product | app_id | Integration status |
|---|---|---|
| PsyGames | psygames | Local candidate; no account UI/deep-link wiring yet |
| Smart Alarm | smart-alarm | Readiness only; owner sign-off pending |
| Chess & Go | abstract-hub | Readiness only; owner sign-off pending |
| TypeFree / TypeRIGHTing | typerighting | Owner sign-off pending |

Default LOCAL. Each app must obtain its OWN explicit, versioned, account-bound
storage consent and history-link preview. Login alone is not progress consent.
Consent does not travel in backups or activate other apps, AI, BrainKit, photos,
diaries, a common wallet, subscriptions or automatic history uploads.
Offline/declined/failed login must preserve local gameplay and alarm safety.

Expected UI lifecycle: LOCAL -> explanation -> consent -> login -> history-link
preview/explicit decision -> cloud enabled. OFF stops new progress requests and
retries immediately, preserves local data and does not mean remote deletion.
Logout, cloud-copy deletion, shared-account deletion and local erasure are
separate explained actions. Shared-account deletion still needs a coordinated
backend implementation before account creation is exposed publicly.

## Session API and security

PKCE email-link login. Each app must register its own exact callback, without
wildcards; neither access nor refresh tokens go in URLs, logs or exports.
Credentials/PKCE verifier use protected OS storage, per-app namespace
ecosystem.account.v1.<app_id>. No automatic cross-app credential sharing or
silent single sign-on promised. The same verified login maps to the same account;
each product may initially ask for sign-in confirmation.

Public methods: resume(consent), requestLink(email, consent), acceptsCallback,
completeLink, flushCredentials, from(table), suspend, signOut, dispose.
No raw Supabase SDK/auth/realtime client is exported. Returned REST builders use
a consent-aware transport. suspend permanently revokes the old transport and
stops refresh; an old builder stays blocked even after opt-in creates a new client.
Already-sent server work cannot be unsent; generation/account fences must reject
late results. Credential writes must succeed before login success is acknowledged;
one vault failure must not poison later retries. signOut is local-session scope,
not a global sign-out of all products. Failure to reach the server is not proof
that remote credentials have been revoked.

Snapshot/session export is NOT event upload. Existing local history without stable
event IDs must not be expanded into fictional sessions or added to restored totals.
An app-specific future event adapter requires stable event_id, server receipt,
idempotency (account_id, app_id, event_id), bounded retry and account-generation
fencing. Do not replace the existing single gameplay/accounting writer.

## Current PsyGames-only server evidence

Approved existing project: iuvvheeocobhiothfgei (personal-nzt). This is an existing
shared project, NOT an isolated staging environment or authorization to use it in
the other three apps. Backend ownership and four-app environment acceptance remain
with the coordination owner. Dashboard warns of outstanding invoices; no billing
actions taken. Project-wide pre-existing security-advisor findings need their
owners; no claim that the whole shared project passed a security audit.

PsyGames callback com.psygames.app://auth/callback was added after Denis's explicit
confirmation. His ONE requested test email arrived as a link. That email test
does not prove an app session, PKCE roundtrip or device restoration.

PsyGames-only immutable table public.psygames_cloud_snapshots, owner RLS,
server-assigned revision/time, ten retained versions. Synthetic transaction test
passed owner/foreign/anon/immutability/timestamps/schema/retention/deletion checks
and was rolled back; no actual progress uploaded. No other app tables or ACL
changed. This backup schema is NOT imposed on Smart Alarm/Chess/TypeFree.

PsyGames snapshots preserve mascot name/look, inventory, purchases for earned
points, balances, bonuses, achievements, settings and history verbatim. Whole
restore replaces a consistent snapshot, never sums wallets or replays rewards.
Local-only consent/device/auth/transport metadata remain local. Restore must run
before gameplay/WebView with a validated before/after journal and safety copy;
the helper exists but startup wiring is still pending.

## Review and acceptance

Freeze this file and package source in a Git commit and submit its SHA/hash to the
shared owner and app owners. Approval of one revision never implies another.
Required tests: OFF/no-network, retained builder, vault failure/retry, refresh,
late callbacks, offline/restart, account A -> B, two-device conflicts, explicit
history linking, idempotent restore, deletion, callback/device end-to-end.
Currently focused local mocks/model/restore tests pass; SQL isolation passes.
No four-app sign-offs, physical-device account PASS or cloud store release yet.

Readiness sources (read-only; do not edit their project files here):
/Users/denisonosov/dev/chessgo-wt-synapse/ACCOUNT_INTEGRATION_READINESS_20261016.md
/Users/denisonosov/dev/smart-alarm-photo-diary/smart-alarm-flutter/UNIFIED_ACCOUNT_READINESS_REF.md
Canonical broader plan:
/Users/denisonosov/dev/psygames-game-lab/ECOSYSTEM_INTEGRATION_PLAN.md
