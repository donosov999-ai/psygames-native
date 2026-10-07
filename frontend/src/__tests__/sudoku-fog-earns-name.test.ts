/* psygames-sudoku-fog-earns-name · VER 1 · 07.10.2026 · psygames-sudoku-claude-mac */
/**
 * ТУМАН ВОЙНЫ ЗАСЛУЖИВАЕТ СВОЁ ИМЯ (пункт 11 цепочки «14 усложнений», задача efb63126).
 *
 * Доска закрыта туманом, кроме окон старта; верная цифра в открытой клетке — напечатанная или
 * поставленная — расчищает соседей крестом. Гейт держит:
 *   · расчистка: верная цифра открывает крест, неверная — ничего, цифра под туманом — ничего;
 *     открывшаяся подсказка расчищает дальше (каскад);
 *   · 🔴 мера монотонна: лишняя подсказка не мешает (вторая редакция 07.10 — расчищали только ходы
 *     игрока, и копание не стартовало: 72 доски из 72 ушли запасным);
 *   · доски генератора (`generateLogical`, зерно сеяное): мера ПОД туманом доходит до той же доски
 *     без перебора (приёмка карточки); на старте закрыта заметная часть; ступень — пол (ниже не
 *     решается); туман строже открытой доски хотя бы на половине.
 * 📍 Замер 07.10 (36 досок парой, крест, 2 окна): на старте открыто ≈ 50 из 81, строже ступенью 28 из 36
 *    (без тумана 1–3, под ним 2–5), цена +26–40 %, ≈ 2 с на доску, запасным 0. Скрипт — ~/dev/psygames/sudoku-chat/measure/fog-measure-20261007.test.ts.
 */
import { fogOpen, fogRevealed, generateLogical, gradeFog, gradePuzzle } from '@/src/services/sudoku-grade';

jest.setTimeout(180000);

const SOL = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2], [6, 7, 2, 1, 9, 5, 3, 4, 8], [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3], [4, 2, 6, 8, 5, 3, 7, 9, 1], [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4], [2, 8, 7, 4, 1, 9, 6, 3, 5], [3, 4, 5, 2, 8, 6, 1, 7, 9],
];
const seeded = (s: number) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const empty = () => Array.from({ length: 9 }, () => Array(9).fill(0));
const openCells = (o: boolean[][]) => o.flat().filter(Boolean).length;
const ctx = { N: 9, BR: 3, BC: 3, variant: 'none' as const };

describe('туман: расчистка', () => {
  it('окно старта — 3×3 вокруг семени', () => {
    const fog = fogOpen([[4, 4]], 9);
    expect(fog.flat().filter((v) => v).length).toBe(9);
    expect(fog[3][3] && fog[5][5] && !fog[2][4] && !fog[4][6]).toBeTruthy();
  });

  it('🔴 верная цифра в открытой клетке открывает крест; неверная — ничего; под туманом — ничего', () => {
    const fog = fogOpen([[4, 4]], 9);
    const g = empty();
    expect(openCells(fogRevealed(fog, g, SOL))).toBe(9);
    g[3][4] = SOL[3][4];   // верная у верхнего края окна → (2,4) открыта, (3,3)/(3,5) и так открыты
    let o = fogRevealed(fog, g, SOL);
    expect(o[2][4]).toBe(true);
    expect(o[2][3] || o[2][5]).toBe(false);   // крест, не 3×3
    expect(openCells(o)).toBe(10);
    g[3][4] = SOL[3][4] % 9 + 1;   // неверная
    expect(openCells(fogRevealed(fog, g, SOL))).toBe(9);
    const h = empty();
    h[0][0] = SOL[0][0];   // верная, но под туманом — расчищать нечем
    expect(openCells(fogRevealed(fog, h, SOL))).toBe(9);
  });

  it('каскад: открывшаяся подсказка расчищает дальше', () => {
    const fog = fogOpen([[4, 4]], 9);
    const g = empty();
    g[3][5] = SOL[3][5];   // в окне → открывает (2,5)
    g[2][5] = SOL[2][5];   // подсказка в (2,5) → открывает (1,5), (2,4), (2,6)
    const o = fogRevealed(fog, g, SOL);
    expect(o[1][5] && o[2][4] && o[2][6]).toBe(true);
    expect(o[0][5]).toBe(false);
  });

  it('вся доска открыта — мера тумана совпадает с обычной', () => {
    // Классическая задача с этим решением (Википедия, «Sudoku»): единственна, решается одиночками.
    const puzzle = [
      '53..7....', '6..195...', '.98....6.', '8...6...3', '4..8.3..1', '7...2...6', '.6....28.', '...419..5', '....8..79',
    ].map((row) => [...row].map((ch) => (ch === '.' ? 0 : Number(ch))));
    expect(gradePuzzle(puzzle, ctx).solved).toBe(true);
    const all = Array.from({ length: 9 }, () => Array(9).fill(1));
    const f = gradeFog(puzzle, all, ctx);
    expect(f.solved).toBe(true);
    expect(f.tier).toBe(gradePuzzle(puzzle, ctx).tier);
  });
});

describe('🔴 туман заслуживает своё имя на досках генератора', () => {
  const spy = jest.spyOn(Math, 'random').mockImplementation(seeded(137));
  const built = Array.from({ length: 4 }, () => generateLogical(137, 81, 9, 3, 3, 'fog', { budgetMs: 8000, tier: { min: 3, max: 6 } }));
  spy.mockRestore();

  it('под туманом мера доходит до той же доски; на старте закрыто не меньше 15 клеток', () => {
    for (const b of built) {
      expect(b.fellBack).toBe(false);
      const f = gradeFog(b.gen.puzzle, b.gen.fog!, ctx);
      expect(f.solved).toBe(true);
      expect(f.grid).toEqual(b.gen.solution);
      expect(81 - openCells(fogRevealed(b.gen.fog!, b.gen.puzzle, b.gen.solution))).toBeGreaterThanOrEqual(15);
    }
  });

  it('🔴 мера монотонна: вернуть подсказку из решения — доска по-прежнему решается', () => {
    for (const b of built) {
      const p = b.gen.puzzle.map((row) => [...row]);
      const blanks = p.flatMap((row, r) => row.map((v, c) => [r, c, v] as const)).filter(([, , v]) => v === 0);
      for (const [r, c] of blanks.slice(0, 6)) p[r][c] = b.gen.solution[r][c];
      expect(gradeFog(p, b.gen.fog!, ctx).solved).toBe(true);
    }
  });

  it('🔴 ступень под туманом — пол: потолком на ступень ниже доска не решается', () => {
    // Решатель берёт самый простой приём, что даёт цифру, и сразу расчищает: иначе тяжёлый приём
    // успевает раньше расчистки, и ступень выходит выше нужной (мутация «без сперва расчистки»).
    for (const b of built) {
      const f = gradeFog(b.gen.puzzle, b.gen.fog!, ctx);
      if (f.tier > 1) expect(gradeFog(b.gen.puzzle, b.gen.fog!, ctx, f.tier - 1).solved).toBe(false);
    }
  });

  it('туман строже открытой доски хотя бы на половине досок', () => {
    let harder = 0;
    for (const b of built) {
      const f = gradeFog(b.gen.puzzle, b.gen.fog!, ctx), p = gradePuzzle(b.gen.puzzle, ctx);
      if (f.tier > p.tier || f.cost > p.cost) harder++;
    }
    expect(harder).toBeGreaterThanOrEqual(2);
  });
});
