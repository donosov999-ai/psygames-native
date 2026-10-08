/* psygames-sudoku-modifiers-earn-name · VER 1 · 07.10.2026 · psygames-sudoku-claude-mac */
/**
 * УДВОИТЕЛИ И ОТРИЦАТЕЛЬНЫЕ ЗАСЛУЖИВАЮТ СВОИ ИМЕНА (пункт 13, типы 2 и 3; задача f46c796c).
 *
 * Девять скрытых клеток — по одной в строке, столбце и блоке, цифры 1–9 по разу — в суммах групп
 * считаются вдвое (удвоители) или со знаком минус (отрицательные). Где они — выводит игрок. Гейт —
 * на КАЖДЫЙ тип (приёмка карточки):
 *   · сетка честная: судоку + ровно один нарушитель в ряду, их цифры 1–9 по разу;
 *   · суммы групп — взвешенные; цифры в группе не повторяются;
 *   · доска единственна перебором (цифры И нарушители); мера доходит до той же доски;
 *   · без правила доска невозможна: те же группы как обычный киллер не имеют ни одного решения;
 *   · без вывода на суммах (потолок 3) не решается.
 * 📍 Замер 07.10 (по 12 досок): единственны 12/12 у обоих; ≈11 цифр, ≈30 групп; ≈135 шагов, из них
 *    ≈55 на суммах; ≈0,4 с на доску. Скрипт — ~/dev/psygames/sudoku-chat/measure/modifiers-measure-20261007.test.ts.
 */
import { countSolutions } from '@/src/services/sudoku-core';
import { countM, MOD_WEIGHT, generateBoardM, logicM, type ModKind } from '@/src/services/sudoku-modifiers';
import { generateLogical, gradeModifiers } from '@/src/services/sudoku-grade';

jest.setTimeout(180000);

const seeded = (s: number) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

describe.each(['doublers', 'negators'] as ModKind[])('🔴 %s на досках генератора', (kind) => {
  const rnd = seeded(149);
  const boards = Array.from({ length: 3 }, () => generateBoardM(kind, rnd)!);

  it('сетка честная: судоку и ровно один нарушитель в каждом ряду, их цифры 1–9 по разу', () => {
    for (const b of boards) {
      const { digits, mods } = b.solution;
      for (let i = 0; i < 9; i++) {
        const row = digits[i], col = digits.map((r) => r[i]);
        const box = Array.from({ length: 9 }, (_, j) => digits[Math.floor(i / 3) * 3 + Math.floor(j / 3)][(i % 3) * 3 + (j % 3)]);
        for (const u of [row, col, box]) expect([...u].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(mods[i].filter(Boolean)).toHaveLength(1);
        expect(mods.map((r) => r[i]).filter(Boolean)).toHaveLength(1);
        expect(Array.from({ length: 9 }, (_, j) => mods[Math.floor(i / 3) * 3 + Math.floor(j / 3)][(i % 3) * 3 + (j % 3)]).filter(Boolean)).toHaveLength(1);
      }
      const modDigits = digits.flatMap((row, r) => row.filter((_, c) => mods[r][c])).sort();
      expect(modDigits).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
  });

  it('суммы групп взвешенные, цифры в группе не повторяются', () => {
    const w = MOD_WEIGHT[kind];
    for (const b of boards) {
      b.cages.cells.forEach((cs, k) => {
        const ds = cs.map(([r, c]) => b.solution.digits[r][c]);
        expect(new Set(ds).size).toBe(ds.length);
        expect(cs.reduce((t, [r, c]) => t + b.solution.digits[r][c] * (b.solution.mods[r][c] ? w : 1), 0)).toBe(b.cages.sum[k]);
      });
    }
  });

  it('единственна перебором (цифры и нарушители); мера доходит до той же доски', () => {
    for (const b of boards) {
      expect(countM(b.puzzle, b.cages, kind, 2, { steps: 400000 })).toBe(1);
      const l = logicM(b.puzzle, b.cages, kind);
      expect(l.solved).toBe(true);
      expect(l.state!.digits).toEqual(b.solution.digits);
      expect(l.state!.mods).toEqual(b.solution.mods);
    }
  });

  it('🔴 без правила доска невозможна: те же группы как обычный киллер — ни одного решения', () => {
    for (const b of boards) {
      // Ноль решений засчитывается, только если перебор ДОШЁЛ: исчерпанный бюджет тоже отвечает нулём.
      const budget = { steps: 2000000 };
      expect(countSolutions(b.puzzle.map((r) => [...r]), 9, 3, 3, 'none', undefined, 2, budget, undefined, undefined, b.cages)).toBe(0);
      expect(budget.steps).toBeGreaterThanOrEqual(0);
    }
  });

  it('без вывода на суммах (потолок 3) не решается; ступень 4', () => {
    for (const b of boards) {
      expect(gradeModifiers(b.puzzle, b.cages, kind).tier).toBe(4);
      expect(gradeModifiers(b.puzzle, b.cages, kind, 3).solved).toBe(false);
    }
  });

  it('боевой путь: generateLogical отдаёт доску без нарушителей в ответе', () => {
    const spy = jest.spyOn(Math, 'random').mockImplementation(seeded(150));
    const g = generateLogical(149, 81, 9, 3, 3, kind, {});
    spy.mockRestore();
    expect(g.fellBack).toBe(false);
    expect(g.grade.solved).toBe(true);
    expect(Object.keys(g.gen).sort()).toEqual(['cages', 'puzzle', 'solution']);
  });
});
