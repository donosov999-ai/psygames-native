/* psygames-water-sort-record-flutter-reference · VER 1 · 02.10.2026 */
/**
 * @jest-environment node
 */
/**
 * ЭТАЛОН ДЛЯ НАТИВНОГО ДВИЖКА СОСУДОВ («Пробирки», «Шарики», «Гайки» — один движок, три
 * шкурки). Пишет `flutter/test/fixtures/sort-tubes-reference.json`: правила налива и отказа,
 * отъезд собранного, раскладку колонок, скрытые слои и параметры лестницы.
 *
 * 🔴 ПОЧЕМУ ВЫГРУЗЧИК ЛЁГ В РЕПО ТОЛЬКО СЕЙЧАС (задача 87ca926a). Эталон положен 23.09 при
 * переносе разовой пробой, которая после выгрузки удалялась. Вшитые данные без выгрузчика не
 * чинятся: правка веба молча расходилась бы с эталоном, а переснять его было бы нечем. Этот
 * файл пересоздаёт эталон 23.09 — сверено перегоном 02.10.2026.
 *
 * 🔴 ЗАЧЕМ ЭТАЛОН, А НЕ ПЕРЕПИСЫВАНИЕ ФОРМУЛ. Перенос, проверенный той же формулой, которой
 * переносил, зелен всегда. Здесь живой TS считает ответы, а Dart обязан выдать те же числа.
 *
 * ⚠️ РАСКЛАДКА ВЫГРУЖАЕТСЯ ТОЖЕ. В `колонокДля`/`ширинаПробирки` лежит замер 11.09.2026:
 * сосуд 62 против 109 точек на том же экране, смотря по числу колонок.
 *
 * ⚠️ УРОВНИ ЗДЕСЬ НЕ ПИШУТСЯ: `flutter/assets/levels/sort_tubes.json` выгружает
 * `tools/export-levels.gen.ts`.
 *
 * ⚠️ ПОСЛЕ ПРАВКИ `core/tubes.ts`, `core/hidden.ts`, лестницы в `core/generate.ts` или
 * раскладки в `app/games/water-sort.tsx` — ПЕРЕЗАПУСТИТЬ И ЗАКОММИТИТЬ вместе с правкой Dart.
 * Команда выгрузки уровней (`water-sort/tools/*.gen.ts`) гоняет и этот файл; эталон от
 * этого не меняется: поток зерна у него свой.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/water-sort/tools/record-flutter-reference.gen.ts'
 */
import {
  capOf, canPour, doneCount, isDone, isOpen, isSolved, pour, pourAmount, roomIn,
  sealDone, stonesIn, topRun, почемуНельзя as whyNot, type Field,
} from '@/src/games/water-sort/core/tubes';
import { levelParams, levelMoveReference, moveLimitFor, строгийНалив as strictPour } from '@/src/games/water-sort/core/generate';
import {
  ключСлоя as layerKey, скрытоНаУровне as hiddenOnLevel, скрытоОсталось as hiddenLeft,
  скрытыеСлои as hiddenLayers, слойВиден as layerVisible, звёздыПоХодам as starsByMoves,
} from '@/src/games/water-sort/core/hidden';
import { колонокДля as colsFor, ширинаПробирки as tubeWidth } from '@/app/games/water-sort';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const REFERENCE_PATH = join(__dirname, '../../../../../flutter/test/fixtures/sort-tubes-reference.json');
const SEED = 777202609;
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

const plain = (f: Field) => ({
  tubes: f.tubes.map((t) => [...t]),
  cap: f.cap,
  caps: f.caps ? [...f.caps] : null,
  stones: f.stones ? [...f.stones] : null,
  opensAt: f.opensAt ? [...f.opensAt] : null,
  strict: f.strict === true,
  sealed: f.sealed ?? 0,
});

/** Случайное поле: разные высоты, камни, замки, строгий налив. */
function randomField(r: () => number): Field {
  const n = 3 + Math.floor(r() * 5);
  const cap = 3 + Math.floor(r() * 3);
  const colours = 1 + Math.floor(r() * 4);
  const tubes: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const count = Math.floor(r() * (cap + 1));
    const t: number[] = [];
    // Иногда столбик однотонный — иначе ветка «однородную в пустую» не проверялась бы.
    const single = r() < 0.35 ? 1 + Math.floor(r() * colours) : 0;
    for (let k = 0; k < count; k += 1) t.push(single || 1 + Math.floor(r() * colours));
    tubes.push(t);
  }
  const f: Field = {
    tubes,
    cap,
    caps: r() < 0.4 ? tubes.map(() => (r() < 0.3 ? Math.max(2, cap - 1 - Math.floor(r() * 2)) : cap)) : undefined,
    stones: r() < 0.35 ? tubes.map(() => (r() < 0.25 ? 1 + Math.floor(r() * 2) : 0)) : undefined,
    opensAt: r() < 0.3 ? tubes.map(() => (r() < 0.3 ? 1 + Math.floor(r() * 2) : 0)) : undefined,
    strict: r() < 0.25,
    sealed: r() < 0.2 ? Math.floor(r() * 2) : 0,
  };
  // Поле обязано быть законным: содержимое не выше своей пригодной высоты.
  return { ...f, tubes: f.tubes.map((t, i) => t.slice(0, Math.max(0, capOf(f, i) - stonesIn(f, i)))) };
}

function record() {
  const r = seeded(SEED);
  const moves = [];
  for (let n = 0; n < 240; n += 1) {
    const f = randomField(r);
    const from = Math.floor(r() * f.tubes.length);
    const to = Math.floor(r() * f.tubes.length);
    const after = pour(f, from, to);
    moves.push({
      field: plain(f), from, to,
      canPour: canPour(f, from, to),
      reason: whyNot(f, from, to),
      amount: pourAmount(f, from, to),
      result: after ? plain(after) : null,
      topRun: f.tubes[from] ? topRun(f.tubes[from]!) : 0,
      roomTo: roomIn(f, to),
      openFrom: isOpen(f, from),
      openTo: isOpen(f, to),
      done: f.tubes.map((_, i) => isDone(f, i)),
      doneCount: doneCount(f),
      solved: isSolved(f),
      caps: f.tubes.map((_, i) => capOf(f, i)),
      stones: f.tubes.map((_, i) => stonesIn(f, i)),
    });
  }

  /* Отъезд собранного: ряды поля едут ВМЕСТЕ (caps, stones, opensAt — параллельные). */
  const seals = [];
  for (let n = 0; n < 80; n += 1) {
    const f = randomField(r);
    const s = sealDone(f);
    seals.push({ field: plain(f), result: plain(s.field), sealed: s.sealed });
  }

  /* Раскладка: сколько колонок и какой ширины сосуд. Ключи эталона — русские, как в 23.09. */
  const layouts = [];
  for (const n of [3, 4, 5, 6, 7, 8, 9, 10, 12, 14]) {
    for (const available of [288, 328, 358, 398, 718, 992]) {
      for (const height of [0, 320, 440, 560, 687, 900]) {
        layouts.push({
          n, 'доступно': available, 'высота': height,
          cols: colsFor(n, available, height),
          width: tubeWidth(n, available, height),
        });
      }
    }
  }

  /* Скрытый слой: верхний виден всегда, однотонный столбик не прячется. */
  const hiddenCases = [];
  for (let n = 0; n < 40; n += 1) {
    const f = randomField(r);
    const hidden = hiddenLayers(f, r);
    hiddenCases.push({
      field: plain(f),
      keys: Array.from(hidden).sort((a, b) => a - b),
      visible: f.tubes.map((t, i) => t.map((_, d) => layerVisible(f, hidden, i, d))),
      left: hiddenLeft(f, hidden),
    });
  }

  const levels = [];
  for (let level = 1; level <= LEVELS; level += 1) {
    const p = levelParams(level);
    levels.push({
      level, colors: p.colors, cap: p.cap, empty: p.empty, minMoves: p.minMoves,
      reference: levelMoveReference(level), moveLimit: moveLimitFor(level),
      hidden: hiddenOnLevel(level), starsByMoves: starsByMoves(level), strict: strictPour(level),
    });
  }

  writeFileSync(REFERENCE_PATH, `${JSON.stringify({
    source: 'живой TS: src/games/water-sort/core/{tubes,hidden,generate}.ts + app/games/water-sort.tsx',
    seed: SEED,
    keyFormula: 'ключСлоя = сосуд * 100 + глубина',
    sampleKey: layerKey(3, 2),
    moves, seals, layouts, hiddenCases, levels,
  })}\n`);
  return { moves: moves.length, seals: seals.length, layouts: layouts.length, hiddenCases: hiddenCases.length };
}

describe('эталон движка сосудов для Flutter', () => {
  it('выгружен', () => {
    const out = record();
    expect(out.moves).toBe(240);
    expect(out.seals).toBe(80);
    expect(out.layouts).toBeGreaterThan(300);
    expect(out.hiddenCases).toBe(40);
  }, 600_000);
});
