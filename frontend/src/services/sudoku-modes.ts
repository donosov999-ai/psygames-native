/* psygames-sudoku-modes · VER 1 · 27.08.2026 */
/**
 * МИНИ-ЛЕСТНИЦЫ РЕЖИМОВ СУДОКУ — небоскрёбы и неравенства.
 *
 * 🔴 ПОЧЕМУ НЕ В ОСНОВНОЙ ЛЕСТНИЦЕ (решение задачи 70b58bbe, 27.08.2026).
 * Оба варианта собраны, замерены и РАБОТАЮТ, но в 57-ступенчатую лестницу не
 * помещаются по замеренным причинам, а не по вкусу:
 *   · towers решается только на 6×6 (на 9×9 одной границы видимости мало —
 *     сплошные −1), а лестница уходит на 9×9 с пятого уровня и не возвращается;
 *   · unequal даже с техникой цепочек имеет потолок 4, вершина лестницы — 6..6
 *     (джигсо). Поставить его после 57-го значит обещать недостижимое — ровно
 *     дефект, который чинился в тот же день (sudoku-ladder-monotonic).
 * Поэтому оба живут ОТДЕЛЬНЫМИ РЕЖИМАМИ классической доски (рядом с killer),
 * каждый со своей короткой лестницей и своим счётчиком прогресса.
 *
 * ⚠️ ОСИ СЛОЖНОСТИ У НИХ РАЗНЫЕ, И ОБЕ — ЗАМЕРЕННЫЕ (27.08.2026):
 *   towers: глубина копки (12→20 из 36 клеток) + требуемая ступень. Замер по
 *     40 досок на глубину: b=12 → тиры 1×28/4×10, b=18 → 1×6/4×25, b=20 → 1×3/4×17.
 *     Генерация 3–5 мс/доска — переборы до попадания в полосу бесплатны.
 *   unequal: ДОЛЯ ПОКАЗАННЫХ ЗНАКОВ, и она РАСТЁТ со ступенью (0.15→0.30).
 *     Знак — не подарок, а сама головоломка: цепочка неравенств работает только
 *     там, где знаки есть (разбор и замер — в markerDensity, sudoku-grade).
 *
 * 🔴 НА ВЕРХНИХ СТУПЕНЯХ НЕРАВЕНСТВ ЗНАКИ ОБЯЗАНЫ БЫТЬ НУЖНЫМИ. Найдено
 * замером: доска со «ступенью 4 через цепочки» решалась БЕЗ ЕДИНОГО знака
 * обычными одиночками на ступени 2 — игрок мог законно игнорировать всю
 * механику. Та же дисциплина, что у гейта башен («подсказка нужна»): с полосы
 * min ≥ 3 доска принимается, только если классическими техниками без знаков
 * она НЕ закрывается.
 */
import { Cell, dimsForSize, generatePuzzle, UnequalMap, TowersMap } from '@/src/services/sudoku-core';
import { gradePuzzle, generateLogical, GeneratedPuzzle, Grade } from '@/src/services/sudoku-grade';

export type SideMode = 'towers' | 'unequal';

export interface SideStep {
  /** Сколько клеток выколото (towers) или лимит копки (unequal). */
  blanks: number;
  /** Полоса техник: принимается доска со ступенью в [min..max]. */
  band: { min: number; max: number };
}

/**
 * 🔴 ОБЕЩАНИЯ СТУПЕНЕЙ МОНОТОННЫ ПО ПОСТРОЕНИЮ — сторожит гейт
 * sudoku-side-modes: min и max не убывают, а глубина/доля растут.
 * Плато 4..4 в хвосте — не лень: потолок обоих вариантов 4 (VARIANT_TIER_CEILING),
 * рост внутри плато даёт вторая ось (глубина у башен, доля знаков у неравенств).
 */
export const TOWERS_LADDER: readonly SideStep[] = [
  { blanks: 12, band: { min: 1, max: 2 } },
  { blanks: 13, band: { min: 1, max: 2 } },
  { blanks: 14, band: { min: 1, max: 4 } },
  { blanks: 15, band: { min: 4, max: 4 } },
  { blanks: 16, band: { min: 4, max: 4 } },
  { blanks: 18, band: { min: 4, max: 4 } },
  { blanks: 19, band: { min: 4, max: 4 } },
  { blanks: 20, band: { min: 4, max: 4 } },
];

/**
 * Плотность знаков задаёт markerDensity(step, 'unequal') — здесь только полосы.
 * ⚠️ Полосы 2..3 в лестнице НЕТ, и это замер, а не пропуск: любой вывод цепочкой —
 * сразу ступень 4, а доски с молчащими знаками выходят на 1 (полоса 2..3 дала
 * 0 попаданий из 8 — копатель откатывал всё, что будило цепочку). Две фазы:
 * вход (1..2, знаки видны и просты) → цепочки обязательны (4..4), рост внутри
 * плато — дефицитом знаков (0.30 → 0.19, см. markerDensity).
 */
export const UNEQUAL_LADDER: readonly SideStep[] = [
  { blanks: 58, band: { min: 1, max: 2 } },
  { blanks: 58, band: { min: 1, max: 2 } },
  { blanks: 58, band: { min: 4, max: 4 } },
  { blanks: 58, band: { min: 4, max: 4 } },
  { blanks: 58, band: { min: 4, max: 4 } },
  { blanks: 58, band: { min: 4, max: 4 } },
  { blanks: 58, band: { min: 4, max: 4 } },
  { blanks: 58, band: { min: 4, max: 4 } },
];

export function sideLadder(mode: SideMode): readonly SideStep[] {
  return mode === 'towers' ? TOWERS_LADDER : UNEQUAL_LADDER;
}

export function sideStepCount(mode: SideMode): number {
  return sideLadder(mode).length;
}

export function sideStepCfg(mode: SideMode, step: number): SideStep {
  const ladder = sideLadder(mode);
  return ladder[Math.min(ladder.length - 1, Math.max(0, step - 1))];
}

export interface SideBoard {
  puzzle: Cell[][];
  solution: Cell[][];
  unequal?: UnequalMap;
  towers?: TowersMap;
  /** Фактическая ступень доски (для подписи), null — оценщик не закрыл. */
  tier: number | null;
  /** Верхним ступеням неравенств знаки обязаны быть нужны — принято ли это требование. */
  signsNeeded: boolean;
}

/**
 * Сборщик доски режима — той же формы `{steps, step, enough}`, что и
 * `logicalBuilder`: экран гоняет его через `runSteps` и показывает те же кадры
 * «идёт сборка». Башни собираются мгновенно (3–5 мс/доска), неравенства — как
 * уровни, заходами generateLogical по ~1.5 с.
 */
export function sideModeBuilder(mode: SideMode, step: number): {
  steps: number;
  step: () => SideBoard;
  enough: (b: SideBoard) => boolean;
} {
  const cfg = sideStepCfg(mode, step);
  const needSigns = mode === 'unequal' && cfg.band.min >= 3;
  const inBand = (t: number | null) => t !== null && t >= cfg.band.min && t <= cfg.band.max;

  if (mode === 'towers') {
    const { N, BR, BC } = dimsForSize(6);
    let best: SideBoard | null = null;
    return {
      steps: 3,
      step: () => {
        // Один шаг = серия быстрых попыток; типично попадаем с первых же.
        const until = Date.now() + 700;
        while (Date.now() < until) {
          const g = generatePuzzle(cfg.blanks, N, BR, BC, 'towers');
          const towers = (g as { towers?: TowersMap }).towers;
          const a: Grade = gradePuzzle(g.puzzle, { N, BR, BC, variant: 'towers', towers });
          if (!a.solved) continue;
          const board: SideBoard = { puzzle: g.puzzle, solution: g.solution, towers, tier: a.tier, signsNeeded: true };
          if (inBand(a.tier)) return (best = board);
          if (!best || Math.abs(a.tier - cfg.band.min) < Math.abs((best.tier ?? 0) - cfg.band.min)) best = board;
        }
        // Ни одной решаемой за весь шаг — доска всё равно корректна (единственность
        // держит dig-with-uniqueness), просто без гарантии ступени.
        if (!best) {
          const g = generatePuzzle(cfg.blanks, N, BR, BC, 'towers');
          best = { puzzle: g.puzzle, solution: g.solution, towers: (g as { towers?: TowersMap }).towers, tier: null, signsNeeded: true };
        }
        return best;
      },
      enough: (b) => inBand(b.tier),
    };
  }

  const { N, BR, BC } = dimsForSize(9);
  let best: SideBoard | null = null;
  const score = (b: SideBoard) =>
    (inBand(b.tier) ? 4 : 0) + (b.signsNeeded ? 2 : 0) - Math.abs((b.tier ?? 0) - cfg.band.min);
  return {
    steps: 4,
    step: () => {
      const r = generateLogical(step, cfg.blanks, N, BR, BC, 'unequal', { budgetMs: 1500, tier: cfg.band });
      const gen = r.gen as GeneratedPuzzle & { unequal?: UnequalMap };
      const tier = r.grade.solved ? r.grade.tier : null;
      // «Знаки нужны» = без знаков классические техники доску НЕ закрывают.
      const closesBlind = gradePuzzle(gen.puzzle, { N, BR, BC, variant: 'none' }).solved;
      const board: SideBoard = {
        puzzle: gen.puzzle, solution: gen.solution, unequal: gen.unequal, tier,
        signsNeeded: !needSigns || !closesBlind,
      };
      if (!best || score(board) > score(best)) best = board;
      return best;
    },
    enough: (b) => inBand(b.tier) && b.signsNeeded,
  };
}

/**
 * Синхронная обёртка для гейтов и замеров: крутит сборщик без кадров экрана.
 * Боевой путь экрана — `sideModeBuilder` через `runSteps`.
 */
export function sideBoardForStep(mode: SideMode, step: number): SideBoard {
  const b = sideModeBuilder(mode, step);
  let out!: SideBoard;
  for (let i = 0; i < b.steps; i++) {
    out = b.step();
    if (b.enough(out)) break;
  }
  return out;
}
