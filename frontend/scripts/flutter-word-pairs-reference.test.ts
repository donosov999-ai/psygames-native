/* psygames-flutter-word-pairs-reference · VER 1 · 24.09.2026 */
/**
 * ВЫГРУЗКА «ПАР СЛОВ» ВО FLUTTER: списки слов и эталон лестницы.
 *
 * 🔴 СЛОВАРЬ ПЕРЕВОДОВ ЗДЕСЬ НЕ ВЫГРУЖАЕТСЯ — ОН УЖЕ В СБОРКЕ. Нативная
 * половина возит `assets/vocab/translation-vocab.json` (283 записи, 12 языков)
 * ради «Словаря SRS»; вторая копия тех же строк раздула бы сборку и разошлась
 * бы с первой молча. Режим перевода берёт ТОТ ЖЕ файл.
 *
 * 🔴 ЛЕСТНИЦА СНИМАЕТСЯ ИСПОЛНЕНИЕМ. `levelParams` — единственное место, где
 * задаётся и число пар, и время на пару; проверять перенос переписанной
 * формулой нельзя, поэтому пятнадцать уровней прогоняются живой функцией.
 *
 * ЭТО ПРИБОР, а не проба. Перевыпуск — из `frontend/`:
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-word-pairs-reference.test.ts'
 */
import { RUSSIAN_WORDS, ENGLISH_WORDS } from '@/src/constants/games';
import { levelParams } from '@/app/games/word-pairs';
import { pickFreshFrom } from '@/src/services/freshPool';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as {
  mkdirSync(p: string, o: { recursive: boolean }): void;
  writeFileSync(p: string, data: string, enc: string): void;
};
const path = require('path') as { resolve(...p: string[]): string };
const FLUTTER = path.resolve(__dirname, '..', '..', 'flutter');

/** Очередь бросков вместо случайности: перенос обязан повторить ПОРЯДОК. */
const ряд = (значения: number[]) => {
  let i = 0;
  return () => значения[i++ % значения.length] as number;
};

it('выгружает списки слов и эталон лестницы «Пар слов»', () => {
  const data = {
    meta: {
      source: 'frontend/src/constants/games.ts · app/games/word-pairs.tsx',
      note: 'Выгружено прибором frontend/scripts/flutter-word-pairs-reference.test.ts. Словарь переводов НЕ здесь: он уже в assets/vocab/translation-vocab.json.',
      ru: RUSSIAN_WORDS.length,
      en: ENGLISH_WORDS.length,
    },
    words: { ru: [...RUSSIAN_WORDS], en: [...ENGLISH_WORDS] },
  };
  fs.mkdirSync(path.resolve(FLUTTER, 'assets'), { recursive: true });
  fs.writeFileSync(path.resolve(FLUTTER, 'assets', 'word-pairs.json'), JSON.stringify(data), 'utf8');
  expect(data.words.ru.length).toBeGreaterThanOrEqual(50);
  expect(data.words.en.length).toBeGreaterThanOrEqual(50);

  const levels = Array.from({ length: 15 }, (_, i) => {
    const p = levelParams(i + 1);
    return { level: i + 1, pairCount: p.pairCount, perPairMs: p.perPairMs, maxErrors: Math.floor(p.pairCount / 4) };
  });

  /** Отбор «сначала невиданное» — с заданной очередью бросков. */
  const items = ['a', 'b', 'c', 'd', 'e'];
  // ⚠️ Поле «что было видно ДО» называется `before`: у результата есть своё
  // `seen` (что стало видно ПОСЛЕ), и одноимённое поле развернулось бы поверх.
  const fresh = [
    { before: [] as string[], count: 2, ...pickFreshFrom(items, 2, [], (x) => x, ряд([0.1, 0.9, 0.5, 0.3])) },
    { before: ['a', 'b'], count: 2, ...pickFreshFrom(items, 2, ['a', 'b'], (x) => x, ряд([0.1, 0.9, 0.5, 0.3])) },
    { before: ['a', 'b', 'c', 'd'], count: 3, ...pickFreshFrom(items, 3, ['a', 'b', 'c', 'd'], (x) => x, ряд([0.2, 0.7, 0.4, 0.6, 0.1])) },
  ];

  const reference = {
    meta: { source: 'frontend/app/games/word-pairs.tsx · src/services/freshPool.ts' },
    levels,
    fresh,
  };
  fs.mkdirSync(path.resolve(FLUTTER, 'test', 'fixtures'), { recursive: true });
  fs.writeFileSync(
    path.resolve(FLUTTER, 'test', 'fixtures', 'word-pairs-reference.json'),
    JSON.stringify(reference, null, 1),
    'utf8',
  );

  expect(levels[0]).toEqual({ level: 1, pairCount: 4, perPairMs: 7000, maxErrors: 1 });
  expect(levels[14].pairCount).toBe(15);
  expect(levels[14].perPairMs).toBe(2520);
  /* Запас кончился — круг сбрасывается, и это отмечено флагом. */
  expect(fresh[2]!.wrapped).toBe(true);
  expect(fresh[0]!.wrapped).toBe(false);
});
