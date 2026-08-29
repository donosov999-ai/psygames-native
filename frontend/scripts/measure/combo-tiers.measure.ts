/* psygames-combo-tiers-measure · VER 1 · 29.08.2026 */
/**
 * ЗАМЕР, А НЕ ТЕСТ (X4, задача 154dfceb): достижимая ступень комбо-вариантов.
 *
 * Вопрос тот же, что решался для джигсо/термоклетки: какую ступень пара осей
 * ДАЁТ на боевом генераторе (generateLogical с liftByClueRemoval), а не какую
 * хочется пообещать. По результату проставляются VARIANT_TIER_CEILING и порядок
 * пар в лестнице 81–92 (сложнее — выше).
 *
 * Запуск:
 *   npx jest --rootDir . scripts/measure/combo-tiers.measure.ts \
 *     --testMatch "<rootDir>/scripts/measure/*.measure.ts" -t "СМЁТ"
 */
import { generateLogical } from '@/src/services/sudoku-grade';
import { levelConfig } from '@/src/services/sudoku-core';

const свод = (a: number[]) => {
  const c = new Map<number, number>();
  for (const t of a) c.set(t, (c.get(t) ?? 0) + 1);
  return [...c.entries()].sort((x, y) => x[0] - y[0]).map(([t, n]) => `${t}×${n}`).join(' ');
};

describe('СМЁТ комбо-пояса 81–92', () => {
  jest.setTimeout(1800_000);

  const CASES: [string, number][] = [
    ['sandparity вход', 81], ['sandparity верх', 84],
    ['thermoknight вход', 85], ['thermoknight верх', 88],
    ['killerdiag вход', 89], ['killerdiag верх', 92],
  ];

  for (const [имя, lv] of CASES) {
    it(`СМЁТ ${имя} (L${lv})`, () => {
      const cfg = levelConfig(lv);
      const tiers: number[] = [];
      const пустых: number[] = [];
      let фолбэков = 0;
      const t0 = Date.now();
      for (let i = 0; i < 15; i++) {
        const r = generateLogical(lv, cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant, { budgetMs: 6000 });
        tiers.push(r.grade.tier);
        if (r.fellBack) фолбэков++;
        let b = 0;
        for (const row of r.gen.puzzle) for (const v of row) if (v === 0) b++;
        пустых.push(b);
      }
      console.log(
        `${имя} L${lv} [${cfg.variant}]: ступени ${свод(tiers)} · пустых ${Math.min(...пустых)}–${Math.max(...пустых)}` +
        ` · фолбэков ${фолбэков}/15 · ${Math.round((Date.now() - t0) / 1000)}с`,
      );
      expect(tiers.length).toBe(15);
    });
  }
});
