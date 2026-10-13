import { sudokuEducational, sudokuResumeRevealed } from '../services/sudoku-attempt';

const solution = [[1, 2], [2, 1]];
describe('Sudoku independent attempt guard across the hybrid boundary', () => {
  test('legacy resume does not invent disclosure; actual evidence remains assisted', () => {
    expect(sudokuResumeRevealed({ hintUses: 0 })).toBe(false);
    expect(sudokuResumeRevealed({ answersRevealed: false })).toBe(false);
    expect(sudokuResumeRevealed({ answersRevealed: true })).toBe(true);
    expect(sudokuResumeRevealed({ lesson: true })).toBe(true);
    expect(sudokuResumeRevealed({ answersRevealed: false, hintUses: 1 })).toBe(true);
  });
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
