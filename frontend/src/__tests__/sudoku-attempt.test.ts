import { sudokuEducational } from '../services/sudoku-attempt';

const solution = [[1, 2], [2, 1]];
describe('Sudoku independent attempt guard across the hybrid boundary', () => {
  test('old clean snapshot remains independent', () => {
    expect(sudokuEducational(solution, false, 0, null)).toBe(false);
  });
  test.each([
    [true, 0, null],
    [false, 1, null],
    [false, 0, JSON.stringify([JSON.stringify(solution)])],
    [false, 0, '["*"]'],
    [false, 0, '{broken'],
    [false, 0, '[1]'],
  ])('reveal, hints, ledger or corrupt data cannot grant completion', (flag, hints, ledger) => {
    expect(sudokuEducational(solution, flag as boolean, hints as number, ledger as string | null)).toBe(true);
  });
  test('a genuinely different solution can count', () => {
    expect(sudokuEducational([[2, 1], [1, 2]], false, 0,
      JSON.stringify([JSON.stringify(solution)]))).toBe(false);
  });
});
