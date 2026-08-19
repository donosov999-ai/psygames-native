# Memory Palace · isolated module specification

Status: local G8 implementation candidate. Integration, catalog, persistence,
shared warm-up wiring, analytics, and release remain outside this module.

## Method

The MVP uses an original code-native 2D/isometric route with 5–12 fixed loci.
The player studies the route, places a deterministic set of concrete items,
may freely move or swap every placement before Recall, studies the associations,
then recalls the item sequence both forward and in reverse.

Recall candidates include deterministic distractors. Scoring keeps three
questions separate: whether a selected object belonged to the learned set,
whether it was assigned to the prompted locus, and whether learned objects kept
their relative route order. The module trains only this task. It does not claim
medical benefit, general memory improvement, or an IQ measurement.

The exported route has `LEVELS = 15`; requests above 15 clamp to level 15.
Difficulty grows through the amount of content, never through a response timer.

| Levels | Honest content progression |
| --- | --- |
| 1–2 | 5 loci and 2 distractors |
| 3–4 | 6 loci and 2 distractors |
| 5–6 | 7 loci and 2 distractors |
| 7–8 | 8 loci and 3 distractors |
| 9–10 | 9 loci and 3 distractors |
| 11–12 | 10 loci and 3 distractors |
| 13–14 | 11 loci and 4 distractors |
| 15 | 12 loci and 4 distractors |

## Content and privacy

The fixed scene, locus motifs, and item assets are original code-native geometry
with localized concrete labels. There are no external images, APIs, accounts,
cloud dependencies, user text, 3D assets, Major System, or PAO features.

## Metrics and pass rule

The result includes `details.level` plus separate item-knowledge, exact-location,
relative-order, forward-location, and reverse-location metrics. Exported
`isPassed(metrics)` requires overall accuracy >= 0.70, combined location accuracy
>= 0.60, and location accuracy >= 0.50 in each recall direction. This tolerates a
small mistake while preventing item recognition or one-direction recall from
masking failure to remember the loci.

## Lifecycle

Seed and level reproduce the same route size, item pool, distractors, and
candidate order. Pause, background, restart, and dispose are explicit. The
component reports only a completed result and never auto-starts a next level.
The integrating application route owns `saveSession`, persistent level progress,
`LevelProgressMap`, `LevelCleared`/`GameResult`, mode behavior, and warm-up flow.
The lab component shows its own result by default; integration passes
`showOwnResults={false}` when the application owns the final screen.
