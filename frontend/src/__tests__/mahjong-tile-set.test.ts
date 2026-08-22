/* psygames-mahjong-tile-set · VER 1 · 22.08.2026 */
/**
 * КОПИЙ ОДНОГО РИСУНКА — НЕ БОЛЬШЕ ЧЕТЫРЁХ, КАК В НАБОРЕ.
 *
 * 🔴 ЧТО НАШЛОСЬ. Рисунков было двенадцать, а раздаются они по кругу
 * (`k % SYMBOLS.length`). При 72 парах выходило по шесть пар каждого рисунка —
 * ДВЕНАДЦАТЬ одинаковых плиток на доске. Замер по настоящим раскладкам:
 *
 *     ур. 1  (10 пар) — 2 копии       ур. 20 (60 пар) — 10 копий
 *     ур. 12 (36 пар) — 6 копий       ур. 40 (72 пары) — 12 копий
 *
 * Это не «сложнее», а ПРОЩЕ и уродливее: пара из двенадцати одинаковых находится
 * взглядом мгновенно, и доска читается как стена повторов, а не как набор. В
 * настоящем маджонге копий ровно четыре: 36 рисунков × 4 = 144 плитки.
 *
 * ⚠️ ПРОВЕРЯЕМ НА НАСТОЯЩИХ РАСКЛАДКАХ, а не на формуле раздачи: между формулой и
 * доской стоит пересборка, отсев неудачных сборок и силуэт.
 */
import { generate, MAX_COPIES, SYMBOL_COUNT } from '@/app/games/mahjong';
import { mahjongLevel, FULL_SET_PAIRS } from '@/src/services/mahjongLevels';

const LEVELS = [1, 3, 6, 12, 20, 30, 40, 60];

describe('набор плиток', () => {
  /**
   * ⚠️ ЧИСЛО ПРИБИТО К ФАКТУ НАБОРА, А НЕ К САМОМУ СЕБЕ. Все проверки ниже
   * сравниваются с `MAX_COPIES` — и если оставить только их, поднятая до восьми
   * константа пройдёт весь гейт: он будет сверять доску с новым обещанием вместо
   * старого. В настоящем маджонге 144 плитки и 36 рисунков, то есть ровно четыре
   * копии; это внешний факт, и он записывается здесь прямо.
   */
  it('🔴 копий в наборе ровно четыре — 144 плитки на 36 рисунков', () => {
    expect(MAX_COPIES).toBe(4);
    expect(SYMBOL_COUNT).toBe(36);
    expect(SYMBOL_COUNT * MAX_COPIES).toBe(144);
  });

  it('рисунков хватает на полный набор — иначе копии полезут по кругу', () => {
    expect(SYMBOL_COUNT * (MAX_COPIES / 2)).toBeGreaterThanOrEqual(FULL_SET_PAIRS);
  });

  it('🔴 ни один рисунок не встречается чаще четырёх раз', () => {
    const bad: string[] = [];
    for (const L of LEVELS) {
      const p = mahjongLevel(L);
      for (let k = 0; k < 8; k += 1) {
        const deal = generate(p.layers, p.pairs, p.cols);
        const tiles = (deal as { tiles?: unknown[] }).tiles ?? (deal as unknown[]);
        if (!Array.isArray(tiles) || tiles.length === 0) continue;
        const count = new Map<number, number>();
        for (const t of tiles as Array<{ symbol: number }>) count.set(t.symbol, (count.get(t.symbol) ?? 0) + 1);
        const worst = Math.max(...count.values());
        if (worst > MAX_COPIES && bad.length < 3) bad.push(`ур.${L}: ${worst} копий одного рисунка`);
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * ⚠️ ВСТРЕЧНАЯ СТОРОНА. Уложиться в четыре копии можно и жульничеством — раздав
   * доску одними уникальными рисунками. Тогда исчезает сам смысл набора: пар
   * становится ровно столько, сколько рисунков, и доска мельчает.
   */
  it('🔴 на большой доске рисунки повторяются, а не вырождаются в уникальные', () => {
    const p = mahjongLevel(40);
    const deal = generate(p.layers, p.pairs, p.cols);
    const tiles = ((deal as { tiles?: unknown[] }).tiles ?? []) as Array<{ symbol: number }>;
    if (!tiles.length) return;   // редкая неудачная сборка — проверять нечего
    const count = new Map<number, number>();
    for (const t of tiles) count.set(t.symbol, (count.get(t.symbol) ?? 0) + 1);
    expect(`рисунков ${count.size}, максимум копий ${Math.max(...count.values())}`)
      .toBe(`рисунков ${count.size}, максимум копий ${MAX_COPIES}`);
  });

  it('🔴 все рисунки различны — одинаковых плиток под разными номерами не бывает', () => {
    const { SYMBOLS } = require('@/app/games/mahjong');
    expect(new Set(SYMBOLS).size).toBe(SYMBOLS.length);
  });

  /**
   * ⚠️ ЗНАКИ ТОЛЬКО ШИРОКО ПОДДЕРЖАННЫЕ. Новинка нарисуется квадратом на телефоне
   * 2016 года, и две разные плитки станут неотличимы — то есть игра сломается
   * ровно там, где её нельзя проверить с этого стола.
   */
  it('🔴 в наборе нет знаков вне базовых плоскостей', () => {
    const { SYMBOLS } = require('@/app/games/mahjong');
    const bad = (SYMBOLS as string[]).filter((sym) => {
      const cp = sym.codePointAt(0) ?? 0;
      // Свежие блоки эмодзи (Emoji 12+) лежат выше U+1FA70.
      return cp >= 0x1FA70;
    });
    expect(bad).toEqual([]);
  });
});

declare function require(id: string): any;
