/* psygames-listening-span-record-flutter-reference · VER 1 · 01.10.2026 */
/**
 * ЭТАЛОН ДЛЯ FLUTTER-ПОЛОВИНЫ «ОБЪЁМА НА СЛУХ». Пишет
 * `flutter/test/fixtures/listening-span-reference.json`: правила уровней (`levelParams`
 * L1…L60), пороги правил, сходство слов (`похожесть`), мешки слов по двенадцати языкам
 * (`wordPool` — с учётом записей голоса), подбор отвлекающих и раздачи раунда целиком
 * (`dealRound`).
 *
 * 🔴 ЗАЧЕМ. Dart-перенос (`flutter/lib/games/listening_span/model.dart`) сверяется с этим
 * файлом, снятым прогоном ЖИВОГО TS. Раздача сверяется на ЗАПИСАННОМ потоке случайных
 * чисел: Dart обязан дать те же слова, ту же сетку и съесть ровно столько же чисел —
 * иначе порядок обращений к ГПСЧ разошёлся, и доля похожих отвлекающих поплыла бы между
 * платформами молча. ⚠️ Сортировка по сходству в вебе УСТОЙЧИВАЯ (так велит стандарт JS),
 * в Dart `List.sort` — нет: равные по сходству слова встали бы в другом порядке.
 *
 * ⚠️ ПОЧЕМУ ЭКСПОРТЁР ЛЕЖИТ В РЕПО: вшитые данные без экспортёра не чинятся, а эталон
 * замораживает ПЕРЕНОС, а не источник. ПОСЛЕ ЛЮБОЙ ПРАВКИ `app/games/listening-span.tsx`,
 * `src/services/freshPool.ts`, словаря `translationVocab.ts` или указателей голоса —
 * ПЕРЕЗАПУСТИТЬ И ЗАКОММИТИТЬ.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/listening-span/tools/record-flutter-reference.gen.ts'
 */
import {
  dealRound, levelParams, LISTENINGSPAN_RULES, LSPAN_VOLUME_TOP, ROUNDS, wordPool,
  похожесть, подобратьОтвлекающие,
} from '@/app/games/listening-span';
import { LANGUAGES } from '@/src/contexts/LanguageContext';
import { hasVocab } from '@/src/constants/translationVocab';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const REFERENCE_PATH = join(__dirname, '../../../../../flutter/test/fixtures/listening-span-reference.json');

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

/** Поток, который пишет каждое выданное число. */
function recording(seed: number): { rng: () => number; randoms: number[] } {
  const source = mulberry32(seed);
  const randoms: number[] = [];
  return { rng: () => { const r = source(); randoms.push(r); return r; }, randoms };
}

test('эталон «Объёма на слух» для Flutter', () => {
  const levels = [];
  for (let level = 1; level <= 60; level++) levels.push({ level, ...levelParams(level) });

  const langs = LANGUAGES.map((l) => l.code).filter((c) => hasVocab(c));
  const pools: Record<string, string[]> = {};
  for (const lang of langs) pools[lang] = wordPool(lang);

  // Сходство: соседние слова мешка на каждом языке + пары, на которых ось и задумана.
  const pairs: [string, string][] = [
    ['casa', 'cama'], ['casa', 'perro'], ['', 'casa'], ['casa', ''], ['rot', 'rat'],
    ['kalt', 'kalb'], ['Haus', 'haus'], ['Straße', 'strasse'], ['房子', '水'], ['घर', 'पानी'],
  ];
  for (const lang of langs) {
    const p = pools[lang];
    for (let i = 0; i + 1 < Math.min(p.length, 16); i += 1) pairs.push([p[i], p[i + 1]]);
  }
  const similarity = pairs.map(([a, b]) => ({ a, b, v: похожесть(a, b) }));

  // Отвлекающие и раздачи — на урезанных мешках по 40 слов (поток раздачи растёт с мешком),
  // и две раздачи на полном мешке, чтобы сверить и его.
  let seed = 1;
  const distractors = [];
  const deals = [];
  for (const lang of ['en', 'es', 'de', 'ru', 'zh', 'hi']) {
    const small = pools[lang].slice(0, 40);
    for (const span of [3, 5, 8]) {
      for (const share of [0, 0.3, 1]) {
        const spoken = small.slice(span, span * 2);
        const r = recording(seed++);
        const picked = подобратьОтвлекающие(small, spoken, span, share, r.rng);
        distractors.push({ lang, pool: small, spoken, need: span, share, randoms: r.randoms, picked });

        for (const seenKind of ['none', 'almostAll']) {
          const seen = seenKind === 'none' ? [] : small.slice(0, small.length - 2);
          const d = recording(seed++);
          const deal = dealRound(small, seen, span, share, d.rng);
          deals.push({ lang, pool: small, seenIn: seen, span, share, randoms: d.randoms,
            spoken: deal.spoken, grid: deal.grid, seenOut: deal.seen });
        }
      }
    }
  }
  for (const lang of ['en', 'ru']) {
    const d = recording(seed++);
    const deal = dealRound(pools[lang], [], 8, 0.5, d.rng);
    deals.push({ lang, pool: 'full', seenIn: [], span: 8, share: 0.5, randoms: d.randoms,
      spoken: deal.spoken, grid: deal.grid, seenOut: deal.seen });
  }

  writeFileSync(REFERENCE_PATH, JSON.stringify({
    source: 'app/games/listening-span.tsx · src/services/freshPool.ts · src/constants/translationVocab.ts',
    volumeTop: LSPAN_VOLUME_TOP, rounds: ROUNDS,
    rules: LISTENINGSPAN_RULES.map((r) => ({ key: r.key, fromLevel: r.fromLevel })),
    levels, langs, pools, similarity, distractors, deals,
  }, null, 0) + '\n');

  expect(levels).toHaveLength(60);
  expect(langs.length).toBeGreaterThanOrEqual(7);
  expect(deals.length).toBeGreaterThan(100);
});
