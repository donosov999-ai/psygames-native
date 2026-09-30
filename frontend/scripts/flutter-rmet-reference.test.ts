/* psygames-flutter-rmet-reference · VER 1 · 24.09.2026 */
/**
 * ВЫГРУЗКА «ПРОЧТИ ЭМОЦИЮ» ВО FLUTTER: материал и снимки — один источник на обе половины.
 *
 * 🔴 ПОЧЕМУ МАТЕРИАЛ НЕ ПЕРЕПИСЫВАЕТСЯ РУКАМИ. Восемнадцать пунктов, у каждого
 * четыре слова-варианта на двух языках и три снимка глаз. Переписать — значит
 * завести второй список, который разойдётся с первым молча: игра станет РАЗНОЙ
 * в вебе и в приложении, а результаты по ней — несопоставимыми.
 *
 * 🔴 КАРТА СНИМКОВ ЧИТАЕТСЯ ИЗ ИСХОДНИКА, А НЕ ПИШЕТСЯ ЗАНОВО. В экране она
 * объявлена через `require`, который в Node отдаёт НОМЕР ассета, а не имя
 * файла. Поэтому имена берутся разбором самого текста экрана: так они не могут
 * разъехаться с тем, что показывает веб-версия.
 *
 * ⚠️ ЭТО НЕ ТЕСТ RMET. У игры свой материал: схематичные глаза и свои слова,
 * фотографии Барона-Коэна под копирайтом и не используются. Нормы чужого
 * инструмента к ней неприменимы — и в выгрузку не попадает ни одна.
 *
 * ЭТО ПРИБОР, а не проба. Перевыпуск — из `frontend/`:
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-rmet-reference.test.ts'
 */
import { ITEMS } from '@/app/games/rmet';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as {
  mkdirSync(p: string, o: { recursive: boolean }): void;
  writeFileSync(p: string, data: string, enc: string): void;
  readFileSync(p: string, enc: string): string;
  copyFileSync(a: string, b: string): void;
  readdirSync(p: string): string[];
};
const path = require('path') as { resolve(...p: string[]): string };
const ROOT = path.resolve(__dirname, '..');
const FLUTTER = path.resolve(ROOT, '..', 'flutter');

it('выгружает материал и снимки «Прочти эмоцию»', () => {
  /* ── 1. Карта снимков — разбором исходника экрана ── */
  const source = fs.readFileSync(path.resolve(ROOT, 'app', 'games', 'rmet.tsx'), 'utf8');
  const block = source.slice(source.indexOf('const EYE_IMG'), source.indexOf('};', source.indexOf('const EYE_IMG')));
  const images: Record<string, string[]> = {};
  for (const line of block.split('\n')) {
    const key = line.match(/^\s*'([^']+)':/);
    if (!key) continue;
    const files = [...line.matchAll(/rmet\/([a-z0-9_]+\.webp)/g)].map((m) => m[1] as string);
    if (files.length) images[key[1] as string] = files;
  }
  expect(Object.keys(images)).toHaveLength(18);
  expect(Object.values(images).every((f) => f.length === 3)).toBe(true);

  /* ── 2. Снимки копируются в сборку Flutter ── */
  const from = path.resolve(ROOT, 'assets', 'images', 'rmet');
  const to = path.resolve(FLUTTER, 'assets', 'rmet');
  fs.mkdirSync(to, { recursive: true });
  const copied = fs.readdirSync(from).filter((f) => f.endsWith('.webp'));
  for (const file of copied) fs.copyFileSync(path.resolve(from, file), path.resolve(to, file));
  expect(copied.length).toBeGreaterThanOrEqual(54);

  /* ── 3. Материал ── */
  const data = {
    meta: {
      source: 'frontend/app/games/rmet.tsx',
      note: 'Выгружено прибором frontend/scripts/flutter-rmet-reference.test.ts. Своё упражнение по мотивам парадигмы, НЕ тест RMET: материал свой, норм чужого инструмента здесь нет.',
      items: ITEMS.length,
      images: copied.length,
    },
    items: ITEMS.map((it) => ({
      emoji: it.emoji,
      hint: { ru: it.hint_ru, en: it.hint_en },
      correct: { ru: it.correct_ru, en: it.correct_en },
      options: { ru: it.options_ru, en: it.options_en },
      files: images[it.correct_en] ?? [],
    })),
  };
  fs.mkdirSync(path.resolve(FLUTTER, 'assets'), { recursive: true });
  fs.writeFileSync(path.resolve(FLUTTER, 'assets', 'rmet.json'), JSON.stringify(data), 'utf8');

  /* Верный ответ обязан стоять среди вариантов — иначе пункт нерешаем. */
  expect(data.items.filter((i) => !i.options.ru.includes(i.correct.ru))).toEqual([]);
  expect(data.items.filter((i) => !i.options.en.includes(i.correct.en))).toEqual([]);
  expect(data.items.filter((i) => i.options.ru.length !== 4 || i.options.en.length !== 4)).toEqual([]);
  expect(data.items.filter((i) => i.files.length !== 3)).toEqual([]);
});
