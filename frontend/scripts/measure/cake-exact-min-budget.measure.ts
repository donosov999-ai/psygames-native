/* psygames-cake-exact-min-budget-measure · VER 1 · 16.09.2026 */
/**
 * ДОКУДА ДОСТАЁТ ТОЧНЫЙ МИНИМУМ ПРИ СВОБОДНОМ ВЫБОРЕ КУСКА.
 * Офлайн-бюджет генератора вшитых уровней — 400 000 узлов A*. При прежних
 * правилах (кусок только сверху) минимум считался для L1…L10. Утверждение, что
 * при свободном выборе он обрывается после L4, — проверяется здесь.
 *   npx jest --rootDir . scripts/measure/cake-exact-min-budget.measure.ts --testMatch "<rootDir>/scripts/measure/*.measure.ts"
 */
import { deal } from '@/src/games/cake-sort/core/level';
import { minMoves } from '@/src/games/cake-sort/core/solver';

describe('СМЁТ точного минимума', () => {
  jest.setTimeout(3_600_000);
  it('L3…L6 при бюджете 400 000', () => {
    for (const L of [3, 4, 5, 6]) {
      const т0 = Date.now();
      const r = minMoves(deal(L).board, 400_000, false);
      process.stdout.write(`L${L}: минимум ${r.moves ?? 'НЕ ДОСТАЛ'} · узлов ${r.nodes} · ${Date.now() - т0} мс\n`);
    }
    expect(true).toBe(true);
  });
});
