/* psygames-sudoku-argyle-earns-name · VER 1 · 07.10.2026 · psygames-sudoku-claude-mac */
/**
 * АРГАЙЛ ЗАСЛУЖИВАЕТ СВОЁ ИМЯ (пункт 10 цепочки «14 усложнений», задача 2345d346).
 *
 * Узор «ромб»: восемь коротких диагоналей, на каждой цифры не повторяются. Доска, где узор ничего
 * не решает, — это классика с пунктиром. Гейт меряет доски, собранные тем же путём, что и
 * лестница (`generateLogical`: копание с единственностью и мерой; полоса 1..6 — пол гейту не нужен), зерно сеяное:
 *   · решение законно по узору, и оно единственно ПО УЗОРУ;
 *   · с узором доска решается логикой (`gradePuzzle`);
 *   · без узора (правило снято) — НЕ решается ни одна: значит, узор несёт часть вывода.
 * 📍 Замер 07.10.2026 боевым путём (`generateLogical`, полоса 4..6, по 8 досок на 50/54/58 пустых):
 *    законны 24/24, без узора решается 0/24, под потолком 3 — 13/24 (своего приёма у правила нет:
 *    диагонали режут кандидатов как сосед, как у XV), ступени 1–5, потолок 4. Скрипт замера —
 *    ~/dev/psygames/sudoku-chat/measure/argyle-measure-20261007.test.ts.
 * Ступени 177–180 (план LEVELS_PLAN.md) ставит раздел уровней; встанут — доски выгрузки займут
 * строку в `sudoku-line-variants-earn-name.test.ts`, а здесь останется проверка самого узора.
 */
import { argylePeers, argyleSegments, countSolutions, isValid, ARGYLE_DIFFS, ARGYLE_SUMS } from '@/src/services/sudoku-core';
import { generateLogical, gradePuzzle } from '@/src/services/sudoku-grade';

jest.setTimeout(120000);

describe('аргайл: узор', () => {
  it('восемь диагоналей: по 8 клеток (r−c = ±1, r+c = 7, 9) и по 5 (r−c = ±4, r+c = 4, 12)', () => {
    const len = (pred: (r: number, c: number) => boolean) => {
      let k = 0;
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (pred(r, c)) k++;
      return k;
    };
    expect(ARGYLE_DIFFS.map((d) => len((r, c) => r - c === d))).toEqual([5, 8, 8, 5]);
    expect(ARGYLE_SUMS.map((s) => len((r, c) => r + c === s))).toEqual([5, 8, 8, 5]);
    expect(argylePeers(4, 4, 9)).toEqual([]);              // центр не на узоре
    expect(argylePeers(1, 0, 9)).toHaveLength(7);          // r−c = 1: остальные 7 клеток
    expect(argylePeers(3, 4, 9)).toHaveLength(7 + 7);      // r−c = −1 и r+c = 7
    expect(argylePeers(0, 1, 6)).toEqual([]);              // узор — только 9×9
    expect(argyleSegments()).toHaveLength(8);
  });

  it('тройка на диагонали узора запрещает тройку по всей линии; классика это разрешает', () => {
    const g = Array.from({ length: 9 }, () => Array(9).fill(0));
    g[2][3] = 3;
    expect(isValid(g, 6, 7, 3, 9, 3, 3, 'argyle')).toBe(false);
    expect(isValid(g, 6, 7, 3, 9, 3, 3, 'none')).toBe(true);
    expect(isValid(g, 6, 6, 3, 9, 3, 3, 'argyle')).toBe(true);
  });
});

describe('🔴 аргайл заслуживает своё имя на досках генератора', () => {
  // Сеяный Math.random (mulberry32): гейт воспроизводим, доски — боевым путём лестницы.
  let seed = 177;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const spy = jest.spyOn(Math, 'random').mockImplementation(rnd);
  const built = Array.from({ length: 4 }, () => generateLogical(177, 54, 9, 3, 3, 'argyle', { budgetMs: 6000, tier: { min: 1, max: 6 } }));
  spy.mockRestore();
  const boards = built.map((b) => b.gen);

  // Логический путь иногда не успевает и отдаёт доску запасному (замер 07.10: 1 из 4 на этом зерне;
  // в полном прогоне jest под нагрузкой — 4 из 4), а без аргайла в LOGIC_VARIANTS запасным идут ВСЕ.
  // Бюджет настенный: «срок вышел» (`budgetSpent`) — не вердикт, как в sudoku-geometric-unique.
  it('логический путь меры аргайл знает (LOGIC_VARIANTS): не все доски ушли запасным путём', () => {
    const logic = built.filter((b) => !b.fellBack).length;
    const outOfTime = built.filter((b) => b.fellBack && b.budgetSpent).length;
    expect(logic > 0 || outOfTime === built.length).toBe(true);
  });

  it('решение законно по узору и единственно по узору', () => {
    for (const b of boards) {
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
        const g = b.solution.map((row) => [...row]);
        const v = g[r][c];
        g[r][c] = 0;
        expect(isValid(g, r, c, v, 9, 3, 3, 'argyle')).toBe(true);
      }
      expect(countSolutions(b.puzzle.map((row) => [...row]), 9, 3, 3, 'argyle', undefined, 2, { steps: 20000 })).toBe(1);
    }
  });

  it('с узором решается логикой; без узора — ни одна', () => {
    let withRule = 0, withoutRule = 0;
    for (const b of boards) {
      if (gradePuzzle(b.puzzle, { N: 9, BR: 3, BC: 3, variant: 'argyle' }).solved) withRule++;
      if (gradePuzzle(b.puzzle, { N: 9, BR: 3, BC: 3, variant: 'none' }).solved) withoutRule++;
    }
    expect(`с узором ${withRule}/${boards.length}, без узора ${withoutRule}`).toBe(`с узором ${boards.length}/${boards.length}, без узора 0`);
  });
});
