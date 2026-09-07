/* psygames-math-slider-generator · VER 5 · 07.09.2026 */
/**
 * Лестница v2 — ШКОЛЬНАЯ ОСЬ (задана Денисом 07.09.2026, дословно в counting-chat/PROJECT_REF §R):
 * усложняем МЕТОД ПОДСЧЁТА, как проходят в школе, до высшей математики:
 * сложение → вычитание → умножение → деление → десятичные → квадраты → проценты →
 * скидки → пропорции → кубы и вложенные степени («фрактал») → уравнения ax+b=c
 * (посчитал в голове → тянешь ползунок к x) → оценка корня √N → микс высших.
 *
 * ЧЕМ БЫЛА ПЛОХА v1 (замер 07.09.2026, counting-chat/sim-slider.mjs, N=500/уровень):
 * 44 номера = 6 ступеней работы, 38 из 43 переходов — клоны (level внутри полос
 * не использовался вовсе), и лестница не была монотонной (десятичные легче
 * умножения, микс L37+ легче скидок L29).
 *
 * УСТРОЙСТВО v2: 12 полос по 4 уровня + B13 (L49+) — квадратные уравнения
 * ax²+b=c, открытый хвост без клампа t. Внутри полосы позиция t МАСШТАБИРУЕТ
 * числа (ось «объём») — соседние уровни различимы. Приёмка симом 07.09.2026
 * (25 сидов × 20 вопросов/уровень): в зоне обещания L1–52 клонов (|Δ|<5%) 0,
 * обрывов (>×1,5) 0. За L53 рост работы замедляется (модель насыщается по
 * разрядам) — следующая ось хвоста: интеграл-оценка (формат согласуется, T5).
 * Слепок полос охраняет src/__tests__/math-slider-bands.test.ts — при правке
 * полос слепок обновляется В ТОМ ЖЕ коммите.
 */
import { expressionWork, questionWorkParts, WORK_NORM } from './work';
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

/** Последний уровень, который лестница ОБЕЩАЕТ (карте — как maxLevel). Выше — открытый хвост микса. */
export const SLIDER_MAX_LEVEL = 52;

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

  // Полосы шкалы привязаны к школьным полосам: B1 — только положительная,
  // B2 — со знаком, дальше ширина пляшет от величины ответа (универсально).
  if (level <= 4 && answer >= 0 && answer <= 100) {
    const width = pick(rng, [50, 75, 100] as const);
    const desiredMin = answer - width * (0.3 + rng() * 0.4);
    min = clamp(snap(desiredMin, 5), 0, 100 - width);
    max = min + width;
  } else if (level <= 8 && Math.abs(answer) <= 95) {
    const sampledWidth = pick(rng, [100, 150, 200] as const);
    const width = answer >= 0 && sampledWidth < answer + 5
      ? (answer + 5 <= 150 ? 150 : 200)
      : sampledWidth;
    const desiredMin = answer - width * (0.3 + rng() * 0.4);
    min = clamp(snap(desiredMin, 5), -100, 100 - width);
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

type Fam = { kind: ExpressionKind; expression: MathExpression };

/** B1: сложение; числа растут с t (30…150 в сумме). */
function addition(rng: Rng, t: number): Fam {
  const top = Math.round(30 + t * 65);   // потолок ≤95: ответ остаётся в узкой шкале B1, рост — переносами
  const answer = randomInt(rng, Math.round(5 + t * 55), top);
  // С ростом t слагаемые тянутся к середине — переносы через десяток чаще
  // ⚠️ floor + запас: при t=1 округление вверх давало lo > answer−lo (краш RangeError)
  // ≥1: при t=0 нижняя граница давала слагаемое 0 — вырожденный вопрос «0 + b»
  // (всплыло живьём 07.09 в тренировке, она всегда зовёт L1)
  const lo = Math.max(1, Math.min(Math.floor(answer * 0.5 * Math.min(0.96, t * 1.1)), Math.floor((answer - 1) / 2)));
  const left = randomInt(rng, lo, answer - lo);
  const pair = binary('+', literal(left), literal(answer - left));
  // С ростом t — три слагаемых (a + b + c): тот же класс, вторая ступень школы
  if (rng() >= t * 0.75) return { kind: 'integer-addition', expression: pair };
  const c = randomInt(rng, 5, 25);
  return { kind: 'integer-addition', expression: binary('+', pair, literal(c)) };
}

/** B2: вычитание со знаком; размах растёт с t (50…120). */
function subtraction(rng: Rng, t: number): Fam {
  const top = Math.round(50 + t * 45);   // потолок ≤95: ответ в знаковой шкале B2, рост — сближением операндов
  const negative = rng() < 0.45 + t * 0.4;   // доля отрицательных ответов растёт с t (старт полосы мягче конца сложения)
  const small = randomInt(rng, Math.round(t * top * 0.4), Math.round(top / 2));
  const big = randomInt(rng, small + 5, top);
  return {
    kind: 'signed-subtraction',
    expression: negative ? binary('-', literal(small), literal(big)) : binary('-', literal(big), literal(small)),
  };
}

/** B3: умножение — от таблицы к двузначным; с t>0.5 возвращается добавка ±c. */
function multiplication(rng: Rng, t: number): Fam {
  const a = randomInt(rng, 3, Math.round(6 + t * 10));
  const b = randomInt(rng, 2, Math.round(4 + t * 8));
  const product = binary('*', literal(a), literal(b));
  // Добавка ±c входит ПЛАВНО (доля = t), а не рубильником на середине полосы
  if (rng() >= t * 0.9) return { kind: 'mixed-small-multiplication', expression: product };
  const c = literal(randomInt(rng, 5, 60));
  return {
    kind: 'mixed-small-multiplication',
    expression: rng() < 0.5 ? binary('+', product, c) : binary('-', product, c),
  };
}

/** B4: деление нацело; делитель и частное растут с t. */
function division(rng: Rng, t: number): Fam {
  const b = randomInt(rng, 3, Math.round(4 + t * 8));
  const q = randomInt(rng, Math.round(3 + t * 5), Math.round(6 + t * 12));
  return { kind: 'integer-division', expression: binary('/', literal(b * q), literal(b)) };
}

/** B5: десятичные; величины растут с t. */
function decimalArithmetic(rng: Rng, t: number): Fam {
  const left = randomInt(rng, 20, Math.round(400 + t * 600)) / 10;
  const right = randomInt(rng, 10, Math.round(200 + t * 300)) / 10;
  const operator = rng() < 0.55 ? '+' : '-';
  const pair = binary(operator, literal(left), literal(right));
  // С ростом t — третий операнд (a ± b ± c); входит плавно, старт полосы без него
  if (rng() >= t * 0.6) return { kind: 'decimal-arithmetic', expression: pair };
  const third = randomInt(rng, 10, Math.round(100 + t * 200)) / 10;
  return { kind: 'decimal-arithmetic', expression: binary(rng() < 0.5 ? '+' : '-', pair, literal(third)) };
}

/** B6: квадраты n²; основание растёт с t (5…19). */
function square(rng: Rng, t: number): Fam {
  const base = randomInt(rng, Math.round(4 + t * 4), Math.round(9 + t * 12));
  return { kind: 'square-power', expression: { type: 'power', base: literal(base), exponent: 2 } };
}

/** B7: проценты; с t>0.5 базы некруглые. */
function percentage(rng: Rng, t: number): Fam {
  const easy = [5, 10, 20, 25, 30, 40, 50] as const;
  const hard = [12.5, 15, 35, 65, 75] as const;
  const percent = rng() < t * 0.8 ? pick(rng, hard) : pick(rng, easy);
  const base = rng() >= t ? randomInt(rng, 2, Math.round(20 + t * 20)) * 10 : randomInt(rng, 24, Math.round(200 + t * 300));
  return { kind: 'percentage', expression: { type: 'percent-of', percent, base } };
}

/** B8: скидки; с t>0.5 цены некруглые. */
function discount(rng: Rng, t: number): Fam {
  const percent = rng() < 0.15 + t * 0.7 ? pick(rng, [12.5, 15, 35, 45, 65] as const) : pick(rng, [5, 10, 20, 25, 30, 40, 50] as const);
  const price = rng() >= t ? randomInt(rng, 4, Math.round(30 + t * 20)) * 10 : randomInt(rng, 45, Math.round(280 + t * 400));
  return { kind: 'discount', expression: { type: 'discount', price, percent } };
}

/** B9: пропорции; множитель растёт с t. */
function proportion(rng: Rng, t: number): Fam {
  const leftNumerator = randomInt(rng, 2, Math.round(9 + t * 6));
  const leftDenominator = randomInt(rng, 2, 12);
  const multiplier = randomInt(rng, 3, Math.round(8 + t * 15));
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

/** B10: кубы и вложенные степени («фрактал», первая ступень: (a²)²). */
function cubeNested(rng: Rng, t: number): Fam {
  if (rng() >= t * 0.8) {
    const base = randomInt(rng, 3, Math.round(6 + t * 4));
    return { kind: 'cube-nested-power', expression: { type: 'power', base: literal(base), exponent: 3 } };
  }
  const base = randomInt(rng, 2, 4);
  const nested: MathExpression = { type: 'power', base: { type: 'power', base: literal(base), exponent: 2 }, exponent: 2 };
  if (rng() >= (t - 0.5) * 1.6) return { kind: 'cube-nested-power', expression: nested };
  // Конец полосы: (a²)² ± k — вложенная степень со сдвигом
  return { kind: 'cube-nested-power', expression: binary(rng() < 0.5 ? '+' : '-', nested, literal(randomInt(rng, 10, 90))) };
}

/** B11: уравнение ax+b=c — посчитал в голове, тянешь к x (Денис 07.09). */
function linearEquation(rng: Rng, t: number): Fam {
  const x = randomInt(rng, 4, Math.round(12 + t * 24));
  const a = randomInt(rng, 2, Math.round(4 + t * 6));
  const b = randomInt(rng, Math.round(-(10 + t * 40)), Math.round(10 + t * 40));
  return { kind: 'linear-equation', expression: { type: 'linear-equation', a, b, c: a * x + b } };
}

/** B12: оценка корня √N — ответ почти всегда нецелый, чистая прикидка. */
function rootEstimation(rng: Rng, t: number): Fam {
  // Старт полосы двузначным корнем (√100+) — вход L45 не проваливается ниже
  // конца уравнений L44 (замер 07.09: старая база 20..150 давала откат ×0,71)
  const value = randomInt(rng, Math.round(160 + t * 340), Math.round(400 + t * 1100));
  const root: MathExpression = { type: 'root-estimation', value };
  if (rng() >= 0.65 + t * 0.28) return { kind: 'root-estimation', expression: root };
  // Вторая ступень: √N ± k (с первого уровня ~четверть; k растёт с t)
  const k = literal(randomInt(rng, 5, Math.round(40 + t * 120)));
  const shifted = binary(rng() < 0.5 ? '+' : '-', root, k);
  if (rng() >= (t - 0.25) * 0.9) return { kind: 'root-estimation', expression: shifted };
  // Третья ступень (конец полосы): √N ± k ± m — разряды корня стоят на месте
  // всю полосу (digits=2), рост несут добавочные члены, иначе клоны L47–48
  return { kind: 'root-estimation', expression: binary(rng() < 0.5 ? '+' : '-', shifted, literal(randomInt(rng, 10, 60))) };
}

/**
 * B13+ (хвост): квадратные уравнения ax² + b = c — следующая ступень школьной
 * оси после линейных уравнений (B11) и корней (B12): посчитал (c−b)/a в голове,
 * оценил корень, тянешь к x. Замер 07.09: микс пройденных семейств НЕ может
 * стоять выше конца B12 (даже 100% самого тяжёлого — root 6,50 < 6,77),
 * поэтому хвост растёт МЕТОДОМ, а не пересдачей пройденного.
 * t сюда приходит ≥1 и растёт без клампа — ось чисел открыта.
 */
function quadEquation(rng: Rng, t: number): Fam {
  const g = Math.max(0, t - 1);
  // Калибровка стыка 07.09: старт s двузначным в основном (доля трёхзначных
  // ~0,4 на L49 → ~0,75 на L52) — вход ~×1,07 от конца B12, не скачок ×1,39
  const s = randomInt(rng, Math.round(35 + g * 150), Math.round(160 + g * 400));
  // Вторая растущая компонента: двузначный делитель a к концу зоны обещания
  // (разряды s насыщаются к L51 — один s рост не держит, клоны L51–52)
  const a = randomInt(rng, 2, Math.round(3 + g * 25));
  const b = randomInt(rng, Math.round(-(20 + g * 80)), Math.round(20 + g * 80));
  return { kind: 'quad-equation', expression: { type: 'quad-equation', a, b, c: a * s + b } };
}


/**
 * B14+ (хвост за квадратными уравнениями, ВЫБОР ДЕНИСА 07.09: «прогрессия»):
 * интеграл-оценка — площадь под графиком, полоса растит ФОРМУ внутри:
 * ступени (сумма прямоугольников) → ломаная (трапеции) → кривая (средняя
 * на глаз × ширина). Доли форм ПЛАВНЫЕ по g (рубильник = обрыв), числа
 * растут с g без потолка (§R). Площадь и рендер — одна кривая (expression.ts).
 */
function integralArea(rng: Rng, g: number): Fam {
  const pPoly = clamp((g - 0.3) * 1.4, 0, 1);
  // Кривая ВХОДИТ, но не вытесняет ломаную: перцептивная оценка дешевле счёта
  // трапеций, и при её доминировании хвост падал (замер 07.09: L61—67 ×0,85—0,99).
  // Медленный вход + кламп 0,55 — обе формы растут числами, микс растёт всегда.
  const pCurve = clamp((g - 0.9) * 0.5, 0, 0.55);
  const r = rng();
  const form: 'steps' | 'polyline' | 'curve' = r < pCurve ? 'curve' : r < pCurve + pPoly * (1 - pCurve) ? 'polyline' : 'steps';
  const n = 5 + Math.floor(g * 1.5 + rng() * 2);              // без клампа: ось «число интервалов» открыта (§R)
  const dx = 1 + Math.floor(g * 0.9 + rng() * 1.4);           // без клампа: ширина интервала растёт всегда
  const base = 6 + g * 8 + rng() * 6;
  const amp = base * (0.45 + 0.25 * rng()) * (form === 'curve' ? 1.25 : 1);
  const nodes = form === 'steps' ? n : n + 1;
  const phase = rng() * Math.PI * 2;
  // Частота волн растёт с g: у кривой на верхах негладкость (и мысленные куски
  // усреднения) — её собственная ось роста; при фикс-частоте rough не рос с n
  const freq = 0.9 + rng() * 1.1 + Math.max(0, g - 0.8) * 0.9;
  // ЗНАКОВЫЙ интеграл (выбор Дениса 07.09, «два цвета»): с ~L61 часть фигур
  // ныряет ниже нуля — ответ = разность площадей. Доля плавная; ровно там,
  // где одноцветный хвост выходил на плоскость модели (замер: L61+ ×0,99–1,03)
  const signed = rng() < clamp((g - 1) * 0.5, 0, 0.6);
  // Центр знаковой волны у нуля, но РАЗМАХ крупнее (×1,5): иначе |высоты|
  // мельчают и знаковый вопрос выходит ДЕШЕВЛЕ беззнакового (замер 07.09 —
  // ямы ×0,94–0,99 на L61–69 при вводе знаковости без масштаба)
  const shift = signed ? base * (0.8 + rng() * 0.4) : 0;
  const scale = signed ? 1.5 : 1;
  const floor = signed ? -Infinity : 1;
  const heights = Array.from({ length: nodes }, (_, i) => (
    Math.max(floor, Math.round(scale * (base - shift + amp * Math.sin(phase + (i * freq * Math.PI) / Math.max(1, nodes - 1)) + (rng() - 0.5) * amp * 0.5)))
  ));
  return { kind: 'integral-area', expression: { type: 'integral-area', form, dx, heights } };
}

const BANDS: readonly ((rng: Rng, t: number) => Fam)[] = [
  addition,        // B1  L1–4
  subtraction,     // B2  L5–8
  multiplication,  // B3  L9–12
  division,        // B4  L13–16
  decimalArithmetic, // B5 L17–20
  square,          // B6  L21–24
  percentage,      // B7  L25–28
  discount,        // B8  L29–32
  proportion,      // B9  L33–36
  cubeNested,      // B10 L37–40
  linearEquation,  // B11 L41–44
  rootEstimation,  // B12 L45–48
];

const BAND_SIZE = 4;

/** Позиция уровня в полосе, 0…1 (внутриполосный рост чисел). */
function bandT(level: number): number {
  return ((level - 1) % BAND_SIZE) / (BAND_SIZE - 1);
}

function expressionForLevel(level: number, rng: Rng): Fam {
  const bandIndex = Math.floor((level - 1) / BAND_SIZE);
  if (bandIndex < BANDS.length) return BANDS[bandIndex](rng, bandT(level));
  // B13 (L49–52): квадратные уравнения — с ростом чисел без клампа (замер
  // 07.09: старый микс давал откат ×0,67 и клоны L50–52).
  if (level <= SLIDER_MAX_LEVEL) return quadEquation(rng, 1 + (level - BANDS.length * BAND_SIZE) / 10);
  // B14+ (L53+): интеграл-оценка, открытый хвост — прогрессия форм по g,
  // числа растут всегда (§R). quad для 49–52 НЕ сдвинут ни на бит.
  return integralArea(rng, (level - 53) / 8);
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
    // difficulty — от РАБОТЫ вопроса (core/work.ts), не от номера уровня:
    // замер 07.09.2026 (counting-chat/probe-difficulty.mjs) — номерное d было
    // слепо к содержимому внутри уровня (спирмен d↔работа = −0,015), а от d
    // живёт окно времени в scoring.ts. Норма калибрует верх к d≈0,85–1.
    const expressionDifficulty = clamp(expressionWork(expression) / WORK_NORM, 0, 1);
    const difficulty = clamp(questionWorkParts(expression, answer, scale) / WORK_NORM, 0, 1);
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

/**
 * МИГРАЦИЯ прогресса лестницы v1 (полосы: 1–5 слож · 6–10 выч · 11–20 умн ·
 * 21–24 дес · 25–28 проц · 29–32 скид · 33–36 проп · 37+ микс) в v2 —
 * по СЕМЕЙСТВУ, на котором игрок стоял: прогресс не сгорает, знакомое остаётся.
 */
export function migrateSliderLevelV1toV2(oldLevel: number): number {
  const L = Math.max(1, Math.floor(oldLevel));
  if (L <= 5) return Math.min(4, L);                       // сложение → B1
  if (L <= 10) return 5 + Math.min(3, L - 6);              // вычитание → B2
  if (L <= 20) return 9 + Math.min(3, Math.floor((L - 11) / 3)); // умножение → B3
  if (L <= 24) return 17 + (L - 21);                       // десятичные → B5
  if (L <= 28) return 25 + (L - 25);                       // проценты → B7
  if (L <= 32) return 29 + (L - 29);                       // скидки → B8
  if (L <= 36) return 33 + (L - 33);                       // пропорции → B9
  return 37;                                               // микс v1 → начало высших (кубы)
}
