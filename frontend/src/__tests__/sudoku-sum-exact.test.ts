/* psygames-sudoku-sum-exact · VER 1 · 07.10.2026 · psygames-sudoku-claude-mac */
/**
 * ПРИЁМ «ТОЧНЫЙ КОРИДОР СУММЫ» (sum_exact, ступень 5) — задача раздела уровней c3f9e08b.
 *
 * Малый киллер и X-суммы упирались в ступень 4 и ~65 пустых: их выводы в мере смотрели только на
 * границы суммы. Приём проверяет, достижима ли сумма кандидатами остальных клеток (у {1,9}+{1,9}
 * только 2, 10, 18). Приёмка раздела уровней:
 *   · ступень 5 появляется на досках 128 (малый киллер) при лимите копания 70;
 *   · без приёма такие доски мерой не решаются (мутация «приём снят» — гейт красный);
 *   · гейты «заслуживает имя» держатся (их прогоняет общий набор).
 * 📍 Замер 07.10 (8 досок на точку, полоса 4..6): малый киллер 128 — ступень 5 у 8/8 при лимите
 *    64/70/76, цена 169/203/179, пустых 63,8/66,1/66,1; X-суммы 132 — 8/8 при 70, цена 208, пустых
 *    69,8; киллер-комбо 92 — 8/8 при 70, цена 221, пустых 70. Без приёма доски ступени 5 решаются
 *    0 из 8. «Правило 45» и «разные цифры в доме» мерили отдельно — вклада сверх шума нет, сняты.
 *    Скрипт — ~/dev/psygames/sudoku-chat/measure/sum45-measure-20261007.test.ts.
 */
/**
 * ПРИЁМ «ТОЧНЫЙ КОРИДОР СУММЫ» (sum_exact, ступень 5) — задача раздела уровней c3f9e08b.
 *
 * Малый киллер и X-суммы упирались в ступень 4 и ~65 пустых: их выводы в мере считали клетки
 * суммы независимыми. Приём сводит сумму с домом («правило 45») и считает коридор суммы с
 * разными цифрами в общем доме. Приёмка раздела уровней:
 *   · ступень 5 появляется на досках 128 (малый киллер) при лимите копания 70;
 *   · без приёма такие доски мерой не решаются (мутация «приём снят» — гейт красный);
 *   · гейты «заслуживает имя» держатся (их прогоняет общий набор).
 * 📍 Замер 07.10 (8 досок на точку, полоса 4..6): малый киллер 128 — ступень 5 у 8/8 при лимите
 *    64/70/76, цена 169/203/179, пустых 63,8/66,1/66,1; X-суммы 132 — 8/8 при 70, цена 208, пустых
 *    69,8; киллер-комбо 92 — 8/8 при 70, цена 221, пустых 70. Без приёма доски ступени 5 решаются
 *    0 из 8. Скрипт — ~/dev/psygames/sudoku-chat/measure/sum45-measure-20261007.test.ts.
 */
import { generateLogical, solvedSameBoard, gradePuzzle } from '@/src/services/sudoku-grade';
import { Variant } from '@/src/services/sudoku-core';

jest.setTimeout(180000);

const seeded = (s: number) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function boards(variant: Variant, level: number, seed: number) {
  const spy = jest.spyOn(Math, 'random').mockImplementation(seeded(seed));
  const out = Array.from({ length: 4 }, () => generateLogical(level, 81, 9, 3, 3, variant, { budgetMs: 6000, tier: { min: 4, max: 6 }, digCap: 70 }));
  spy.mockRestore();
  return out;
}

describe.each([
  ['littlekiller', 128],
  ['xsums', 132],
  ['killerdiag', 92],
] as const)('«%s»: приём ступени 5 при лимите копания 70', (variant, level) => {
  const built = boards(variant, level, level);

  it('🔴 ступень 5 у большинства досок, и даёт её именно этот приём', () => {
    const t5 = built.filter((b) => b.grade.solved && b.grade.tier === 5).length;
    const bySum = built.filter((b) => b.grade.hardest === 'sum_exact').length;
    expect(`ступень 5 у ${t5}/4, sum_exact самый трудный у ${bySum}/4`).toMatch(/ступень 5 у [34]\/4, sum_exact самый трудный у [234]\/4/);
  });

  it('вывод честный: мера приходит к той же доске, что генератор', () => {
    for (const b of built) {
      const g = gradePuzzle(b.gen.puzzle, { N: 9, BR: 3, BC: 3, variant, littlekiller: b.gen.littlekiller, xsums: b.gen.xsums, cages: b.gen.cages });
      expect(solvedSameBoard(g, b.gen.solution)).toBe(true);
    }
  });

  it('под потолком 4 доски ступени 5 не решаются', () => {
    for (const b of built.filter((x) => x.grade.tier === 5)) {
      expect(gradePuzzle(b.gen.puzzle, { N: 9, BR: 3, BC: 3, variant, littlekiller: b.gen.littlekiller, xsums: b.gen.xsums, cages: b.gen.cages }, 4).solved).toBe(false);
    }
  });
});
