/* psygames-mahjong-depth-on-blocked-test · VER 1 · 05.09.2026 */
/**
 * 🔴 ГЛУБИНА ВИДНА НА ЗАНЯТОЙ ПЛИТКЕ ТОЖЕ — А ИХ НА ДОСКЕ ДЕВЯТЬ ИЗ ДЕСЯТИ.
 *
 * ЧТО ЛОМАЛОСЬ. Соседняя проба `mahjong-layers-are-visible` считала яркость по
 * `layerShadeFor` и была зелёной: этажи различались на 15,7 единицы. Экран же
 * звал эту функцию ТОЛЬКО для свободной плитки — занятая красилась постоянной
 * серой плёнкой `#7b8798` при 0,42, одинаковой на всех пяти этажах.
 *
 * ЗАМЕР 05.09.2026 (`freeFlags` по живой раздаче, случайный разбор):
 *     ур.  1 — занятых 80 % на старте, 51 % в среднем за партию
 *     ур. 20 — 79 % / 78 %
 *     ур. 28 — 90 % / 82 %
 *     ур. 40 — 90 % / 85 %
 * Разброс яркости по этажам: у свободных 62,9, у ЗАНЯТЫХ 0,0. То есть признак,
 * ради которого писался `layerShadeFor`, доходил до одной плитки из шести, а
 * девять из десяти на глубоких уровнях стояли ровно одного цвета.
 *
 * ⚠️ ПОЧЕМУ ЭТО ОТДЕЛЬНАЯ ПРОБА, А НЕ СТРОЧКА В СОСЕДНЕЙ. Соседняя описывает
 * ветку «свободна» и обязана остаться про неё: если однажды сломают её, а не
 * эту, надо видеть, ЧТО именно сломали. Здесь проверяется вторая ветка и —
 * главное — что ветки не разъезжаются: занятая обязана быть темнее свободной
 * НА КАЖДОМ этаже, иначе состояние и высота перепутаются.
 *
 * ⚠️ СЧИТАЕМ В ОБЕИХ ТЕМАХ. Занятая плитка раньше стояла на `opacity: 0.6`, то
 * есть подмешивала фон доски: на светлой теме выцветала вверх, на чёрной вниз.
 * Проба меряет и `#F5F5F7`, и `#000000` — если прозрачность вернут, ответы в
 * темах разойдутся, и это будет видно здесь.
 */
import { tileShadeFor, layerShadeFor, ПЛЁНКА_ГЛУБИНЫ, ТЕНЬ_ЗАНЯТОЙ, freeFlags, type Tile } from '@/src/games/mahjong/board';
import { generateDeal } from '@/app/games/mahjong';
import { layoutForLevel } from '@/src/games/mahjong/layouts';
import { silhouetteForLevel } from '@/src/games/mahjong/silhouettes';
import { mahjongLevel } from '@/src/services/mahjongLevels';

declare const __dirname: string;
declare function require(m: string): any;

/** Средний цвет кости — замерен по assets/images/games/mahjong-tile.webp. */
const КОСТЬ: [number, number, number] = [232, 215, 185];
/** Фон доски из ThemeContext: светлая тема и тёмная. */
const ФОНЫ: Record<string, [number, number, number]> = {
  светлая: [0xf5, 0xf5, 0xf7],
  тёмная: [0, 0, 0],
};

function hex(c: string): [number, number, number] {
  const n = parseInt(c.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const смесь = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
  [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t];
const яркость = (c: [number, number, number]): number => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

/**
 * ЯРКОСТЬ ПЛИТКИ ТАК, КАК ЕЁ СОБИРАЕТ ЭКРАН: кость → плёнка глубины → фон доски.
 *
 * ⚠️ Прозрачность плитки к фону = 1 (экран, `opacity: 1`). Держим её отдельным
 * параметром, чтобы проба считала ИМЕННО композицию, а не одну функцию: вернут
 * `0.6` у занятых — сюда придётся вписать другое число, и разница по темам
 * вылезет сама.
 */
function плитка(layer: number, maxLayer: number, free: boolean, фон: [number, number, number], прозр = 1): number {
  const кость = смесь(КОСТЬ, hex(ПЛЁНКА_ГЛУБИНЫ), tileShadeFor(layer, maxLayer, free));
  return яркость(смесь(кость, фон, 1 - прозр));
}

const ЭТАЖЕЙ = [2, 3, 4, 5];     // столько слоёв бывает на уровнях маджонга

describe('маджонг: глубина видна и на занятой плитке', () => {
  it('есть что проверять: функция вообще знает про занятость', () => {
    expect(tileShadeFor(0, 4, true)).toBe(layerShadeFor(0, 4));
    expect(tileShadeFor(0, 4, false)).toBeGreaterThan(tileShadeFor(0, 4, true));
    expect(ТЕНЬ_ЗАНЯТОЙ).toBeGreaterThan(0);
  });

  it('🔴 ЗАНЯТЫХ на доске большинство — значит их ветка и есть основная', () => {
    const мало: string[] = [];
    for (const L of [1, 20, 28, 40]) {
      const p = mahjongLevel(L);
      const tiles: Tile[] = generateDeal(
        p.layers, p.pairs, p.cols, silhouetteForLevel(L), layoutForLevel(L)?.places,
      ).tiles;
      const free = freeFlags(tiles, new Array(tiles.length).fill(true));
      const доля = free.filter((v) => !v).length / tiles.length;
      // Замер 05.09.2026: 0,80 / 0,79 / 0,90 / 0,90. Порог 0,5 — проба про то,
      // что ветка занятых главная, а не про точный процент.
      if (доля < 0.5) мало.push(`ур.${L}: занятых ${(доля * 100).toFixed(0)} %`);
    }
    expect(мало).toEqual([]);
  });

  it('🔴 соседние этажи ЗАНЯТЫХ плиток различимы — в обеих темах', () => {
    const слепые: string[] = [];
    for (const [тема, фон] of Object.entries(ФОНЫ)) {
      for (const слоёв of ЭТАЖЕЙ) {
        const max = слоёв - 1;
        for (let l = 0; l < max; l += 1) {
          const d = Math.abs(плитка(l, max, false, фон) - плитка(l + 1, max, false, фон));
          // 6 единиц яркости — та же граница различимости, что в соседней пробе.
          if (d < 6) слепые.push(`${тема}, ${слоёв} слоёв, этажи ${l}/${l + 1}: ${d.toFixed(1)}`);
        }
      }
    }
    expect(слепые).toEqual([]);
  });

  it('🔴 занятая плитка ТЕМНЕЕ свободной на КАЖДОМ этаже', () => {
    // Иначе состояние и высота путаются: занятая верхнего этажа сравнивается со
    // свободной нижнего. Ровно на этом развалилась первая попытка починки —
    // серая плёнка `#7b8798` (яркость 133) темнит светлый верх и светлит тёмный
    // низ, и на среднем этаже свободная с занятой сходились до 1,1 единицы.
    // Перебор 5×6 (плотность плёнки × прозрачность плитки) не дал ни одного
    // чистого сочетания; поэтому занятость выражена ТОЙ ЖЕ тенью.
    const слитые: string[] = [];
    for (const [тема, фон] of Object.entries(ФОНЫ)) {
      for (const слоёв of ЭТАЖЕЙ) {
        const max = слоёв - 1;
        for (let l = 0; l <= max; l += 1) {
          const d = плитка(l, max, true, фон) - плитка(l, max, false, фон);
          if (d < 12) слитые.push(`${тема}, ${слоёв} слоёв, этаж ${l}: своб−занят = ${d.toFixed(1)}`);
        }
      }
    }
    expect(слитые).toEqual([]);
  });

  it('🔴 стопка занятых читается сверху вниз, а не наоборот', () => {
    const перевёрнутые: string[] = [];
    for (const [тема, фон] of Object.entries(ФОНЫ)) {
      for (const слоёв of ЭТАЖЕЙ) {
        const max = слоёв - 1;
        if (плитка(max, max, false, фон) <= плитка(0, max, false, фон)) {
          перевёрнутые.push(`${тема}, ${слоёв} слоёв: верхняя занятая не светлее нижней`);
        }
      }
    }
    expect(перевёрнутые).toEqual([]);
  });

  it('🔴 картинка НЕ зависит от темы — прозрачность плитки к фону убрана', () => {
    // Пока плитка непрозрачна, светлая и тёмная темы дают одно и то же. Вернут
    // `opacity: 0.6` занятой — числа разойдутся, и это увидит вот эта строка.
    const расхождения: string[] = [];
    for (const слоёв of ЭТАЖЕЙ) {
      const max = слоёв - 1;
      for (let l = 0; l <= max; l += 1) {
        for (const free of [true, false]) {
          const св = плитка(l, max, free, ФОНЫ.светлая as [number, number, number]);
          const тм = плитка(l, max, free, ФОНЫ.тёмная as [number, number, number]);
          if (Math.abs(св - тм) > 0.01) расхождения.push(`${слоёв} слоёв, этаж ${l}, своб=${free}: ${св.toFixed(1)} против ${тм.toFixed(1)}`);
        }
      }
    }
    expect(расхождения).toEqual([]);
  });

  it('🔴 кость просвечивает даже под самой глубокой тенью', () => {
    // Потолок 0,92 в `tileShadeFor`: за ним плитка становится чёрным
    // прямоугольником — рисунок ещё виден, а материал уже нет.
    const чёрные: string[] = [];
    for (const слоёв of ЭТАЖЕЙ) {
      const max = слоёв - 1;
      const самая = плитка(0, max, false, ФОНЫ.светлая as [number, number, number]);
      if (самая < 60) чёрные.push(`${слоёв} слоёв: самая глубокая занятая = ${самая.toFixed(1)}`);
    }
    expect(чёрные).toEqual([]);
  });
});

describe('экран красит плитку ядром, а не своей копией правила', () => {
  it('🔴 плёнка глубины стоит на КАЖДОЙ плитке, а не только на свободной', () => {
    const src = (require('fs').readFileSync(
      require('path').join(__dirname, '../../app/games/mahjong.tsx'), 'utf8',
    ) as string).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    // Тут стояла развилка `free ? layerShadeFor(...) : 0.42` — она и была дефектом.
    expect(src).toMatch(/opacity: tileShadeFor\(tt\.layer, maxLayer, free\)/);
    expect(src).not.toMatch(/'#7b8798'/);
    // Своей константы прозрачности у занятой плитки быть не должно вовсе.
    expect(src).not.toMatch(/free \? 1 : 0\.6/);
  });
});
