/* psygames-counting-number-bonds-ladder · VER 1 · 06.09.2026 */
/**
 * Лестница «Состав числа» — ЕДИНСТВЕННЫЙ источник правды об уровнях.
 * Читают двое: экран app/games/number-bonds.tsx и замер counting-chat/sim-ladder.mjs
 * (node --experimental-strip-types импортирует этот файл напрямую — второй копии нет).
 *
 * ЗАЧЕМ ПЕРЕДЕЛАНА (замер 06.09.2026, sim-ladder + решения Дениса R1–R3):
 *   1. Детского входа не было: на старом L1 целей ≤10 было 17,1% — «состав числа
 *      до 10» отсутствовал в игре вовсе. → L1–L3: пары, цель ≤10 → ≤20, БЕЗ таймера.
 *   2. Обрыв ×3,6 на старом стыке L4→L5: рубильник solMin 2→3 разом запрещал
 *      парные решения. → веса размеров решения (sizeWeights), доля пар тает
 *      постепенно; приёмка гейтом: скачок работы соседних уровней ≤ ×1,5.
 *   3. Окно падало 45→15 с линейно и с L5 было МЕНЬШЕ потребного времени
 *      (83 с нужно / 36 с дано) — уровни выше не проходились. → окно из замера:
 *      2,5 × прогноз времени, потолок 300 с (страховка от застревания, не стена);
 *      на детских L1–3 окна нет.
 *
 * ⚠️ Правишь уровни → прогони `node --experimental-strip-types counting-chat/sim-ladder.mjs 2000`
 * и пробу `npx jest number-bonds-ladder` — гейт скачков обязан остаться зелёным.
 */

export interface BondsCfg {
  pool: number;                      // сколько фишек на поле
  maxV: number;                      // максимальное значение фишки
  sizeWeights: Record<number, number>; // размер решения → вес (доли, в сумме ~1)
  targetMax?: number;                // потолок цели (детские уровни «состав до N»)
  trials: number;                    // задач в раунде
  windowMs: number;                  // окно на задачу; 0 = таймера нет
}

/** Число уровней лестницы (тропинке передаётся как maxLevel). */
export const NB_MAX_LEVEL = 20;

/**
 * Таблица уровней. Окна (winS) посчитаны из прогноза sim-ladder VER 2 от 06.09.2026
 * (якорь 15 с/задачу на параметрах старого L1 ≈ нового L6, живые сессии):
 * winS = clamp(2,5×прогноз, 40, 300); потолок 300 с — страховка от застревания,
 * не стена (модель перебора завышает абсолюты — оговорка в реф §2).
 * Уровни с winS=0 — детские, без таймера. Новый L8 = старый L4 параметр в параметр.
 */
const LEVELS: readonly (Omit<BondsCfg, 'windowMs'> & { winS: number })[] = [
  /* L1  дети: пары, состав до 10 */ { pool: 6,  maxV: 8,  sizeWeights: { 2: 1 },                    targetMax: 10, trials: 6,  winS: 0 },
  /* L2  дети: пары, состав до 20 */ { pool: 7,  maxV: 12, sizeWeights: { 2: 1 },                    targetMax: 20, trials: 6,  winS: 0 },
  /* L3  дети: пары, числа крупнее*/ { pool: 8,  maxV: 14, sizeWeights: { 2: 1 },                                   trials: 6,  winS: 0 },
  /* L4  тройки появляются (20%)  */ { pool: 8,  maxV: 12, sizeWeights: { 2: 0.86, 3: 0.14 },                        trials: 6,  winS: 40 },
  /* L5                           */ { pool: 8,  maxV: 13, sizeWeights: { 2: 0.69, 3: 0.31 },                        trials: 6,  winS: 40 },
  /* L6  ≈ старый L1 по работе    */ { pool: 8,  maxV: 14, sizeWeights: { 2: 0.5, 3: 0.5 },                         trials: 6,  winS: 45 },
  /* L7                           */ { pool: 9,  maxV: 16, sizeWeights: { 2: 0.5, 3: 0.5 },                         trials: 6,  winS: 50 },
  /* L8  = старый L4              */ { pool: 9,  maxV: 18, sizeWeights: { 2: 0.5, 3: 0.5 },                         trials: 6,  winS: 55 },
  /* L9  четвёрки появляются (8%) */ { pool: 9,  maxV: 18, sizeWeights: { 2: 0.42, 3: 0.51, 4: 0.07 },              trials: 8,  winS: 75 },
  /* L10                          */ { pool: 9,  maxV: 20, sizeWeights: { 2: 0.3, 3: 0.55, 4: 0.15 },               trials: 8,  winS: 100 },
  /* L11                          */ { pool: 10, maxV: 22, sizeWeights: { 2: 0.24, 3: 0.56, 4: 0.20 },              trials: 8,  winS: 140 },
  /* L12                          */ { pool: 10, maxV: 23, sizeWeights: { 2: 0.15, 3: 0.55, 4: 0.30 },              trials: 8,  winS: 165 },
  /* L13 ≈ старый L5, живое окно  */ { pool: 10, maxV: 24, sizeWeights: { 2: 0.10, 3: 0.50, 4: 0.40 },              trials: 8,  winS: 205 },
  /* L14 пары ушли                */ { pool: 10, maxV: 26, sizeWeights: { 3: 0.55, 4: 0.45 },                       trials: 8,  winS: 220 },
  /* L15 ≈ старый L9              */ { pool: 10, maxV: 28, sizeWeights: { 3: 0.50, 4: 0.50 },                       trials: 8,  winS: 255 },
  /* L16 пятёрки появляются (10%) */ { pool: 10, maxV: 30, sizeWeights: { 3: 0.45, 4: 0.45, 5: 0.10 },              trials: 6,  winS: 300 },
  /* L17                          */ { pool: 11, maxV: 32, sizeWeights: { 3: 0.40, 4: 0.44, 5: 0.16 },              trials: 6,  winS: 300 },
  /* L18 ≈ старые L10-12          */ { pool: 11, maxV: 34, sizeWeights: { 3: 0.32, 4: 0.44, 5: 0.24 },              trials: 6,  winS: 300 },
  /* L19                          */ { pool: 12, maxV: 36, sizeWeights: { 3: 0.27, 4: 0.44, 5: 0.29 },              trials: 6,  winS: 300 },
  /* L20 ≈ старые L13-15 (плато)  */ { pool: 12, maxV: 40, sizeWeights: { 3: 0.20, 4: 0.45, 5: 0.35 },              trials: 6,  winS: 300 },
];

export function levelParams(level: number): BondsCfg {
  const row = LEVELS[Math.min(Math.max(1, Math.round(level)), NB_MAX_LEVEL) - 1];
  const { winS, ...rest } = row;
  return { ...rest, windowMs: winS * 1000 };
}

/** Размер решения по весам уровня (rnd — инъекция для детерминированных проб). */
export function pickSolSize(weights: Record<number, number>, rnd: () => number = Math.random): number {
  const entries = Object.entries(weights);
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = rnd() * total;
  for (const [size, w] of entries) {
    roll -= w;
    if (roll <= 0) return Number(size);
  }
  return Number(entries[entries.length - 1][0]);
}

export interface BondsPuzzle { target: number; chips: number[]; }

/**
 * Генератор задачи. Отличия от старого makePuzzle (поведение L4–L7 совпадает):
 *  - размер решения — по весам уровня, а не uniform[solMin..solMax];
 *  - targetMax (детские уровни): пере-генерация решения, пока цель не влезла
 *    в «состав до N» (guard 300 — при maxV детских уровней укладывается всегда).
 * Дистракторы как раньше: uniform 1..maxV, запрещено только значение == цели.
 */
export function makePuzzle(cfg: BondsCfg, rnd: () => number = Math.random): BondsPuzzle {
  let sol: number[] = [];
  let target = 0;
  let guard = 0;
  do {
    const solSize = pickSolSize(cfg.sizeWeights, rnd);
    const used = new Set<number>();
    sol = [];
    while (sol.length < solSize) {
      const v = 1 + Math.floor(rnd() * cfg.maxV);
      if (!used.has(v)) { used.add(v); sol.push(v); }
    }
    target = sol.reduce((a, b) => a + b, 0);
    guard++;
  } while (cfg.targetMax !== undefined && target > cfg.targetMax && guard < 300);

  const distractors: number[] = [];
  let dGuard = 0;
  while (distractors.length < cfg.pool - sol.length && dGuard < 200) {
    const v = 1 + Math.floor(rnd() * cfg.maxV);
    if (v !== target) distractors.push(v);
    dGuard++;
  }
  const chips = [...sol, ...distractors];
  // Перемешивание Фишера–Йетса (решение не должно лежать первым куском)
  for (let i = chips.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [chips[i], chips[j]] = [chips[j], chips[i]];
  }
  return { target, chips };
}

/**
 * МИГРАЦИЯ ПРОГРЕССА старой лестницы (1..15) в новую (1..20) — решение Дениса R1:
 * «прогресс игроков не сгорает, best пересчитывается сдвигом». Маппинг — по РАВНОЙ
 * РАБОТЕ поиска (замер sim-ladder 06.09.2026), а не по номеру: старый L1 (работа 24)
 * ≈ новый L6 (27); старый L4 (37) = новый L8 (те же параметры); старые L5–L9 были
 * заперты окном — встают на L13–L15 с похожими параметрами и живым окном; старые
 * L10–L15 (замеренное плато 468..642) — на L18–L19.
 */
const MIGRATE_OLD_TO_NEW: readonly number[] = [6, 6, 7, 8, 13, 13, 14, 14, 15, 18, 18, 18, 19, 19, 19];

export function migrateOldLevel(oldLevel: number): number {
  if (oldLevel <= 1) return 1;   // не начинал — начинает с детского входа
  return MIGRATE_OLD_TO_NEW[Math.min(oldLevel, 15) - 1];
}
