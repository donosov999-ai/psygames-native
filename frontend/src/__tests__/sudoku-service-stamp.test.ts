/* psygames-gate-sudoku-service-stamp · VER 1 · 09.09.2026 */
/**
 * ШТАМП ВЕРСИИ НА КАЖДОМ СЕРВИСЕ СУДОКУ.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНАЯ ПРОБА, ЕСЛИ ГЕЙТЫ ШТАМПОВ УЖЕ ЕСТЬ. Их два, и НИ ОДИН не
 * смотрит в `src/services/`: `core-module-stamp` обходит `src/games/`,
 * `game-version-stamp` — экраны `app/games/`. Замер 09.09.2026: три судочных
 * сервиса (`sudoku-core`, `sudoku-grade`, `sudoku-coloring`) и мой собственный
 * новый `sudoku-level-help` лежали БЕЗ штампа, и обе пробы были зелёными.
 * Поймал это Денис глазами, а не прогон, — значит дыра в покрытии, а не мелочь.
 *
 * ⚠️ ЧТО ЭТА ПРОБА НЕ ЛОВИТ. Она проверяет, что штамп ЕСТЬ и разбирается. Она НЕ
 * проверяет, что он свежий: правку без подъёма VER не поймает ни она, ни соседи.
 * Ровно так 09.09 экран судоку уехал с чужой датой (VER 13 · 28.08 при правках
 * от 09.09). Это общая для всех разделов дыра — вынесена координатору.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');
const DIR = path.resolve(__dirname, '../services');

/** Ровно первая строка: ниже штамп не считается — иначе засчитается ссылка в описании. */
const STAMP = /^\/\* (psygames-[a-z0-9-]+) · VER (\d+) · (\d{2})\.(\d{2})\.(\d{4}) \*\/$/;

const files: string[] = fs.readdirSync(DIR)
  .filter((n: string) => /^sudoku.*\.ts$/.test(n) && !/\.(test|spec)\.ts$/.test(n))
  .sort();

test('🔴 каждый сервис судоку начинается штампом версии', () => {
  expect(files.length).toBeGreaterThan(5);   // каталог найден, а не пуст
  const без = files.filter((n: string) => {
    const first = fs.readFileSync(path.join(DIR, n), 'utf8').split('\n')[0];
    return !STAMP.test(first);
  });
  expect(`сервисов без штампа: ${без.join(', ') || 'нет'}`).toBe('сервисов без штампа: нет');
});

test('🔴 имя в штампе совпадает с именем файла — иначе штамп не про этот модуль', () => {
  const чужие = files.filter((n: string) => {
    const m = STAMP.exec(fs.readFileSync(path.join(DIR, n), 'utf8').split('\n')[0]);
    if (!m) return false;                       // отсутствие ловит проба выше
    const ожид = 'psygames-' + n.replace(/\.ts$/, '').replace(/[A-Z]/g, (c: string) => '-' + c.toLowerCase());
    return m[1] !== ожид;
  });
  expect(`штампов с чужим именем: ${чужие.join(', ') || 'нет'}`).toBe('штампов с чужим именем: нет');
});
