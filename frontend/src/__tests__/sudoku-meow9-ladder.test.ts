/* psygames-sudoku-meow9-ladder · VER 1 · 02.10.2026 · psygames-sudoku-claude-mac */
/**
 * 🔴 СТУПЕНИ «МЯУ — ДРУЗЬЯ» БЕРУТ СВОИ ДОСКИ ПО ПОЗИЦИИ В БЛОКЕ — И ПАДАЮТ, ЕСЛИ ДОСОК НЕТ.
 *
 * Генератора правила друзей на TS нет: `export-sudoku-boards.cjs` для ступени с вариантом
 * 'friends' берёт доски из выгрузки MindLab (`flutter/assets/levels/sudoku-meow9-boards.json`)
 * модулем `flutter/tools/meow9-ladder.cjs`. Номера ступеней ставит развилка лестницы в
 * `levelConfig` (план v4 — 129–132), поэтому здесь лестница ПОДСТАВНАЯ: блок 'friends' из
 * четырёх ступеней в середине классики. Проверяется то, на чём доска могла бы уехать не туда:
 * позиция в блоке, поле, число пустых и конец выгрузки.
 */
import type { Variant } from '@/src/services/sudoku-core';

declare const require: (m: string) => any;
declare const __dirname: string;
const { readFileSync } = require('fs');
const { join } = require('path');
const { friendsRows } = require(join(__dirname, '..', '..', '..', 'flutter', 'tools', 'meow9-ladder.cjs'));

const meow = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'flutter', 'assets', 'levels', 'sudoku-meow9-boards.json'), 'utf8'));
const FIRST = 129;
const GIVENS = [30, 28, 26, 24];

type Cfg = { variant: Variant; N: number; BR: number; BC: number; blanks: number };
const ladder = (over: Partial<Record<number, Partial<Cfg>>> = {}, last = FIRST + 3) => (lv: number): Cfg => {
  const base: Cfg = lv >= FIRST && lv <= last
    ? { variant: 'friends', N: 9, BR: 3, BC: 3, blanks: 81 - (GIVENS[lv - FIRST] ?? 24) }
    : { variant: 'none', N: 9, BR: 3, BC: 3, blanks: 50 };
  return { ...base, ...(over[lv] ?? {}) };
};
const givens = (puzzle: string) => [...puzzle].filter((ch) => ch !== '0').length;

describe('«Мяу — друзья» 9×9 на ступенях лестницы', () => {
  it('🔴 каждая ступень блока берёт СВОЮ ступень выгрузки: 30 / 28 / 26 / 24 подсказок, по 6 досок', () => {
    const got = [0, 1, 2, 3].map((k) => {
      const rows = friendsRows(FIRST + k, ladder(), meow);
      return `${FIRST + k}: ${rows.length}×${[...new Set(rows.map((r: { puzzle: string }) => givens(r.puzzle)))].join('/')}`;
    });
    expect(got).toEqual(['129: 6×30', '130: 6×28', '131: 6×26', '132: 6×24']);
  });

  it('строки — как у остальных вариантных досок: поле, правило, задание ⊂ решению', () => {
    for (const r of friendsRows(FIRST, ladder(), meow)) {
      expect([r.level, r.variant, r.n, r.br, r.bc]).toEqual([FIRST, 'friends', 9, 3, 3]);
      expect(r.puzzle).toHaveLength(81);
      for (let i = 0; i < 81; i++) if (r.puzzle[i] !== '0') expect(r.puzzle[i]).toBe(r.solution[i]);
    }
  });

  it('🔴 блок длиннее выгрузки, чужое поле или чужое число пустых — выгрузчик падает с причиной', () => {
    expect(() => friendsRows(FIRST + 4, ladder({}, FIRST + 4), meow)).toThrow(/5-я в блоке/);
    expect(() => friendsRows(FIRST, ladder({ [FIRST]: { N: 6, BR: 2, BC: 3 } }), meow)).toThrow(/поле 6×6/);
    expect(() => friendsRows(FIRST + 1, ladder({ [FIRST + 1]: { blanks: 51 } }), meow)).toThrow(/пустых 51/);
    expect(() => friendsRows(FIRST, ladder(), null)).toThrow(/export_kids_boards\.py --meow9/);
  });
});
