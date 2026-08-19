# Dots Connect · isolated module specification

Status: local G2 implementation candidate. Integration, catalog registration,
shared warm-up wiring, persistence, and release remain outside this module.

## Product loop

1. A square board shows several endpoint pairs.
2. The player draws an orthogonal path between endpoints with the same symbol/color.
3. Paths cannot jump, cross, share a cell, or enter another pair's endpoint.
4. The round is complete only when every pair is joined and every cell is occupied.

The first board is mandatory training. It is not included in completion metrics.

## Guaranteed-solvable generation

The generator first builds a Hamiltonian traversal covering the complete grid, then
cuts it into contiguous path segments of at least two cells. Only each segment's two
endpoints are published to the player. Even boards use a rotated/reflected Hamiltonian
cycle; odd boards use a reflected/reversed serpentine path. This guarantees a complete
non-overlapping solution before endpoints exist.

An independent solver receives only the public endpoints. It enumerates the supported
Hamiltonian construction family, reconstructs candidate partitions, and validates
coverage and path legality without reading the stored solution or seed. Uniqueness is
not claimed or required for the MVP.

Progression grows from 4×4 to 8×8. Pair count and typical path length rise separately.
Seed normalization plus FNV-1a/mulberry32 makes every level reproducible. Generator
version: `dots-connect-generator-v1`.

The published route has LEVELS = 40. Levels 1–30 introduce the five board sizes
and three-to-eight pair counts; 31–40 are reproducible maximal-board planning
variants. Difficulty never grows by shortening a timer.

## Input rules

- Drag or press an endpoint to begin its path.
- Only orthogonally adjacent cells can be added.
- Moving back onto an earlier cell of the active path erases its tail.
- Starting on any already drawn cell truncates that same path there for correction.
- Other paths and other pairs' endpoints are blocked.
- Undo and restart operate on immutable snapshots and never mutate the puzzle.

Keyboard: arrows move the board cursor; while drawing they extend the active path.
Enter/Space begins or releases a path; Escape releases it; U undoes; R restarts; P
pauses. The board has an accessible adjustable/grid role, state text, labels, and a
visible focus/cursor. Every color is duplicated by a stable shape symbol.

## Metrics and lifecycle

Common completion metrics are `accuracy` 0..1, active `durationMs`, normalized
`difficulty`, `errors`, `score`, seed, and generator version. A clean solution has
accuracy 1. Backtracks, undo actions, and rejected moves reduce efficiency. Specific
metrics include board size, pair count, forward moves, backtracks, undo count,
invalid moves, optimal edges, path efficiency, and full coverage.

isPassed requires full coverage and at least 0.80 accuracy, which bounds
corrections to 25% of the optimal edge count. Metrics carry details.level for
progress recovery.

The pure state machine owns rules, training, play, pause, undo, restart, result, and
dispose. It has no timers, animation loops, storage, network, or global mutable state.
Pause time is excluded. `onComplete` is emitted exactly once for a fully covered main
board; training and incomplete sessions emit nothing. The future route owns
`saveSession` and must not auto-chain another level in shared warm-up mode.
