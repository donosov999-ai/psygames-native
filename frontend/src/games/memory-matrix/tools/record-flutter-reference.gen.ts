/* psygames-memory-matrix-record-flutter-reference · VER 1 · 01.10.2026 */
/**
 * ЭТАЛОН ДЛЯ FLUTTER-ПОЛОВИНЫ «МАТРИЦЫ ПАМЯТИ». Пишет `flutter/test/fixtures/mm-reference.json`.
 *
 * 🔴 ПОЧЕМУ ЭКСПОРТЁР ПОЯВИЛСЯ ТОЛЬКО СЕЙЧАС. Эталон `mm-reference.json` лёг в репо 23.09 при
 * первом переносе (732193f7a), а экспортёра к нему не было: вшитые данные без экспортёра не
 * чинятся — правка веба молча расходилась бы с эталоном. Этот файл пересоздаёт прежние ключи
 * (`volumeTop`, `decoyRoom`, `levels` L1…L40, `cells` 7 уровней × 3 раунда × 2 режима) ДОСЛОВНО и
 * дописывает то, без чего перенос был урезан: раунды уровня, шаг зарядки, паузу на чтение
 * подписи и раздачу раунда на ЗАПИСАННОМ потоке случайных чисел.
 *
 * ⚠️ ПОСЛЕ ЛЮБОЙ ПРАВКИ `app/games/memory-matrix.tsx` (levelParams, cellsNeeded, dealRound,
 * паузаНаЧтение) — ПЕРЕЗАПУСТИТЬ И ЗАКОММИТИТЬ.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/memory-matrix/tools/record-flutter-reference.gen.ts'
 */
import {
  cellsNeeded, dealRound, DECOY_ROOM, levelParams, MEMORYMATRIX_RULES, MM_TOTAL_ROUNDS, MM_VOLUME_TOP,
  паузаНаЧтение,
} from '@/app/games/memory-matrix';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const REFERENCE_PATH = join(__dirname, '../../../../../flutter/test/fixtures/mm-reference.json');

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

test('эталон «Матрицы памяти» для Flutter', () => {
  const modes = ['static', 'sequential'] as const;
  // ── прежние ключи — дословно, в прежнем порядке ──
  const levels = [];
  for (let level = 1; level <= 40; level++) levels.push({ level, ...levelParams(level) });
  const cells = [];
  for (const level of [1, 3, 8, 15, 16, 20, 30]) {
    for (const round of [1, 2, 3]) {
      for (const mode of modes) cells.push({ level, round, mode, ...cellsNeeded(level, round, mode) });
    }
  }
  // ── новое ──
  const levelsTail = [];
  for (let level = 41; level <= 60; level++) levelsTail.push({ level, ...levelParams(level) });
  const rounds = [];
  for (let level = 1; level <= 30; level++) {
    for (let round = 1; round <= MM_TOTAL_ROUNDS; round++) {
      for (const mode of modes) {
        for (const preset of [false, true]) rounds.push({ level, round, mode, preset, ...cellsNeeded(level, round, mode, preset) });
      }
    }
  }
  const captions = ['', 'Memorise!', 'Запомните клетки!', '🟣 Запомни ФИОЛЕТОВЫЕ · Перечёркнутые — мимо', '記憶してください', 'x'.repeat(80)];
  const pauses = [];
  for (const caption of captions) {
    for (const prev of ['', caption, 'другая']) pauses.push({ caption, prev, ms: паузаНаЧтение(caption, prev) });
  }
  const deals = [];
  let seed = 1;
  for (const gs of [3, 4, 5, 6]) {
    for (const [need, two, decoys] of [[3, false, 0], [4, false, 2], [5, true, 0], [7, true, 6], [8, false, 6]] as const) {
      if ((two ? need * 2 : need) > gs * gs) continue;
      const source = mulberry32(seed++);
      const randoms: number[] = [];
      const rng = () => { const r = source(); randoms.push(r); return r; };
      deals.push({ gs, need, two, decoysWanted: decoys, randoms, ...dealRound(gs, need, two, decoys, rng) });
    }
  }

  writeFileSync(REFERENCE_PATH, JSON.stringify({
    volumeTop: MM_VOLUME_TOP, decoyRoom: DECOY_ROOM, levels, cells,
    source: 'app/games/memory-matrix.tsx',
    totalRounds: MM_TOTAL_ROUNDS,
    rules: MEMORYMATRIX_RULES.map((r) => ({ key: r.key, fromLevel: r.fromLevel })),
    levelsTail, rounds, pauses, deals,
  }, null, 1));

  expect(levels).toHaveLength(40);
  expect(cells).toHaveLength(42);
  expect(deals.length).toBeGreaterThan(10);
});
