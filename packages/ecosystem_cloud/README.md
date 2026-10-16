# ecosystem_cloud 0.1.0 / ecosystem.cloud/1

Private Dart connector for the deployed owner/app backup tables. Uses
ecosystem_account 0.1.3 (draft.4); no second authentication or gameplay writer.
Canonical wire/host handoff: ../../ECOSYSTEM_CLOUD_V1_REF.md.

Construct `AppCloudClient(account, expectedAccountId, validatePayload)` only after
the exact identity is durably signed in. Construction is inert/OFF. The required
host validator throws on non-allowlisted payload; both outgoing and downloaded
JSON are detached and recursively immutable. Envelope is exactly
`{schema:1,data:appOwnedSnapshot}`. Validate each app's OWN inner schema.

`allowHistoryRead()` permits preview/metadata, not upload. Separate explicit
`acceptConsent()` enables upload; `recoverConsent(hostReceipt)` requires exact
local AND currently enabled server policy-1 consent. `versions()` returns at
most ten `AppCloudCopy(id,requestId,revision,createdAt)`; `download(id)` returns
the validated payload only (unlike TS's snapshot record). Neither imports data.
`save(payload, baseRevision:..., requestId:...)` performs one CAS write; gaps in
global server revisions are normal. No conflict retry, merging or new rewards.
An exact retained idempotent retry yielding no row performs one scoped request-id
lookup. Retention-bounded idempotency is not an eternal event ledger.

`revokeConsent()` immediately disables local upload, then updates server consent;
`deleteCopies()` requires successful revocation before owner/app DELETE. Failure
preserves local data and is not a confirmed server revocation/deletion. `suspend()`
is terminal and suspends the associated account network. Already-sent requests
may still commit. A shared isolate-level issuer/app/owner mutation lane remains
held until the actual request settles, even after local OFF; replacement
mutations fail fast as unavailable. No soft timeout that leaves HTTP running.
Host UI can exit to LOCAL immediately; never block alarm/gameplay safety on it.
No cross-process/device ordering is claimed. Busy revoke withdraws permission
locally and fences late accept ACK but is NOT proof of server revocation.

Errors expose bounded `CloudPortCode` only. `deleteAccount()` is deliberately
unavailable until a real coordinated server endpoint exists. Do not expose
public registration as finished before account deletion/runtime review.
No publishable keys, tokens, endpoint secrets or app snapshots belong in Git.

Tests are in ../../flutter/test/ecosystem_cloud_client_test.dart and use actual
SDK REST builders with MockClient, not real Auth/device or live HTTP. SQL/RLS
rollback tests are separately in ../../supabase/tests. Relative package paths
permit vendoring both ecosystem_account and ecosystem_cloud under one packages
directory from the same immutable Git commit; do not point at a floating checkout.
