import { sudokuEducational, sudokuResumeRevealed } from '../services/sudoku-attempt';

const solution = [[1, 2], [2, 1]];
describe('Sudoku independent attempt guard across the hybrid boundary', () => {
  test('legacy resume does not invent disclosure; actual evidence remains assisted', () => {
    expect(sudokuResumeRevealed({ hintUses: 0 })).toBe(false);
    expect(sudokuResumeRevealed({ answersRevealed: false })).toBe(false);
    expect(sudokuResumeRevealed({ answersRevealed: true })).toBe(true);
    expect(sudokuResumeRevealed({ lesson: true })).toBe(true);
    // Подсказка — помощь, а не показанное решение (отзывы «Релакс» 16.10, L76–L79).
    expect(sudokuResumeRevealed({ answersRevealed: false, hintUses: 1 })).toBe(false);
    expect(sudokuResumeRevealed({ answersRevealed: true, hintUses: 1 })).toBe(false);
  });
  test('one hint is help, not a shown solution: the level counts', () => {
    expect(sudokuEducational(solution, false, 1, null)).toBe(false);
    // Запись в реестре рядом с подсказкой — от подсказки (правило 04.10–20.10).
    expect(sudokuEducational(solution, false, 1, JSON.stringify([JSON.stringify(solution)]))).toBe(false);
    // Битый реестр закрывает зачёт и с подсказкой.
    expect(sudokuEducational(solution, false, 1, '{broken')).toBe(true);
  });
  test('old clean snapshot remains independent', () => {
    expect(sudokuEducational(solution, false, 0, null)).toBe(false);
  });
  test.each([
    [true, 0, null],
    [true, 1, null],
    [false, 0, JSON.stringify([JSON.stringify(solution)])],
    [false, 0, '["*"]'],
    [false, 0, '{broken'],
    [false, 0, '[1]'],
  ])('shown answers, ledger or corrupt data cannot grant completion', (flag, hints, ledger) => {
    expect(sudokuEducational(solution, flag as boolean, hints as number, ledger as string | null)).toBe(true);
  });
  test('a genuinely different solution can count', () => {
    expect(sudokuEducational([[2, 1], [1, 2]], false, 0,
      JSON.stringify([JSON.stringify(solution)]))).toBe(false);
  });
});
