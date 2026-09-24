/* psygames-goods-sort-export-levels · VER 1 · 24.09.2026 */
/**
 * 🔴 ВЫГРУЗКА ЛЕСТНИЦЫ ТОВАРОВ ДЛЯ ПРИЛОЖЕНИЯ — ТЕПЕРЬ ПОВТОРЯЕМАЯ.
 *
 * ⚠️ ЗАЧЕМ ЭТОТ ФАЙЛ ВООБЩЕ ПОЯВИЛСЯ. `flutter/assets/levels/goods_sort.json`
 * лежит в репозитории с 23.09.2026, а инструмента, которым его сделали, в
 * репозитории НЕТ: выгрузку гоняли руками и не сохранили. Цена выяснилась
 * 24.09.2026, когда в лестнице нашлись невыигрываемые уровни: починить
 * генератор было можно, а ПЕРЕСНЯТЬ лестницу — нечем. Одноразовый скрипт,
 * который не сохранили, это не «сэкономили файл», а «данные больше не
 * пересобираются».
 *
 * 🔴 ЗОВЁТ ТО ЖЕ ЯДРО, ЧТО И ЭКРАН, И НИ ОДНОЙ СВОЕЙ КОПИИ ПРАВИЛ. Раздача —
 * `dealBoard`, сетка и план — `levelCfg`, накрытия — `hideDeepSpots`, живые ряды
 * для заморозки — `liveRowsForFreeze`, цель собирается тем же кодом, что в
 * `loadLevel`. Своя копия здесь означала бы, что приложение играет по одним
 * правилам, а выгрузка сделана по другим, и разойтись они могут молча.
 *
 * ЗАПУСК (из frontend):
 *   npx jest --testMatch '**\/goods-sort/tools/*.gen.ts' --testTimeout 900000
 * Зерно и место выгрузки переопределяются переменными среды:
 *   GOODS_SEED=20260923 GOODS_OUT=../flutter/assets/levels/goods_sort.json
 *
 * ⚠️ ЭТО ИНСТРУМЕНТ, А НЕ ПРОБА: обычный `testMatch` берёт только
 * `src/__tests__`, поэтому в общий прогон файл не попадает.
 */
import type { Shelf } from '../core/board';
import {
  capsForBoard, collapseLevel, dealBoard, GOOD_SETS, hiddenInfo, hideDeepSpots,
  ITEM_FLOOR, jokersForBoard, levelCfg, liveRowsForFreeze, monochromeLevel, moveReference,
  movingNiches, rowOfNiche, SCROLL_FROM, shuffle, strictPlacement, целымиТройками,
  type Goal,
} from '../core/level';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

const СТУПЕНЕЙ = Number(process.env.GOODS_LEVELS ?? 60);
const ЗЕРНО = Number(process.env.GOODS_SEED ?? 20260923);
const НАБОР = process.env.GOODS_SET ?? 'mix';
/** Порог узкой сетки — тот же, что читает приложение (`narrowWidth` в выгрузке). */
const УЗКАЯ_ДО = 560;

/**
 * 🔴 ЗЕРНО СТАВИТСЯ ПОДМЕНОЙ `Math.random`, И ЭТО НЕ ХАК, А ЕДИНСТВЕННЫЙ ЧЕСТНЫЙ
 * СПОСОБ. Раздача товаров перемешивает через `shuffle`, который зовёт
 * `Math.random` напрямую (`core/level.ts`). Протащить генератор случайных чисел
 * параметром сквозь `dealBoard` → `dealCollapse` → `generate` значило бы
 * переписать подписи половины ядра ради выгрузки — то есть менять игру под
 * инструмент. Подменяем на время выгрузки и возвращаем обратно.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ВыгруженныйУровень {
  level: number;
  cols: number;
  rows: number;
  mask: boolean[];
  slots: number;
  types: number;
  spares: number;
  moveLimit: number;
  strict: boolean;
  hidden: boolean;
  moving: boolean;
  collapse: boolean;
  cells: number[][];
  caps: number[];
  jokers: boolean[];
  col: number[] | null;
  ids: number[] | null;
  queue: readonly Shelf[];
  back: number[][];
  obstacles: ({ kind: string; movesLeft?: number } | null)[];
  covered: string[];
  frozen: { row: number; type: number } | null;
  goal: Goal;
  proven: boolean | null;
  reference: number;
  floorItem: number;
}

/**
 * Один уровень целиком — ровно в том порядке, в каком его собирает `loadLevel`
 * экрана: сетка → раздача → препятствия → накрытия → заморозка → ЦЕЛЬ.
 * ⚠️ Цель ПОСЛЕДНЕЙ: ей нужно видеть и раздачу, и препятствия, и заморозку.
 */
function собратьУровень(L: number, пул: number[], narrow: boolean): ВыгруженныйУровень {
  const cfg = levelCfg(L, пул.length, narrow);
  const deal = dealBoard(L, пул, narrow);
  const cells = deal.cells;
  const obs = deal.obstacles;

  const spots = hideDeepSpots(cells);
  const covered = hiddenInfo(L) ? spots : shuffle(spots).slice(0, cfg.obst.covered);

  let frozen: { row: number; type: number } | null = null;
  let frozenRow = -1;
  if (cfg.obst.frozenRow) {
    const present = Array.from(new Set(cells.flat()));
    const type = present[Math.floor(Math.random() * present.length)] ?? -1;
    const live = liveRowsForFreeze(cfg.mask, obs, cfg.cols, cfg.rows);
    const row = live.length ? live[Math.floor(Math.random() * live.length)] : -1;
    if (type >= 0 && row >= 0) { frozen = { row, type }; frozenRow = row; }
  }

  const plan = cfg.goal;
  let goal: Goal = { kind: 'all' };
  if (plan.kind === 'moves' && cfg.moveLimit > 0) {
    goal = { kind: 'moves', limit: cfg.moveLimit };
  } else if (plan.kind === 'pick') {
    const present = shuffle(Array.from(new Set(cells.flat())));
    const n = Math.max(1, Math.min(plan.count, present.length - 1));
    if (n >= 1 && present.length > n) goal = { kind: 'pick', types: present.slice(0, n) };
  } else if (plan.kind === 'free') {
    const movable = cells
      .map((c, i) => (c.length > 0 && !obs[i] && rowOfNiche(i, cfg.mask, cfg.cols) !== frozenRow ? i : -1))
      .filter((i) => i >= 0);
    const n = Math.min(plan.count, Math.max(1, cfg.spares - 1), movable.length);
    if (n >= 1) goal = { kind: 'free', niches: shuffle(movable).slice(0, n) };
  }

  return {
    level: L,
    cols: cfg.cols,
    rows: cfg.rows,
    mask: cfg.mask,
    slots: cfg.slots,
    types: cfg.types,
    spares: cfg.spares,
    moveLimit: cfg.moveLimit,
    strict: strictPlacement(L),
    hidden: hiddenInfo(L),
    moving: movingNiches(L),
    collapse: collapseLevel(L),
    cells,
    caps: deal.caps ?? capsForBoard(L, cells),
    jokers: jokersForBoard(L, cells),
    col: deal.col ?? null,
    ids: deal.ids ?? null,
    queue: deal.queue ?? [],
    back: deal.back ?? [],
    obstacles: obs as ({ kind: string; movesLeft?: number } | null)[],
    covered,
    frozen,
    goal,
    proven: deal.proven ?? null,
    reference: moveReference(cfg),
    // Пол размера товара — чисто раскладочный: с уровня прокрутки товар не ужимается.
    floorItem: L >= SCROLL_FROM ? ITEM_FLOOR : 0,
  };
}

describe('выгрузка лестницы товаров для приложения', () => {
  it('собирает обе сетки и пишет JSON', () => {
    const набор = GOOD_SETS.find((s) => s.key === НАБОР) ?? GOOD_SETS[0];
    const пул = набор.pool;

    const настоящий = Math.random;
    Math.random = mulberry32(ЗЕРНО);
    let levels: ВыгруженныйУровень[];
    let wide: ВыгруженныйУровень[];
    try {
      levels = Array.from({ length: СТУПЕНЕЙ }, (_, i) => собратьУровень(i + 1, пул, true));
      wide = Array.from({ length: СТУПЕНЕЙ }, (_, i) => собратьУровень(i + 1, пул, false));
    } finally {
      Math.random = настоящий;
    }

    /**
     * 🔴 ВЫГРУЗКА ПРОВЕРЯЕТ СЕБЯ ДО ЗАПИСИ. Инвариант «каждый вид целыми
     * тройками» стоит и в раздаче, но файл, который уедет в приложение, обязан
     * быть проверен ещё раз ЗДЕСЬ: между раздачей и записью лежит сборка
     * уровня, и однажды она уже теряла товар молча.
     */
    const битые: string[] = [];
    for (const [имя, список] of [['узкая', levels], ['широкая', wide]] as const) {
      for (const lv of список) {
        if (!целымиТройками(lv.cells, lv.queue, lv.back)) битые.push(`${имя} L${lv.level}`);
      }
    }
    expect(битые).toEqual([]);

    const выход = process.env.GOODS_OUT
      ?? path.resolve(__dirname, '../../../../../flutter/assets/levels/goods_sort.json');
    const данные = {
      generator: 'goods-sort dealBoard (живой TS)',
      exportedAt: new Date().toISOString().slice(0, 10),
      seed: ЗЕРНО,
      set: набор.key,
      pool: пул,
      narrowWidth: УЗКАЯ_ДО,
      levels,
      wide,
    };
    fs.writeFileSync(выход, `${JSON.stringify(данные)}\n`);
    // eslint-disable-next-line no-console
    console.log(`ВЫГРУЗКА: ${levels.length} + ${wide.length} ступеней, зерно ${ЗЕРНО}, `
      + `набор ${набор.key} (${пул.length} видов) → ${выход}`);
    // Одноцветные уровни — проверка, что предикаты дожили до выгрузки, а не
    // потерялись по дороге: без них лестница стала бы ровной.
    // eslint-disable-next-line no-console
    console.log(`одноцветных ${levels.filter((l) => monochromeLevel(l.level)).length}, `
      + `строгих ${levels.filter((l) => l.strict).length}, `
      + `со схлопыванием ${levels.filter((l) => l.collapse).length}, `
      + `с очередью ${levels.filter((l) => l.queue.length > 0).length}`);
  }, 900000);
});
