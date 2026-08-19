# Object Tracker · isolated module specification

Status: local G5 implementation candidate. Integration, catalog, persistence,
shared warm-up wiring, and release remain outside this module.

## Product loop

The player sees 4–12 identical objects. One to five targets receive a temporary
ring, then every ring disappears and the objects move. When motion stops, the player
selects the remembered targets and submits. Result reports hits, misses, and false
selections separately.

Speed, duration, and center-convergence/close-approach pressure progress on separate
level schedules. Object physics uses a fixed-step deterministic integrator with wall
reflection, circle separation, and elastic pair response. Objects remain inside the
field, never overlap, and never jump across a fixed substep. The same normalized seed
and level reproduce initial state, targets, and trajectory.

The exported integration range is finite: `LEVELS = 41`.

| Levels | Honest content progression |
| --- | --- |
| 1–8 | 4–6 objects, 1 target, rising motion and close-approach pressure |
| 9–16 | 6–9 objects, 2 targets |
| 17–24 | 9–11 objects, 3 targets |
| 25–32 | 12 objects, 4 targets; speed reaches its maximum tier |
| 33–40 | 12 objects, 5 targets; longer tracking and closer approaches |
| 41 | All five content axes at their maximum supported tier |

Motion duration is stimulus load: the player must track the targets for longer. It
is not a response countdown and cannot end selection early.

## Motion lifecycle

The React Native adapter owns exactly one `requestAnimationFrame` loop. It starts only
in `moving`, clamps frame deltas, and returns cancellation on phase change, AppState
backgrounding, pause, or unmount. The pure core owns no scheduler. Reduced-motion
mode starts no animation loop and exposes a user-controlled fixed-time step button;
it reaches the same selection phase instead of disabling the game.

The normalized physics radius is 0.068. At the accepted 359 px mobile field this is
48.8 px diameter. Interactive targets additionally enforce `minWidth/minHeight: 48`.

## Lifecycle and metrics

The pure state machine owns rules, target preview, motion, selection, pause, restart,
result, and dispose. Completion metrics include common accuracy/duration/difficulty/
errors/seed/version, `details.level`, object/target counts, hits, misses, false
selections, speed, motion duration, close-approach pressure, and actual close
approaches. Exported `isPassed(metrics)` requires at least 60% accuracy and no more
than one false selection. This makes one-target rounds exact while allowing one
swapped object in the hardest four/five-target rounds. The future route owns
`saveSession`, persistent level progress, and the final LevelCleared/GameResult UI;
it must not auto-chain in shared warm-up mode.
