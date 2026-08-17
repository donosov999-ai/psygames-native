import { binary, evaluateExpression, literal, roundNumber } from './expression';
import { createRng, normalizeSeed, pick, randomInt, type Rng } from './rng';
import {
  MATH_SLIDER_GENERATOR_VERSION,
  type ExpressionKind,
  type MathExpression,
  type MathSliderQuestion,
  type MathSliderScale,
} from './types';

const SCALE_DENSITIES = [4, 5, 8, 10] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function niceCeiling(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const fraction = value / magnitude;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return niceFraction * magnitude;
}

function snap(value: number, step: number): number {
  return roundNumber(Math.round(value / step) * step, 6);
}

function precisionFor(step: number): number {
  if (step >= 1 && Number.isInteger(step)) return 0;
  if (step >= 0.1) return 1;
  return 2;
}

function makeScale(answer: number, level: number, rng: Rng): MathSliderScale {
  const tickCount = pick(rng, SCALE_DENSITIES);
  let min: number;
  let max: number;

  // Expression complexity and scale complexity deliberately consume separate
  // random draws. A denser scale is not silently tied to a harder expression.
  if (level <= 5) {
    const width = pick(rng, [50, 75, 100] as const);
    const desiredMin = answer - width * (0.3 + rng() * 0.4);
    min = clamp(snap(desiredMin, 5), 0, 100 - width);
    max = min + width;
  } else if (level <= 10) {
    const sampledWidth = pick(rng, [100, 150, 200] as const);
    // A positive answer near +100 still needs visible negative scale space.
    // Widen instead of shifting the answer outside the upper bound.
    const width = answer >= 0 && sampledWidth < answer + 5
      ? (answer + 5 <= 150 ? 150 : 200)
      : sampledWidth;
    const desiredMin = answer - width * (0.3 + rng() * 0.4);
    min = clamp(snap(desiredMin, 5), -100, 100 - width);
    // Signed levels always expose a negative part of the scale.
    if (min >= 0) min = -5;
    max = min + width;
  } else {
    const factor = pick(rng, [1.4, 1.9, 2.6] as const);
    const width = niceCeiling(Math.max(20, Math.abs(answer) * factor + 10));
    const position = 0.3 + rng() * 0.4;
    const snapStep = niceCeiling(width / 20);
    min = snap(answer - width * position, snapStep);
    max = min + width;
    if (answer < min) {
      min = snap(answer - width * 0.2, snapStep);
      max = min + width;
    } else if (answer > max) {
      max = snap(answer + width * 0.2, snapStep);
      min = max - width;
    }
  }

  min = roundNumber(min, 6);
  max = roundNumber(max, 6);
  const width = roundNumber(max - min, 6);
  const majorStep = roundNumber(width / tickCount, 6);
  const rawKeyboardStep = majorStep / 5;
  const keyboardStep = roundNumber(
    rawKeyboardStep >= 1 ? Math.max(1, niceCeiling(rawKeyboardStep) / 2) : Math.max(0.01, niceCeiling(rawKeyboardStep) / 2),
    4,
  );
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => (
    roundNumber(min + majorStep * index, 4)
  ));

  return {
    min,
    max,
    width,
    majorStep,
    keyboardStep,
    tickCount,
    ticks,
    precision: precisionFor(Math.min(majorStep, keyboardStep)),
  };
}

function addition(rng: Rng): { kind: ExpressionKind; expression: MathExpression } {
  const answer = randomInt(rng, 5, 100);
  const left = randomInt(rng, 0, answer);
  return {
    kind: 'integer-addition',
    expression: binary('+', literal(left), literal(answer - left)),
  };
}

function subtraction(rng: Rng): { kind: ExpressionKind; expression: MathExpression } {
  const negative = rng() < 0.6;
  if (negative) {
    const left = randomInt(rng, 0, 50);
    const right = randomInt(rng, left + 5, 100);
    return { kind: 'signed-subtraction', expression: binary('-', literal(left), literal(right)) };
  }
  const right = randomInt(rng, 0, 50);
  const left = randomInt(rng, right + 5, 100);
  return { kind: 'signed-subtraction', expression: binary('-', literal(left), literal(right)) };
}

function mixedMultiplication(rng: Rng): { kind: ExpressionKind; expression: MathExpression } {
  const product = binary('*', literal(randomInt(rng, 2, 12)), literal(randomInt(rng, 2, 9)));
  const third = literal(randomInt(rng, 5, 80));
  const fourth = literal(randomInt(rng, 1, 30));
  switch (randomInt(rng, 0, 3)) {
    case 0: return { kind: 'mixed-small-multiplication', expression: binary('+', product, third) };
    case 1: return { kind: 'mixed-small-multiplication', expression: binary('-', third, product) };
    case 2: return { kind: 'mixed-small-multiplication', expression: binary('-', binary('+', product, third), fourth) };
    default: return { kind: 'mixed-small-multiplication', expression: binary('+', binary('-', third, product), fourth) };
  }
}

function decimalArithmetic(rng: Rng): { kind: ExpressionKind; expression: MathExpression } {
  const left = randomInt(rng, 20, 999) / 10;
  const right = randomInt(rng, 10, 500) / 10;
  const operator = rng() < 0.55 ? '+' : '-';
  return {
    kind: 'decimal-arithmetic',
    expression: binary(operator, literal(left), literal(right)),
  };
}

function percentage(rng: Rng): { kind: ExpressionKind; expression: MathExpression } {
  const percent = pick(rng, [5, 10, 12.5, 15, 20, 25, 30, 40, 50, 75] as const);
  const base = randomInt(rng, 2, 30) * 10;
  return { kind: 'percentage', expression: { type: 'percent-of', percent, base } };
}

function discount(rng: Rng): { kind: ExpressionKind; expression: MathExpression } {
  const percent = pick(rng, [5, 10, 15, 20, 25, 30, 40, 50] as const);
  const price = randomInt(rng, 4, 40) * 10;
  return { kind: 'discount', expression: { type: 'discount', price, percent } };
}

function proportion(rng: Rng): { kind: ExpressionKind; expression: MathExpression } {
  const leftNumerator = randomInt(rng, 1, 9);
  const leftDenominator = randomInt(rng, 2, 12);
  const multiplier = randomInt(rng, 2, 10);
  return {
    kind: 'proportion',
    expression: {
      type: 'proportion',
      leftNumerator,
      leftDenominator,
      rightDenominator: leftDenominator * multiplier,
    },
  };
}

function expressionForLevel(level: number, rng: Rng): { kind: ExpressionKind; expression: MathExpression } {
  if (level <= 5) return addition(rng);
  if (level <= 10) return subtraction(rng);
  if (level <= 20) return mixedMultiplication(rng);
  if (level <= 24) return decimalArithmetic(rng);
  if (level <= 28) return percentage(rng);
  if (level <= 32) return discount(rng);
  if (level <= 36) return proportion(rng);
  return pick(rng, [decimalArithmetic, percentage, discount, proportion] as const)(rng);
}

export function generateMathSliderQuestions(
  seed: string,
  level: number,
  count = 8,
): MathSliderQuestion[] {
  const normalizedSeed = normalizeSeed(seed);
  const safeLevel = Math.max(1, Math.floor(level));
  const safeCount = clamp(Math.floor(count), 1, 20);
  const rng = createRng(`${normalizedSeed}|${safeLevel}|${MATH_SLIDER_GENERATOR_VERSION}`);

  return Array.from({ length: safeCount }, (_, index) => {
    const { kind, expression } = expressionForLevel(safeLevel, rng);
    const answer = evaluateExpression(expression);
    const scale = makeScale(answer, safeLevel, rng);
    const scaleDifficulty = (scale.tickCount - 4) / 6;
    const expressionDifficulty = clamp((safeLevel - 1) / 39, 0, 1);
    const difficulty = clamp(expressionDifficulty * 0.85 + scaleDifficulty * 0.15, 0, 1);
    return {
      id: `${normalizedSeed}:${safeLevel}:${index}`,
      index,
      level: safeLevel,
      kind,
      expression,
      answer,
      scale,
      difficulty: roundNumber(difficulty, 6),
      expressionDifficulty: roundNumber(expressionDifficulty, 6),
      scaleDifficulty: roundNumber(scaleDifficulty, 6),
      seed: normalizedSeed,
      generatorVersion: MATH_SLIDER_GENERATOR_VERSION,
    };
  });
}

export function generateTrainingQuestion(seed: string): MathSliderQuestion {
  return generateMathSliderQuestions(`${normalizeSeed(seed)}-training`, 1, 1)[0] as MathSliderQuestion;
}
