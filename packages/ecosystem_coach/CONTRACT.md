# Teacher cabinet — ecosystem.coach/2

Package `ecosystem_coach` 0.1.0 · server RPC `public.ecosystem_coach_v2(p_action, p_payload)` ·
migration `supabase/migrations/20261111120000_ecosystem_coach_v2.sql` · local checks
`supabase/tests/coach/run-local.sh` (41 checks, fresh PG17).
Status: candidate. Migration is NOT applied to production; apps keep it behind a flag (OFF).

## Who sees what

- One account per person (ecosystem_account: Google / e-mail), the same in PsyGames,
  Chess & Go (`abstract-hub`), TypeFree (`typerighting`), Smart Alarm (`smart-alarm`).
- A teacher sees a student only after an invite **and** the student's explicit consent,
  separately per app. Scopes: `completion` (always), `metrics`, `errors`, `history`.
- Nothing before consent is visible (events are filtered by consent time). Revoke per app or
  disconnect fully at any time; the teacher loses access immediately.
- Smart Alarm sends only practices and their stats (owner decision 11.11.2026), no alarms/sleep.

## Invite link

`<scheme>://coach/invite?code=<48 hex>` — same form as Chess & Go. Schemes:
psygames `com.psygames.app` · abstract-hub `com.abstracthub.app` ·
smart-alarm `com.odv999.smartalarm` · typerighting `pro.typefree.app`.
One-time, 7 days. Server stores only sha256 of the code. Parse with `CoachInviteLink.parse`
(own scheme only, exact host/path, one `code` parameter).

## Actions (payload keys are a closed list; unknown key → `coach_bad_request`)

| action | payload | who |
|---|---|---|
| dashboard | page | anyone signed in |
| profile_save | name | becomes a teacher |
| invite_create | app_id | teacher, ≤20/day |
| invite_preview | app_id, code | student, wrong codes ≤10/hour |
| invite_accept | app_id, code, student_name, consent=true, scopes, policy_version=`coach/2` | student |
| consent_update / consent_revoke | connection_id, app_id (+ scopes, policy_version, consent) | student |
| disconnect | connection_id | either side |
| result_submit | app_id, event | student app, ≤1000/day; without consent nothing is stored (not an error) |
| student_events | connection_id, app_id, page | teacher; metrics/errors only if scoped |
| program_save / assign / comment_add | see migration | teacher (UI later) |

Event: `event_id` (idempotent per app+student), `kind`, `mode`, `exercise_ref`, `occurred_at`
(UTC; >5 min in future or >30 days old → stored as unknown time, shown as received time),
`metrics`/`errors` — flat objects, keys ≤60, strings ≤120. Payload ≤16 KB.

Errors come back as `{error: "coach_*"}` → `CoachException(code)`. If the server is
unreachable, the app shows "unavailable" and training works as usual.

## Screens — the app draws the frame

`TeacherCabinetScreen`, `StudentDetailScreen`, `AcceptInviteScreen`, `MyCoachesScreen`
take a `CoachFrame` builder: the app passes its own header/toolbar (in PsyGames — GameShell).
The package draws only content. Strings: `CoachStrings.en` / `.ru` or the app's own.

## Pin for other apps

Copy `packages/ecosystem_account` (0.1.6) and `packages/ecosystem_coach` (0.1.0) by exact
commit; the SHA256 of the `git archive` is posted in the TeamOps psygames journal.
