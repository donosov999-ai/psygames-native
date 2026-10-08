/* psygames-sudoku-skins-ladder · VER 1 · 08.10.2026 · psygames-sudoku-claude-mac */
/**
 * WORDOKU И ЗВЕРИ — ВАРИАНТЫ ЛЕСТНИЦЫ (письмо раздела уровней 2d8320ed, блоки 153+).
 *
 * До сих пор буквы и звери — оформление по выбору игрока, а 'none' 9×9 на лестнице — доски банка.
 * Ступени Wordoku и зверей — классика логическим путём (полоса ступени), значки на них задаёт
 * ступень (натив: `forcedSkinVariants`). Гейт: доски логического пути, единственны перебором,
 * мера доходит до той же доски, лишних полей геометрии нет; имя и правило — строки скина.
 */
import { countSolutions, variantLabel, variantRule } from '@/src/services/sudoku-core';
import { generateLogical, gradePuzzle, solvedSameBoard } from '@/src/services/sudoku-grade';

jest.setTimeout(180000);
const seeded = (s: number) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

describe.each(['wordoku', 'animals'] as const)('🔴 %s на лестнице', (variant) => {
  const spy = jest.spyOn(Math, 'random').mockImplementation(seeded(153));
  const built = Array.from({ length: 4 }, () => generateLogical(153, 81, 9, 3, 3, variant, { budgetMs: 6000, tier: { min: 3, max: 5 } }));
  spy.mockRestore();

  it('классика логическим путём: мера доходит до той же доски, единственна перебором, полей геометрии нет', () => {
    for (const b of built) {
      expect(b.fellBack).toBe(false);
      const g = gradePuzzle(b.gen.puzzle, { N: 9, BR: 3, BC: 3, variant: 'none' });
      expect(solvedSameBoard(g, b.gen.solution)).toBe(true);
      const budget = { steps: 400000 };
      expect(countSolutions(b.gen.puzzle.map((r) => [...r]), 9, 3, 3, 'none', undefined, 2, budget)).toBe(1);
      expect(budget.steps).toBeGreaterThanOrEqual(0);
      const extra = Object.entries(b.gen).filter(([k, v]) => k !== 'puzzle' && k !== 'solution' && v != null).map(([k]) => k);
      expect(extra).toEqual([]);
    }
  });

  it('имя и правило — строки скина', () => {
    expect(variantLabel(variant, 'ru')).toBe(variant === 'wordoku' ? 'Буквы вместо цифр' : 'Звери вместо цифр');
    expect(variantRule(variant, 'en')).toMatch(variant === 'wordoku' ? /Letters/ : /Animals/);
  });
});
