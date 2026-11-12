# Teacher cabinet — ecosystem.coach/2

Package `ecosystem_coach` 0.1.0 · server RPC `public.ecosystem_coach_v2(p_action, p_payload)` ·
migration `supabase/migrations/20261111120000_ecosystem_coach_v2.sql` · local checks
`supabase/tests/coach/run-local.sh` (41 checks, fresh PG17).
Status: **server LIVE** in `personal-nzt` since 11.11.2026 (migration `ecosystem_coach_v2`, smoke flow passed on prod with rollback).
**coach/3 LIVE** since 11.11.2026 (migration `ecosystem_coach_v3`, `supabase/migrations/20261111180000_ecosystem_coach_v3.sql`;
local `run-local.sh` 93 checks = coach/2 through the new entry + coach/3; prod smoke with rollback passed). Package **0.2.0**.

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

Copy `packages/ecosystem_account` (0.1.7) and `packages/ecosystem_coach` (0.2.0) by exact
commit; the SHA256 of the `git archive` is posted in the TeamOps psygames journal.

## How to connect an app (same steps for Chess & Go, TypeFree, Smart Alarm)

1. Dependencies: `ecosystem_account` 0.1.6 + `ecosystem_coach` 0.1.0 (path or your pinned mirror).
2. One `EcosystemAccount(appId: '<app_id>', url: 'https://iuvvheeocobhiothfgei.supabase.co',
   publishableKey: <public publishable key of personal-nzt>, callback: Uri.parse('<scheme>://auth/callback'))`.
   If the app already has an account object for this app_id, reuse it (one owner per namespace).
3. `final auth = AccountCoachAuth(account, openUrl: (u) => launchUrl(u, mode: LaunchMode.externalApplication),
   googleAvailable: true /* Denis 11.11.2026: Google on EVERY platform incl. iPhone — never hide it */, onSignedIn: …remember…, onSignedOut: …forget…);`
   On start, if the person signed in before: `await auth.restore();`.
4. `final client = CoachClient(AccountCoachTransport(account), appId: '<app_id>');`
5. Incoming links (the app's own link listener):
   - `<scheme>://auth/callback?code=…` → `await auth.complete(uri)`;
   - `<scheme>://coach/invite?code=<48 hex>` → `CoachInviteLink.parse(uri, appId: …)` → push
     `AcceptInviteScreen(client: client, code: link.code, auth: auth, frame: <your frame>)`.
   🔴 Invite path is **`/invite?code=`**, not `/join/<code>`. Android: add an intent-filter
   `scheme=<scheme> host=coach path=/invite` (lowercase scheme).
6. Entry points in settings: `TeacherCabinetScreen(client:, auth:, frame:, strings:)` and
   `MyCoachesScreen(client:, auth:, frame:, strings:)`.
7. After each finished training: `client.submit(CoachEvent(eventId:, kind:, mode:, exerciseRef:, occurredAt:, metrics:, errors:))`
   — fire-and-forget, swallow errors; without consent the server returns `stored:false` (not an error).
   `metrics`/`errors`: flat objects (≤40 / ≤100 keys, key ≤60 chars, values number/bool/string ≤120).
   Programs/assignments: `steps` is any JSON array (1–50 items, ≤8 KB) — app-specific step formats are allowed.

Reference integration: PsyGames `flutter/lib/shell/coach_bridge.dart` (+ test `flutter/test/coach_bridge_test.dart`).

## Cabinet v2 (coach/3, package 0.2.0) — groups, lessons, assignments, reports

Decision of Denis 11.11.2026, variant A: **one code for all apps, each app gives its own «clothes»**.

New server actions (same RPC, routed by `coach_private.route`): `groups_list`, `group_save`, `group_archive`,
`group_members`, `group_members_set`, `group_invite_create` (multi-use group link, 30 days, the SAME
`<scheme>://coach/invite?code=<48 hex>` form — apps already shipped with `AcceptInviteScreen` accept it unchanged),
`lessons_list`, `templates_list`, `lesson_save` (steps validated: `ref`, `amount` 1..1000, `unit` times|minutes,
`level` 0..1000, `title`, `note`, `app_id` = lesson app), `lesson_copy`, `lesson_archive`, `assign_lesson`
(`group_id` XOR `connection_id`, `due_at`, `recurrence` none|daily|weekdays|weekly, `starts_at`), `assignments_list`,
`assignment_report`, `assignment_archive`, `student_assignments`, `student_report`, `group_report`, `comment_list`.

**Progress is counted by the server, no «done» button:** an event of the student counts for a step when
`event.mode == step.ref` or `event.exercise_ref == step.ref` or starts with `step.ref + ':'`; `minutes` steps sum
`metrics.time_seconds`; if a step has `level` and the event sends `metrics.level`, it must be ≥. Recurring
assignments count from the start of today (daily/weekdays) or the week (weekly). An event that matches an
open assignment is stored even without the `history` scope. ⇒ **your `ref` must equal what you send as `mode`/`exercise_ref`.**

How to connect v2 (after steps 1–7 above):
1. `CoachStepCatalog([CoachStepKind(appId: '<app_id>', ref: '<mode you submit>', title: <localized>, group:, maxLevel:, unit:)…])` — your exercises.
2. Settings entry: `TeacherCabinetV2(client:, catalog:, auth:, strings:, v2: CoachV2Strings.ru|en, frame:, lang: '<locale>')`
   (replaces `TeacherCabinetScreen`; sign-in and teacher profile are inside).
3. Home of the student: `StudentAssignmentsPanel(client:, catalog:, auth:, strings:, refresh: <Listenable ticked after submit>,
   onStart: (task, i) => <open your exercise task.lesson.steps[i].kind.ref>)` — empty when no assignments.
4. Clothes: your `CoachFrame` + wrap the body in `CoachSkinScope(skin: CoachSkin(panel: <your card>, progressColor: …))`.
   Without a skin the cards are Material `Card`s. Reference: PsyGames `psyCoachFrame` / `psyCoachSkin` in `coach_bridge.dart`.
5. Templates for your app: send their `ref`s and titles to psygames-claude-mac — they are seeded server-side
   (`programs.is_template`, `i18n.<lang>.title/goal/steps`). PsyGames has 2 now.

## Fudao — the fifth app (Denis 11.11.2026)

`app_id = 'fudao'`, scheme `com.odv999.fydao` (invite `com.odv999.fydao://coach/invite?code=<48 hex>`, NOT `/join/<code>`).
Same account, invite, connection and consent. Fudao consent scopes: `completion` (required) + `birth_data`, `charts`,
`readings`, `diary_shared` (`coachFudaoScopes`, `coachScopesFor('fudao')`); scopes of the other apps are rejected for
Fudao and vice versa (server check + `require_scopes` by `app_id`). Migration `20261111200000_ecosystem_coach_fudao.sql`,
LIVE in `personal-nzt` (local 100 checks; prod smoke with rollback passed). Readings, materials, specialist notes and
suggested steps are Fudao's own objects next to the connection — not in this schema.

## coach/3.1 — editing future assignments, schedule timezone (TeamOps 0ff0b928)

Migration `supabase/migrations/20261112060000_ecosystem_coach_v3_1.sql` (additions only; local 116 checks).
- `assign_lesson` accepts `tz_offset_min` (−840..840; the client sends the device offset): «daily / weekdays / weekly»
  count from the teacher's local midnight / Monday, not from UTC.
- `assignment_update {assignment_id, program_id?, due_at? (null = no due), recurrence?, tz_offset_min?}` — «change from now on»:
  the old assignment is archived with its report (the past is not rewritten); the new one keeps the start when the lesson
  is the same (done steps still count) or starts now with the new lesson. Client: `updateAssignment(...)`; UI —
  «Change» on the assignment report (`AssignmentReportScreen.onEdit`).

## coach/3.2 — step data (`data`)

Migration `supabase/migrations/20261112100000_ecosystem_coach_v3_2.sql` (additions only; local 121 checks).
A lesson step may carry `data` — a JSON object up to 4 KB that the server stores in the lesson and the assignment
snapshot and returns to the student as is (it does not interpret it): the teacher's own text (TypeFree), a FEN position or a
PGN game (Chess & Go), a puzzle id. Package: `CoachLessonStep.data`; catalog entries may ship `CoachStepKind.defaultData`
(a ready exercise) and `editableData: true` (the teacher fills the data). Give `TeacherCabinetV2(stepDataEditor: ...)` /
`LessonEditorScreen(stepDataEditor: ...)` your own editor `(context, step) => Future<Map?>` — it opens when such a step is
added and by «✎». The student side gets it in `StudentAssignmentsPanel.onStart(task, i)` → `task.lesson.steps[i].data`.
