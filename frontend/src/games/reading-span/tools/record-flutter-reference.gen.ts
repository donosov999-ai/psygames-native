/* psygames-reading-span-record-flutter-reference · VER 1 · 01.10.2026 */
/**
 * ЭТАЛОН И ДАННЫЕ ДЛЯ FLUTTER-ПОЛОВИНЫ «ОБЪЁМА ПРИ ЧТЕНИИ». Пишет два файла:
 *   · `flutter/assets/reading_span/sentences.json` — предложения игры (`SENTENCES`) как есть:
 *     во Flutter второй копии в коде нет, правится только здесь, в вебе;
 *   · `flutter/test/fixtures/reading-span-reference.json` — правила уровней (`levelParams`),
 *     порог правила уровня, проверка воспоминания (`recallScore`), метка трудности и счёт
 *     партии, раздачи набора (`pickFreshFrom` — тот же отбор невиданного, что зовёт игра).
 *
 * 🔴 ЗАЧЕМ. Dart-перенос (`flutter/lib/games/reading_span/model.dart`) сверяется с этим файлом,
 * снятым прогоном ЖИВОГО TS. Раздачи — на ЗАПИСАННОМ потоке случайных чисел: те же
 * предложения и столько же съеденных чисел. Проверка воспоминания — на вводах с запятыми,
 * точками с запятой, лишними пробелами, неразрывным пробелом, регистром и «ё».
 *
 * ⚠️ ПОЧЕМУ ЭКСПОРТЁР ЛЕЖИТ В РЕПО: вшитые данные без экспортёра не чинятся, а эталон
 * замораживает ПЕРЕНОС, а не источник. ПОСЛЕ ЛЮБОЙ ПРАВКИ `app/games/reading-span.tsx`
 * (предложения, levelParams, recallScore) или `src/services/freshPool.ts` — ПЕРЕЗАПУСТИТЬ
 * И ЗАКОММИТИТЬ ОБА ФАЙЛА.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/reading-span/tools/record-flutter-reference.gen.ts'
 */
import {
  levelParams, READINGSPAN_RULES, recallScore, SENTENCES, sessionDifficulty, sessionScore,
} from '@/app/games/reading-span';
import { pickFreshFrom } from '@/src/services/freshPool';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const ROOT = join(__dirname, '../../../../../flutter');
const SENTENCES_PATH = join(ROOT, 'assets/reading_span/sentences.json');
const REFERENCE_PATH = join(ROOT, 'test/fixtures/reading-span-reference.json');

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

test('эталон «Объёма при чтении» и предложения для Flutter', () => {
  // Одна запись на строку: правка предложения в вебе видна в диффе ассета одной строкой.
  writeFileSync(SENTENCES_PATH, '[\n' + SENTENCES.map((s) => '  ' + JSON.stringify(s)).join(',\n') + '\n]\n');

  const levels = [];
  for (const poolSize of [SENTENCES.length, 10, 30]) {
    for (let level = 1; level <= 80; level++) levels.push({ poolSize, level, ...levelParams(level, poolSize) });
  }

  // Проверка воспоминания: настоящие наборы, ввод — как его набирает человек.
  const recall = [];
  const nbsp = ' ';
  for (const [from, size] of [[0, 3], [10, 5], [21, 4], [40, 8], [55, 7]] as const) {
    const seq = SENTENCES.slice(from, from + size);
    for (const language of ['ru', 'en', 'de']) {
      const words = seq.map((s) => (language !== 'ru' ? s.lastEn : s.lastRu));
      const inputs = [
        words.join(' '),
        words.join(', '),
        words.join(';'),
        '  ' + words.join(`  ,${nbsp}`) + '  ',
        words.map((w) => w.toUpperCase()).join(' '),
        words.slice(0, -1).join(' '),
        [...words].reverse().join(' '),
        [...words, 'лишнее'].join(' '),
        words.map((w, i) => (i === 1 ? w.replace(/е/g, 'ё') : w)).join(' '),
        '',
        words[0],
      ];
      for (const input of inputs) recall.push({ from, size, language, input, ...recallScore(seq, language, input) });
    }
  }

  const difficulty = Array.from({ length: 12 }, (_, i) => ({ setSize: i + 1, d: sessionDifficulty(i + 1) }));
  const scores = [[0, 0, 0], [3, 3, 0], [2, 3, 1], [0, 1, 5], [8, 7, 0], [1, 0, 7]].map(([h, j, e]) => ({
    hits: h, judgeHits: j, errors: e, score: sessionScore(h, j, e),
  }));

  // Раздачи набора: тот же отбор невиданного, что зовёт игра (pickFresh → pickFreshFrom, ключ — en).
  const deals = [];
  let seed = 1;
  const keys = SENTENCES.map((s) => s.en);
  for (const size of [3, 5, 8, 12]) {
    for (const seen of [[], keys.slice(0, 20), keys.slice(0, keys.length - 2)]) {
      const source = mulberry32(seed++);
      const randoms: number[] = [];
      const rng = () => { const r = source(); randoms.push(r); return r; };
      const res = pickFreshFrom(SENTENCES, size, seen, (it) => it.en, rng);
      deals.push({ size, seenIn: seen, randoms, picked: res.picked.map((s) => s.en), seenOut: res.seen, wrapped: res.wrapped });
    }
  }

  writeFileSync(REFERENCE_PATH, JSON.stringify({
    source: 'app/games/reading-span.tsx · src/services/freshPool.ts',
    poolSize: SENTENCES.length,
    rules: READINGSPAN_RULES.map((r) => ({ key: r.key, fromLevel: r.fromLevel })),
    levels, recall, difficulty, scores, deals,
  }, null, 0) + '\n');

  expect(SENTENCES.length).toBeGreaterThan(40);
  expect(recall.length).toBeGreaterThan(100);
});
