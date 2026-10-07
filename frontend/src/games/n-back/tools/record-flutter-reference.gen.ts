/* psygames-n-back-record-flutter-reference · VER 2 · 02.10.2026 */
/**
 * ЭТАЛОН И СЛОВАРЬ ДЛЯ FLUTTER-ПОЛОВИНЫ N-BACK. Пишет два файла:
 *   · `flutter/test/fixtures/n-back-reference.json` — правила уровней (`levelParams` L1…L60),
 *     доли приманок, разбор режима шага (`nFromModeParam`), блоки ряда
 *     (`buildNbackSequence`) и d′/точность (`core/dprime.ts`); с 02.10 — ось 9: план глубины
 *     (`nPlanFor`, `switchEvery` уровня) и блоки с глубиной на позицию (`buildNbackSequenceVar`);
 *   · `flutter/assets/l10n/n_back.json` — подписи разбора партии на двенадцати языках из
 *     `core/i18n.ts`: перевод, сделанный для веба, приезжает в приложение как есть.
 *
 * 🔴 ЗАЧЕМ. Dart-перенос (`flutter/lib/games/n_back/model.dart`) сверяется с этим файлом,
 * снятым прогоном ЖИВОГО TS. n-back — флагман научного обоснования продукта: доля целей и
 * число приманок в блоке заданы точно, и d′ двух блоков сравнимы только если генератор
 * одинаков до последней позиции.
 *
 * ⚠️ БЛОКИ — НА ЗАПИСАННОМ ПОТОКЕ СЛУЧАЙНЫХ ЧИСЕЛ. Генератор берёт ГПСЧ параметром; здесь
 * поток пишется в эталон целиком (`randoms`), и Dart прогоняет ТОТ ЖЕ поток в том же
 * порядке вызовов. Так сверяется не «похоже», а каждая позиция блока и каждый вызов.
 *
 * ⚠️ ПОЧЕМУ ЭКСПОРТЁР ЛЕЖИТ В РЕПО: вшитые данные без экспортёра не чинятся, а эталон
 * замораживает ПЕРЕНОС, а не источник. ПОСЛЕ ЛЮБОЙ ПРАВКИ `app/games/n-back.tsx` (levelParams),
 * `src/games/nback/sequence.ts` или `src/games/n-back/core/*` — ПЕРЕЗАПУСТИТЬ И ЗАКОММИТИТЬ ОБА.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/n-back/tools/record-flutter-reference.gen.ts'
 */
import { levelParams, nFromModeParam, NB_VOLUME_TOP } from '@/app/games/n-back';
import {
  buildNbackSequence, buildNbackSequenceVar, countLures, countLuresVar, countMatches, countMatchesVar, lureRateFor,
  MATCH_RATE, nPlanFor,
} from '@/src/games/nback/sequence';
import { accuracyPercent, signalDetection, type NBackCounts } from '../core/dprime';
import { getNBackStrings, N_BACK_LOCALES } from '../core/i18n';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const REFERENCE_PATH = join(__dirname, '../../../../../flutter/test/fixtures/n-back-reference.json');
const STRINGS_PATH = join(__dirname, '../../../../../flutter/assets/l10n/n_back.json');

/** mulberry32 — только источник потока; Dart его не повторяет, а читает записанные числа. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('эталон n-back и словарь подписей для Flutter', () => {
  const levels = [];
  for (let level = 1; level <= 60; level++) {
    const p = levelParams(level);
    levels.push({
      level, n: p.N, modality: p.modality, showMs: p.showMs, gapMs: p.gapMs, lureRate: p.lureRate ?? null,
      switchEvery: p.switchEvery ?? null,
    });
  }

  const lures = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ n, rate: lureRateFor(n) }));
  const modes = ['1-back', '2-back', '3-back', '4-back', '6-back', '', '15t-single', '0-back', 'back', '12-back']
    .map((s) => ({ s, n: nFromModeParam(s) }));

  const sequences = [];
  let seed = 1;
  for (const trials of [15, 20, 30]) {
    for (const n of [1, 2, 4, 6]) {
      for (const alphabet of [9, 10]) {
        for (const lureRate of [undefined, 0.45]) {
          const source = mulberry32(seed++);
          const randoms: number[] = [];
          const rng = () => { const r = source(); randoms.push(r); return r; };
          const seq = buildNbackSequence(trials, n, alphabet, rng, lureRate);
          sequences.push({
            trials, n, alphabet, lureRate: lureRate ?? null, randoms,
            items: seq.items, matchAt: seq.matchAt, lureAt: seq.lureAt,
            matches: countMatches(seq.items, n), lures: countLures(seq.items, n),
          });
        }
      }
    }
  }

  // Ось 9: план глубины и блоки по нему — на тех уровнях, где смена есть, и на записанном потоке.
  const plans = [[20, 6, 10], [20, 6, 4], [15, 6, 7], [30, 6, 5], [20, 2, 3], [20, 1, 2], [20, 6, 0]]
    .map(([trials, n, every]) => ({ trials, n, switchEvery: every, plan: nPlanFor(trials, n, every || undefined) }));
  const varSequences = [];
  for (const level of [27, 29, 31, 33, 40]) {
    for (const trials of [15, 20, 30]) {
      for (const alphabet of [9, 10]) {
        const p = levelParams(level);
        const plan = nPlanFor(trials, p.N, p.switchEvery);
        const source = mulberry32(seed++);
        const randoms: number[] = [];
        const rng = () => { const r = source(); randoms.push(r); return r; };
        const seq = buildNbackSequenceVar(trials, plan, alphabet, rng, p.lureRate);
        varSequences.push({
          level, trials, alphabet, plan, lureRate: p.lureRate ?? null, randoms,
          items: seq.items, matchAt: seq.matchAt, lureAt: seq.lureAt,
          matches: countMatchesVar(seq.items, plan), lures: countLuresVar(seq.items, plan),
        });
      }
    }
  }

  const counts: NBackCounts[] = [
    { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 },
    { hits: 5, misses: 0, falseAlarms: 0, correctRejections: 10 },
    { hits: 0, misses: 5, falseAlarms: 10, correctRejections: 0 },
    { hits: 4, misses: 1, falseAlarms: 1, correctRejections: 9 },
    { hits: 3, misses: 2, falseAlarms: 2, correctRejections: 8 },
    { hits: 1, misses: 4, falseAlarms: 0, correctRejections: 10 },
    { hits: 5, misses: 0, falseAlarms: 10, correctRejections: 0 },
    { hits: 0, misses: 0, falseAlarms: 3, correctRejections: 12 },
    { hits: 6, misses: 0, falseAlarms: 0, correctRejections: 0 },
    { hits: 2, misses: 3, falseAlarms: 4, correctRejections: 6 },
  ];
  const signals = counts.map((c) => {
    const s = signalDetection(c);
    return { counts: c, ...s, accuracy0: accuracyPercent(c, 0), accuracy100: accuracyPercent(c, 100) };
  });

  writeFileSync(REFERENCE_PATH, JSON.stringify({
    source: 'app/games/n-back.tsx · src/games/nback/sequence.ts · src/games/n-back/core/dprime.ts',
    volumeTop: NB_VOLUME_TOP, matchRate: MATCH_RATE, levels, lures, modes, sequences, signals, plans, varSequences,
  }, null, 0) + '\n');

  const strings: Record<string, unknown> = {};
  for (const loc of N_BACK_LOCALES) strings[loc] = getNBackStrings(loc);
  writeFileSync(STRINGS_PATH, JSON.stringify(strings, null, 1) + '\n');

  expect(levels).toHaveLength(60);
  expect(sequences.length).toBeGreaterThan(40);
  expect(varSequences.length).toBe(30);
});
