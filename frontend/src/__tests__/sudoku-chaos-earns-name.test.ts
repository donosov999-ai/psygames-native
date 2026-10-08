/* psygames-sudoku-chaos-earns-name · VER 1 · 07.10.2026 · psygames-sudoku-claude-mac */
/**
 * САМОСБОРКА ОБЛАСТЕЙ ЗАСЛУЖИВАЕТ СВОЁ ИМЯ (пункт 12 цепочки «14 усложнений», задача 6cee3610).
 *
 * Блоков нет; области (9 связных клеток, в каждой 1–9) выводит игрок по подсказкам границ — числу
 * сторон клетки на границе области — и по напечатанным цифрам. Гейт держит:
 *   · подсказки границ считаются верно; решатель разбиения (перенос palisade.c) при всех подсказках
 *     выводит обычные блоки, без подсказок — ничего;
 *   · седьмой вывод — свой: одна и та же напечатанная цифра в двух областях ставит между ними границу
 *     (на досках генератора оставленные подсказки выводят разбиение только вместе с цифрами);
 *   · ход без блоков: строка и столбец — да, квадрат 3×3 — нет; с выведенными областями — как кривые блоки;
 *   · доски генератора (`generateLogical`, зерно сеяное): областей в доске нет; мера выводит
 *     разбиение и доходит до той же доски; цифры единственны перебором по выведенным областям; без
 *     подсказок границ разбиение не выводится; ступень не ниже 4 и дороже той же доски с блоками.
 * 📍 Замер 07.10 (18 досок, полоса 3..6): 17/18 (1 запасным), ступени 4–6 против 3–6 у той же доски
 *    кривыми блоками, цена 119 → 194, единственны 17/17, без подсказок 0/17, цифры помогли границам
 *    на 15/17; ≈ 29 подсказок границ и ≈ 20 цифр. Скрипт —
 *    ~/dev/psygames/sudoku-chat/measure/chaos-measure-20261007.test.ts.
 */
import { borderCounts, samePartition, solvePartition } from '@/src/services/sudoku-chaos';
import { countSolutions, isValid } from '@/src/services/sudoku-core';
import { generateLogical, gradeChaos, gradePuzzle } from '@/src/services/sudoku-grade';

jest.setTimeout(180000);

const seeded = (s: number) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const BOXES = Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3)));
const none = () => Array.from({ length: 9 }, () => Array(9).fill(-1));

describe('самосборка: подсказки и решатель разбиения', () => {
  it('подсказка границ — число сторон клетки на границе области (край — тоже)', () => {
    const b = borderCounts(BOXES, 9);
    expect(b[0][0]).toBe(2);   // верх и лево — край доски
    expect(b[1][1]).toBe(0);   // середина блока
    expect(b[0][2]).toBe(2);   // край сверху + граница блока справа
    expect(b[2][2]).toBe(2);   // граница блока снизу и справа
    expect(b[4][3]).toBe(1);   // граница блока слева
  });

  it('все подсказки выводят обычные блоки; без подсказок и цифр — ничего', () => {
    const r = solvePartition(borderCounts(BOXES, 9), null, 9);
    expect(r.regions && samePartition(r.regions, BOXES)).toBe(true);
    expect(solvePartition(none(), null, 9).regions).toBeNull();
  });

  it('ход без блоков: строка и столбец — да, квадрат 3×3 — нет; с областями — как кривые блоки', () => {
    const g = Array.from({ length: 9 }, () => Array(9).fill(0));
    g[1][1] = 5;
    expect(isValid(g, 0, 0, 5, 9, 3, 3, 'none')).toBe(false);
    expect(isValid(g, 0, 0, 5, 9, 3, 3, 'chaos')).toBe(true);
    expect(isValid(g, 1, 7, 5, 9, 3, 3, 'chaos')).toBe(false);
    expect(isValid(g, 0, 0, 5, 9, 3, 3, 'chaos', BOXES)).toBe(false);
  });
});

describe('🔴 самосборка заслуживает своё имя на досках генератора', () => {
  const spy = jest.spyOn(Math, 'random').mockImplementation(seeded(141));
  const built = Array.from({ length: 4 }, () => generateLogical(141, 81, 9, 3, 3, 'chaos', { budgetMs: 8000, tier: { min: 3, max: 6 } }));
  spy.mockRestore();

  it('областей в доске нет; мера выводит разбиение и доходит до той же доски', () => {
    for (const b of built) {
      expect(b.fellBack).toBe(false);
      expect(b.gen.regions).toBeUndefined();
      const g = gradeChaos(b.gen.puzzle, b.gen.chaos!, 9, 3, 3);
      expect(g.solved).toBe(true);
      expect(g.grid).toEqual(b.gen.solution);
    }
  });

  it('цифры единственны перебором по выведенным областям; без подсказок границ разбиения нет', () => {
    for (const b of built) {
      const g = gradeChaos(b.gen.puzzle, b.gen.chaos!, 9, 3, 3);
      expect(countSolutions(b.gen.puzzle.map((row) => [...row]), 9, 3, 3, 'jigsaw', g.regions!, 2, { steps: 200000 })).toBe(1);
      expect(solvePartition(none(), b.gen.puzzle, 9).regions).toBeNull();
    }
  });

  it('🔴 седьмой вывод работает: оставленные подсказки выводят разбиение только вместе с цифрами', () => {
    // Подсказки снимаются, пока разбиение выводится С ЦИФРАМИ, — значит без цифр (одним «Палисадом»)
    // его выводить обязаны не все доски: иначе цифры границам не помогают и это две задачи подряд.
    const needDigits = built.filter((b) => !solvePartition(b.gen.chaos!, null, 9).regions).length;
    expect(needDigits).toBeGreaterThanOrEqual(1);
  });

  it('ступень не ниже 4 и дороже той же доски с данными областями; под потолком 3 не решается', () => {
    for (const b of built) {
      const g = gradeChaos(b.gen.puzzle, b.gen.chaos!, 9, 3, 3);
      const j = gradePuzzle(b.gen.puzzle, { N: 9, BR: 3, BC: 3, variant: 'jigsaw', regions: g.regions! });
      expect(g.tier).toBeGreaterThanOrEqual(4);
      expect(g.cost).toBeGreaterThan(j.cost);
      expect(gradeChaos(b.gen.puzzle, b.gen.chaos!, 9, 3, 3, 3).solved).toBe(false);
    }
  });
});
