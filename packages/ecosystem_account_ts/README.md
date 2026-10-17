# Shared-account deletion TS adapter — 0.1.0 review candidate

Adapter contract: `ecosystem.account-delete.ts/1`.
Native wire contract: `ecosystem.account-delete.native/1`.

Independent, dependency-free deletion orchestration, NOT an auth SDK or a
snapshot connector. No runtime imports outside this directory, fetch, token
decoding/storage, hidden resume, history read, progress/local-data deletion,
server/configuration changes or production native implementation. This is NOT
part of release 2.56.30, TypeFree acceptance, deployment or native availability.
It does not enable the existing cloud connector's unavailable delete method.

## Minimal host delegation

```ts
import { AccountDeletionAdapter } from './adapter.ts';
import { createNativeDeleteReferenceSender } from './native_contract.ts';
import type { AccountDeletionHost } from './adapter.ts';
import type { NativeDeleteInvoke } from './native_contract.ts';

// Explicitly injected by an independently accepted AuthHost/native integration.
// Neither port has a production implementation or default fallback here.
function connect(host: AccountDeletionHost, nativeInvoke: NativeDeleteInvoke) {
  return new AccountDeletionAdapter(host, createNativeDeleteReferenceSender(nativeInvoke));
}
// AuthHost delegates deleteAccount(expected, {confirmAllApps: true}, signal).
// Construct a NEW adapter for a NEW explicitly authenticated generation.
```

`deleteAccount(expected, {confirmAllApps: boolean}, signal?): Promise<void>`:

1. Validate exact input shapes and canonical HTTPS `issuer = origin/auth/v1`,
   UUID `accountId`. Literal false or a pre-aborted signal makes NO host call,
   fence, HTTP dispatch, credential mutation or retirement. No confirmation
   coercion. An invalid request is rejected without consuming the adapter.
2. Read-only `host.capture(expected)` supplies a verified, durably committed
   active binding: issuer, accountId, appId, generation and opaque leaseId.
   Compare expected issuer/owner and `host.owns(lease)`. This is not JWT signature
   verification; the trusted host and existing provider/server own authentication.
3. Synchronously call `host.fence(lease)` BEFORE dispatch: atomically recheck and
   reserve the lease, stop refresh, permanently revoke all retained REST and
   refresh-write capabilities. Old capabilities never revive after a new login.
   This adapter becomes single-use, including on errors; concurrent/replay calls
   return `OFF`. The host/native registry MUST also prevent replay across adapter
   instances, windows or IPC callers; the local flag alone is not that guarantee.
4. Await the fixed native operation. No JS timer or `Promise.race`. Native must
   enforce a real 70-second end-to-end HTTP deadline and AbortSignal cancellation.
   Cancelling/closing UI does NOT prove server rollback or release a native lease.
5. ALWAYS await `host.retire(lease)` after a fencing attempt, even on failed fence,
   failed dispatch, malformed result, HTTP error, timeout, abort or supersession.
   This is conditional credential retirement, never a blanket auth suspend of B.
6. Resolve only for HTTP 200 plus `ACCOUNT_DELETED`, completed retirement, a
   non-aborted signal and still-owned lease. All attempted-dispatch uncertainty
   requires fresh sign-in, not cached resume/refresh or automatic deletion retry.

`capture` and `owns` are synchronous read-only methods. `fence` must finish
synchronously (no async work masquerading as `void`; a non-undefined return is
rejected/drained without dispatch); failure must leave old
capabilities fail-closed. A host without an accepted native capability must not
create this connection; return unavailable instead. Do not route through
TypeFree's snapshot cleanup helper (which may resume/read history), nor call its
ordinary `off()` before reserving the separate deletion capability.

## Fixed native IPC schema

One command: **`ecosystem_account_delete_v1`**. Its exact JSON data argument:

```ts
{
  version: 'ecosystem.account-delete.native/1',
  lease: {
    issuer: string,        // exact canonical configured origin + /auth/v1
    accountId: string,     // UUID, exact expected subject
    appId: 'psygames' | 'smart-alarm' | 'abstract-hub' | 'typerighting',
    generation: number,    // safe integer >= 1
    leaseId: string        // [A-Za-z0-9_-]{16,128}, non-credential handle
  }
}
```

All fields required; NO extra fields at either level. No URL, target owner,
method, body, headers, Origin, JWT, refresh token, timeout override or caller
chosen command. TS reference validation rejects non-data accessors, inherited
shapes, symbols, hidden extras and coercions, then detaches/freezes the request.
**Native MUST independently enforce the same exact schema**, not trust TS types
or allow a raw IPC caller to bypass validation. Bound issuer/owner/app/generation
and the unconsumed reserved handle must match native trusted state; self-asserted
JSON is NOT authority. appId/absence of Origin do not authenticate an application.

The result has exact common fields `{version, leaseId, generation}` matching the
request, plus exactly ONE of:

| kind | Additional exact fields |
|---|---|
| `response` | `status`: integer 100..599; `ack`: `ACCOUNT_DELETED` or `UNCONFIRMED` |
| `cancelled` | `reason`: `ABORTED` or `DEADLINE` |
| `failed` | `reason`: `TRANSPORT` |

No upstream body/error/headers/JWT is returned. Native sets `ACCOUNT_DELETED`
only on HTTP200 with a valid bounded JSON object containing exactly
`{code: 'ACCOUNT_DELETED'}`; anything else is UNCONFIRMED or a sanitized failure.
The adapter independently validates the result and lease before considering ACK.

### Mandatory native HTTP boundary (not implemented by TS)

- Native code obtains credentials from the EXISTING protected account host/vault
  and verified lease; no second auth SDK/session store and no credential in IPC.
  Exact credential provisioning/lease registration is the app owner's integration
  responsibility and remains unimplemented here. No refresh/resume during delete.
- Derive HTTPS origin from trusted configured authority, NOT a request URL. Only
  POST `/functions/v1/ecosystem-account-delete`, empty query, fixed UTF-8 body
  `{"confirm":"DELETE_ACCOUNT","scope":"all_ecosystem_apps"}`. The account target
  is derived by the Edge handler from the authenticated user, not from this body.
- Only native-owned Authorization, configured publishable apikey and JSON content
  type as needed. No caller headers; **no Origin header at all**, including empty
  or `null`; no WebView/browser fetch fallback or permissive CORS changes. No
  redirect following (3xx is unconfirmed). No other path, method or retry.
- Enforce request <=1024 bytes, response <=1024 bytes incrementally while reading,
  and a native monotonic 70000ms deadline covering connection, headers AND body.
  No unbounded buffering/decompression. Oversize/parse/deadline failure cancels
  and drains/closes real HTTP before completing. This does not bound subsequent
  protected OS-storage latency; retirement must genuinely settle too.
- `NativeDeleteInvoke(command, request, signal)` is a typed injected FUNCTION,
  **not stock Tauri `invoke`**: AbortSignal is not a JSON IPC argument. An accepted
  host must connect that signal to cancellation of precisely this reserved native
  handle, including an abort racing listener registration. Cancel completion must
  be acknowledged by native only after actual HTTP/body termination. Native must
  enforce its deadline even if JS stalls. Never merely resolve a timeout promise.
- Native state: active bound generation -> reserved/deleting (old REST/refresh
  permanently fenced) -> HTTP settled/cancelled -> conditional retirement. Hold
  the native operation reservation until HTTP actually settles. Reject reuse.
  Already-dispatched server work may still finish despite client cancellation.
  Other processes/devices/server RLS remain outside this local ordering guarantee.

### Retirement and stale A -> B

The host's existing **app+issuer** FIFO lane must contain ALL credential and PKCE
writes/removals, including retirement. Do not create a separate subject-keyed lane.
`retire(lease)` rechecks exact owner/generation/handle before and after OS work,
returns only `retired` or `superseded`, and must not call ordinary `begin()` to
reclaim a retired generation. If B already owns the namespace, skip A cleanup.
If A removal physically started first, B may begin but MUST NOT ACK credentials
until that removal has settled and B's subsequent durable write has completed.
No compensating clears/writes. A late HTTP ACK never means success for B.
`owns(lease)` means generation/handle ownership, NOT active network permission,
and must remain meaningful after A's own retirement.

Use the existing native runtime lease to reject stale WebViews. The JS adapter
and a module-local lane cannot establish cross-window/native mutual exclusion.
Retirement must prevent cached automatic recovery of A (also after restart).
If storage cleanup fails, the host must keep A unusable/fail closed; the adapter
returns `RETIREMENT_FAILED` and cannot prove durable erasure. New explicit B
sign-in must not be cleared, suspended or falsely ACKed by the old operation.
No local gameplay, history, wallet, pet, consent receipts of B or unrelated
namespace is erased. The controller owns user-facing confirmation/LOCAL state.

## Errors, tests and proof boundaries

`AccountDeleteError` contains only a fixed code/message, no cause, provider body
or original exception. Codes: `INVALID_INPUT`, `CONFIRMATION_REQUIRED`, `ABORTED`
(before dispatch), `UNAVAILABLE`, `OFF`, `ACCOUNT_CHANGED`, `SIGN_IN_REQUIRED`,
`RETIREMENT_FAILED`. A superseded A returns ACCOUNT_CHANGED, never a global
instruction to clear B. The host/controller must not log credentials, input
envelopes or provider/bridge exceptions. No logging is performed in this package.

From repository root (Node with built-in TS type stripping, tested Node26.9.0):

```sh
node --experimental-strip-types --test packages/ecosystem_account_ts/adapter.test.ts
```

Or from this directory: `npm test` (no install/runtime dependencies).
Strict production-source typecheck with an existing TypeScript installation:

```sh
tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --lib ES2022,DOM packages/ecosystem_account_ts/adapter.ts packages/ecosystem_account_ts/native_contract.ts
```

For typechecking the test too, include `adapter.test.ts`, `--types node` and
`--typeRoots` pointing at existing Node typings. No dependency download needed.

Tests use ONLY host/native doubles: confirmation/abort no mutation, synchronous
fence ordering, exact ACK, replay, retained REST, real-settlement ordering in the
double, deadline/cancel acknowledgement, malformed/forged requests/results,
conditional retirement, slow A removal before B ACK and error sanitization.
These cannot prove actual native HTTP cancellation, native registry enforcement,
OS-vault durability/crash safety, Edge deployment, physical-device behaviour,
provider JWT validity or TypeFree integration. A violating sender that never
settles deliberately leaves the adapter pending/fenced; it is NOT a bounded,
accepted native implementation. No TS timeout fabricates completion or releases
its responsibility. Main review and app-owner native acceptance are required.
