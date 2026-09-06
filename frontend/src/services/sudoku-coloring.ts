/**
 * Пользовательская раскраска клеток Sudoku для цепочек рассуждений.
 * -1 = без цвета, 0..4 = индекс выбранного цвета.
 */
export type SudokuCellColors = number[][];

export const SUDOKU_COLOR_COUNT = 5;
export const NO_SUDOKU_COLOR = -1;

export function emptySudokuCellColors(N: number): SudokuCellColors {
  return Array.from({ length: N }, () => Array(N).fill(NO_SUDOKU_COLOR));
}

/**
 * Resume v2 уже отделяет новый формат от v1, но повреждённое v2-состояние тоже не
 * должно ронять экран. Валидные значения сохраняем, всё остальное очищаем.
 */
export function normalizeSudokuCellColors(value: unknown, N: number): SudokuCellColors {
  if (!Array.isArray(value) || value.length !== N) return emptySudokuCellColors(N);
  return Array.from({ length: N }, (_, r) => {
    const row = value[r];
    if (!Array.isArray(row) || row.length !== N) return Array(N).fill(NO_SUDOKU_COLOR);
    return Array.from({ length: N }, (_, c) => {
      const color = row[c];
      return Number.isInteger(color) && color >= NO_SUDOKU_COLOR && color < SUDOKU_COLOR_COUNT
        ? color
        : NO_SUDOKU_COLOR;
    });
  });
}

/**
 * Поставить клетке ГОТОВЫЙ цвет — движение отмены, а не игрока.
 *
 * Парная к `setPencilCell`: отмена возвращает «как было», а `toggle` этого не умеет —
 * повтор снимает метку, и вернуть ею замену одного цвета другим нельзя. `NO_SUDOKU_COLOR`
 * (-1) — законное значение «цвета не было».
 */
export function setSudokuCellColor(
  current: SudokuCellColors,
  N: number,
  r: number,
  c: number,
  color: number,
): SudokuCellColors {
  const next = normalizeSudokuCellColors(current, N);
  if (r < 0 || r >= N || c < 0 || c >= N) return next;
  next[r][c] = Number.isInteger(color) && color >= NO_SUDOKU_COLOR && color < SUDOKU_COLOR_COUNT
    ? color
    : NO_SUDOKU_COLOR;
  return next;
}

/** Повтор выбранного цвета снимает метку; другой цвет заменяет её. */
export function toggleSudokuCellColor(
  current: SudokuCellColors,
  N: number,
  r: number,
  c: number,
  color: number,
): SudokuCellColors {
  const next = normalizeSudokuCellColors(current, N);
  if (r < 0 || r >= N || c < 0 || c >= N || color < 0 || color >= SUDOKU_COLOR_COUNT) return next;
  next[r][c] = next[r][c] === color ? NO_SUDOKU_COLOR : color;
  return next;
}
