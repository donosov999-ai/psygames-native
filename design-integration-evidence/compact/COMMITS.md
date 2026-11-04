# Verified receipts — 01 November 2026

Base remote main: `63f62d0cf70f35c06e61969fe151843948c47b4c`; fetched again during final verification, unchanged.

Own commits, in application order (no push/merge/store upload):

```
+945e06ad4208345c06c3a2c66dce21a435f90cbd feat(workout): compact connected time-of-day jewel programs
ecd4aa3eb4f720aa71d9c88854ef7d6718ef3fef feat(pet): unite name speech shop and Feed-first care in one scene
9ac46e80b515c8cd31f6a95305ca3b4bc8dedb01 feat(tabs): finite catalog entry and accessible progress refresh
ffb3a11e36e640ee4fcf75a5dbb6d14107823268 test(design): cover compact console geometry actions and motion captures
47618d139a4189fc221077a2ed15f0b414dcf9ce chore(review): preload tab manifest in isolated acceptance launcher
2205a1a81b63af31f67b45444f38415268871d98 fix(workout): keep jewel launch action explicitly sized and accessible
92f324a2d569d2ad8ec619674845782ff6343b32 fix(pet): Play with a local toy inside the console without training credit
```

Verification receipts (local logs, not CI):

- `/tmp/psygames-compact-baseline.log`: 16 passed /1 skipped before edits.
- `/tmp/psygames-compact-full-suite.log`: 4787 passed /10 skipped; full run BEFORE the later explicit launch widget and user-approved local Pet Play addition. Do not claim that run tested the later addition.
- `/tmp/psygames-compact-launch-verified-tests.log`: 70 passed, explicit launch widget + layout/bridge contracts.
- `/tmp/psygames-compact-pet-play-final2.log`: 29 passed /1 skipped, AFTER local Play; checks toy movement, no catalogue JS/write, close and cancellation on background/tab exit, preserved pet model/screens.
- `/tmp/psygames-compact-play-captures.log`: 32 passed, real widget captures in both themes plus local toy recording.
- `/tmp/psygames-compact-motion-final.log`: 32 passed, actual motion enabled, four page animations recorded.
- `/tmp/psygames-compact-play-analyze.log`: No issues found.
- `/tmp/psygames-compact-macos-play.log`: final macOS debug review build succeeded, includes Play addition. Existing plugin Swift/SwiftPM warnings remain; they are not analyzer errors.
- `git diff --check`: passed before handoff.

Build identity: `pro.psygames.compactReview`, `PsyGames Compact Review`, isolated in-memory test storage, no production preferences imported. AppInfo temporarily overridden to build and restored afterwards; generated88 web pubspec entries also removed from source after build. Real embedded web1490 files/89MB and Tatham built from local canonical428913c6a58b60802fe5d734d9a44c34159f4e0f, no source migration.

Native/manual screenshots and runtime actions are recorded separately in IMPLEMENTATION_REF.md. Denis has NOT visually accepted the working build; no phone testing, store publication or CI claim is made.
