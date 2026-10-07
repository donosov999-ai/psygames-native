/* psygames-goods-sort-record-flutter-reference · VER 1 · 02.10.2026 */
/**
 * @jest-environment node
 */
/**
 * ЭТАЛОН ДЛЯ НАТИВНОЙ «СОРТИРОВКИ ТОВАРОВ». Пишет `flutter/test/fixtures/goods-sort-reference.json`:
 * ходы и укладка, разбор троек, цели и победа, счёт и звёзды, раскладка шкафа, накрытые товары,
 * сетки уровней.
 *
 * 🔴 ПОЧЕМУ ВЫГРУЗЧИК ЛЁГ В РЕПО ТОЛЬКО СЕЙЧАС (задача 87ca926a). Эталон положен 23.09 при
 * переносе разовой пробой, которая после выгрузки удалялась. Вшитые данные без выгрузчика не
 * чинятся: правка веба молча расходилась бы с эталоном, а переснять его было бы нечем.
 *
 * ⚠️ ПОТОК ЗЕРНА СВОЙ, А НЕ ОБЩИЙ С РАЗДАЧЕЙ УРОВНЕЙ. В 23.09 одна проба писала и уровни, и
 * эталон одним потоком случайных чисел, и случаи эталона зависели от того, сколько чисел съела
 * раздача. Раздачу с 25.09 делает `export-levels.gen.ts`, и сцепка сделала бы эталон заложником
 * любой правки генератора. Поэтому поток начинается здесь, и случаи эталона 02.10.2026
 * переписаны заново. Правила те же: нативные пробы `goods_sort_test.dart` и
 * `goods_sort_layout_test.dart` сверяют с ним Dart.
 *
 * 🔴 ЗАЧЕМ ЭТАЛОН, А НЕ ПЕРЕПИСЫВАНИЕ ФОРМУЛ. Перенос, проверенный той же формулой, которой
 * переносил, зелен всегда. Живой TS считает ответы, Dart обязан выдать те же числа.
 *
 * 🔴 РАСКЛАДКА — ТОЖЕ ЭТАЛОН. В `gsLayout` лежат три починки по отчётам со скриншотами:
 * обрезанные банки (18.08), «ужасно товары мелкие» (нахлёст и размер по СВОЕЙ нише), нижний ряд
 * под обрез (05.09). Перепиши арифметику на глаз — и все три вернутся молча.
 *
 * ⚠️ ПОСЛЕ ПРАВКИ `core/board.ts` или `core/level.ts` — ПЕРЕЗАПУСТИТЬ И ЗАКОММИТИТЬ вместе
 * с правкой Dart. Команда выгрузки уровней (`goods-sort/tools/*.gen.ts`) гоняет и этот файл:
 * эталон от этого не меняется, поток у него свой.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/goods-sort/tools/record-flutter-reference.gen.ts'
 */
import {
  goalMet, goalProgress, gridFor, gsLayout, ITEM_FLOOR, levelCfg, levelWon, moveReference,
  movesExhausted, scoreForClears, SCROLL_FROM, shiftCoveredAfterTake, starsForMoves, type Goal,
} from '@/src/games/goods-sort/core/level';
import {
  canPlace, collapseTriples, freeNiches, isCleared, makeBoard, makeReport, moveTop,
  removeTriple, tripleIn, type Board, type Shelf,
} from '@/src/games/goods-sort/core/board';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const REFERENCE_PATH = join(__dirname, '../../../../../flutter/test/fixtures/goods-sort-reference.json');
const SEED = 20260923;
const LEVELS = 60;

/** mulberry32: выгрузка обязана повторяться байт в байт. */
function seeded(s: number): () => number {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Случайная доска: ёмкости, джокеры, столбцы, очередь, задние ряды. */
function randomBoard(r: () => number, i: number): { board: Board; strict: boolean } {
  const niches = 3 + Math.floor(r() * 6);
  const cols = 1 + Math.floor(r() * 3);
  const kinds = 2 + Math.floor(r() * 4);
  const caps: number[] = [];
  const cells: number[][] = [];
  const jokers: boolean[] = [];
  const col: number[] = [];
  const ids: number[] = [];
  const back: number[][] = [];
  for (let n = 0; n < niches; n += 1) {
    const cap = 1 + Math.floor(r() * 4);
    caps.push(cap);
    const count = Math.floor(r() * (cap + 1));
    cells.push(Array.from({ length: count }, () => Math.floor(r() * kinds)));
    jokers.push(r() < 0.15);
    col.push(n % cols);
    ids.push(n);
    back.push(r() < 0.2 ? Array.from({ length: 1 + Math.floor(r() * 2) }, () => Math.floor(r() * kinds)) : []);
  }
  const withColumns = i % 3 === 0;
  const queue: Shelf[] = withColumns && r() < 0.5
    ? Array.from({ length: 1 + Math.floor(r() * 2) }, () => ({
        cell: Array.from({ length: Math.floor(r() * 3) }, () => Math.floor(r() * kinds)),
        cap: 2 + Math.floor(r() * 3),
        joker: r() < 0.1,
      }))
    : [];
  const board = makeBoard(cells, caps, {
    jokers,
    col: withColumns ? col : undefined,
    ids,
    queue: queue.length ? queue : undefined,
    back: back.some((b) => b.length) ? back : undefined,
  });
  return { board, strict: r() < 0.5 };
}

const plain = (b: Board) => ({
  cells: b.cells.map((c) => [...c]), caps: [...b.caps],
  jokers: b.jokers ? [...b.jokers] : null, col: b.col ? [...b.col] : null,
  ids: b.ids ? [...b.ids] : null,
  queue: (b.queue ?? []).map((s) => ({ cell: [...s.cell], cap: s.cap, joker: s.joker === true })),
  back: b.back ? b.back.map((x) => [...x]) : null,
});

function record() {
  const r = seeded(SEED);
  const moves = [];
  for (let i = 0; i < 200; i += 1) {
    const { board, strict } = randomBoard(r, i);
    const from = Math.floor(r() * board.cells.length);
    const to = Math.floor(r() * board.cells.length);
    const report = makeReport();
    const after = moveTop(board, from, to, strict, report);
    moves.push({
      board: plain(board), from, to, strict,
      canPlaceTo: board.cells[from]?.length
        ? canPlace(board, to, board.cells[from]![board.cells[from]!.length - 1] as number, strict)
        : null,
      result: after ? plain(after) : null,
      report: after ? report : null,
      freeNiches: freeNiches(board),
      cleared: isCleared(board),
    });
  }

  const collapses = [];
  for (let i = 0; i < 80; i += 1) {
    const { board } = randomBoard(r, i + 1000);
    const report = makeReport();
    const after = collapseTriples(board, report);
    collapses.push({ board: plain(board), result: plain(after), report });
  }

  const triples = [];
  for (let i = 0; i < 40; i += 1) {
    const cell = Array.from({ length: Math.floor(r() * 5) }, () => Math.floor(r() * 3));
    const t = tripleIn(cell);
    triples.push({ cell, triple: t, removed: t === null ? null : removeTriple(cell, t) });
  }

  const goals: unknown[] = [];
  const samples: number[][][] = [
    [[], [], []], [[1, 1], [2], []], [[3, 3, 3], [], [4]], [[0], [0], [0]],
  ];
  const goalKinds: Goal[] = [
    { kind: 'all' }, { kind: 'pick', types: [1, 2] }, { kind: 'free', niches: [0, 2] },
    { kind: 'moves', limit: 10 },
  ];
  for (const cells of samples) {
    for (const goal of goalKinds) {
      goals.push({
        cells, goal,
        goalMet: goalMet(cells.map((c) => [...c]), goal),
        progress: goalProgress(cells.map((c) => [...c]), goal),
        wonEmptyQueue: levelWon({ cells }, goal),
        wonWithQueue: levelWon({ cells, queue: [{ cell: [1], cap: 3 }] }, goal),
        wonWithBack: levelWon({ cells, back: [[2], [], []] }, goal),
        exhausted10: movesExhausted(10, 10, cells.map((c) => [...c]), goal),
        exhausted9: movesExhausted(9, 10, cells.map((c) => [...c]), goal),
      });
    }
  }

  const scores = Array.from({ length: 7 }, (_, n) => ({ n, score: scoreForClears(n) }));
  const stars: unknown[] = [];
  for (const reference of [10, 20, 33]) {
    for (const moves of [reference, Math.ceil(reference * 1.15), Math.ceil(reference * 1.15) + 1, Math.ceil(reference * 1.6), Math.ceil(reference * 1.6) + 1]) {
      stars.push({ moves, reference, stars: starsForMoves(moves, reference) });
    }
  }
  const references = [];
  for (let level = 1; level <= LEVELS; level += 1) {
    const cfg = levelCfg(level, 34);
    references.push({ level, types: cfg.types, moveLimit: cfg.moveLimit, reference: moveReference({ moveLimit: cfg.moveLimit, types: cfg.types }) });
  }

  /* Раскладка на реальных экранах: телефон 320…430, планшет 750…1024, десктоп 1280. */
  const layouts = [];
  const shapes: [number, number][] = [[3, 3], [3, 4], [4, 3], [4, 4], [3, 5], [5, 4], [4, 6]];
  const outOf = (L: ReturnType<typeof gsLayout>) => ({
    boardW: L.boardW, cellW: L.cellW, itemSize: L.itemSize, itemH: L.itemH,
    nicheH: L.nicheH, shelfH: L.shelfH, overlap: L.overlap, rowW: L.rowW,
    boardH: L.boardH, scrolls: L.scrolls,
    itemBox: [1, 2, 3, 4].map((c) => L.itemBox(c)),
    nicheW: [1, 2, 3, 4].map((c) => L.nicheW(c)),
  });
  for (const width of [320, 360, 390, 430, 750, 834, 1280]) {
    for (const availH of [280, 396, 560, 800]) {
      for (const [cols, rows] of shapes) {
        for (const capWide of [3, 4]) {
          for (const floorItem of [0, ITEM_FLOOR]) {
            layouts.push({
              in: { width, availH, cols, rows, capWide, hintH: 0, floorItem },
              out: outOf(gsLayout(width, availH, cols, rows, capWide, 0, floorItem)),
            });
          }
        }
      }
    }
  }
  // Строка цели у Flutter живёт ВНЕ поля (свой ряд каркаса), поэтому hintH=0; но веб зовёт
  // с подсказкой, и её ветку тоже надо уметь повторить.
  for (const hintH of [30, 44, 88]) {
    layouts.push({
      in: { width: 390, availH: 560, cols: 3, rows: 4, capWide: 3, hintH, floorItem: 0 },
      out: outOf(gsLayout(390, 560, 3, 4, 3, hintH, 0)),
    });
  }

  // Перенос ключей накрытия через изъятие: позиции съезжают, и ключ не имеет права
  // перепрыгнуть на соседний товар (разбор в `shiftCoveredAfterTake`).
  const covered = [];
  const takes: [number, number][] = [[0, 0], [0, 1], [0, 2], [1, 0], [2, 1]];
  for (const keys of [
    ['0:0', '0:1', '1:0'], ['0:1'], ['0:0', '0:2'], [], ['2:0', '2:1', '2:2'], ['0:2', '1:1'],
  ]) {
    for (const [fromCell, fromIdx] of takes) {
      covered.push({ covered: keys, fromCell, fromIdx, result: shiftCoveredAfterTake(keys, fromCell, fromIdx) });
    }
  }

  // Сетка уровня: экран обязан спросить ту же функцию, иначе попадание пальца поедет
  // относительно рисунка.
  const grids = [];
  for (let level = 1; level <= LEVELS; level += 1) {
    const narrow = gridFor(level, true);
    const wide = gridFor(level, false);
    grids.push({
      level, narrow: { cols: narrow.cols, rows: narrow.rows }, wide: { cols: wide.cols, rows: wide.rows },
      floorItem: level >= SCROLL_FROM ? ITEM_FLOOR : 0,
    });
  }

  writeFileSync(REFERENCE_PATH, `${JSON.stringify({
    source: 'живой TS: src/games/goods-sort/core/{board,level}.ts', seed: SEED,
    moves, collapses, triples, goals,
    scores, stars, references,
    layouts, covered, grids,
  })}\n`);
  return { moves: moves.length, collapses: collapses.length, goals: goals.length, layouts: layouts.length };
}

describe('эталон «Сортировки товаров» для Flutter', () => {
  it('выгружен', () => {
    const out = record();
    expect(out.moves).toBe(200);
    expect(out.collapses).toBe(80);
    expect(out.goals).toBeGreaterThan(10);
    expect(out.layouts).toBeGreaterThan(380);
  }, 600_000);
});
