/* psygames-sudoku-killer-ladder-earns-name · VER 1 · 08.10.2026 · psygames-sudoku-claude-mac */
/**
 * КИЛЛЕР НА ЛЕСТНИЦЕ ЗАСЛУЖИВАЕТ СВОЁ ИМЯ (письмо раздела уровней 2d8320ed: блоки 153+ — режимы и
 * оформление становятся вариантами лестницы; первым — киллер).
 *
 * У режима «Киллер» суммы лежат поверх доски, которая единственна и без них (killerBlanksForStep:
 * 44–60 пустых) — там они украшение. Вариант лестницы 'killer' копает логический путь с мерой сумм:
 * доска единственна ТОЛЬКО с суммами. Гейт держит:
 *   · группы — разбиение всей доски, цифры в группе разные, суммы сходятся с решением;
 *   · мера доходит до той же доски; без сумм (обычная классика) — не решается ни одна;
 *   · единственна перебором с суммами (перебор дошёл, бюджет не исчерпан);
 *   · имя и правило — строки режима «Киллер» (sudokuModeKiller, sudokuKillerRule).
 * 📍 Замер 08.10 (по 18 досок, сид 161+cap, полоса 4..6): лимит 64 — ступень 4 у 18/18, цена 166;
 *    лимит 70 — ступени 4–5 (5 у 8/18), цена 228; без сумм 0/36; единственны 36/36; 0,1–0,3 с.
 *    Скрипт — ~/dev/psygames/sudoku-chat/measure/killer-ladder-measure-20261008.test.ts.
 */
import { countSolutions, variantLabel, variantRule } from '@/src/services/sudoku-core';
import { generateLogical, gradePuzzle, solvedSameBoard } from '@/src/services/sudoku-grade';

jest.setTimeout(180000);

const seeded = (s: number) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

describe('🔴 киллер лестницы на досках генератора', () => {
  const spy = jest.spyOn(Math, 'random').mockImplementation(seeded(161));
  const built = Array.from({ length: 4 }, () => generateLogical(161, 81, 9, 3, 3, 'killer', { budgetMs: 8000, tier: { min: 4, max: 6 }, digCap: 64 }));
  spy.mockRestore();

  it('группы — разбиение всей доски, цифры в группе разные, суммы сходятся', () => {
    for (const b of built) {
      const cg = b.gen.cages!;
      expect(cg.cageOf.flat().every((id) => id >= 0)).toBe(true);
      cg.cells.forEach((cs, k) => {
        if (!cs) return;
        const ds = cs.map(([r, c]) => b.gen.solution[r][c]);
        expect(new Set(ds).size).toBe(ds.length);
        expect(ds.reduce((t, v) => t + v, 0)).toBe(cg.sum[k]);
      });
    }
  });

  it('мера доходит до той же доски; без сумм не решается ни одна', () => {
    for (const b of built) {
      expect(b.fellBack).toBe(false);
      const g = gradePuzzle(b.gen.puzzle, { N: 9, BR: 3, BC: 3, variant: 'killer', cages: b.gen.cages });
      expect(solvedSameBoard(g, b.gen.solution)).toBe(true);
      expect(gradePuzzle(b.gen.puzzle, { N: 9, BR: 3, BC: 3, variant: 'none' }).solved).toBe(false);
    }
  });

  it('единственна перебором с суммами (перебор дошёл)', () => {
    for (const b of built) {
      const budget = { steps: 2000000 };
      expect(countSolutions(b.gen.puzzle.map((r) => [...r]), 9, 3, 3, 'killer', undefined, 2, budget, undefined, undefined, b.gen.cages)).toBe(1);
      expect(budget.steps).toBeGreaterThanOrEqual(0);
    }
  });

  it('имя и правило — строки режима «Киллер»', () => {
    expect(variantLabel('killer', 'ru')).toBe('Киллер');
    expect(variantRule('killer', 'en')).toMatch(/cage/i);
  });
});
