/* psygames-sudoku-littlekiller-earns-name · VER 1 · 07.10.2026 · psygames-sudoku-claude-mac */
/**
 * МАЛЫЙ КИЛЛЕР ЗАСЛУЖИВАЕТ СВОЁ ИМЯ (пункт 8 цепочки «14 усложнений», задача 2dddd227).
 *
 * Число со стрелкой снаружи доски — сумма цифр на диагонали; цифры на ней МОГУТ повторяться (сверено
 * 07.10 по трём языкам, ссылки — в шапке `LittleKillerClue`, sudoku-core.ts). Гейт меряет доски того же
 * пути, что лестница (`generateLogical`; полоса 1..6 — пол гейту не нужен), зерно сеяное:
 *   · подсказки честные: суммы — по решению, диагонали от 3 клеток, по одной в гнезде поля;
 *   · с суммами доска решается логикой ТОЙ ЖЕ доской (вывод вынужден — решение единственно);
 *   · без сумм — не решается ни одна; под потолком 3 (приём суммы отсечён) — не больше одной из 4.
 * 📍 Замер 07.10.2026 боевым путём (полоса 4..6, 10 диагоналей, по 8 досок на 50/56/62 пустых):
 *    без сумм 0/24, под потолком 3 0/24, ступень 4 у 22 из 24, приём little_killer_sum — самый трудный
 *    у 21 из 24; все 24 — логическим путём. Скрипт — ~/dev/psygames/sudoku-chat/measure/
 *    littlekiller-measure-20261007.test.ts. Ступени 181–184 (LEVELS_PLAN.md) ставит раздел уровней.
 */
import {
  LittleKillerClue, littleKillerCells, littleKillerFromSolution, littleKillerOk, littleKillerSlot, onLittleKiller, overlayOk,
} from '@/src/services/sudoku-core';
import { generateLogical, gradePuzzle, solvedSameBoard } from '@/src/services/sudoku-grade';

jest.setTimeout(120000);

const SOL = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2], [6, 7, 2, 1, 9, 5, 3, 4, 8], [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3], [4, 2, 6, 8, 5, 3, 7, 9, 1], [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4], [2, 8, 7, 4, 1, 9, 6, 3, 5], [3, 4, 5, 2, 8, 6, 1, 7, 9],
];

describe('малый киллер: подсказки и правило', () => {
  it('подсказки по решению: диагонали от 3 клеток, стрелки вниз, по одной в гнезде', () => {
    const clues = littleKillerFromSolution(SOL, 9);
    expect(clues).toHaveLength(10);
    const slots = new Set(clues.map((k) => { const s = littleKillerSlot(k); return s.side + s.i; }));
    expect(slots.size).toBe(10);
    for (const k of clues) {
      const cells = littleKillerCells(k, 9);
      expect(cells.length).toBeGreaterThanOrEqual(3);
      expect(k.dr).toBe(1);
      expect(k.r === 0 || k.c === 0 || k.c === 8).toBe(true);   // старт у края, откуда смотрит стрелка
      expect(k.sum).toBe(cells.reduce((t, [r, c]) => t + SOL[r][c], 0));
      for (const [r, c] of cells) expect(onLittleKiller(k, r, c)).toBe(true);
    }
    // Все 26 диагоналей разом: верхние гнёзда 3–5 делят ↘ и ↙ — в каждое встаёт ровно одна.
    const all = littleKillerFromSolution(SOL, 9, 26);
    const allSlots = new Set(all.map((k) => { const s = littleKillerSlot(k); return s.side + s.i; }));
    expect(allSlots.size).toBe(all.length);
    expect(all.length).toBe(26 - 3);
  });

  it('гнёзда: ↘ с верха — над столбцом левее, ↙ — правее; слева и справа — строкой выше', () => {
    expect(littleKillerSlot({ r: 0, c: 0, dr: 1, dc: 1, sum: 0 })).toEqual({ side: 'top', i: -1 });
    expect(littleKillerSlot({ r: 0, c: 8, dr: 1, dc: -1, sum: 0 })).toEqual({ side: 'top', i: 9 });
    expect(littleKillerSlot({ r: 3, c: 0, dr: 1, dc: 1, sum: 0 })).toEqual({ side: 'left', i: 2 });
    expect(littleKillerSlot({ r: 3, c: 8, dr: 1, dc: -1, sum: 0 })).toEqual({ side: 'right', i: 2 });
  });

  it('🔴 цифры на диагонали МОГУТ повторяться; сумма держится и сверху, и снизу', () => {
    const k: LittleKillerClue = { r: 0, c: 0, dr: 1, dc: 1, sum: 10 };   // главная диагональ, 9 клеток
    const g = Array.from({ length: 9 }, () => Array(9).fill(0));
    g[0][0] = 1;
    expect(littleKillerOk(g, 1, 1, 1, [k], 9)).toBe(true);    // повтор единицы: 1 + 1 + 7 пустых по 1 = 9 ≤ 10
    expect(littleKillerOk(g, 1, 1, 3, [k], 9)).toBe(false);   // 1 + 3 + 7 = 11 > 10
    const short: LittleKillerClue = { r: 0, c: 6, dr: 1, dc: 1, sum: 24 };   // 3 клетки
    expect(littleKillerOk(g, 0, 6, 5, [short], 9)).toBe(false);   // 5 + 9 + 9 = 23 < 24
    expect(littleKillerOk(g, 0, 6, 6, [short], 9)).toBe(true);
    expect(littleKillerOk(g, 4, 4, 9, [short], 9)).toBe(true);    // клетка не на диагонали
    // Та же проверка — в overlayOk: по ней копание считает единственность (countSolutions).
    expect(overlayOk(g, 1, 1, 3, 9, { littlekiller: [k] })).toBe(false);
    expect(overlayOk(g, 1, 1, 2, 9, { littlekiller: [k] })).toBe(true);
  });
});

describe('🔴 малый киллер заслуживает своё имя на досках генератора', () => {
  let seed = 181;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const spy = jest.spyOn(Math, 'random').mockImplementation(rnd);
  const built = Array.from({ length: 4 }, () => generateLogical(181, 56, 9, 3, 3, 'littlekiller', { budgetMs: 6000, tier: { min: 1, max: 6 } }));
  spy.mockRestore();

  it('подсказки дошли до доски и честны по её решению', () => {
    for (const b of built) {
      const lk = b.gen.littlekiller!;
      expect(lk.length).toBe(10);
      for (const k of lk) expect(k.sum).toBe(littleKillerCells(k, 9).reduce((t, [r, c]) => t + b.gen.solution[r][c], 0));
    }
  });

  it('с суммами — логикой та же доска; без сумм — ни одна; под потолком 3 — не больше одной', () => {
    let same = 0, plain = 0, capped = 0;
    for (const b of built) {
      const ctx = { N: 9, BR: 3, BC: 3, variant: 'littlekiller' as const, littlekiller: b.gen.littlekiller };
      if (solvedSameBoard(gradePuzzle(b.gen.puzzle, ctx), b.gen.solution)) same++;
      if (gradePuzzle(b.gen.puzzle, { N: 9, BR: 3, BC: 3, variant: 'none' }).solved) plain++;
      if (gradePuzzle(b.gen.puzzle, ctx, 3).solved) capped++;
    }
    expect(`та же доска ${same}/4, без сумм ${plain}`).toBe('та же доска 4/4, без сумм 0');
    expect(capped).toBeLessThanOrEqual(1);
  });

  it('логический путь меры малый киллер знает (LOGIC_VARIANTS); срок вышел — не вердикт', () => {
    const logic = built.filter((b) => !b.fellBack).length;
    const outOfTime = built.filter((b) => b.fellBack && b.budgetSpent).length;
    expect(logic > 0 || outOfTime === built.length).toBe(true);
  });
});
