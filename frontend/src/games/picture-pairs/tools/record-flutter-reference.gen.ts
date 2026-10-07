/* psygames-picture-pairs-record-flutter-reference · VER 1 · 01.10.2026 */
/**
 * ЭТАЛОН ДЛЯ FLUTTER-ПОЛОВИНЫ «ПАРНЫХ КАРТИНОК». Пишет `flutter/test/fixtures/picture-pairs-reference.json`.
 *
 * 🔴 ПОЧЕМУ ЭКСПОРТЁР ПОЯВИЛСЯ ТОЛЬКО СЕЙЧАС. Эталон лёг в репо 30.09 с переносом (#32), а
 * экспортёра к нему не было: вшитые данные без экспортёра не чинятся. 01.10 понадобилось
 * поменять кривую показа (задача 0d6d8b28) — и переснять эталон было нечем. Этот файл
 * пересоздаёт все прежние ключи ДОСЛОВНО и берёт каждое число из ЖИВОГО TS, а не переписывает
 * формулы. Проверено 01.10.2026: новый выход совпал с прежним эталоном байт в байт везде,
 * кроме 60 значений `previewMs`, а прежние значения равны старой формуле `max(250, 800 − 40·L)`.
 *
 * ⚠️ ПОСЛЕ ЛЮБОЙ ПРАВКИ `app/games/picture-pairs.tsx` (levelCfg, previewMsPerCard, сеткаПар,
 * обменовПослеОшибки, PAIRS_VOLUME_TOP, SWAP_*) или `PAIR_BACKS` — ПЕРЕЗАПУСТИТЬ И ЗАКОММИТИТЬ.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/picture-pairs/tools/record-flutter-reference.gen.ts'
 */
import {
  levelCfg, PAIRS_VOLUME_TOP, SWAP_GAP_MS, SWAP_LIT_MS, обменовПослеОшибки, сеткаПар,
} from '@/app/games/picture-pairs';
import { PAIR_BACKS, SPRITE_COUNT } from '@/src/constants/pairThemes';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const REFERENCE_PATH = join(__dirname, '../../../../../flutter/test/fixtures/picture-pairs-reference.json');

/** Ставки обменов и броски: целая часть, дробная у самой границы, ноль и почти единица. */
const SWAP_RATES = [0, 0.25, 0.5, 1, 1.5, 4, 9.75];
const SWAP_ROLLS = [0, 0.1, 0.24, 0.26, 0.5, 0.74, 0.76, 0.999];

/**
 * Окна: ширина и высота поля (h = 0 — поле ещё не измерено). Высоты — то, что остаётся полю
 * на 390×844, 360×640, 375×667, 320×568 и 430×932 (замер живой сборки 16.09).
 */
const GRID_WINDOWS: readonly (readonly [number, number])[] = [
  [390, 686], [360, 482], [375, 509], [320, 410], [430, 774], [390, 0],
];
/** Уровни, где меняется число групп или размер группы, и один уровень с обменами. */
const GRID_LEVELS = [1, 5, 9, 12, 14, 18, 19, 21, 37];
/** Запас под кнопку отзыва: без выреза и с вырезом. */
const GRID_RESERVES = [156, 190];
/** Высота подсказки над полем. */
const GRID_HINT = 44;

it('пишет эталон «Парных картинок» для Flutter', () => {
  const levels = [];
  for (let L = 1; L <= 60; L++) levels.push({ level: L, ...levelCfg(L) });

  const swaps = [];
  for (const rate of SWAP_RATES) {
    for (const r of SWAP_ROLLS) swaps.push({ rate, r, n: обменовПослеОшибки(rate, () => r) });
  }

  const grids = [];
  for (const [w, h] of GRID_WINDOWS) {
    for (const L of GRID_LEVELS) {
      const c = levelCfg(L);
      for (const reserve of GRID_RESERVES) {
        const g = сеткаПар({
          групп: c.pairs,
          карт: c.pairs * c.groupSize,
          ширинаКонтейнера: Math.min(w - 32, 480),
          высотаПоля: h,
          резервСнизу: reserve,
          подсказка: GRID_HINT,
        });
        grids.push({ w, h, L, reserve, groups: c.pairs, cards: c.pairs * c.groupSize, ...g });
      }
    }
  }

  writeFileSync(REFERENCE_PATH, JSON.stringify({
    volumeTop: PAIRS_VOLUME_TOP,
    spriteCount: SPRITE_COUNT,
    swapLitMs: SWAP_LIT_MS,
    swapGapMs: SWAP_GAP_MS,
    backs: PAIR_BACKS,
    levels, swaps, grids,
  }, null, 1));

  expect(levels).toHaveLength(60);
  expect(swaps).toHaveLength(56);
  expect(grids).toHaveLength(108);
});
