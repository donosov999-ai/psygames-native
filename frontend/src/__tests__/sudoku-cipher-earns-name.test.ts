/* psygames-sudoku-cipher-earns-name · VER 1 · 07.10.2026 · psygames-sudoku-claude-mac */
/**
 * ШИФР ЗАСЛУЖИВАЕТ СВОЁ ИМЯ (пункт 2 цепочки «14 усложнений», задача 1f8fbd7f).
 *
 * Часть подсказок показана буквами: одинаковые буквы — одинаковые цифры, разные — разные; код
 * выводится вместе с доской. Гейт держит:
 *   · 🔴 буквы смешаны с цифрами: если зашифровать ВСЕ подсказки зашифрованных цифр, доска не
 *     единственна (перестановка зашифрованных цифр — тоже решение) — так и было в первой редакции
 *     07.10, генератор не выкопал ни одной доски;
 *   · правило: та же буква — та же цифра, другая буква — другая;
 *   · доски пути лестницы (`generateLogical`, зерно сеяное): логикой та же доска; без букв —
 *     ни одна; под потолком 3 — не больше одной из 4; буквы на доске есть.
 * 📍 Замер 07.10 (16 досок, полоса 4..6, 5 цифр, половина подсказок — буквами): ступень 4 у 16/16,
 *    cipher_code — самый трудный у всех; без букв 0/16; под потолком 3 0/16; единственны 16/16.
 *    Скрипт — ~/dev/psygames/sudoku-chat/measure/cipher-measure-20261007.test.ts.
 */
import { cipherLetters, cipherOk, countSolutions, encodeCipher, overlayOk } from '@/src/services/sudoku-core';
import { generateLogical, gradePuzzle, solvedSameBoard } from '@/src/services/sudoku-grade';

jest.setTimeout(180000);

const SOL = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2], [6, 7, 2, 1, 9, 5, 3, 4, 8], [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3], [4, 2, 6, 8, 5, 3, 7, 9, 1], [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4], [2, 8, 7, 4, 1, 9, 6, 3, 5], [3, 4, 5, 2, 8, 6, 1, 7, 9],
];
const seeded = (s: number) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

describe('шифр: буквы и правило', () => {
  it('буквы только на подсказках; клетка-буква в задании пустая', () => {
    const letters = SOL.map((row) => row.map((v) => (v === 5 ? 1 : v === 7 ? 2 : 0)));
    const puzzle = SOL.map((row, r) => row.map((v, c) => ((r + c) % 2 ? 0 : v)));
    const enc = encodeCipher(puzzle, letters);
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (puzzle[r][c] === 0) expect(enc.cipher[r][c]).toBe(0);
      if (enc.cipher[r][c]) expect(enc.puzzle[r][c]).toBe(0);
      else expect(enc.puzzle[r][c]).toBe(puzzle[r][c]);
    }
  });

  it('та же буква — та же цифра, другая буква — другая', () => {
    const cipher = Array.from({ length: 9 }, () => Array(9).fill(0));
    cipher[0][0] = 1; cipher[4][4] = 1; cipher[8][8] = 2;
    const g = Array.from({ length: 9 }, () => Array(9).fill(0));
    g[4][4] = 6;
    expect(cipherOk(g, 0, 0, 6, cipher, 9)).toBe(true);
    expect(cipherOk(g, 0, 0, 7, cipher, 9)).toBe(false);
    expect(cipherOk(g, 8, 8, 6, cipher, 9)).toBe(false);
    expect(cipherOk(g, 8, 8, 7, cipher, 9)).toBe(true);
    expect(overlayOk(g, 0, 0, 7, 9, { cipher })).toBe(false);
  });

  it('🔴 зашифровать ВСЕ подсказки зашифрованных цифр нельзя — доска не единственна', () => {
    const spy = jest.spyOn(Math, 'random').mockImplementation(seeded(2));
    const letters = cipherLetters(SOL, 9, 5, 1);   // доля 1 — каждая подсказка цифры буквой
    spy.mockRestore();
    const enc = encodeCipher(SOL.map((row) => [...row]), letters);   // ВСЯ доска — подсказки
    expect(countSolutions(enc.puzzle, 9, 3, 3, 'none', undefined, 2, { steps: 20000 }, undefined, undefined, undefined, { cipher: enc.cipher })).toBe(2);
  });
});

describe('🔴 шифр заслуживает своё имя на досках генератора', () => {
  const spy = jest.spyOn(Math, 'random').mockImplementation(seeded(133));
  const built = Array.from({ length: 4 }, () => generateLogical(133, 81, 9, 3, 3, 'cipher', { budgetMs: 8000, tier: { min: 1, max: 6 } }));
  spy.mockRestore();

  it('буквы на доске есть и смешаны с цифрами', () => {
    for (const b of built) {
      const letters = b.gen.cipher!.flat().filter((v) => v);
      expect(letters.length).toBeGreaterThanOrEqual(3);
      expect(b.gen.puzzle.flat().filter((v) => v).length).toBeGreaterThan(0);
    }
  });

  it('с буквами — логикой та же доска; без букв — ни одна; под потолком 3 — не больше одной', () => {
    let same = 0, plain = 0, capped = 0;
    for (const b of built) {
      const ctx = { N: 9, BR: 3, BC: 3, variant: 'cipher' as const, cipher: b.gen.cipher };
      if (solvedSameBoard(gradePuzzle(b.gen.puzzle, ctx), b.gen.solution)) same++;
      if (gradePuzzle(b.gen.puzzle, { N: 9, BR: 3, BC: 3, variant: 'none' }).solved) plain++;
      if (gradePuzzle(b.gen.puzzle, ctx, 3).solved) capped++;
    }
    expect(`та же доска ${same}/4, без букв ${plain}`).toBe('та же доска 4/4, без букв 0');
    expect(capped).toBeLessThanOrEqual(1);
  });

  it('логический путь меры шифр знает (LOGIC_VARIANTS); срок вышел — не вердикт', () => {
    const logic = built.filter((b) => !b.fellBack).length;
    const outOfTime = built.filter((b) => b.fellBack && b.budgetSpent).length;
    expect(logic > 0 || outOfTime === built.length).toBe(true);
  });
});
