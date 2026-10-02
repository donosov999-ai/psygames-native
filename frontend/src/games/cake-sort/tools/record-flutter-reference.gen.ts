/* psygames-cake-sort-record-flutter-reference · VER 1 · 02.10.2026 */
/**
 * @jest-environment node
 */
/**
 * ЭТАЛОН ДЛЯ НАТИВНЫХ «ТОРТОВ» И «ПИЦЦЫ» (одна игра, две шкурки). Пишет
 * `flutter/test/fixtures/cake-sort-reference.json`: ходы и отказы, схлопывание кругов с
 * приходом из очереди, раскладку стола и попадание пальцем, звёзды и параметры лестницы.
 *
 * 🔴 ПОЧЕМУ ВЫГРУЗЧИК ЛЁГ В РЕПО ТОЛЬКО СЕЙЧАС (задача 87ca926a). Эталон положен 23.09 при
 * переносе разовой пробой, которая после выгрузки удалялась. Вшитые данные без выгрузчика не
 * чинятся: правка веба молча расходилась бы с эталоном, а переснять его было бы нечем. Этот
 * файл пересоздаёт эталон 23.09 — сверено перегоном 02.10.2026.
 *
 * 🔴 ЗАЧЕМ ЭТАЛОН. Перенос, проверенный той же формулой, которой переносил, зелен всегда.
 * Живой TS считает ответы, Dart обязан выдать те же числа.
 *
 * ⚠️ УРОВНИ ЗДЕСЬ НЕ ПИШУТСЯ. Они уже лежат данными (`core/levels.json`, 120 доказанных
 * раскладов, и `core/solutions.json`), а в Flutter их побайтно копирует
 * `flutter/tools/embed-cake-levels.mjs`.
 *
 * ⚠️ ПОСЛЕ ПРАВКИ `core/{plate,layout,stars,level,prebuilt}.ts` — ПЕРЕЗАПУСТИТЬ И
 * ЗАКОММИТИТЬ вместе с правкой Dart.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/cake-sort/tools/record-flutter-reference.gen.ts'
 */
import {
  CIRCLE, canPlace, capOf, collapse, completeAt, completeIn, hasAnyMove, isCleared, isEmpty,
  makeBoard, moveTop, moveType, roomIn, typesIn, type Board,
} from '@/src/games/cake-sort/core/plate';
import {
  CAKE_FILL, CAKE_INSET, PLATE_GAP, SECTOR_MIN, cakeRadius, inRow, maxCols, plateAtPoint,
  plateForGrab, rowLeft, sectorWidth, tableFit, tableLayout,
} from '@/src/games/cake-sort/core/layout';
import { REF_PER_TYPE, moveReference, referenceFor, starsFor, starsForMoves } from '@/src/games/cake-sort/core/stars';
import { levelCfg, QUEUE_FROM, PLATES_MAX, SPARES_MIN, capsForPlates } from '@/src/games/cake-sort/core/level';
import { PREBUILT_COUNT, prebuilt, prebuiltMin, prebuiltPath } from '@/src/games/cake-sort/core/prebuilt';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const REFERENCE_PATH = join(__dirname, '../../../../../flutter/test/fixtures/cake-sort-reference.json');
const SEED = 230926;

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

const plain = (b: Board) => ({
  plates: b.plates.map((p) => [...p]),
  queue: b.queue.map((p) => [...p]),
  caps: b.caps ? [...b.caps] : null,
  queueCaps: b.queueCaps ? [...b.queueCaps] : null,
});

/** Случайный стол: разные круги, очередь, свои вместимости. */
function randomBoard(r: () => number): Board {
  const n = 3 + Math.floor(r() * 5);
  const kinds = 2 + Math.floor(r() * 4);
  const ownCaps = r() < 0.35;
  const caps = Array.from({ length: n }, () => (ownCaps && r() < 0.4 ? 3 + Math.floor(r() * 4) : CIRCLE));
  const plates: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const count = Math.floor(r() * ((caps[i] as number) + 1));
    const single = r() < 0.3 ? 1 + Math.floor(r() * kinds) : 0;
    plates.push(Array.from({ length: count }, () => single || 1 + Math.floor(r() * kinds)));
  }
  const queue: number[][] = [];
  const queued = Math.floor(r() * 3);
  for (let i = 0; i < queued; i += 1) {
    const count = Math.floor(r() * (CIRCLE + 1));
    queue.push(Array.from({ length: count }, () => 1 + Math.floor(r() * kinds)));
  }
  return makeBoard(plates, queue, ownCaps ? caps : undefined);
}

function record() {
  const r = seeded(SEED);

  const moves = [];
  for (let n = 0; n < 240; n += 1) {
    const b = randomBoard(r);
    const from = Math.floor(r() * b.plates.length);
    const to = Math.floor(r() * b.plates.length);
    const src = b.plates[from] ?? [];
    const type = src.length ? (src[Math.floor(r() * src.length)] as number) : 0;
    const afterTop = moveTop(b, from, to);
    const afterType = src.length ? moveType(b, from, type, to) : null;
    moves.push({
      board: plain(b), from, to, type,
      canPlaceTop: src.length ? canPlace(b, to, src[src.length - 1] as number) : false,
      canPlaceType: src.length ? canPlace(b, to, type) : false,
      room: roomIn(b, to),
      empty: isEmpty(b, to),
      completeFrom: completeAt(b, from),
      typesFrom: typesIn(b, from),
      cleared: isCleared(b),
      anyMove: hasAnyMove(b),
      caps: b.plates.map((_, i) => capOf(b, i)),
      afterTop: afterTop ? plain(afterTop) : null,
      afterType: afterType ? plain(afterType) : null,
    });
  }

  /* Схлопывание отдельно: круг собрался — тарелка уезжает, на её место встаёт
     полка из очереди, и это повторяется каскадом. */
  const collapses = [];
  for (let n = 0; n < 80; n += 1) {
    const b = randomBoard(r);
    const c = collapse(b);
    collapses.push({ board: plain(b), result: plain(c.board), cleared: c.cleared });
  }

  /* Готовые круги: полный одноцветный круг СВОЕЙ высоты. */
  const circles = [];
  for (const plate of [[1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1], [1, 1, 1, 2, 1, 1], [], [2, 2, 2]]) {
    for (const cap of [3, 5, 6]) circles.push({ plate, cap, complete: completeIn(plate, cap) });
  }

  /* Раскладка стола: тарелки, сектор, колонки, ряды, попадание пальцем. */
  const layouts = [];
  for (const width of [320, 360, 390, 430, 768, 1024]) {
    for (const cols of [1, 2, 3, 4, 5, 6, 8]) {
      const l = tableLayout(width, cols);
      layouts.push({
        width, cols,
        plate: l.plate, radius: l.radius, sector: l.sector, sectorOuter: l.sectorOuter,
        cakeRadius: cakeRadius(l.plate), sectorWidth: sectorWidth(l.plate),
      });
    }
  }
  const fits = [];
  for (const width of [280, 320, 360, 390, 430, 560, 768, 1024, 1280]) {
    fits.push({ width, maxCols: maxCols(width) });
    for (const plates of [3, 5, 9, 12, 16, 20]) {
      for (const height of [320, 480, 640, 800]) {
        const f = tableFit(width, height, plates);
        fits.push({ width, height, plates, fitCols: f.cols, fitPlate: f.plate, fitRows: f.rows, fitSector: f.sector });
      }
    }
  }
  /* Попадание пальцем: тарелка по точке и «хват по клетке» (правка 3c085b4d —
     охват касания 61,5 % → 100 %). */
  const hits = [];
  const hitCases: [number, number, number][] = [[3, 96, 9], [4, 80, 12], [2, 140, 5]];
  for (const [cols, plateSize, count] of hitCases) {
    for (let k = 0; k < 40; k += 1) {
      const x = Math.round(r() * 400);
      const y = Math.round(r() * 500);
      hits.push({
        x, y, cols, plate: plateSize, count,
        atPoint: plateAtPoint(x, y, cols, plateSize, count),
        forGrab: plateForGrab(x, y, cols, plateSize, count),
        atPointCentered: plateAtPoint(x, y, cols, plateSize, count, 390),
        forGrabCentered: plateForGrab(x, y, cols, plateSize, count, 390),
      });
    }
  }
  const rows = [];
  for (const cols of [2, 3, 4]) {
    for (const count of [3, 5, 9, 12]) {
      for (let row = 0; row < 5; row += 1) {
        rows.push({ cols, count, row, inRow: inRow(row, cols, count), rowLeft: rowLeft(390, 96, inRow(row, cols, count)) });
      }
    }
  }

  /* Звёзды и эталон ходов. */
  const stars = [];
  for (const total of [3, 6, 11, 20]) {
    stars.push({ circles: total, reference: moveReference(total) });
    for (const exact of [null, 20, 50]) {
      for (const known of [null, 30, 80]) {
        const ref = referenceFor(total, exact, known);
        stars.push({
          circles: total, exact, known, referenceFor: ref,
          stars: [10, 30, 60, 120].map((m) => starsFor(m, total, exact, known)),
          byMoves: [10, 30, 60, 120].map((m) => starsForMoves(m, ref)),
        });
      }
    }
  }

  /* Уровни: параметры лестницы и вшитые расклады. */
  const levels = [];
  for (let level = 1; level <= 130; level += 1) {
    const cfg = levelCfg(level);
    const p = prebuilt(level);
    levels.push({
      level, types: cfg.types, plates: cfg.plates, queue: cfg.queue,
      caps: capsForPlates(level, cfg.plates),
      prebuilt: p ? { plates: p.plates.length, queue: p.queue.length, proven: p.proven === true } : null,
      min: prebuiltMin(level), path: prebuiltPath(level),
    });
  }

  writeFileSync(REFERENCE_PATH, `${JSON.stringify({
    source: 'живой TS: src/games/cake-sort/core/{plate,layout,stars,level,prebuilt}.ts',
    seed: SEED,
    consts: {
      CIRCLE, PLATE_GAP, SECTOR_MIN, CAKE_FILL, CAKE_INSET, REF_PER_TYPE,
      QUEUE_FROM, PLATES_MAX, SPARES_MIN, PREBUILT_COUNT,
    },
    moves, collapses, circles,
    layouts, fits, hits, rows,
    stars, levels,
  })}\n`);
  return { moves: moves.length, collapses: collapses.length, layouts: layouts.length, hits: hits.length };
}

describe('эталон «Тортов» и «Пиццы» для Flutter', () => {
  it('выгружен', () => {
    const out = record();
    expect(out.moves).toBe(240);
    expect(out.collapses).toBe(80);
    expect(out.layouts).toBeGreaterThan(40);
    expect(out.hits).toBe(120);
  }, 600_000);
});
