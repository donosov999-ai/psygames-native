import { isAdjacent } from './grid';
import { randomHamiltonianPath } from './orders';
import { createRng, normalizeSeed, randomInt, shuffle, type Rng } from './rng';
import { DOTS_TIERS, dotsTierRank, solveDotsPuzzleAt, type DotsTier } from './solver';
import {
  DOTS_CONNECT_GENERATOR_VERSION,
  LEVELS,
  type Cell,
  type DotsPair,
  type GeneratedDotsPuzzle,
} from './types';

/**
 * ЦВЕТА ПАР — РАЗВЕДЕНЫ ЗАМЕРОМ, А НЕ ПОДОБРАНЫ НА ГЛАЗ.
 *
 * 🔴 ЧТО БЫЛО. Сначала `#0f766e` спорил с `#047857` (разница по CIELAB ΔE 15.9),
 * а `#9d174d` с `#be123c` (22.8): на доске из трёх пар две читались как «два
 * красных». Это вылечили в августе восьмицветной палитрой с минимумом ΔE 30.1.
 *
 * 🔴 ЧТО СЛОМАЛОСЬ ПОТОМ. Восемь цветов — это ПОТОЛОК В ВОСЕМЬ ПАР, и вся
 * лесенка упиралась в него с 26-го уровня: доска 8×8, восемь пар, и дальше
 * пятнадцать уровней одного и того же. Образец (Flow Free) к этому месту даёт
 * десять-четырнадцать цветов на плотной сетке. Значит палитру надо было не
 * подкрасить, а расширить до четырнадцати, НЕ потеряв различимости.
 *
 * ЧЕМ МЕРЯНО. Перебор по сетке sRGB с двумя условиями сразу: максимум
 * МИНИМАЛЬНОГО расстояния ΔE по всей палитре и контраст белого значка внутри
 * точки не ниже 4.5 (иначе символ — вторая опора дальтоника — исчезает).
 * Результат замера 22.08.2026: 14 цветов, минимум ΔE 36.5 (худшая пара
 * `#6b0d1f`~`#8f6076`), худший контраст 4.71. То есть цветов стало почти вдвое
 * больше, а различимость ВЫРОСЛА против прежних 30.1. Сторожит
 * `dots-palette.test.ts`, порог там 28.
 */
export const DOTS_PAIR_STYLES = [
  { color: '#d81b3c', symbol: '●' },
  { color: '#1a3ae0', symbol: '■' },
  { color: '#0b7a12', symbol: '▲' },
  { color: '#b81ecc', symbol: '◆' },
  { color: '#a35208', symbol: '★' },
  { color: '#12757f', symbol: '✚' },
  { color: '#660a6b', symbol: '✖' },
  { color: '#0a3563', symbol: '⬢' },
  { color: '#d21f7a', symbol: '▼' },
  { color: '#6e6b12', symbol: '⬟' },
  { color: '#0b74d4', symbol: '✦' },
  { color: '#6b0d1f', symbol: '❖' },
  { color: '#0d3f14', symbol: '◉' },
  { color: '#8f6076', symbol: '▣' },
] as const;

/** Сколько пар физически можно раскрасить. Больше цветов нет — и не выдумываем. */
export const DOTS_MAX_PAIRS = DOTS_PAIR_STYLES.length;

export interface DotsLevelPlan {
  size: number;
  pairCount: number;
  minPathLength: number;
}

/**
 * ЛЕСЕНКА УРОВНЕЙ. Замер того, ЧТО БЫЛО (генератор v1, прогон 22.08.2026):
 *
 *   L1–5   4×4, 3 пары   ·  L6      4×4, 4 пары
 *   L7–10  5×5, 4 пары   ·  L11–12  5×5, 5 пар
 *   L13–15 6×6, 5 пар    ·  L16–18  6×6, 6 пар
 *   L19–20 7×7, 6 пар    ·  L21–24  7×7, 7 пар
 *   L25    8×8, 7 пар    ·  L26–40  8×8, 8 пар
 *
 * 🔴 ТРИ ДЫРЫ, ВИДНЫЕ ПРЯМО В ЭТИХ ЧИСЛАХ.
 *
 * 1. НАЧАЛО ПУСТОЕ. Третий уровень — доска 4×4 на ТРИ пары. Шестнадцать клеток,
 *    шесть точек; владелец продукта сыграл его и сказал прямо: это не игра, а
 *    заготовка. У образца (Flow Free) стартовый пакет — 5×5 на четыре-пять пар,
 *    и уже там доска выглядит доской.
 * 2. ПОЛЕ СТОИТ НА МЕСТЕ. 4×4 держалось ШЕСТЬ уровней подряд, а 8×8 —
 *    ПЯТНАДЦАТЬ. Пятнадцать уровней, отличающихся только случайной раскладкой,
 *    — это не лесенка, это один уровень пятнадцать раз.
 * 3. ПОТОЛОК В ВОСЕМЬ ПАР был не решением, а следствием: в палитре лежало ровно
 *    восемь цветов (см. DOTS_PAIR_STYLES выше).
 *
 * ЧТО СТАЛО. Таблица ниже, 40 строк, три оси сразу:
 *   · размер поля 5→10 (никогда не стоит больше ТРЁХ уровней подряд);
 *   · число пар 4→14 (растёт монотонно, назад не откатывается);
 *   · нижняя граница длины пути 3→5 (пара из двух соседних точек — подарок,
 *     и на верхних уровнях его нет).
 *
 * ⚠️ ПОЧЕМУ НАВЕРХУ РАЗМЕР КОЛЕБЛЕТСЯ, А НЕ РАСТЁТ. Сорок уровней и потолок
 * 10×10 не дают расти монотонно: 40/6 ≈ 7 уровней на каждый размер, то есть
 * ровно та же болезнь «поле стоит на месте». Поэтому с 16-го уровня размер
 * ходит по верхней полосе 8–10, а сложность несёт ПЛОТНОСТЬ: 12 пар на 8×8
 * плотнее, чем 12 пар на 10×10, и планировать там труднее. Обе величины,
 * которые обязаны только расти (число пар и нижняя длина пути), растут.
 *
 * 🔴 ПЛОТНОСТЬ ИМЕЕТ НИЖНЮЮ ГРАНИЦУ, И ЭТО НЕ ВКУСОВЩИНА. Первая редакция
 * таблицы ставила 10×10 уже на 16-й уровень — с девятью парами. Сто клеток на
 * девять путей значит СРЕДНИЙ ПУТЬ В ОДИННАДЦАТЬ КЛЕТОК: игрок ведёт девять
 * длинных змей вместо того, чтобы решать головоломку, а независимый решатель на
 * двух раскладках из 320 не находил решения за четыре миллиона шагов (замер
 * 22.08.2026). Обе беды — одна и та же: доска слишком разрежена. Правило:
 * 10×10 — только от двенадцати пар, 9×9 — от девяти. Средний путь нигде не
 * длиннее ≈9 клеток.
 *
 * ⚠️ ПОЧЕМУ ПОТОЛОК 10×10, А НЕ БОЛЬШЕ. Клетка на телефоне шириной 360 px при
 * 10×10 — 34 px, это ещё палец. 12×12 дало бы 28 px, и промахи начались бы не
 * от планирования, а от попадания.
 */
const LEVEL_PLAN: readonly (readonly [size: number, pairs: number, minLen: number])[] = [
  [5, 4, 3], [5, 4, 3], [5, 5, 3],        // 1–3    знакомство: доска уже плотная
  [6, 6, 3], [6, 6, 3], [6, 6, 3],        // 4–6    ⚠️ шесть пар, а не пять — см. ниже
  [7, 6, 3], [7, 7, 3], [7, 7, 3],        // 7–9
  [8, 7, 3], [8, 8, 3], [8, 8, 3],        // 10–12
  [9, 9, 3], [9, 9, 3], [9, 10, 3],       // 13–15  потолок «ступеньками» достигнут
  [8, 10, 3], [9, 10, 4], [8, 11, 4],     // 16–18  дальше растёт плотность
  [9, 11, 4], [10, 12, 4], [9, 12, 4],    // 19–21  10×10 — только от 12 пар
  [8, 12, 4], [10, 12, 4], [9, 12, 4],    // 22–24
  [8, 13, 4], [10, 13, 4], [9, 13, 5],    // 25–27
  [10, 13, 5], [9, 13, 5], [10, 14, 5],   // 28–30
  [9, 14, 5], [10, 14, 5], [9, 14, 5],    // 31–33
  [10, 14, 5], [9, 14, 5], [10, 14, 5],   // 34–36
  [9, 14, 5], [10, 14, 5], [9, 14, 5],    // 37–39
  [10, 14, 5],                            // 40
];

/**
 * ⚠️ ПОЧЕМУ НА ЧЕТВЁРТОМ УРОВНЕ ШЕСТЬ ПАР, А НЕ ПЯТЬ (правка 23.08.2026).
 * Уровням 4–6 назначена ступень «от противного» (`dotsLevelTier`), то есть
 * доска обязана ВЫВОДИТЬСЯ, а выводимость держится на плотности: чем длиннее
 * пути, тем меньше в клетках вынужденного. 6×6 на ПЯТЬ пар — самая разреженная
 * доска в этой полосе (средний путь 7.2 клетки), и отбор доски нужной ступени
 * стоил там 235 мс в среднем и 1.3 с в худшем случае — на глазах у человека,
 * при открытии уровня. С шестью парами (средний путь 6) то же самое стоит 96 мс
 * и 0.3 с. Правило «число пар только растёт» не нарушено: на третьем уровне их
 * пять, на пятом и шестом — тоже шесть.
 */

/** Тренировочная доска. Маленькая — она учит ПРАВИЛУ, а не сложности. */
export const DOTS_TRAINING_PLAN: DotsLevelPlan = { size: 4, pairCount: 4, minPathLength: 3 };

/**
 * ⚠️ ТРЕНИРОВКА ОБЯЗАНА БЫТЬ ВЫВОДИМОЙ ЦЕЛИКОМ. Она учит правилу «занять всю
 * сетку», и доска, где без догадки не обойтись, учила бы ровно обратному —
 * «тыкай, потом разберёшься». Ступень тут не для сложности, а для честности
 * обучения.
 */
export const DOTS_TRAINING_TIER: DotsTier = 'forced';

/**
 * Сколько раз пересобирать доску, добиваясь нужной ступени. Не бюджет качества,
 * а страховка от вечного цикла: по замеру хватает десятков попыток.
 */
export const DOTS_TIER_ATTEMPTS = 4_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function dotsLevelPlan(level: number): DotsLevelPlan {
  const safeLevel = Math.max(1, Math.floor(level) || 1);
  const row = LEVEL_PLAN[Math.min(safeLevel, LEVEL_PLAN.length) - 1] as readonly [number, number, number];
  return { size: row[0], pairCount: row[1], minPathLength: row[2] };
}

/**
 * СТУПЕНЬ РАССУЖДЕНИЯ, НАЗНАЧЕННАЯ УРОВНЮ, — ЧЕТВЁРТАЯ ОСЬ ЛЕСЕНКИ.
 *
 * 🔴 ЧТО БЫЛО. Три оси таблицы выше (размер, число пар, длина пути) описывают
 * РАЗМЕР задачи и молчат о том, сколько на доске надо СООБРАЗИТЬ. Замер
 * 23.08.2026 показал, во что это вылилось: доля досок, закрываемых одними
 * вынужденными ходами, была 2/60 на первом уровне и 0/60 на десятом,
 * двадцатом, тридцатом и сороковом — то есть ВСЯ лесенка, от первого уровня до
 * сорокового, стояла на одной и той же верхней ступени «без догадки не
 * закрыть». По рассуждению лесенки не было вовсе.
 *
 * ЧТО СТАЛО. Уровню назначается ступень, и генератор обязан выдать доску именно
 * этой ступени (см. `buildForTier`). Границы взяты не с потолка, а по замеру
 * достижимости (числа — в шапке `dots-difficulty-ladder.test.ts`):
 *   · 5×5 — досок, закрываемых вынужденно, 3–16%, отбор стоит 4–20 мс в среднем;
 *   · 6×6 — 2–3%, отбор 39–50 мс в среднем, до 180 мс в худшем случае;
 *   · 7×7 и выше — 0 из 300: доска, целиком выводимая без догадок, там просто
 *     не встречается, и требовать её значило бы вешать человека на минуту.
 * Отсюда: 1–3 «вынужденный», 4–6 «от противного», 7–40 «перебор».
 *
 * ⚠️ ТАБЛИЦЕЙ, А НЕ ЦЕПОЧКОЙ `if`. Четвёртая ступень (если появится в
 * `DOTS_TIERS`) вписывается сюда одной строкой.
 */
const TIER_PLAN: readonly (readonly [upToLevel: number, tier: DotsTier])[] = [
  [3, 'forced'],
  [6, 'contradiction'],
  [LEVELS, 'search'],
];

export function dotsLevelTier(level: number): DotsTier {
  const safeLevel = Math.max(1, Math.floor(level) || 1);
  for (const [upTo, tier] of TIER_PLAN) if (safeLevel <= upTo) return tier;
  return (TIER_PLAN[TIER_PLAN.length - 1] as readonly [number, DotsTier])[1];
}

/**
 * Нормализованная сложность 0..1. Считается ТОЛЬКО из величин, которые по
 * таблице растут монотонно (номер уровня, число пар, нижняя длина пути,
 * ступень рассуждения). Размер поля сюда не входит намеренно: наверху он
 * колеблется по замыслу, и тянуть его в скаляр значило бы получить «сложность
 * то вверх, то вниз».
 *
 * ⚠️ СТУПЕНЬ БЕРЁТСЯ ПО УРОВНЮ, А НЕ ПО ФАКТУ ДОСКИ. Сложность — свойство
 * ЗАМЫСЛА уровня, и она обязана быть одинаковой у всех досок этого уровня;
 * фактическая ступень конкретной доски лежит отдельно, в `puzzle.tier`.
 */
function difficultyOf(level: number, plan: DotsLevelPlan): number {
  const levelPart = clamp((level - 1) / (LEVELS - 1), 0, 1);
  const pairPart = clamp((plan.pairCount - 4) / (DOTS_MAX_PAIRS - 4), 0, 1);
  const lengthPart = clamp((plan.minPathLength - 3) / 2, 0, 1);
  const tierPart = clamp(dotsTierRank(dotsLevelTier(level)) / (DOTS_TIERS.length - 1), 0, 1);
  return round(levelPart * 0.45 + pairPart * 0.3 + lengthPart * 0.1 + tierPart * 0.15);
}

/**
 * ДЛИНЫ КУСКОВ, НА КОТОРЫЕ РЕЖЕТСЯ ПУТЬ.
 *
 * 🔴 БЫЛО: каждому куску две клетки, остаток раздавался случайным индексам без
 * всякого потолка. Результат на 4×4 — куски вида 2/2/12: две пары соединялись
 * одним движением, а третья змея накрывала три четверти доски. Игрок видел
 * «почти пустое поле с одной длинной кишкой».
 *
 * СТАЛО: нижняя граница приходит из уровня (3→5 клеток), сверху стоит потолок
 * ≈1.7 от средней длины — одна пара не может съесть доску. Потолок поднимается
 * сам, если раздать остаток иначе некуда: раскладка обязана собраться ВСЕГДА.
 */
function segmentLengths(totalCells: number, pairCount: number, minLength: number, rng: Rng): number[] {
  if (totalCells < pairCount * minLength) {
    throw new RangeError(`Нельзя нарезать ${totalCells} клеток на ${pairCount} путей по ${minLength}`);
  }
  const lengths = Array.from({ length: pairCount }, () => minLength);
  let remaining = totalCells - pairCount * minLength;
  let cap = Math.max(minLength + 2, Math.ceil((totalCells / pairCount) * 1.7));
  while (remaining > 0) {
    const open: number[] = [];
    for (let index = 0; index < pairCount; index += 1) {
      if ((lengths[index] as number) < cap) open.push(index);
    }
    if (open.length === 0) { cap += 1; continue; }
    const target = open[randomInt(rng, 0, open.length - 1)] as number;
    lengths[target] = (lengths[target] as number) + 1;
    remaining -= 1;
  }
  return shuffle(rng, lengths);
}

function assertTraversal(order: readonly Cell[], size: number): void {
  if (order.length !== size * size) throw new Error('Traversal does not cover the grid');
  const seen = new Set<number>();
  for (let index = 0; index < order.length; index += 1) {
    const cell = order[index] as Cell;
    const key = cell.row * size + cell.col;
    if (seen.has(key)) throw new Error(`Traversal repeats a cell at index ${index}`);
    seen.add(key);
    if (index > 0 && !isAdjacent(order[index - 1] as Cell, cell)) {
      throw new Error(`Traversal jumps at index ${index}`);
    }
  }
}

/**
 * СНАЧАЛА РЕШЕНИЕ, ПОТОМ ЗАДАЧА.
 *
 * Раскладка строится ровно в этом порядке: берётся случайный гамильтонов путь
 * (он по построению проходит КАЖДУЮ клетку ровно один раз), режется на
 * непересекающиеся куски, и наружу отдаются только концы кусков. Значит полное
 * покрытие поля возможно ВСЕГДА — не «скорее всего», а по построению: само
 * решение уже лежит в `solution`, и валидатор его проверяет.
 */
function buildPuzzle(
  seedKey: string,
  level: number,
  plan: DotsLevelPlan,
  difficulty: number,
  id: string,
  seed: string,
): GeneratedDotsPuzzle {
  const rng = createRng(seedKey);
  const order = randomHamiltonianPath(plan.size, rng);
  assertTraversal(order, plan.size);
  const lengths = segmentLengths(order.length, plan.pairCount, plan.minPathLength, rng);
  const styles = shuffle(rng, DOTS_PAIR_STYLES).slice(0, plan.pairCount);
  const pairs: DotsPair[] = [];
  const solution: GeneratedDotsPuzzle['solution'] = {};
  let cursor = 0;

  for (let index = 0; index < plan.pairCount; index += 1) {
    const length = lengths[index] as number;
    const path = order.slice(cursor, cursor + length).map((cell) => ({ ...cell }));
    const first = path[0] as Cell;
    const last = path[path.length - 1] as Cell;
    const style = styles[index] as (typeof DOTS_PAIR_STYLES)[number];
    const pairId = `pair-${index + 1}`;
    pairs.push({
      id: pairId,
      color: style.color,
      symbol: style.symbol,
      endpoints: [{ ...first }, { ...last }],
    });
    solution[pairId] = path;
    cursor += length;
  }

  return {
    id,
    seed,
    level,
    size: plan.size,
    pairCount: plan.pairCount,
    minPathLength: plan.minPathLength,
    difficulty,
    // ⚠️ ЗАГЛУШКА. Настоящую ступень ставит `buildForTier` — ПО ЗАМЕРУ этой самой
    // доски решателем. Здесь она ещё не известна, а поле обязательное.
    tier: 'search',
    construction: 'shaken-hamiltonian-path',
    generatorVersion: DOTS_CONNECT_GENERATOR_VERSION,
    pairs: shuffle(rng, pairs),
    solution,
  };
}

/**
 * КАКОЙ СТУПЕНИ ТРЕБУЕТ ЭТА ДОСКА. Идём по списку ступеней снизу вверх и берём
 * первую, которой доска поддалась.
 *
 * ⚠️ ВЕРХНЮЮ СТУПЕНЬ НЕ ПРОВЕРЯЕМ ПЕРЕБОРОМ, И ЭТО НЕ ЛЕНЬ. Решение у доски
 * есть ПО ПОСТРОЕНИЮ: она нарезана из гамильтонова пути, и само решение лежит в
 * `solution`. Гонять здесь полный перебор (до 90 мс на 10×10) значило бы
 * доказывать уже доказанное — и делать это на глазах у человека при каждой
 * пересборке. Что решение НАХОДИТСЯ независимым решателем по одним лишь точкам,
 * проверяет гейт `dots-flow`, а не игрок своим ожиданием.
 */
function tierOfPuzzle(puzzle: GeneratedDotsPuzzle): DotsTier {
  const last = DOTS_TIERS[DOTS_TIERS.length - 1] as DotsTier;
  for (const tier of DOTS_TIERS) {
    if (tier === last) break;
    if (solveDotsPuzzleAt(puzzle, tier)) return tier;
  }
  return last;
}

/**
 * СОБРАЛ → ПРОВЕРИЛ РЕШАТЕЛЕМ → НЕ ТА СТУПЕНЬ → ПЕРЕСОБРАЛ. Приём Тэтхэма
 * (`add_clues(state, rs, diff)` в `tracks.c`): доска считается готовой не тогда,
 * когда она собралась, а тогда, когда её решает решатель ЗАДАННОЙ ступени.
 *
 * ⚠️ ПОПЫТКА НОМЕРУЕТСЯ В ЗЕРНЕ. Иначе повтор того же уровня давал бы другую
 * доску, а зерно у уровня фиксировано номером: «подсмотрел → перезапустил →
 * обвёл» стало бы бесплатным прохождением.
 *
 * ⚠️ ЧТО ЕСЛИ НЕ ПОПАЛИ ЗА ВСЕ ПОПЫТКИ. Отдаём первую собранную доску и пишем в
 * `tier` ЕЁ НАСТОЯЩУЮ ступень, а не заказанную: раздача не имеет права врать о
 * себе. По замеру такого не случается — самая редкая ступень на своём уровне
 * встречается у 2% досок, то есть вероятность промаха за 4000 попыток около
 * 1e-35, — но молча выдать чужую ступень хуже, чем выдать честную.
 */
function buildForTier(
  seedKey: string,
  level: number,
  plan: DotsLevelPlan,
  difficulty: number,
  id: string,
  seed: string,
  wanted: DotsTier,
): GeneratedDotsPuzzle {
  let fallback: GeneratedDotsPuzzle | null = null;
  for (let attempt = 0; attempt < DOTS_TIER_ATTEMPTS; attempt += 1) {
    const puzzle = buildPuzzle(`${seedKey}|try${attempt}`, level, plan, difficulty, id, seed);
    const tier = tierOfPuzzle(puzzle);
    if (tier === wanted) return { ...puzzle, tier };
    if (!fallback) fallback = { ...puzzle, tier };
  }
  return fallback as GeneratedDotsPuzzle;
}

export function generateDotsPuzzle(seed: string, level: number): GeneratedDotsPuzzle {
  const normalizedSeed = normalizeSeed(seed);
  const safeLevel = Math.max(1, Math.floor(level));
  const plan = dotsLevelPlan(safeLevel);
  return buildForTier(
    `${normalizedSeed}|${safeLevel}|${DOTS_CONNECT_GENERATOR_VERSION}`,
    safeLevel,
    plan,
    difficultyOf(safeLevel, plan),
    `${normalizedSeed}:${safeLevel}`,
    normalizedSeed,
    dotsLevelTier(safeLevel),
  );
}

/**
 * ТРЕНИРОВОЧНАЯ ДОСКА — ОТДЕЛЬНЫМ ВЫЗОВОМ, А НЕ «УРОВЕНЬ 1».
 *
 * 🔴 Раньше тренировка была `generateDotsPuzzle(seed + '-training', 1)`, то есть
 * первым уровнем лесенки. Как только первый уровень вырос до 5×5, тренировка
 * выросла бы вместе с ним — а она обязана оставаться самой мелкой доской в игре:
 * она учит ПРАВИЛУ («занять всю сетку»), и лишние клетки тут только мешают.
 * Теперь у неё свой план, и от лесенки она не зависит вовсе.
 */
export function generateDotsTrainingPuzzle(seed: string): GeneratedDotsPuzzle {
  const normalizedSeed = normalizeSeed(seed);
  return buildForTier(
    `${normalizedSeed}|training|${DOTS_CONNECT_GENERATOR_VERSION}`,
    1,
    DOTS_TRAINING_PLAN,
    0,
    `${normalizedSeed}:training`,
    normalizedSeed,
    DOTS_TRAINING_TIER,
  );
}

export function toPublicPuzzle(puzzle: GeneratedDotsPuzzle): Omit<GeneratedDotsPuzzle, 'solution'> {
  const { solution: _solution, ...publicPuzzle } = puzzle;
  return publicPuzzle;
}
