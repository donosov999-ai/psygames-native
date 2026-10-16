# Common cloud v1 — dependency-free TypeScript sidecar

For TypeFree TS/Tauri hosts. This is a PostgREST connector, **not private auth**,
not a sign-in implementation, and not a Dart port. No imports at runtime, fetch,
environment lookup, hardcoded project, token extraction, token persistence,
local-data storage, wallet merge, event replay, or automatic sync.

The host supplies an authority-bound `AuthedTransport` configured for its chosen
PostgREST base. `path` is relative to that base (for example,
`/ecosystem_app_snapshots?...`); the host adds the base URL and authentication.
The connector never receives a raw JWT. The host owns PKCE, the secure vault,
login/logout and trusted current identity under `ecosystem.account/1-draft.4`.
`session()` must synchronously expose that **current** validated identity, not
infer one from an unverified token. `suspend()` must synchronously revoke the
capability for this connector, including preventing unsent requests. A response
guard cannot undo a request already committed by the server.

```ts
import { EcosystemCloudClient } from './client.ts';
import type { AuthedTransport, PayloadValidator } from './client.ts';

function connect(transport: AuthedTransport, owner: string, issuer: string, validatePayload: PayloadValidator) {
  return new EcosystemCloudClient({
    transport, validatePayload, appId: 'typerighting', expectedOwner: owner, expectedIssuer: issuer,
  });
}
// Host UI, after login AND history/preview explanation:
// client.allowHistoryRead();
// await client.listVersions();           // metadata, no automatic import
// await client.acceptConsent();          // separate explicit upload consent
// await client.save(hostAllowlistedPayload, { baseRevision, requestId });
```

Allowed apps: `psygames`, `smart-alarm`, `abstract-hub`, `typerighting`. Constructor
is inert and OFF. `allowHistoryRead()` enables consent reads, metadata and preview
only. Reading an existing enabled consent does **not** authorize this host to
upload. Only a successful explicit `acceptConsent()` does; `save()` additionally
checks the exact server owner/app/issuer/policy-1 enabled consent before each POST.
Consent timestamps `accepted_at` / `updated_at` are exclusively server-owned and
are neither sent nor needed in the client's five-field consent projection.

## API and state

- `getConsent(): Promise<Consent | null>` reads the scoped consent row.
- `acceptConsent(): Promise<Consent>` upserts `enabled=true` and grants this host
  upload permission after exact response validation. Not an automatic login hook.
- `listVersions(): Promise<VersionMetadata[]>` selects only
  `id,request_id,revision,created_at`, ordered `revision.desc`, limit 10.
- `download(id): Promise<Snapshot>` returns a scoped schema-1 preview; does not
  restore/import/merge data. The host owns app-specific allowlists and restore UX.
- `save(payload, {baseRevision, requestId}): Promise<VersionMetadata>` performs one
  explicit CAS upload. The host supplies a UUID request ID and a nonnegative safe
  integer base revision; it must reuse the **same payload, base, and request ID**
  for an intentional retry. Revision is an **opaque monotonic CAS value**, not a
  counter the host may increment: base 1 → server 7 is valid. Save requires the
  exact returned request ID and `revision > baseRevision`. History/downloads
  accept gaps from interleaved owner/app writes and rolled-back SQL identities.
- `revokeConsent(): Promise<Consent>` disables this host's upload permission
  immediately and upserts server `enabled=false`; does not delete snapshots.
- `deleteCopies(): Promise<void>` disables local upload permission, first confirms
  server app-consent `enabled=false`, **then** deletes owner/app snapshots. No
  DELETE is sent if revocation fails or is malformed. It requires explicit host
  invocation and history permission, not upload consent. It does not delete local
  data, the consent row, other apps, or the account. Remote consent revocation
  prevents devices relying on an old enabled state from appending without fresh
  server consent; actual enforcement remains the SQL/RLS authority's job.
- `suspend(): void` increments the local generation and revokes the transport.
  It is terminal for this instance; construct a fresh connector/capability and
  obtain explicit permissions again to resume. It makes **no server requests**,
  claims no server revocation/deletion, and never modifies local host data.
- `deleteAccount(): Promise<never>` always rejects `UNAVAILABLE`; no fake endpoint.

All operations except unavailable account deletion require history permission.
Mutations use a shared **module-level** lane keyed by the exact issuer, app and
UUID owner (owner casing normalized). Replacement connector/transport instances
in that module share the lane; distinct scopes do not block one another.
Mutations fail fast with `UNAVAILABLE` when the lane is held; callers must await
completion, not enqueue actions. Local OFF is immediate but **does not release
the lane**: it remains held until the original transport promise settles and the
original mutation finishes. There is no soft timeout or synthetic cancellation.
The host's `request()` promise must represent actual HTTP completion/cancellation,
not race a timeout while leaving the underlying request running. A never-settling
transport deliberately keeps its lane busy; OFF does not claim server revocation.
This is not a cross-process/worker/module-copy/device lock and creates no new CAS
or distributed ordering guarantee; SQL/RLS remains the server authority.
Exception for local safety effects:
`revokeConsent()` and `deleteCopies()` synchronously disable local upload and
increment a permission epoch **before** the busy check. A pending accept with an
older epoch rejects `CONSENT_REQUIRED` instead of re-enabling local upload.
A busy `UNAVAILABLE` dispatches no server revocation/deletion; the pending accept
may still commit on the server. The host must explicitly retry server revocation
after the pending operation settles, not claim that busy failure revoked it.
Every request and every continuation
after an await rechecks generation and the exact bound owner **and** issuer.
Account/issuer mismatch revokes the capability and rejects `ACCOUNT_CHANGED`;
late responses after local suspension reject `OFF`, including transport failures.
The transport must revoke on actual logout/identity switches: sampling current
identity cannot detect an unreported switch away and back between observations.

## Wire contract and limits

Every GET, POST and DELETE includes owner/app filters. Consent POST uses
`on_conflict=owner_id,app_id` and
`Prefer: resolution=merge-duplicates,return=representation`. Its body is exactly
`owner_id,app_id,issuer,policy_version:1,enabled`. The server's immutable-scope
trigger must permit unchanged owner/app values in merge-duplicates UPDATE paths.

Snapshot POST body is exactly
`owner_id,app_id,request_id,base_revision,payload`, with
`Prefer: return=representation` and a metadata projection. No client-generated
snapshot ID, revision or timestamp. SQLSTATE `40001` (`cloud_revision_conflict`)
becomes `CONFLICT`; `23505` (`cloud_request_reused`, changed payload under a
retained request ID) becomes `INVALID_PAYLOAD`, even with HTTP 409.
Neither is retried. If an exact retained retry returns `[]`, one scoped
`request_id` metadata GET resolves the original result. An absent row then yields
`NOT_FOUND`; there is no second POST or automatic new request ID. Retention is
10 snapshots per owner/app; **idempotency exists only while the request is retained**.
The server, not this stateless connector, enforces payload equality and retention.

The common wire envelope is exactly `{schema:1,data:appOwnedSnapshot}`. Preserve
the existing app-owned snapshot **inside `data`**, for example TypeFree
`{schema:1,data:{schema,appId,values}}` or Chess
`{schema:1,data:{schema,app_id,data}}`. Do not flatten their inner envelopes,
force another app's schema, or copy raw PsyGames state as a universal format.

`ClientOptions.validatePayload` is a **required synchronous host callback** of
type `(payload: ReadonlyPayload) => boolean` (recursively readonly JSON). The connector first validates
the common JSON envelope and size, detaches a copy, and recursively freezes it,
then invokes the callback for **both outgoing and downloaded payloads**. Only
literal `true` accepts; false/other values or an exception yield bounded
`INVALID_PAYLOAD` without exposing callback diagnostics. Rejected outgoing data
sends no consent-read request or snapshot POST. Downloaded data is validated
before return, and its returned payload remains deeply frozen (including arrays).
The exact frozen outgoing object approved by the callback is passed to the
transport. No production accept-all fallback exists; each host owns its own
privacy/schema allowlist and restore UX, including the app-owned inner envelope.
The **complete serialized payload envelope** is limited to 5 MiB UTF-8, on both
upload and download. Non-JSON/lossy values, cycles, sparse arrays, accessors,
custom prototypes and extra envelope keys are rejected. Payload/options are
copied before the first upload await. Server envelopes must be arrays with valid
cardinality, UUIDs, safe integer revisions and UTC timestamps; ownership fields,
when present, cannot contradict the bound scope. GET/DELETE require HTTP 200;
POST requires 200/201 with a valid representation. A bare 204/202 is not proof.

`CloudError` exposes only `code` and a fixed identical message:
`OFF`, `ACCOUNT_CHANGED`, `CONSENT_REQUIRED`, `CONFLICT`, `NOT_FOUND`, `NETWORK`,
`INVALID_PAYLOAD`, `UNAVAILABLE`. No server body, payload, transport exception or
secret is attached or logged. Ordinary transport exceptions yield `NETWORK`;
401/403 yield `CONSENT_REQUIRED`, 404 `NOT_FOUND`, 503 `NETWORK`, other unsuccessful
statuses `UNAVAILABLE` unless SQLSTATE/409 mapping above applies. During
`deleteCopies`, unsuccessful HTTP statuses
and transport failures yield `NETWORK`; malformed representations still yield
`INVALID_PAYLOAD`, and identity/OFF guards take precedence. Local data is always
preserved. Deletion failure may leave server consent already revoked or deletion
already committed with a lost response: there is no false success/atomicity claim.
The host must explicitly reconcile failures and must not erase its local copy.

## Local verification (no network)

From this directory, with Node 22+ supporting type stripping:

```sh
node --experimental-strip-types --test client.test.ts
../../frontend/node_modules/.bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --types node --typeRoots ../../frontend/node_modules/@types client.ts client.test.ts
```

`node:test` / `node:assert` and an injected fake transport only. The existing
frontend TypeScript installation and Node typings are development checks, not
runtime dependencies. Tests do not exercise SQL triggers, RLS, deployments, real
auth/vault integration, a live server, device acceptance or release behavior;
the main implementation owns those boundaries.
