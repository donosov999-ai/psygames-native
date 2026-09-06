import { readFileSync } from 'fs';
import { join } from 'path';
import {
  emptySudokuCellColors,
  NO_SUDOKU_COLOR,
  normalizeSudokuCellColors,
  SUDOKU_COLOR_COUNT,
  toggleSudokuCellColor,
} from '@/src/services/sudoku-coloring';

describe('Sudoku cell coloring', () => {
  it('paints, replaces and removes the same color without mutating the source', () => {
    const empty = emptySudokuCellColors(3);
    const painted = toggleSudokuCellColor(empty, 3, 1, 2, 2);
    expect(empty[1][2]).toBe(NO_SUDOKU_COLOR);
    expect(painted[1][2]).toBe(2);

    const replaced = toggleSudokuCellColor(painted, 3, 1, 2, 4);
    expect(replaced[1][2]).toBe(4);
    expect(toggleSudokuCellColor(replaced, 3, 1, 2, 4)[1][2]).toBe(NO_SUDOKU_COLOR);
  });

  it('normalizes malformed resume data instead of throwing', () => {
    expect(normalizeSudokuCellColors([[0]], 2)).toEqual([
      [NO_SUDOKU_COLOR, NO_SUDOKU_COLOR],
      [NO_SUDOKU_COLOR, NO_SUDOKU_COLOR],
    ]);
    expect(normalizeSudokuCellColors([[0, 99], ['bad', -1]], 2)).toEqual([
      [0, NO_SUDOKU_COLOR],
      [NO_SUDOKU_COLOR, NO_SUDOKU_COLOR],
    ]);
  });
});

/**
 * 🔴 ПАЛИТРА И СЧЁТЧИК ОБЯЗАНЫ СХОДИТЬСЯ — иначе цвет из сохранённой партии
 * подставится в несуществующий элемент и клетка потеряет краску молча.
 *
 * Гейт заведён 07.09.2026 вместе с расширением палитры 5 → 9 по отчёту «Релакс»
 * (app_feedback 83584e50: «хотелось бы девять цветов, чтобы каждая цифра имела свой
 * цвет»). Проверяет ФАЙЛ экрана: обе палитры там объявлены литералами, и разъехаться
 * с константой они могут только молча.
 */
describe('девять цветов: палитры и счётчик не разъезжаются', () => {
  const SRC = readFileSync(join(__dirname, '..', '..', 'app', 'games', 'sudoku.tsx'), 'utf8');
  const палитра = (имя: string): string[] => {
    const m = SRC.match(new RegExp(`const ${имя} = \\[([^\\]]*)\\] as const;`));
    return m ? (m[1].match(/#[0-9A-Fa-f]{6}/g) ?? []) : [];
  };

  it('🔴 в обеих палитрах ровно SUDOKU_COLOR_COUNT цветов', () => {
    expect(`обычная: ${палитра('CELL_COLORS').length}`).toBe(`обычная: ${SUDOKU_COLOR_COUNT}`);
    expect(`дальтоник: ${палитра('CELL_COLORS_CB').length}`).toBe(`дальтоник: ${SUDOKU_COLOR_COUNT}`);
  });

  it('🔴 цвета внутри палитры РАЗНЫЕ — иначе две цифры красятся одинаково', () => {
    for (const имя of ['CELL_COLORS', 'CELL_COLORS_CB']) {
      const p = палитра(имя).map((c) => c.toLowerCase());
      expect(`${имя}: уникальных ${new Set(p).size} из ${p.length}`).toBe(`${имя}: уникальных ${p.length} из ${p.length}`);
    }
  });

  it('🔴 индекс последнего цвета принимается, а следующий за ним — нет', () => {
    const N = 9;
    const пусто = emptySudokuCellColors(N);
    const последний = toggleSudokuCellColor(пусто, N, 0, 0, SUDOKU_COLOR_COUNT - 1);
    expect(последний[0][0]).toBe(SUDOKU_COLOR_COUNT - 1);
    // за границей — краска не ставится
    const мимо = toggleSudokuCellColor(пусто, N, 1, 1, SUDOKU_COLOR_COUNT);
    expect(мимо[1][1]).toBe(NO_SUDOKU_COLOR);
  });
});
