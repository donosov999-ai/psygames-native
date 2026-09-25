/* psygames-goods-sort-export-levels · VER 2 · 25.09.2026 */
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
 * 🔴 ВЫГРУЖАЮТСЯ ВСЕ ШЕСТЬ НАБОРОВ, А НЕ ОДИН «МИКС» (25.09.2026). До этого
 * инструмент по умолчанию делал только «Микс», и в приложении жил ОДИН набор из
 * шести: выбор товаров перенос потерял целиком. Наборы не косметика — у них
 * разные пулы (34 · 6 · 8 · 8 · 9 · 12 видов), а от размера пула зависит,
 * сколько видов уровень вообще может положить на доску. То есть у каждого набора
 * СВОЯ лестница, и подменить её нельзя.
 *
 * ЗАПУСК (из frontend):
 *   npx jest --testMatch '**\/goods-sort/tools/*.gen.ts' --testTimeout 1800000
 * Выгружает все наборы плюс каталог `goods_sets.json`. Переменные среды:
 *   GOODS_SEED=20260923            зерно
 *   GOODS_SET=food                 только один набор
 *   GOODS_OUT=<путь>               куда писать (только с GOODS_SET)
 *   GOODS_DIR=../flutter/assets/levels   папка выгрузки
 *
 * ⚠️ ЭТО ИНСТРУМЕНТ, А НЕ ПРОБА: обычный `testMatch` берёт только
 * `src/__tests__`, поэтому в общий прогон файл не попадает.
 */
import type { Shelf } from '../core/board';
import {
  capsForBoard, collapseLevel, dealBoard, GOOD_SETS, hiddenInfo, hideDeepSpots,
  ITEM_FLOOR, jokersForBoard, levelCfg, liveRowsForFreeze, monochromeLevel, moveReference,
  movingNiches, PROFILE_GOOD_SET, rowOfNiche, SCROLL_FROM, setUnlockLevel, shuffle,
  strictPlacement, WIDEST_POOL, целымиТройками,
  type Goal,
} from '../core/level';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

const СТУПЕНЕЙ = Number(process.env.GOODS_LEVELS ?? 60);
const ЗЕРНО = Number(process.env.GOODS_SEED ?? 20260923);
const ОДИН_НАБОР = process.env.GOODS_SET ?? '';
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

/** Файл лестницы набора. «Микс» остаётся под прежним именем: его читает выпущенный экран. */
function файлНабора(ключ: string): string {
  return ключ === 'mix' ? 'goods_sort.json' : `goods_sort_${ключ}.json`;
}

const ПАПКА = process.env.GOODS_DIR
  ?? path.resolve(__dirname, '../../../../../flutter/assets/levels');

/** Одна лестница: собрать обе сетки, проверить себя и записать. */
function выгрузитьНабор(ключ: string, выход: string): void {
  const набор = GOOD_SETS.find((s) => s.key === ключ) ?? GOOD_SETS[0];
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
   * 🔴 ВЫГРУЗКА ПРОВЕРЯЕТ СЕБЯ ДО ЗАПИСИ. Инварианты стоят и в раздаче, но файл,
   * который уедет в приложение, обязан быть проверен ещё раз ЗДЕСЬ: между
   * раздачей и записью лежит сборка уровня, и однажды она уже теряла товар молча.
   *
   * ⚠️ ПРОВЕРОК ТРИ, И ТРЕТЬЯ ПОЯВИЛАСЬ 25.09.2026 ПО НАСТОЯЩЕМУ ДЕФЕКТУ: доска
   * не имеет права приехать с ГОТОВОЙ тройкой — она схлопнется первым касанием, и
   * очко с местом достанутся ни за что. Считаем весь расклад: и доску, и очередь,
   * и задние ряды.
   */
  const битые: string[] = [];
  for (const [имя, список] of [['узкая', levels], ['широкая', wide]] as const) {
    for (const lv of список) {
      if (!целымиТройками(lv.cells, lv.queue, lv.back)) битые.push(`${ключ}/${имя} L${lv.level}: не кратно трём`);
      const готовая = lv.cells.some((c) => готоваяТройка(c))
        || lv.queue.some((sh) => готоваяТройка(sh.cell))
        || lv.back.some((b) => готоваяТройка(b));
      if (готовая) битые.push(`${ключ}/${имя} L${lv.level}: приехала с готовой тройкой`);
      const вне = lv.cells.flat().filter((t) => !пул.includes(t));
      if (вне.length > 0) битые.push(`${ключ}/${имя} L${lv.level}: товар вне пула ${вне[0]}`);
    }
  }
  expect(битые).toEqual([]);

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
  // ⚠️ ОТСТУП В ОДИН ПРОБЕЛ — КАК БЫЛО У ПЕРВОЙ ВЫГРУЗКИ. Схлопнутый в строку
  // JSON приложение читает ровно так же, но диффы становятся нечитаемы: правка
  // одного уровня выглядит как «изменены все 120». Формат файла — это ещё и то,
  // можно ли увидеть, что в нём поменялось.
  fs.writeFileSync(выход, `${JSON.stringify(данные, null, 1)}\n`);
  // eslint-disable-next-line no-console
  console.log(`ВЫГРУЗКА: ${levels.length} + ${wide.length} ступеней, зерно ${ЗЕРНО}, `
    + `набор ${набор.key} (${пул.length} видов) → ${выход}\n`
    + `  одноцветных ${levels.filter((l) => monochromeLevel(l.level)).length}, `
    + `строгих ${levels.filter((l) => l.strict).length}, `
    + `со схлопыванием ${levels.filter((l) => l.collapse).length}, `
    + `с очередью ${levels.filter((l) => l.queue.length > 0).length}`);
}

/** Три одинаковых товара в одной нише — тройка, которая схлопнется сама. */
function готоваяТройка(cell: readonly number[]): boolean {
  const счёт = new Map<number, number>();
  for (const t of cell) {
    const n = (счёт.get(t) ?? 0) + 1;
    if (n >= 3) return true;
    счёт.set(t, n);
  }
  return false;
}

describe('выгрузка лестницы товаров для приложения', () => {
  it('собирает обе сетки и пишет JSON', () => {
    if (ОДИН_НАБОР) {
      выгрузитьНабор(ОДИН_НАБОР, process.env.GOODS_OUT ?? path.join(ПАПКА, файлНабора(ОДИН_НАБОР)));
      return;
    }
    for (const набор of GOOD_SETS) выгрузитьНабор(набор.key, path.join(ПАПКА, файлНабора(набор.key)));
  }, 1800000);

  /**
   * 🔴 КАТАЛОГ НАБОРОВ — ДАННЫЕ, А НЕ ПОВТОРЁННОЕ В DART ПРАВИЛО.
   *
   * Приложению нужно знать по каждому набору: имя человеку, сколько видов, с
   * какого уровня открыт, какие шесть товаров показать в витрине и какой набор
   * ставить профилю по умолчанию. Всё это УЖЕ посчитано в TS (`setUnlockLevel` —
   * от размера пула через `typeBudget`, `PROFILE_GOOD_SET` — решение 06.09.2026).
   * Написать те же числа в Dart значило бы завести вторую истину, которая молча
   * разойдётся с первой на первой же правке пула.
   */
  it('пишет каталог наборов', () => {
    const каталог = {
      generator: 'goods-sort GOOD_SETS (живой TS)',
      exportedAt: new Date().toISOString().slice(0, 10),
      widestPool: WIDEST_POOL,
      sets: GOOD_SETS.map((s) => ({
        key: s.key,
        ru: s.ru,
        en: s.en,
        pool: s.pool,
        preview: s.preview,
        alike: s.alike === true,
        unlockLevel: setUnlockLevel(s.key),
        file: файлНабора(s.key),
      })),
      byProfile: PROFILE_GOOD_SET,
    };
    // Самый широкий набор обязан быть открыт с первого уровня: он точка отсчёта
    // и запасной вариант, когда предпочтение профиля ещё не открылось.
    const широкий = каталог.sets.find((s) => s.pool.length === WIDEST_POOL);
    expect(широкий?.unlockLevel).toBe(1);
    // И каждый файл лестницы обязан существовать — иначе каталог обещает набор,
    // которого приложение не найдёт.
    const нет = каталог.sets.filter((s) => !fs.existsSync(path.join(ПАПКА, s.file)));
    expect(нет.map((s: { key: string }) => s.key)).toEqual([]);

    const выход = path.join(ПАПКА, 'goods_sets.json');
    fs.writeFileSync(выход, `${JSON.stringify(каталог, null, 1)}\n`);
    // eslint-disable-next-line no-console
    console.log(`КАТАЛОГ: ${каталог.sets.length} наборов → ${выход}\n  `
      + каталог.sets.map((s) => `${s.key} ${s.pool.length}в с L${s.unlockLevel}`).join(' · '));
  }, 60000);
});
