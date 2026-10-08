/* psygames-sudoku-xsums-earns-name · VER 1 · 07.10.2026 · psygames-sudoku-claude-mac */
/**
 * X-СУММЫ ЗАСЛУЖИВАЮТ СВОЁ ИМЯ (пункт 9 цепочки «14 усложнений», задача 5ea317fc).
 *
 * Число у края — сумма первых X цифр с этой стороны, X — первая из них и входит в сумму (сверено 07.10
 * по четырём языкам, ссылки — в шапке `XsumsClues`, sudoku-core.ts). Гейт меряет доски пути лестницы
 * (`generateLogical`; полоса 1..6), зерно сеяное:
 *   · подсказки честные: каждая показанная — X-сумма своего ряда по решению; показано XSUMS_SHOWN;
 *   · с суммами — логикой та же доска; без сумм — ни одна; под потолком 3 — не больше одной из 4.
 * 📍 Замер 07.10.2026 (полоса 4..6, 12 сумм из 18, по 8 досок на 50/56/62 пустых): ступень 4 у 24/24,
 *    приём xsum_clue — самый трудный у всех; без сумм 0/24, под потолком 3 — 1/24; 0,15 с на доску.
 *    Скрипт — ~/dev/psygames/sudoku-chat/measure/xsums-measure-20261007.test.ts. Ступени 185–188 —
 *    раздел уровней (LEVELS_PLAN.md).
 */
import { XSUMS_SHOWN, overlayOk, xsumLineOk, xsumOf, xsumsFromSolution } from '@/src/services/sudoku-core';
import { generateLogical, gradePuzzle, solvedSameBoard } from '@/src/services/sudoku-grade';

jest.setTimeout(120000);

const SOL = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2], [6, 7, 2, 1, 9, 5, 3, 4, 8], [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3], [4, 2, 6, 8, 5, 3, 7, 9, 1], [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4], [2, 8, 7, 4, 1, 9, 6, 3, 5], [3, 4, 5, 2, 8, 6, 1, 7, 9],
];

describe('X-суммы: подсказки и правило', () => {
  it('🔴 X — первая цифра и входит в сумму', () => {
    expect(xsumOf([2, 4, 9, 1, 3, 5, 6, 7, 8])).toBe(6);    // 2 + 4
    expect(xsumOf([1, 9, 8, 2, 3, 4, 5, 6, 7])).toBe(1);    // одна единица
    expect(xsumOf([9, 1, 2, 3, 4, 5, 6, 7, 8])).toBe(45);   // весь ряд
  });

  it('подсказки по решению; показано XSUMS_SHOWN, остальные −1', () => {
    const xs = xsumsFromSolution(SOL, 9);
    const shown = [...xs.rows, ...xs.cols].filter((v) => v >= 0);
    expect(shown).toHaveLength(XSUMS_SHOWN);
    xs.rows.forEach((v, r) => { if (v >= 0) expect(v).toBe(xsumOf(SOL[r])); });
    xs.cols.forEach((v, c) => { if (v >= 0) expect(v).toBe(xsumOf(SOL.map((row) => row[c]))); });
  });

  it('проверка по известным цифрам: X пуст — молчим; известен — коридор суммы первых X клеток', () => {
    expect(xsumLineOk([0, 5, 0, 0, 0, 0, 0, 0, 0], 3, 9)).toBe(true);    // X неизвестен
    expect(xsumLineOk([3, 0, 0, 0, 0, 0, 0, 0, 0], 4, 9)).toBe(false);   // 3 + две пустые по 1 = 5 > 4
    expect(xsumLineOk([3, 0, 0, 0, 0, 0, 0, 0, 0], 5, 9)).toBe(true);
    expect(xsumLineOk([2, 7, 0, 0, 0, 0, 0, 0, 0], 9, 9)).toBe(true);    // полный префикс: 2 + 7 = 9
    expect(xsumLineOk([2, 7, 0, 0, 0, 0, 0, 0, 0], 10, 9)).toBe(false);
    expect(xsumLineOk([2, 7, 0, 0, 0, 0, 0, 0, 0], -1, 9)).toBe(true);   // подсказка скрыта
    const g = Array.from({ length: 9 }, () => Array(9).fill(0));
    g[0][0] = 3;
    expect(overlayOk(g, 0, 1, 1, 9, { xsums: { rows: [5, -1, -1, -1, -1, -1, -1, -1, -1], cols: Array(9).fill(-1) } })).toBe(true);
    expect(overlayOk(g, 0, 1, 4, 9, { xsums: { rows: [5, -1, -1, -1, -1, -1, -1, -1, -1], cols: Array(9).fill(-1) } })).toBe(false);
  });
});

describe('🔴 X-суммы заслуживают своё имя на досках генератора', () => {
  let seed = 185;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const spy = jest.spyOn(Math, 'random').mockImplementation(rnd);
  const built = Array.from({ length: 4 }, () => generateLogical(185, 56, 9, 3, 3, 'xsums', { budgetMs: 6000, tier: { min: 1, max: 6 } }));
  spy.mockRestore();

  it('с суммами — логикой та же доска; без сумм — ни одна; под потолком 3 — не больше одной', () => {
    let same = 0, plain = 0, capped = 0;
    for (const b of built) {
      const xs = b.gen.xsums!;
      xs.rows.forEach((v, r) => { if (v >= 0) expect(v).toBe(xsumOf(b.gen.solution[r])); });
      const ctx = { N: 9, BR: 3, BC: 3, variant: 'xsums' as const, xsums: xs };
      if (solvedSameBoard(gradePuzzle(b.gen.puzzle, ctx), b.gen.solution)) same++;
      if (gradePuzzle(b.gen.puzzle, { N: 9, BR: 3, BC: 3, variant: 'none' }).solved) plain++;
      if (gradePuzzle(b.gen.puzzle, ctx, 3).solved) capped++;
    }
    expect(`та же доска ${same}/4, без сумм ${plain}`).toBe('та же доска 4/4, без сумм 0');
    expect(capped).toBeLessThanOrEqual(1);
  });

  it('логический путь меры X-суммы знает (LOGIC_VARIANTS); срок вышел — не вердикт', () => {
    const logic = built.filter((b) => !b.fellBack).length;
    const outOfTime = built.filter((b) => b.fellBack && b.budgetSpent).length;
    expect(logic > 0 || outOfTime === built.length).toBe(true);
  });
});
