# Faces & Names · isolated module specification

Status: local G4 implementation candidate. Integration, catalog, persistence,
shared warm-up wiring, and release remain outside this module.

## Content boundary

Every portrait is a procedural SVG assembled locally from geometric parameters.
The profile library contains no photographs, contacts, address-book data, remote
URLs, real-user identifiers, or demographic labels. Each synthetic asset, profile
ID, name, and neutral fact is unique. Names and abstract portraits are deliberately
decoupled from demographic assumptions; accessibility text describes only visual
shape and styling.

## Product loop

The player studies one synthetic portrait, exact written name, and neutral fact at
a time. A user-paced arithmetic interference phase follows; it owns no countdown or
timer. Recall then measures three components independently: choose a previously seen
face among controlled novel distractors, select its exact name, and at higher levels
select its fact. A wrong answer never contaminates the following component: name and
fact questions still use the intended target portrait.

Progression grows from 2 to 12 people. Early levels choose visually and textually
distinct profiles, preserve study order, use one interference item, and omit fact
recall. Later levels increase face/name similarity, shuffle target order, extend the
interference phase, add closer distractors, and enable fact recall.

The published route exports LEVELS = 33, the point where set size, four-choice
distractors, similarity, fact recall, and six user-paced interference prompts reach
their designed maxima. Time pressure is not a difficulty axis.

## Lifecycle and metrics

The pure state machine owns rules, study, interference, face recognition, name
recall, optional fact recall, pause, restart, result, and dispose. It owns no timers,
animation loops, storage, network calls, media permissions, or global mutable state.
Pause time is excluded.

Completion reports common accuracy/duration/difficulty/errors/seed/version plus
separate face-recognition, name-recall, and fact-recall totals, interference count,
profile count, and generated similarity diagnostics. `onComplete` fires once only
after every recall component. The future route owns `saveSession` and must not
auto-chain in shared warm-up mode.

isPassed requires 0.75 overall accuracy, at least 0.60 face and name accuracy, and
0.50 fact accuracy when enabled. Metrics include details.level for progress recovery.
