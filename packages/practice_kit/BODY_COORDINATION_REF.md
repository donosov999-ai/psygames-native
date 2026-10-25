# Shared body scene and explicit gentle coordination · 25.10.2026

Owner: smart-alarm-codex-mac, direct instruction by Denis. TeamOps
4131b15a-cd1d-416c-8d5f-53584515d9d1. Base f23ef6b33c6ca37c632871b54e3c765559e482c7.

## Contract

- PracticeStage uses one existing cosmic-body asset with separate abdomen and
  pelvic-floor cue overlays. Both stay visible with eye-gym; eye targets remain
  foreground and the body is muted. No second animation clock, sensor inference,
  gesture capture, muscle completion event or haptics implementation is added.
- Other illustration families retain their previous stage. Ordinary solo and
  independent plans retain their existing scheduling and plan identifiers.
- Explicit request `muscleCoordination: gentle` is supported only in `parallel`,
  abdomen `level-1`, pelvic-floor `holds`/`exhale-sync`. Optional breathing is
  `coherent`, `extended-exhale` or `ujjayi`, without retention phases. Eye-gym
  may coexist. `canCoordinateMuscles(request)` exposes the eligibility check.
- Both muscle lanes share a clock: selected breathing, or the selected pelvic
  holds when no breathing is selected. They engage and fully release together.
  Coordinated pelvic instructions explicitly mention gentle lower-abdominal
  engagement instead of the ordinary isolated-Kegel instruction.
- No automatic programme substitution. Unsupported explicitly coordinated
  requests fail with MUSCLE_SYNC_UNAVAILABLE; apps must leave independent
  launch available and omit the flag when saved preferences become incompatible.
- Coordination participates in plan fingerprint and frame cues. Stored default
  plans without the flag remain unchanged. Pause uses the existing session time.

## Evidence and acceptance

129 shared package tests PASS; engine checks both selection orders, with/without
breathing, identical lane phase/progress, independent defaults, incompatible
vacuum/box/quick modes, and session pause. Widget matrix 320×480, light/dark,
normal/large text: both anatomical indicators and eye targets remain present.
Stage bounds/original SVG/body-crop tests remain. flutter analyze: No issues.
Negative control: temporarily disabling the coordinated scheduler makes the
alignment test fail (0 PASS / 1 FAIL); the mutation was removed, not committed.
mutation-no-sync.log is saved in the same evidence directory.

/Users/denisonosov/Documents/TeamOps/smart-alarm-ux/body-rituals-20261025/
contains kit-tests-final.log and four body-{theme}-{scale}.png Flutter-rendered
frames. These are widget-test frames, not physical-device or store acceptance.
Existing stage test now measures MuscleBodyVisual instead of the replaced single
PracticeArtwork, retaining stationary bounds and perimeter assertions.

## Medical/content boundary

This is guidance, not measurement or a universally prescribed treatment.
Do not translate generic abdomen/vacuum cues into gentle contractions. Do not
force breath holding or imply that a timed phase proves muscle contraction.
Stop for discomfort; individual suitability requires a qualified professional.

References informing separation of isolated and coordinated modes:
https://www.niddk.nih.gov/health-information/urologic-diseases/kegel-exercises
https://www.nhs.uk/baby/support-and-services/your-post-pregnancy-body/

Smart Alarm owns its opt-in/config adapter. PsyGames can reuse this same package
revision and request flag; this feature branch does not modify its app, TS engine,
global registries, version, main or store release. Existing native haptics remains
one leader. No claim of rollout to PsyGames until its owner integrates and tests.
