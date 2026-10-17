# TypeFree fresh-auth boundary proposal/1 — architecture review

18.10.2026 · psygames-codex-mac · R1 task
`e63cc347-94c9-40f0-8fbe-ed20a9aeed5b`, parent review77ca8ea0.

Exact reviewed proposal:
`/Users/denisonosov/Documents/TeamOps/typerighting-onboarding/account-native-review-fixes-20261018/FRESH_AUTH_BOUNDARY_PROPOSAL_V1.md`
SHA256 **2a4d7ff9467b7c1150d7eed9c957f1efe53f171d9e4329680322b248b6bfbc36**.

**Personal ACK to the architecture/boundaries of exact proposal/1**, subject to
the concrete requirements below. Not a final vault/3 wire ACK, implementation
acceptance, permission to enable availability, or new server/provider authority.
The proposal itself requires exact commands and migration agreement before
implementing this boundary; that prerequisite is retained, not silently waived.

The direction addresses the reproduced R1: a native-owned PKCE transaction and
internal single-use receipt can distinguish fresh verified sign-in from a raw
`explicit=true`, a repeated session write, decoded claims or JS getUser assertion.
GET /user alone confirms validity, not completion of this native fresh flow.
The existing Supabase backend/account and protected store remain the same.

## Required in the next exact app-private vault/3 specification

1. **Single authority per generation.** Native owns this PKCE exchange and its
   durable credential commit. Existing AuthHost is its facade; no second session
   store, competing JS/native refreshers, parallel code exchanges or SDK storage
   writers. Define how existing JS SDK/REST consumers receive their sanctioned
   capability without obtaining a second mutable owner of the transaction.

2. **Native-private flow material.** Generate verifier/challenge and random flow
   binding before the fixed sign-in request. Private slots/receipt are inaccessible
   to generic vault read/write/remove and to legacy vault/2 routes. Neither public
   JSON, changed cached bytes, a caller boolean nor refresh of cached credentials
   can create the fresh receipt. Freeze its one-shot consumption rules, expiry,
   ownership, durable-write-before-ACK ordering and restart/failed-storage states.

3. **Exact existing provider semantics.** Specify fixed origin, Auth endpoints,
   methods, request fields, verification of issuer/subject and native transaction
   binding. Derive the wire from the installed pinned Supabase SDK/API, not guessed
   fields. Current callback is exactly `pro.typefree.app://auth/callback`; preserve
   registration and PKCE/multi-flow correlation (including sb_flow_id where used).
   Reject foreign/duplicate/stale callback fields and old A flow after B owns.

4. **Separate bounded Auth transport.** Enumerate exact new private command names,
   DTOs, errors, no-extra-fields validation, allowlisted operations and deadlines.
   No generic URL/headers/target, redirect, browser fallback or unbounded body.
   Auth JSON needs explicitly justified bounds distinct from deletion's unchanged
   1024-byte contract. Keep actual native cancellation/settlement and the existing
   app+issuer FIFO; JS timers alone do not settle network or credential mutations.

5. **Fail-closed migration.** Specify treatment of old vault/2 credential, pause,
   deletion tombstone and pending PKCE slots. Old saved session/import/backup is
   never a fresh receipt and cannot erase a fence. Preserve local progress, queued
   practice results and B's receipts. If old in-flight transaction cannot migrate
   safely, retire only that attempt and require explicit new sign-in; do not clear
   the whole protected namespace or silently migrate/recover into availability.

6. **Tests before availability.** Original raw-native proof must fail, including
   same-cached-bytes rewrite and modified claims; old-flow/receipt replay and wrong
   runtime/writer/issuer/subject must fail. A real native synthetic challenge/code/
   user-confirmation flow must succeed exactly once. Include cancellation, crash/
   restart checkpoints, delayed A removal and B durable ACK ordering. Distinguish
   synthetic server/store, actual Tauri protected store, real provider and device.

Shared sources **ea404f50b70d7c7cc8dc7296402bf39a4aecadc4** and addendum
**e1be4ce4b80f2c7481a119be34783574d7c220a0** remain unchanged. A need to change
their observable contract requires a new exact version/source and agreement,
not reinterpretation of this architecture ACK. Public final action remains OFF.

Next deliverable: exact versioned private-command/flow/migration document with
hash/commit, and clear old-versus-new Auth ownership. Review it before boundary
implementation as the author proposed. Independent R2 lifetime-guard work can
continue within existing app-owned scope; this ACK neither accepts its fix nor
requires delaying it. No real accounts, Auth requests, server/CORS/config changes,
release, heavy build or new cost is authorised by this review.
