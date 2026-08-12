import {
  emptySudokuCellColors,
  NO_SUDOKU_COLOR,
  normalizeSudokuCellColors,
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
