/* psygames-schulte-series-record-reference · VER 1 · 07.10.2026 */
/**
 * @jest-environment node
 */
/**
 * ЭТАЛОН СЕРИИ БЛОКОВ «ТАБЛИЦЫ ШУЛЬТЕ» ДЛЯ FLUTTER — `flutter/test/fixtures/schulte-series-reference.json`.
 *
 * 🔴 ЗАЧЕМ. Нативная серия (задача 1b6338c1) — ПЕРЕНОС живого ядра (`core/blocks.ts`,
 * `core/progress.ts`, `src/services/series.ts`), а не пересказ. Доказывается это прогоном:
 * здесь ядро веба проигрывает сценарии — цели блоков, поле по зерну, нажатия по клеткам, ход
 * уровня после серии, сессию, — а Dart-проба `flutter/test/schulte_series_test.dart` гонит
 * тот же сценарий своим портом и сверяет число в число.
 *
 * ⚠️ ГЕНЕРАТОР СЛУЧАЙНОСТИ — СВОЙ, ОДИНАКОВЫЙ В ОБОИХ ЯЗЫКАХ (линейный конгруэнтный, 32 бита).
 * `Math.random` и `dart:math` дают разные ряды, и поле «по зерну» без общего генератора не
 * сверить. Ядро принимает генератор снаружи (`buildSchulteField(size, random)`), поэтому
 * сверяется именно перестановка Фишера — Йетса, а не случайность.
 *
 * ⚠️ ПОСЛЕ ПРАВКИ ЯДРА В TS — ПЕРЕЗАПУСТИТЬ И ЗАКОММИТИТЬ JSON: эталон замораживает перенос,
 * а не источник.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/schulte/tools/record-series-reference.gen.ts'
 */
import {
  alternateTargets, blockDone, blockKeyAt, blockTarget, buildSchulteField, nextBlock, openBlock,
  orderTargets, pairSum, pressSeriesCell, sumPairsTotal, SCHULTE_SERIES_PLAN,
  type SchulteField, type SchulteSeriesState,
} from '../core/blocks';
import {
  afterSeriesRun, EMPTY_SERIES_PROGRESS, parseSeriesProgress, seriesEntry, type SchulteSeriesProgress,
} from '../core/progress';
import { recordBlock, seriesComplete, seriesDiffs, seriesSession, startSeries, type SeriesRun } from '@/src/services/series';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const OUT = join(__dirname, '../../../../../flutter/test/fixtures/schulte-series-reference.json');

/** Линейный конгруэнтный генератор, 32 бита — тот же в Dart (`schulte_series_test.dart`). */
const lcg = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const summary = (st: SchulteSeriesState) => ({
  block: st.blockIndex,
  step: st.step,
  pending: st.pending,
  errors: st.errors,
  taken: st.taken.filter(Boolean).length,
  target: blockTarget(st),
  done: blockDone(st),
});

/** Индекс клетки со значением v на поле. */
const at = (f: SchulteField, v: number) => f.cells.indexOf(v);

it('эталон серии «Таблицы Шульте» для Flutter', () => {
  const targets = [25, 36, 49, 64].map((total) => ({
    total, order: orderTargets(total), alternate: alternateTargets(total),
    pairSum: pairSum(total), pairs: sumPairsTotal(total),
  }));

  const fields = [3, 4, 5, 6, 7, 8, 9, 12].map((size) => ({
    size, seed: 1000 + size, cells: buildSchulteField(size, lcg(1000 + size)).cells,
  }));

  // Сценарии нажатий по одному полю 5×5 — все три блока, с ошибками, отменой и повтором.
  const field = buildSchulteField(5, lcg(7));
  const total = field.cells.length;
  const scripts: { name: string; block: number; presses: number[] }[] = [];
  scripts.push({ name: 'order-clean', block: 0, presses: orderTargets(total).map((v) => at(field, v)) });
  scripts.push({ name: 'order-errors', block: 0, presses: [at(field, 2), at(field, 1), at(field, 1), at(field, 5), -1, 99, at(field, 2), at(field, 3)] });
  scripts.push({ name: 'alternate-clean', block: 1, presses: alternateTargets(total).map((v) => at(field, v)) });
  scripts.push({ name: 'alternate-errors', block: 1, presses: [at(field, 2), at(field, 1), at(field, 24), at(field, 25), at(field, 2), at(field, 24)] });
  const pairs: number[] = [];
  for (let a = 1; a <= sumPairsTotal(total); a += 1) pairs.push(at(field, a), at(field, pairSum(total) - a));
  scripts.push({ name: 'sum-clean', block: 2, presses: pairs });
  scripts.push({ name: 'sum-mixed', block: 2, presses: [
    at(field, 1), at(field, 1),               // выбор и отмена
    at(field, 1), at(field, 2),               // пара не сложилась — ошибка
    at(field, 3), at(field, 23),              // пара взята
    at(field, 3),                             // клетка уже закрыта — без последствий
    at(field, 13), at(field, 12),             // середина 13 без пары: 13 + 12 ≠ 26 — ошибка
    at(field, 12), at(field, 14),             // пара взята
  ] });
  const plays = scripts.map(({ name, block, presses }) => {
    let st = openBlock(field, block);
    const steps = presses.map((index) => {
      const r = pressSeriesCell(st, index);
      st = r.state;
      return { index, result: r.result, ...summary(st) };
    });
    return { name, block, key: blockKeyAt(block), start: summary(openBlock(field, block)), steps };
  });
  // Переход блока: поле ТО ЖЕ, состояние сброшено.
  const moved = nextBlock(pressSeriesCell(openBlock(field, 0), at(field, 1)).state);

  // Прогресс: разбор сохранённого, вход в серию, ход уровня после прогона.
  const raws = ['', 'garbage', '{"sizes":{"order":7}}',
    '{"sizes":{"order":99,"alternate":3,"sum":6},"streaks":{"order":1,"alternate":-1,"sum":2.7}}',
    '{"sizes":{"order":6,"alternate":6,"sum":6},"streaks":{"order":2,"alternate":2,"sum":1}}'];
  const parsed = raws.map((raw) => ({ raw, progress: parseSeriesProgress(raw) }));
  const entries = parsed.flatMap(({ raw, progress }) => [3, 5, 6, 8, 10].map((ladder) => ({
    raw, ladder, entry: seriesEntry(progress, ladder),
  })));

  const block = (key: string, timeMs: number, errors: number, done: boolean) => ({ key, timeMs, errors, done });
  const runOf = (level: number, blocks: { key: string; timeMs: number; errors: number; done: boolean }[]): SeriesRun =>
    blocks.reduce((run, b) => recordBlock(run, b), startSeries('schulte_series', level, SCHULTE_SERIES_PLAN, 0));
  const runs: Record<string, SeriesRun> = {
    clean5: runOf(5, [block('order', 30000, 0, true), block('alternate', 42000, 1, true), block('sum', 51000, 2, true)]),
    clean6: runOf(6, [block('order', 41000, 0, true), block('alternate', 52000, 0, true), block('sum', 60500, 0, true)]),
    errors3: runOf(5, [block('order', 30000, 0, true), block('alternate', 42000, 3, true), block('sum', 51000, 0, true)]),
    partial: runOf(5, [block('order', 30000, 0, true), block('alternate', 9000, 0, false)]),
    max8: runOf(8, [block('order', 90000, 0, true), block('alternate', 99000, 0, true), block('sum', 120000, 0, true)]),
  };
  // Цепочка прогонов от пустого прогресса: две чистые серии поднимают поле, оборванная не двигает.
  const chain: { run: string; ladder: number; outcome: unknown }[] = [];
  let progress: SchulteSeriesProgress = EMPTY_SERIES_PROGRESS;
  for (const [name, ladder] of [['clean5', 5], ['partial', 5], ['clean5', 5], ['errors3', 5], ['clean5', 5], ['clean5', 5], ['clean6', 6], ['clean6', 7], ['max8', 8], ['max8', 8]] as const) {
    const outcome = afterSeriesRun(progress, runs[name], ladder);
    chain.push({ run: name, ladder, outcome });
    progress = outcome.progress;
  }
  const sessions = Object.fromEntries(Object.entries(runs).map(([name, run]) => [name, {
    complete: seriesComplete(run), diffs: seriesDiffs(run), session: seriesSession(run),
  }]));

  writeFileSync(OUT, JSON.stringify({
    plan: SCHULTE_SERIES_PLAN, targets, fields, field: field.cells, plays,
    moved: { block: moved.blockIndex, step: moved.step, errors: moved.errors, sameCells: moved.field.cells },
    parsed, entries, chain, sessions,
  }, null, 1) + '\n');
  expect(plays.length).toBe(6);
  expect(chain.length).toBe(10);
});
