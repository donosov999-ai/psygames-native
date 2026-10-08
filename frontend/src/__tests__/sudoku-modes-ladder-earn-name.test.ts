/* psygames-sudoku-modes-ladder-earn-name · VER 1 · 08.10.2026 · psygames-sudoku-claude-mac */
/**
 * НАШИ НЕБОСКРЁБЫ И НЕРАВЕНСТВА НА ЛЕСТНИЦЕ ЗАСЛУЖИВАЮТ СВОИ ИМЕНА (письмо раздела уровней 2d8320ed,
 * блоки 153+; киллер — #311).
 *
 * У режимов мини-лестницы короткие и с потолком (небоскрёбы 6×6, 13–22 пустых; неравенства 9×9,
 * 58 пустых; полоса до 4). Как вариант лестницы оба идут логическим путём 9×9 (`LOGIC_VARIANTS`) с
 * мерой своих подсказок (`towers_clue`, `unequal_chain`). Гейт держит: мера доходит до той же доски;
 * без подсказок/знаков не решается ни одна; единственна перебором (бюджет не исчерпан); ступень ≥ 4.
 * 🔴 Неравенства — с ПРОРЕЖЕННЫМИ знаками (overlayThinner до копания, доля по месту в блоке 0.30 → 0.15):
 *    первый замер 08.10 шёл со всеми 144 знаками — а они решают доску сами (замер 26.08), и заодно
 *    увёл режим «Неравенства» с его пути (его проба поймала: 144 знака вместо прореженных). Режим
 *    теперь явно `logic: false`.
 * 📍 Замер 08.10 (по 12 досок, полоса 4..6): небоскрёбы — лимит 56/64 → цена 67/94; неравенства
 *    (знаков 43 при 0.30 и 22 при 0.15) — 88–93 / 136–145; ступень 4 у всех 96; без подсказок 0/96;
 *    единственны 96/96. Скрипты — ~/dev/psygames/sudoku-chat/measure/{modes,unequal}-ladder-measure-20261008.test.ts.
 */
import { countSolutions } from '@/src/services/sudoku-core';
import { generateLogical, gradePuzzle, solvedSameBoard } from '@/src/services/sudoku-grade';

jest.setTimeout(180000);

const seeded = (s: number) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

describe.each(['towers', 'unequal'] as const)('🔴 %s на лестнице 9×9', (variant) => {
  const spy = jest.spyOn(Math, 'random').mockImplementation(seeded(165));
  const built = Array.from({ length: 4 }, () => generateLogical(165, 81, 9, 3, 3, variant, { budgetMs: 8000, tier: { min: 4, max: 6 }, digCap: 60 }));
  spy.mockRestore();
  const ctx = (b: (typeof built)[number]) => ({ N: 9, BR: 3, BC: 3, variant, towers: b.gen.towers, unequal: b.gen.unequal });

  it('логический путь: мера доходит до той же доски, ступень ≥ 4', () => {
    for (const b of built) {
      expect(b.fellBack).toBe(false);
      expect(b.gen.puzzle).toHaveLength(9);
      const g = gradePuzzle(b.gen.puzzle, ctx(b));
      expect(solvedSameBoard(g, b.gen.solution)).toBe(true);
      expect(g.tier).toBeGreaterThanOrEqual(4);
    }
  });

  it('🔴 знаки неравенств прорежены: полный набор из 144 решает доску сам', () => {
    if (variant !== 'unequal') return;
    for (const b of built) {
      let signs = 0;
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) { if (c < 8 && b.gen.unequal!.h[r][c]) signs++; if (r < 8 && b.gen.unequal!.v[r][c]) signs++; }
      expect(signs).toBeGreaterThan(0);
      expect(signs).toBeLessThan(72);
    }
  });

  it('без подсказок/знаков не решается ни одна; с ними единственна перебором', () => {
    for (const b of built) {
      expect(gradePuzzle(b.gen.puzzle, { N: 9, BR: 3, BC: 3, variant: 'none' }).solved).toBe(false);
      const budget = { steps: 2000000 };
      expect(countSolutions(b.gen.puzzle.map((r) => [...r]), 9, 3, 3, variant, undefined, 2, budget, undefined, undefined, undefined, { towers: b.gen.towers, unequal: b.gen.unequal })).toBe(1);
      expect(budget.steps).toBeGreaterThanOrEqual(0);
    }
  });
});
