/* psygames-sudoku-digcap-reaches-own-generators · VER 1 · 08.10.2026 · psygames-sudoku-claude-mac */
/**
 * ЛИМИТ КОПАНИЯ СТУПЕНИ ДОХОДИТ ДО СВОИХ ГЕНЕРАТОРОВ ПРАВИЛ.
 *
 * `digCap` — поле ступени (levelConfig) и ось трудности внутри блока (PR #258). `generateLogical`
 * брал его из levelConfig только ПОСЛЕ развилок, а туман, самосборка, Шрёдингер и нарушители уходят
 * в свои генераторы раньше — им доходил лишь явный opts.digCap, и поле ступени молча не действовало
 * (найдено 08.10, когда раздел уровней получил «ось — digCap» для этих правил). Проба: лестница
 * говорит digCap = 20 — каждое правило выкапывает не больше 20 клеток, хотя явного лимита нет.
 */
jest.mock('@/src/services/sudoku-core', () => {
  const actual = jest.requireActual('@/src/services/sudoku-core');
  return { ...actual, levelConfig: (lv: number) => ({ ...actual.levelConfig(lv), digCap: 20 }) };
});
import { generateLogical } from '@/src/services/sudoku-grade';

jest.setTimeout(180000);

it.each(['fog', 'chaos', 'schrodinger', 'doublers', 'negators'] as const)('🔴 %s: digCap ступени из levelConfig соблюдён', (variant) => {
  const b = generateLogical(141, 81, 9, 3, 3, variant, { budgetMs: 6000, tier: { min: 1, max: 6 } });
  const blanks = b.gen.puzzle.flat().filter((v) => v === 0).length;
  expect(blanks).toBeLessThanOrEqual(20);
});
