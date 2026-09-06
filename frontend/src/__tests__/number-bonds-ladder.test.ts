/* __tests__/number-bonds-ladder · VER 1 · 06.09.2026 */
/**
 * ГЕЙТЫ лестницы «Состав числа» (решения Дениса R1–R3 от 06.09.2026, реф counting-chat).
 * Мерят ПОВЕДЕНИЕ боевого модуля (генерация задач + окна + миграция), не буквы исходника.
 * Сид фиксирован — числа детерминированы, гейт не мигает.
 *
 * Что охраняется и чем это было дефектом:
 *  [G1] скачок работы соседних уровней ≤ ×1,5 — старый рубильник solMin 2→3 давал ×3,6,
 *       игра «слишком сложно» начиная со стыка (отчёт Релакс 03.08).
 *  [G2] детский вход: L1 все цели ≤10, L2 ≤20, L1–L3 пары и БЕЗ таймера —
 *       на старой лестнице целей ≤10 было 17,1%, школьного входа не было.
 *  [G3] окно ≥ 2×прогноза времени (или потолок 300 с) — старое окно с уровня 5
 *       было МЕНЬШЕ потребного (36 с при нужных 83 с), уровни не проходились.
 *  [G4] работа растёт монотонно — лестница не «растёт числами» с провалами трудности.
 *  [G5] миграция v1→v2 по равной работе, прогресс не сгорает и не выходит за потолок.
 */
import {
  levelParams, makePuzzle, migrateOldLevel, pickSolSize, NB_MAX_LEVEL,
} from '@/src/games/counting/numberBondsLadder';
import { puzzleWork, seededRnd } from '@/src/games/counting/ladderWork';

const N = 1500;              // задач на уровень; при фикс-сиде детерминировано (N=400 давал шум ±7% и ложный ×1,64)
const ANCHOR_LEVEL = 6;      // ≈ старый L1 по работе (реф §2), живой якорь 15 с/задачу

/** Средняя работа уровня на фиксированном сиде. */
function levelWork(level: number, seed = 1): number {
  const rnd = seededRnd(seed + level * 1000);
  const cfg = levelParams(level);
  const maxSize = Math.max(...Object.keys(cfg.sizeWeights).map(Number));
  let sum = 0;
  for (let i = 0; i < N; i++) sum += puzzleWork(makePuzzle(cfg, rnd), maxSize);
  return sum / N;
}

describe('лестница number-bonds (VER 2, 20 уровней)', () => {
  const works: number[] = [];
  beforeAll(() => {
    for (let L = 1; L <= NB_MAX_LEVEL; L++) works.push(levelWork(L));
  });

  test('[G1] скачок работы между соседними уровнями ≤ ×1,5 (обрыв ×3,6 не вернулся)', () => {
    const bad: string[] = [];
    for (let i = 1; i < works.length; i++) {
      const jump = works[i] / works[i - 1];
      if (jump > 1.5) bad.push(`L${i}→L${i + 1}: ×${jump.toFixed(2)}`);
    }
    if (bad.length) throw new Error(`обрыв(ы) трудности: ${bad.join(' · ')}`);
  });

  test('[G4] работа растёт монотонно по всем уровням', () => {
    for (let i = 1; i < works.length; i++) {
      expect(works[i]).toBeGreaterThan(works[i - 1]);
    }
  });

  test('[G2] детский вход: L1 цели ≤10, L2 ≤20, L1–L3 только пары и без таймера', () => {
    for (const [L, cap] of [[1, 10], [2, 20]] as const) {
      const cfg = levelParams(L);
      const rnd = seededRnd(42 + L);
      for (let i = 0; i < 500; i++) {
        expect(makePuzzle(cfg, rnd).target).toBeLessThanOrEqual(cap);
      }
    }
    for (const L of [1, 2, 3]) {
      const cfg = levelParams(L);
      expect(cfg.windowMs).toBe(0);
      expect(Object.keys(cfg.sizeWeights)).toEqual(['2']);
    }
  });

  test('[G3] окно ≥ 2×прогноза времени, либо потолок 300 с; с L4 окно есть везде', () => {
    const anchorW = works[ANCHOR_LEVEL - 1];
    for (let L = 4; L <= NB_MAX_LEVEL; L++) {
      const winS = levelParams(L).windowMs / 1000;
      expect(winS).toBeGreaterThan(0);
      const predS = 15 * (works[L - 1] / anchorW);
      const generousOrCapped = winS >= 2 * predS || winS === 300;
      if (!generousOrCapped) {
        throw new Error(`L${L}: окно ${winS}с < 2×прогноза ${predS.toFixed(0)}с и не потолок`);
      }
    }
  });

  test('[G5] миграция v1→v2: по равной работе, в границах, прогресс не сгорает', () => {
    expect(migrateOldLevel(1)).toBe(1);            // не начинал → детский вход
    expect(migrateOldLevel(4)).toBe(8);            // старый L4 = новый L8 параметр в параметр
    expect(migrateOldLevel(5)).toBe(13);           // запертые окном уровни → та же трудность, живое окно
    expect(migrateOldLevel(15)).toBe(19);
    for (let old = 2; old <= 15; old++) {
      const nu = migrateOldLevel(old);
      expect(nu).toBeGreaterThanOrEqual(6);        // прогресс не сгорает до детских уровней
      expect(nu).toBeLessThanOrEqual(NB_MAX_LEVEL);
      expect(nu).toBeGreaterThanOrEqual(migrateOldLevel(old - 1));   // порядок сохраняется
    }
  });

  test('[доп] pickSolSize уважает веса уровня (L4: доля троек ≈13%)', () => {
    const rnd = seededRnd(7);
    const w = levelParams(4).sizeWeights;
    let threes = 0;
    for (let i = 0; i < 4000; i++) if (pickSolSize(w, rnd) === 3) threes++;
    expect(threes / 4000).toBeGreaterThan(0.09);
    expect(threes / 4000).toBeLessThan(0.17);
  });
});
