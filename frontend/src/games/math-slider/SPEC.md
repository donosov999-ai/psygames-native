# Math Slider · isolated module specification

Status: local G1 implementation candidate. Integration, catalog registration,
shared warm-up wiring, and release remain outside this module.

## Product loop

1. Show an explicitly formatted expression.
2. The player estimates the result and places a marker on a number line.
3. Confirmation reveals the exact answer, the estimate, normalized absolute
   error, and signed error.
4. The next question starts only after an explicit action. The module never
   starts another level or warm-up step by itself.

The first interaction is a training attempt. It is excluded from metrics and
never reaches `onComplete`.

## Progression

| Levels | Expression family | Constraints |
|---|---|---|
| 1–5 | two-integer addition | answers and scale stay within 0–100 |
| 6–10 | subtraction | signed answers and a scale with negative values |
| 11–20 | 3–4 operands | one small multiplication, explicit parentheses |
| 21–24 | decimal arithmetic | one decimal place, explicit operation |
| 25–28 | percentage | percent-of form |
| 29–32 | discount | explicit `price × (1 − percent)` form |
| 33–36 | proportion | non-zero denominator, exact approachable result |
| 37+ | mixed advanced pool | decimals, percentages, discounts, proportions |

Scale width and tick density use independent random draws. Expression
difficulty and scale difficulty are exposed separately in every question.

## Determinism and expression safety

- Canonical seed: trimmed, lower-case, whitespace/underscores normalized to `-`.
- Generator version: `math-slider-generator-v1`.
- FNV-1a + mulberry32 supplies deterministic randomness.
- Expressions are typed trees; no `eval`, string parsing, or implicit order of
  operations is used.
- Mixed arithmetic is printed with explicit parentheses.
- Proportion denominators are always non-zero.

## Scoring contract

For a question with scale width `W`:

```text
normalizedError       = abs(estimate - answer) / W
normalizedSignedError = (estimate - answer) / W
accuracy              = clamp(1 - normalizedError, 0, 1)
```

Positive signed error means overestimation; negative means underestimation.
An `error` is counted when normalized error is greater than 10%.

Speed is a strict tie-break, not a substitute for accuracy:

```text
accuracyUnits = round(accuracy × 1000)
speedTieBreak = 0..9
score         = accuracyUnits × 10 + speedTieBreak
```

Therefore one accuracy unit (0.1 percentage point) always beats the complete
speed bonus.

## Session and persistence boundary

The pure state machine owns rules, training, play, feedback, pause, restart,
and result phases. It has no timers, animation loops, storage, network calls,
or global mutable state. Pause time is excluded from active duration.

`MathSliderGame` emits `onComplete(metrics)` exactly once after the final
feedback is explicitly advanced to the result screen. Leaving, unmounting,
pausing, or restarting before then emits nothing. The future PsyGames route is
responsible for mapping that completed callback to `saveSession`.

## Input and accessibility

- Touch/mouse drag and tap use the full 88 px number-line hit area.
- The visual marker is 28×42 px and the interactive track exceeds the 48 px
  minimum touch target.
- Arrow keys adjust one fine step; Page Up/Down adjust one major tick; Home/End
  go to bounds; Enter/Space confirms.
- Native accessibility role is `adjustable`; web role is `slider`, with label,
  hint, min/max/current value, and increment/decrement actions.
- Focus is visibly outlined on web.
- There are no motion-dependent mechanics. The browser harness also disables
  transitions under `prefers-reduced-motion`.

## Metrics

The completion payload contains the common contract:

- `accuracy` in 0..1;
- `durationMs` excluding pauses;
- normalized `difficulty` in 0..1;
- `errors`;
- `score`;
- `seed` and generator version.

Specific metrics include mean absolute normalized error, mean signed error,
normalized bias, bias direction, over/under/exact counts, and speed tie-break
total.
