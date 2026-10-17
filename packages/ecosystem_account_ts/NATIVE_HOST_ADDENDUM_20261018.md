# Native host seam review — addendum 1, 18 October 2026

Author: psygames-codex-mac. Parent bb2c9f30-d786-4fe6-b25c-4b2ace267d4b;
TypeFree review task77ca8ea0-181c-4b8c-bd55-ba85f07a382e.
Reviewed candidate SOURCE **ea404f50b70d7c7cc8dc7296402bf39a4aecadc4**,
package0.1.0, `ecosystem.account-delete.ts/1`,
`ecosystem.account-delete.native/1`.

Decision: the two proposed TypeFree implementation details are **compatible
subject to the conditions below**. This is a contract/seam review, NOT approval
of an implementation, native availability, device behaviour or a store release.
The adapter, fixed delete request/result shapes and frozen source above are
unchanged. This addendum is independently versioned; its commit must be pinned
and explicitly acknowledged by TypeFree before treating the interpretation as
agreed. No server/Auth/Origin/CORS changes are authorised or necessary here.

## 1. JS synchronous fence + native atomic entry

No synchronous stock Tauri IPC is required or claimed. `host.fence(lease)` must
still synchronously reserve the local operation, stop refresh and permanently
invalidate its retained app REST/refresh-write capabilities before calling the
async native sender. An async function typed as void remains incompatible.

At native command entry, before any deletion HTTP request, native MUST atomically
validate and consume the pre-issued protected-credential-bound handle against
trusted issuer/subject/app/runtime/generation, and close the corresponding
native REST/refresh/credential-write capabilities. Invalid, replayed, cancelled
or superseded handles produce zero HTTP. The JS envelope is never authority.
All local native entry paths must enforce the same registry/generation rules;
an unguarded parallel path or merely a per-JS-window flag is insufficient.

This is two explicit boundaries, not a claim that JS synchronously locked the
native registry. There is no await between native validation and logical
reservation/fencing that could admit another claimant. If durable retirement or
an operation tombstone is required before HTTP to prevent crash-time recovery,
the reservation remains held while that work completes; failure stays closed
and does not dispatch. A login B must not receive a durable ACK before earlier
A credential removals have settled and B's subsequent write has completed.
Already-dispatched work on another device/process is outside this local fence;
do not describe it as a distributed transaction or server rollback.

## 2. Typed app-owned companion cancellation command

Permitted as an explicitly versioned **app-native bridge implementation detail**,
not an extra field/URL/header/target on the public fixed native/1 delete request.
The app owner must freeze its exact command name, schema and bridge version.
Calling it private is not a security boundary: a raw IPC caller must receive the
same native authorization/ownership validation as the original command.

- Bind cancellation to exactly the previously issued opaque handle and its
  trusted runtime/owner/app/generation. No arbitrary HTTP request IDs or targets;
  no ability to cancel B through A's stale handle. Do not create unknown-handle
  registry entries from untrusted cancellation requests.
- Cover abort before listener registration, before command entry, during
  connect/headers/body, and simultaneous HTTP completion. If cancel reaches
  native before the delete command, mark that *known* handle cancelled so that
  later entry cannot dispatch. Duplicate cancellation is bounded/idempotent.
- A cancel-command receipt is **not** completion of the original sender. That
  sender settles only after actual native HTTP/body termination, or proven
  non-dispatch, and releases the reservation only then. A cancelled HTTP request
  can still have completed server-side; no automatic deletion retry/resume.
- Keep the exact existing native/1 result envelope. A separate cancellation
  control acknowledgement is never converted optimistically to ACCOUNT_DELETED.
  The original adapter then awaits conditional credential retirement through
  the existing app+issuer lane; a late A acknowledgement never erases or ACKs B.
- Enforce the native monotonic 70000ms HTTP deadline even if JS or its bridge is
  stalled. No Promise.race-only timeout, JS-only abort or WebView fetch fallback.

If either proposed implementation needs different public native/1 input/result
fields or relaxes its fixed endpoint/body/credentials/settlement guarantees,
STOP that incompatible path: prepare a new contract version and exact source
for explicit agreement. Do not silently reinterpret the existing pin.

## Evidence required from the app-owned implementation

Actual minimal native module/synthetic endpoint tests, separate from the52 TS
host doubles, must demonstrate at least:

1. Invalid/replayed/forged-runtime handles never dispatch; concurrent callers
   have one winner, and retained native capabilities cannot revive.
2. A synchronous local fence precedes invocation; native reservation precedes
   HTTP, without a gap admitting a second operation.
3. Abort-before-entry and abort-during-registration races cause no late dispatch.
4. Abort/body timeout actually terminates HTTP/body before sender settlement;
   deadline remains effective without a live JS timer.
5. A slow credential removal A precedes durable B ACK; late A delete/cancel/
   retirement never clears or suspends B.
6. No Origin, redirects, target override, credentials in IPC, hidden auth resume,
   history read, local progress deletion or automatic retry on ambiguity.

Device/OS crash durability and store/artifact acceptance remain separate gates.
Final TypeFree action stays unavailable until its actual host/native integration
is accepted. Existing snapshot SOURCE057c and the Dart cloud pin remain intact.
