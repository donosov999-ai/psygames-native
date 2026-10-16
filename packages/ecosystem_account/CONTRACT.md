# Unified account — ecosystem.account/1-draft.4

Status: candidate for owner review, NOT four-app acceptance or a public release.
Package: ecosystem_account 0.1.3. Adds an explicit cold PKCE callback lifecycle
to draft.3/0040152 as a NEW review candidate, not automatic acceptance.
Current implementation is not runtime-connected in the published four apps.
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
| PsyGames | psygames | Local UI/controller and common Dart connector; runtime wiring pending |
| Smart Alarm | smart-alarm | Owner host candidate; new exact-pin integration/review pending |
| Chess & Go | abstract-hub | Owner host candidate; new exact-pin integration/review pending |
| TypeFree / TypeRIGHTing | typerighting | Owner host candidate and common TS connector; protected AuthHost pending |

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

### Cold callback (new in draft.4)

After process restart, validate the exact callback and recover the host's explicit
login intent/consent first. Then call `prepareCallback(consent:true)` followed by
`completeLink(uri)`. The preparation retires older SDK/generation capabilities,
does not read the vault, recover a cached account, refresh a token or send HTTP.
Only completion uses this app/issuer's protected PKCE verifier; success requires
durable credential writes. Consent false, missing verifier, wrong callback and
late OFF fail closed. Never use `resume()` to activate a cold callback: that may
recover or refresh the unrelated cached account A before exchanging account B.
Host consent/history upload decisions are still separate from login intent.
This API addition does not retroactively change accepted draft.3 hashes.

PKCE email-link login. Each app must register its own exact callback, without
wildcards; neither access nor refresh tokens go in URLs, logs or exports.
Credentials/PKCE verifier use protected OS storage, authority-bound namespace
ecosystem.account.v2.<app_id>.<base64url(canonical-issuer)>. Canonical issuer is
the configured HTTPS API origin plus /auth/v1. Session envelope schema1 contains
app_id, issuer, account_id and session. Before SDK recovery or refresh, the package
requires envelope authority/app/subject and JWT iss/sub/user.id to agree.
This is local scope validation, NOT cryptographic authentication: server JWT
signature/expiry/session checks and owner RLS remain mandatory.
Old app-only v1 values are never read/copied implicitly: re-login is required.
They are not erased as a side effect of changing environment. No silent authority
migration. PKCE verifier slots are separated by the same authority namespace.
No automatic cross-app credential sharing or
silent single sign-on promised. The same verified login maps to the same account;
each product may initially ask for sign-in confirmation.

Public methods: resume(consent, expectedAccountId), requestLink(email, consent), prepareCallback(consent), acceptsCallback,
completeLink, flushCredentials, from(table), suspend, signOut, dispose.
No raw Supabase SDK/auth/realtime client is exported. Returned REST builders use
a consent-aware transport. suspend permanently revokes the old transport and
stops refresh; an old builder stays blocked even after opt-in creates a new client.
Already-sent server work cannot be unsent; generation/account fences must reject
late results. EVERY resume starts a new generation and permanently retires its old
SDK/transport before reading the vault, even if the account did not change.
Switch A -> B cannot lend B's identity to a previously prepared A query. A new
login request also retires its predecessor. REST is unavailable until a valid
identity has been restored/exchanged and securely persisted.

Shared responsibility: enforce transport/authority/subject fences, discard late
recovery/callbacks and reject an expectedAccountId mismatch without token dispatch.
Host responsibility: store versioned app-specific consent bound to issuer+subject;
pass its account_id as expectedAccountId on AUTOMATIC recovery, then re-check the
same consent before progress upload/restore. Missing optional expectedAccountId is
for explicit sign-in/onboarding, NOT a substitute for a stored progress consent.
On mismatch return LOCAL; require explicit B sign-in/consent/history-link before
calling recovery with expectedAccountId=B. Never reuse A's progress queue/receipt.
PsyGames draft backup start now passes its stored owner; no owner means no resume.

Credential writes must succeed before login success is acknowledged;
one vault failure must not poison later retries. signOut is local-session scope,
not a global sign-out of all products. Failure to reach the server is not proof
that remote credentials have been revoked.

### Credential storage serialization (R3)

ALL session writes/removals, explicit final flush and PKCE writes/removals use
one lifecycle-aware FIFO lane per app+issuer namespace in the host isolate.
Before AND after each OS mutation the attempt generation is checked. A newer B
can start, but MUST NOT acknowledge durable credentials while an older A write
is still in flight. The old write may physically complete; B is committed after
it, then acknowledged. No blind compensating write or cross-account balance work.
The same rule covers removal: late logout cannot clear an acknowledged successor.

Only one active in-isolate owner per namespace: activating a replacement instance
retires the previous transport/generation and shares its credential lane. Disposing
the old instance does not suspend the replacement. Hosts must not share this vault
namespace across uncontrolled Dart isolates/processes/extensions; the lane is NOT
a cross-process CAS or transaction. Secure storage atomicity/durability beyond its
API and real OS-crash behaviour remain separate device/platform gates. Never put
account/storage waits on Smart Alarm's safety-critical stop/snooze path.

OFF stops future network work immediately but cannot undo an OS write or request
already started. The next successful credential ACK waits for stale mutations to
settle. Cancelled attempts do not get a success ACK; errors do not poison later
mutations. Logout removal is serialized and generation-scoped, not a global purge.
Already-sent logout/OTP responses cannot finalize a newer lifecycle.

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
Original Smart Alarm reproducer on a294-equivalent source was independently run:
2 failures confirmed. Draft.2 repeats both semantic scenarios using the new
authority-bound envelope (a documented fixture-format change), plus foreign-token,
PKCE, bound-consent and concurrent recovery tests. The original app-only fixture
is preserved as baseline evidence, not misreported as a valid v2 login fixture.
Draft.3 independently confirms Chess R3 on unchanged b6 source before the fix.
After choosing the serialization alternative, its retest explicitly asserts that
B has NOT ACKed before releasing A (the original test awaited early ACK B, which
is intentionally forbidden by this contract). Persisted-B, zero-request and
restart assertions remain; delayed-write/removal/logout/PKCE/A-B-C cases added.
Focused local mocks/model/restore tests pass; prior SQL isolation is historical,
not re-executed as a claim of live network/device testing for this revision.
No four-app sign-offs, physical-device account PASS or cloud store release yet.

Readiness sources (read-only; do not edit their project files here):
/Users/denisonosov/dev/chessgo-wt-synapse/ACCOUNT_INTEGRATION_READINESS_20261016.md
/Users/denisonosov/dev/smart-alarm-photo-diary/smart-alarm-flutter/UNIFIED_ACCOUNT_READINESS_REF.md
Canonical broader plan:
/Users/denisonosov/dev/psygames-game-lab/ECOSYSTEM_INTEGRATION_PLAN.md
