# One Line · isolated module specification

Status: local G3 implementation candidate. Integration, catalog, persistence,
shared warm-up wiring, and release remain outside this module.

## Product loop

Select a graph vertex, then draw one continuous trail through every edge exactly
once. Vertices may be revisited; edges may not. An unfinished or invalid trail is
never saved. The first graph is mandatory training and excluded from metrics.

## Guaranteed Euler construction

The generator starts with a cycle, attaches additional closed ears/cycles, and may
remove one non-bridge cycle edge. The resulting connected graph therefore has either
zero odd-degree vertices (Euler circuit) or exactly two (Euler trail). A separate
validator recomputes connectivity/degrees, and an independent Hierholzer solver must
consume every published edge before the level is accepted.

Generator version: `one-line-generator-v1`. Seed normalization plus FNV-1a and
mulberry32 is deterministic. Difficulty grows with vertices, edges, visual segment
crossings, and removal of the early valid-start marker.

The published route exports LEVELS = 48. Content grows from a guided four-vertex
circuit to twelve-vertex trail/circuit graphs with three closed triangles and
increasingly deceptive crossing layouts. Time pressure is not a difficulty axis.

## Interaction and topology

Only vertex hit targets can change the trail. A visual crossing point between two
unrelated segments is not an interactive edge or vertex, so it cannot select the
topologically foreign edge. Drag vertex-to-vertex and tap-step input share the same
core transition. Keyboard arrows move to the nearest vertex in that direction;
Enter selects it. U undoes, R restarts, H highlights legal adjacent choices without
moving, and P pauses.

Undo removes the most recent edge; restart preserves the generated graph. Hints only
highlight eligible starts or currently unused adjacent vertices and never apply a
move or reveal a complete route.

## Lifecycle and metrics

The pure state machine owns rules, training, play, pause, undo, hint, restart,
result, and dispose. It owns no timers, animation loops, storage, network calls, or
global mutable state. Pause time is excluded.

Completion metrics include common accuracy/duration/difficulty/errors/seed/version
plus vertex count, edge count, visual crossings, circuit/trail kind, undo count,
hint count, rejected moves, and path efficiency. `onComplete` fires once only after
all edges are used by one continuous legal trail. The future route owns `saveSession`
and must not auto-chain in shared warm-up mode.

isPassed requires accuracy >= 0.80 after a complete trail. Metrics include
details.level so application persistence can recover the played level.
