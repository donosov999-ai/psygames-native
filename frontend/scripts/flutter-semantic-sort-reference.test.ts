/* psygames-flutter-semantic-sort-reference · VER 1 · 30.09.2026 */
/**
 * ВЫГРУЗКА ЭТАЛОНОВ «СОРТИРОВКИ СЛОВ» ИЗ ЖИВОГО TS — для сверки переноса на Flutter.
 *
 * Числа снимаются прогоном НАСТОЯЩИХ функций: `levelParams` и `buildSemanticRounds`
 * из `app/games/semantic-sort.tsx`, `pickFreshFrom` и `poolKey` из
 * `src/services/freshPool.ts`, `рядЯзыковПары` из `src/services/bilingualMode.ts`.
 * Вместо Math.random — заданная очередь чисел; Dart получает ту же очередь, поэтому
 * перепутанный порядок перемешиваний покраснеет, даже если каждая формула верна.
 *
 * ЭТО НЕ ПРОБА, А ПРИБОР (в обычный прогон не попадает). Перевыпуск — из `frontend/`:
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-semantic-sort-reference.test.ts'
 */
import { TRANSLATION_VOCAB } from '@/src/constants/translationVocab';
import { SEMANTIC_DISTRACTORS } from '@/src/data/semantic-distractors';
import { pickFreshFrom, poolKey } from '@/src/services/freshPool';
import { рядЯзыковПары } from '@/src/services/bilingualMode';
import { levelParams, buildSemanticRounds, semanticCategories } from '@/app/games/semantic-sort';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as {
  mkdirSync(p: string, o: { recursive: boolean }): void;
  writeFileSync(p: string, data: string, enc: string): void;
};
const path = require('path') as { resolve(...p: string[]): string; dirname(p: string): string };

const ВЫХОД = path.resolve(__dirname, '../../flutter/test/fixtures/semantic-sort-reference.json');
const АССЕТ = path.resolve(__dirname, '../../flutter/assets/vocab/semantic-distractors.json');

function очередь(значения: number[]): () => number {
  let i = 0;
  return () => значения[i++ % значения.length]!;
}
/** Длинная неповторяющаяся очередь — чтобы перемешивания не зациклились на коротком узоре. */
const ДЛИННАЯ = Array.from({ length: 997 }, (_, i) => ((i * 7919) % 997) / 997);

type W = Record<string, string | undefined>;

/** Категории — ИСПОЛНЕНИЕМ веб-функции, а не копией. */
function категории(tgt: string) {
  return semanticCategories(TRANSLATION_VOCAB as unknown as W[], tgt);
}

describe('эталоны «Сортировки слов» для переноса на Flutter', () => {
  it('выгружает', () => {
    const уровни = Array.from({ length: 15 }, (_, i) => ({ level: i + 1, ...levelParams(i + 1) }));

    const свежие = [
      { имя: 'ничего не видел', count: 5, seen: [] as string[] },
      { имя: 'часть уже видел', count: 5, seen: ['house', 'water', 'dog'] },
      { имя: 'запас кончился — круг сброшен', count: 4, seen: ['a', 'b', 'c'] },
    ].map((c) => {
      const items = ['a', 'b', 'c', 'house', 'water', 'dog', 'cat', 'sun'];
      const r = pickFreshFrom(items, c.count, c.seen, (x) => x, очередь(ДЛИННАЯ));
      return { ...c, items, итог: r };
    });

    const партии = [
      { имя: 'ru→en, уровень 1', tgt: 'en', второй: 'es', level: 1, билингво: false },
      { имя: 'ru→en, уровень 9', tgt: 'en', второй: 'es', level: 9, билингво: false },
      { имя: 'ru→en+es, уровень 4, билингво', tgt: 'en', второй: 'es', level: 4, билингво: true },
    ].map((c) => {
      const p = levelParams(c.level);
      const { cats, wordCat } = категории(c.tgt);
      const effCats = Math.min(p.catsPerRound, cats.length);
      const языкиРаунда = c.билингво ? рядЯзыковПары(p.roundsCount, c.tgt, c.второй) : [];
      const wordsPool = (TRANSLATION_VOCAB as W[]).filter((w) => w.cat && cats.includes(w.cat)
        && (c.билингво ? [c.tgt, c.второй].every((l) => w[l]) : !!w[c.tgt]));
      const rngPick = очередь(ДЛИННАЯ);
      const fresh = pickFreshFrom(wordsPool, p.roundsCount, [], (w) => String(w.en), rngPick);
      const rounds = buildSemanticRounds(fresh.picked, p.roundsCount, cats, effCats, wordCat,
        c.tgt, языкиРаунда, c.билингво, очередь(ДЛИННАЯ.slice(13)));
      return {
        ...c, ...p, effCats, cats, размерПула: wordsPool.length,
        отобрано: fresh.picked.map((w) => String(w.en)),
        раунды: rounds,
      };
    });

    // 🔴 ПОРОГ «НЕ МЕНЬШЕ ТРЁХ СЛОВ» В ЖИВЫХ ДАННЫХ СПИТ: минимум 6 слов в категории
    // на всех 12 языках. Мутация «порог снят» поэтому выживала — проба стояла там,
    // где правило не работает. Здесь свой словарь, где у одной категории два слова.
    const свой: W[] = [
      { en: 'a1', cat: 'x' }, { en: 'a2', cat: 'x' }, { en: 'a3', cat: 'x' },
      { en: 'b1', cat: 'y' }, { en: 'b2', cat: 'y' },
      { en: 'c1', cat: 'z' }, { en: 'c2', cat: 'z' }, { en: 'c3', cat: 'z' }, { en: 'c4', cat: 'z' },
      { ru: 'только ру', cat: 'x' },
    ];
    const порог = { словарь: свой, tgt: 'en', итог: (() => { const r = semanticCategories(свой, 'en');
      return { cats: r.cats, wordCat: Object.fromEntries(r.wordCat) }; })() };

    const эталон = {
      снято: '2026-09-30',
      источник: ['frontend/app/games/semantic-sort.tsx', 'frontend/src/services/freshPool.ts'],
      прибор: 'frontend/scripts/flutter-semantic-sort-reference.test.ts',
      очередь: ДЛИННАЯ,
      сдвигОчередиРаундов: 13,
      ключЗапаса: { pool: 'semantic_sort_words', пример: poolKey('semantic_sort_words', 'nzt48'), гость: poolKey('semantic_sort_words', undefined) },
      проходТочностью: 0.8,
      уровни,
      свежие,
      партии,
      порог,
      таблицаКоварных: { ключей: Object.keys(SEMANTIC_DISTRACTORS).length },
    };
    fs.mkdirSync(path.dirname(ВЫХОД), { recursive: true });
    fs.writeFileSync(ВЫХОД, JSON.stringify(эталон, null, 1), 'utf8');
    fs.mkdirSync(path.dirname(АССЕТ), { recursive: true });
    fs.writeFileSync(АССЕТ, JSON.stringify(SEMANTIC_DISTRACTORS), 'utf8');
    // eslint-disable-next-line no-console
    console.log(`эталон: ${партии.map((x) => `${x.имя}: ${x.раунды.length} раундов`).join(' · ')}`);
    expect(партии.every((x) => x.раунды.length > 0)).toBe(true);
  });
});
