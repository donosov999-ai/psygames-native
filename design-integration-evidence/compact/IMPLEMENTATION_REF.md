# Compact Workout / Pet — implementation handoff

01 November 2026 · psygames-codex-mac · TeamOps 99fe7d78-edef-461c-a128-e678aa52bfac.

## Read first: scope and acceptance

Denis explicitly approved the v3 direction and the full implementation plan. This is an isolated review implementation, NOT a store release, production deployment, or visual acceptance. No backend, dependencies, prices, rewards, game rules or user data migrations changed. Do not replace Claude's checkout with this tree.

Base: remote main `63f62d0cf70f35c06e61969fe151843948c47b4c` (PR454). Own branch `codex/compact-workout-pet`; worktree `/Users/denisonosov/dev/psygames-game-lab/compact-workout-pet-impl-20261101`. Commit receipts are recorded in `COMMITS.md` alongside this file after verification.

Accepted direction: `/Users/denisonosov/dev/psygames-game-lab/design-refresh-20261024/compact-workout-pet-20261101/workout-pet-candidate-v3-connected-console.png`, SHA256 `361bf4cebb13b9774c1dd0de34b153d8e896701e6acfcf15d7f57ce24c155681`. Older v1/v2 are NOT implementation targets. The generated four-gem sheet is new implementation artwork; do not confuse accepted layout with separate acceptance of these new assets or the running build.

## Implemented, using existing actions

| Area | Source in this tree | Behaviour |
| --- | --- | --- |
| Workout | `flutter/lib/shell/compact_workout_art.dart`, `warmup_screens.dart` | 72px normal content-sized tiles, max520 content; distinct dawn/amber/ruby/amethyst; native localized labels; one union-outline opens selected tab into programme. No optimistic choice: pick/dur/launch still use WarmupUi. Compact series and own series retained. |
| Pet | `flutter/lib/shell/pet_gem_console.dart`, `pet_screen.dart` | Square normal scene <=390; editable name, stage, shop and comic bubble inside. Feed first/primary then Wash/Pet/Play inside bottom. Long speech scroll/expand and existing AI Next/Close remain inside. At x2 height grows and care wraps internally. |
| State | Existing `pet_model.dart`, SharedState, WarmupUi | Unchanged ownership/calculations. Feed price and fed state come from model, insufficient-points action remains real; semantic hint retains needMore. Growth stays empty at0. Skins/locks/skills/advice retained below. No duplicate external care/name/feed. |
| Games | `catalog_screen.dart`, `tab_chrome.dart` | First six actual square entries fade in within450ms, no layout shift; query/filter rows remain rows. Entry clock is route/lifecycle-owned, not reset by model rebuild. |
| Progress | `stats_screen.dart`, `tab_chrome.dart` | Aurora root Back/Refresh row removed. Pull-to-refresh and localized custom accessibility action share the existing refresh handler. Summary/History stay scrollable; existing600ms top-down entry retained. |
| Shared | Existing header/footer/FeedbackFab | Approved panel art and104px base header retained; five fixed equal footer slots. One existing draggable red floating bugFX, not added to header. No new sound/haptic patterns. Existing Classic styling remains. |

### Dynamics and cancellation

- Header glint450ms on all five routes, Pet materialization1000ms and Progress600ms retained from main.
- Workout confirmed selection uses200ms AnimatedSwitcher; exiting the route disposes transitions instead of freezing an obsolete transition for later replay.
- Games only first six entries animate, interval<=450ms. Route exit, lifecycle and Reduce Motion use the existing TabEntryMotion clock/final state.
- New sounds/haptics remain OFF in `flutter/config/approved-ui.json`.

### Artwork and reuse

`flutter/assets/workout_gems/{morning,day,evening,night}.png` are512px RGBA, symbols only. Native text is required: do not bake EN/RU into them. Full sheet, prompt, original ID mapping and hashes are in `gems/`; built-in image generation only, no paid external service. `flutter/tools/slice-workout-gems.py` reproduces the mechanical cutout/centering. `crop-workout-panel.py` mechanically extracts the inner texture of the already approved panel; one outer Flutter path owns the border, avoiding double seams.

Other artwork, fonts, palettes, header/footer sizes and controllers are NOT to be regenerated for this handoff. No animated raster was substituted for the real pet: PetFrames and all handlers remain live.

## Review build / safety

App: `/Users/denisonosov/dev/psygames-game-lab/compact-workout-pet-impl-20261101/flutter/build/macos/Build/Products/Debug/PsyGames Compact Review.app`.

Built with `lib/design_integration_preview.dart`, `config/approved-ui.json`, temporary `PRODUCT_NAME=PsyGames Compact Review`, bundle `pro.psygames.compactReview`. Build settings are restored in source, not a production rename. Preview uses in-memory SharedPreferences and the real app shell, embedded web models and actual game routes; it does NOT import the installed app's progress/account. Restart resets its test state. Production entrypoint remains `lib/main.dart`.

Rebuild in this worktree: `npm ci --legacy-peer-deps` in frontend; `REBUILD=1 bash tools/embed-web.sh` in flutter (adds generated web asset entries locally); `PUZZLES_SRC=/Users/denisonosov/dev/puzzles bash tool/build_tatham.sh`; set isolated AppInfo values; `flutter build macos --debug -t lib/design_integration_preview.dart --dart-define-from-file=config/approved-ui.json`; restore AppInfo and only generated pubspec web entries afterwards. Never build this review entrypoint for a store upload.

## Evidence and its limits

- Targeted run:65 passed /1 existing skipped (`compact_workout_pet`, existing aurora_workout_actions, pet_screen, stats_screen, four_tabs_preview). 320/390/800, both themes, long speech, RTL/x2, semantic selection, denied Night, rename/care/shop/AI Next-Close, refresh paths covered by real widgets and existing action bridges.
- Four-tab capture/motion run:32 passed. EN/RU/Arabic shell layout and x2; fixture models contain EN content, so this is NOT proof of every production long translation. Production locale smoke remains separate.
- Static PNGs under `flutter/test/design/preview/`: top/scrolled dark/light and History. They are real Flutter widget renders with checked fixture data and real assets, NOT physical-device screenshots.
- `review/*-reference-flutter-overlay.png`: reference/Flutter/50% overlay at equal390px width. The AI reference has a different aspect ratio; images are top-aligned with letterboxing, NOT stretched non-uniformly or falsely declared pixel identical. Overlay is diagnostic, not acceptance.
- `review/{games,warmup_picker,statistics,pet}-motion.gif`: recording of actual Flutter frames,40ms sampling, finite effects. Not a screen recording of a physical phone. Original112 frames retained locally in `flutter/test/design/preview/motion/` (ignored from Git, reproducible).
- `flutter/tools/compact-review-evidence.py` recreates comparison sheets/GIFs; source frame hashes differ across animation time. No UI painted over screenshots.
- Native Mac build succeeded. ScreenCaptureKit initially returned `-3811`, then recovered. Actual window screenshots confirmed the native Home/Workout header, fixed footer and connected programme; real Morning selection updated the authoritative model, Start launched Schulte (game1/7), and nested Back returned Home. Important: an early AX tree exposed hidden WebKit content while the screenshot visibly showed Flutter; that AX snapshot is NOT evidence that the application fell back to bare web. The review entrypoint explicitly awaits NativeTabs.load to avoid silently swallowed manifest-load failures; production routing is not changed. Full phone-flow acceptance is still separate.
- Full-suite / final analyze results and commit hashes: see `COMMITS.md`; never infer them from these targeted counts.

## Remaining gates / known boundaries

1. Denis must inspect and accept this running review build, both themes. No task closure or store upload before that decision.
2. Physical iPhone/Android motion/large-font/locale/performance and actual screen-reader gesture checks remain unperformed here. Inspect Night, user series, actual launch/finish/back, five routes and quick exits on devices.
3. bugFX uses the existing movable overlay and saved position. It does not cover the Pet care row or Workout launch at its default position; it CAN overlap scrolling secondary cards, as in the existing app. No automatic protected-rect placement is implemented. Do not claim all possible saved positions are overlap-free.
4. Classic appearance is intentionally retained; root Back/Refresh removal in this patch targets Aurora. If removal is required in Classic too, review its existing navigation contract explicitly rather than silently altering it.
5. New v3 asset crops and outline join are not an exact pixel match to a generative reference. Review the overlay; do not label visual fidelity accepted by test passes.
6. Before integration compare remote main again, cherry-pick only the own commits. Revert an individual own commit / disable motion for rollback; never reset another checkout. No migration/production/API work belongs to this phase.

## Later explicit user correction — Play inside the scene

Denis reported Play opening another menu. Source diagnosis: `frontend/app/pet.tsx` registered `play: () => router.push('/games')`; the old handler intentionally selected a training game, not a pet interaction. Denis explicitly approved replacing this with local play inside the scene, with NO training credit.

`pet_screen.dart` now handles Play locally in both Flutter templates. `pet_play_overlay.dart` adds a48px toy target; tapping moves it and restarts the existing wiggle reaction. Close stays inside the scene. Tab exit or app background closes the mode. No ScreenUi.play call, new API, currency spend, session, growth, mood/reward write or training result. Feed/Wash/Stroke remain actual model actions; their prices and rules are untouched. Legacy web markup is not redesigned by this patch.

Final focused verification:29 passed /1 skipped; capture matrix32 passed. `review/pet_play-motion.gif` records the real interaction in the Flutter widget harness. This is a small local toy interaction, not a claim of a fully developed new pet mini-game.

Native Mac confirmation after rebuilding: Pet Play stayed on the same tab, toy appeared inside the scene, clicking it moved the toy and visibly changed the cat's pose. These actual window captures were shown inline via computer-use; no physical iPhone/Android claim. The review app is left open on Pet for Denis.

## Later discussion — one palette system, not nine redraws

See [DYNAMIC_PALETTE_PROPOSAL.md](DYNAMIC_PALETTE_PROPOSAL.md): runtime hue slider and profile presets, separated metal/crystal/reflections, masked recolouring pilot, native text contrast and renderer fallback. Research/proposal only; not implemented or included as a released setting.

Distinct Home content entrance remains NOT implemented: Home currently retains shared header glint and press response; Games450ms, Workout200ms, Progress600ms and Pet1000ms are separately described above. Do not claim five new distinct content effects.
