# Navigator · isolated module specification

Status: local G6 implementation candidate. Integration, catalog, persistence,
shared warm-up wiring, and release remain outside this module.

## Product loop

One deterministic route supports three modes. Route Recall first shows numbered
route cells and then asks for the screen directions without the route. Turn Sequence
shows relative left/straight/right instructions and asks for the same sequence.
Home Direction shows the route and then asks for the direction back to its start.

Progression grows the grid from 3×3 to 8×8 and the route from 3 to 15 steps. Original
code-native landmarks, false branch cells, map rotation, hidden recall maps, and a
user-paced delay are introduced only after tutorial levels.

The exported route has `LEVELS = 33`; larger requested values clamp to level 33.
Route Recall, Turn Sequence, and Home Direction cycle in that order, so the task type
changes every level while the spatial load rises independently.

| Levels | Honest content progression |
| --- | --- |
| 1–5 | 3×3, 3–5 steps; tutorial maps, then the first landmarks |
| 6–10 | 4×4, 5–7 steps; map hiding, user-paced delay, false branches, and rotation begin |
| 11–15 | 5×5, 8–10 steps; more landmarks/branches and wider rotation set |
| 16–20 | 6×6, 10–12 steps; denser routes and longer retention |
| 21–25 | 7×7, 13–15 steps; all rotations and all three delay steps become available |
| 26–30 | 8×8, 15 steps; landmarks reach five and branches approach maximum |
| 31–33 | 8×8, 15 steps; five landmarks and up to six false branches |

Delay is a user-paced interference step, not a countdown. No response is rejected
because time elapsed.

## Geometry and input

The generated path is in logical coordinates. Rotation only maps logical cells and
directions to the screen; input is unrotated before evaluation. Therefore 0°, 90°,
180°, and 270° views preserve the same answer. Routes are self-avoiding and every
step is exactly one orthogonal in-bounds move. False branches are reachable neighbors
that never replace a required route cell.

Keyboard, visible buttons, and swipe gestures use the same pure normalizers. Route
Recall accepts four directions; Turn Sequence accepts left/straight/right; Home
Direction accepts eight compass sectors and reports continuous angular error to the
exact start bearing.

## Lifecycle and metrics

The pure state machine owns rules, study, optional delay, recall, pause, restart,
result, and dispose. There are no timers. Completion metrics include common accuracy,
duration, difficulty, errors, seed, and version plus mode, grid/route size, route
accuracy, extra steps, angular error, turn hits, rotation, landmarks, branches,
map-hiding, delay settings, and `details.level`. Exported `isPassed(metrics)` requires
at least 0.80 route/turn accuracy; Home Direction must select the closest 45-degree
sector (`angularErrorDeg <= 22.5`). The future route owns `saveSession`, persistent
level progress, and LevelCleared/GameResult; it must not auto-chain in shared warm-up
mode.
