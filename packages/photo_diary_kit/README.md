# photo_diary_kit

Shared opt-in local photo diary, extracted (not rewritten) from Smart Alarm
`4479dba59c736b8814f10e29033a62936206c87b` on 2026-10-11.
Task: `0ff09ef1-d091-48b9-9f6f-c2a65a549fc5`.

## Integration contract

- Import `package:photo_diary_kit/photo_diary_kit.dart`. Own one
  `nativeDiaryController(await SharedPreferences.getInstance())` per app.
- All flags default OFF. Settings (`DiarySettings`) must collect separate camera
  and storage consent. `DiaryOptIn` additionally collects a per-session choice.
- `DiaryCameraSetup` requires `privacyWrapper`; wrap its child in the host's
  private-screen guard. Apply the same guard to screens containing diary photos.
  Disable feedback/screenshot upload at capture time **and** before sending;
  a navigation transition must not expose a delayed capture.
- Request camera permission only in the explicit setup route. Never push setup
  from a ringing alarm or automatically on session start. Front camera, flash
  off, microphone off. A camera failure must not block the underlying task.
- Forward app lifecycle to `controller.foreground(bool)` and dispose when the
  host closes. Use a stable, unique session ID across pause/resume/restoration.
- `begin(id:, kind:, title:, sessionOptIn:)`: `kind == 'wake'` uses wake consent;
  all other kinds use practice consent. `finish(id, outcome)` captures after
  only for exact `completed`, never for skipped/interrupted/snoozed.
- Wake hosts must display the exercise and silence their alarm independently
  of photo preparation. Resolve competing camera users before capture.
- UI supports RU/EN via `english`. Localization expansion is a separate task.
- No backend, AI, alarm scheduler or practice_kit dependency. No face-derived
  health, emotion, sleep, stress or completion claims. Rating is user supplied.

## Native storage and migration

The plugin registers `com.odv999.photo_diary_kit/storage` automatically on iOS
(SwiftPM or CocoaPods) and Android. Do not copy its handlers into app delegates.
App supplies its camera permission descriptions/manifest declarations.

Existing Smart Alarm data stays in its original sandbox:

- SharedPreferences key `photo_diary_consent_v1` is unchanged.
- iOS: Application Support/photo_diary, excluded from backup, complete file
  protection. Android: noBackupFilesDir/photo_diary.
- `index.json`, entry JSON fields (including historical `alertness`) and frame
  basenames are unchanged. Missing native storage fails closed, no fallback.
- Atomic index, generation-based cancellation and strict own-file deletion stay
  in the extracted implementation. An invalid index must not trigger cleanup.

Version 0.1.1 adds an optional `during` shot (state/file/time/error fields);
old entries decode with no during shot. Recovery/deletion includes its file.
`controller.captureDuring(id)` requires separate `rainbowCapture` opt-in (default
OFF, including existing saved consents) and does not mark the task completed.
Display it as “During the task”, never as “Before” or “After”.
Capture is bounded to 6 seconds (controller operations 8s); failed loader
initialization can retry on the next explicit session. Safe error codes explain
missing frames without storing platform exception text or camera data in logs.
Camera waits 450ms after initialization for auto-exposure; this is a tunable
initial value, not device-verified exposure readiness or a guarantee in darkness.

Sharing code does **not** share photos between app sandboxes. No App Group,
export, cloud sync or cross-app history transfer is implemented.

## Ownership

Smart Alarm owner maintains this package and its adapter. PsyGames owner adds
its adapter, consent UI, lifecycle and private-screen guard, pins the tested Git
SHA, runs consumer tests and releases PsyGames. Neither copies the core code.
Package extraction is not evidence of PsyGames integration or device QA.

## Checks

Run `flutter pub get`, `flutter analyze`, `flutter test` from this package.
Tests cover consent, cancellation, storage recovery, per-session state,
front-camera capture, no microphone/flash, photo layout and settings.
Smart Alarm has separate wake/practice/lifecycle and feedback privacy tests.
Physical iPhone/Android camera/backup behavior still needs device acceptance.
