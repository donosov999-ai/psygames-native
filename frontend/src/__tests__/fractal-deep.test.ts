/* psygames-fractal-deep-test · VER 1 · 28.08.2026 */
/**
 * ДВИЖОК ГЛУБОКОГО ФРАКТАЛА — проверяется поведением, не чтением исходников.
 *
 * Что обязано держаться, чтобы «их масштаб» вообще был возможен:
 *   · детерминизм: узел рождается одинаковым от (зерно, путь) — иначе ленивая
 *     материализация разъедется со снимком партии;
 *   · правило центра: центр решения ребёнка равен цифре родительской клетки —
 *     на этом стоит вся передача цифр наверх (референс Fractal Sudoku);
 *   · релейбл цифр не ломает судоку: решение остаётся валидным, подсказки —
 *     подсказками;
 *   · счёт дерева без решений сходится с самим деревом.
 */
import {
  childPath, parentOf, depthOf, materializeNode, materializeChain, countDeep,
  DEEP_FEED_CELL, DEEP_N, type DeepCfg,
} from '@/src/services/fractal-deep';

const CFG: DeepCfg = { depth: 3, rating: 1.2, feedCount: 'all', unlockShare: 0.5 };
const SEED = 'кедр-муссон-47';

/** Решение валидно: каждая строка, столбец и блок — перестановка 1..9. */
function validSolution(g: number[][]): boolean {
  const perm = (xs: number[]) => new Set(xs).size === DEEP_N && xs.every((v) => v >= 1 && v <= DEEP_N);
  for (let i = 0; i < DEEP_N; i++) {
    if (!perm(g[i]!)) return false;
    if (!perm(g.map((row) => row[i]!))) return false;
  }
  for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
    const box: number[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) box.push(g[br * 3 + r]![bc * 3 + c]!);
    if (!perm(box)) return false;
  }
  return true;
}

describe('глубокий фрактал — движок', () => {
  it('путь: ребёнок ↔ родитель ходят туда и обратно', () => {
    const p = childPath(childPath('', 2, 3), 5, 6);
    expect(p).toBe('2,3/5,6');
    expect(depthOf(p)).toBe(2);
    expect(parentOf(p)).toEqual({ parent: '2,3', cell: [5, 6] });
    expect(parentOf('2,3')).toEqual({ parent: '', cell: [2, 3] });
    expect(parentOf('')).toBeNull();
  });

  it('🔴 детерминизм: одно зерно и путь — один узел, всегда', () => {
    const a = materializeNode(SEED, '4,4', CFG, 7);
    const b = materializeNode(SEED, '4,4', CFG, 7);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Разные зёрна расходятся хотя бы иногда (в полосе 40 досок — пять зёрен
    // подряд совпасть не могут разве что чудом; чудо здесь равно поломке rng).
    const keys = new Set(['a', 'b', 'c', 'd', 'e'].map((s) => JSON.stringify(materializeNode(s, '4,4', CFG, 7).puzzle)));
    expect(keys.size).toBeGreaterThan(1);
  });

  it('🔴 правило центра: ребёнок отдаёт родителю ровно его цифру', () => {
    const root = materializeNode(SEED, '', CFG, 0);
    const [r1, c1] = root.feedCells[0]!;
    const chain = materializeChain(SEED, childPath('', r1, c1), CFG);
    expect(chain).toHaveLength(2);
    expect(chain[1]!.solution[DEEP_FEED_CELL[0]]![DEEP_FEED_CELL[1]]).toBe(root.solution[r1]![c1]);
    // и слоем глубже
    const [r2, c2] = chain[1]!.feedCells[0]!;
    const deep = materializeChain(SEED, childPath(childPath('', r1, c1), r2, c2), CFG);
    expect(deep).toHaveLength(3);
    expect(deep[2]!.solution[DEEP_FEED_CELL[0]]![DEEP_FEED_CELL[1]]).toBe(chain[1]!.solution[r2]![c2]);
  });

  it('релейбл не ломает судоку: решение валидно, подсказки — подсказки', () => {
    const root = materializeNode(SEED, '', CFG, 0);
    for (const [r, c] of root.feedCells.slice(0, 3)) {
      const child = materializeNode(SEED, childPath('', r, c), CFG, root.solution[r]![c]!);
      expect(validSolution(child.solution as number[][])).toBe(true);
      let givens = 0;
      for (let rr = 0; rr < DEEP_N; rr++) for (let cc = 0; cc < DEEP_N; cc++) {
        const v = child.puzzle[rr]![cc]!;
        if (v !== 0) { givens++; expect(v).toBe(child.solution[rr]![cc]); }
      }
      expect(givens).toBe(DEEP_N * DEEP_N - child.blanks);
    }
  });

  it('листья детей не заводят, кормимые — только пустые клетки', () => {
    const root = materializeNode(SEED, '', CFG, 0);
    const [r1, c1] = root.feedCells[0]!;
    const l2 = materializeNode(SEED, childPath('', r1, c1), CFG, root.solution[r1]![c1]!);
    const [r2, c2] = l2.feedCells[0]!;
    const leaf = materializeNode(SEED, childPath(childPath('', r1, c1), r2, c2), CFG, l2.solution[r2]![c2]!);
    expect(leaf.feedCells).toHaveLength(0);   // глубина кончилась — обычная судоку
    for (const [r, c] of root.feedCells) expect(root.puzzle[r]![c]).toBe(0);
    // ручное ограничение: просим 12 — получаем 12
    const few = materializeNode(SEED, '', { ...CFG, feedCount: 12 }, 0);
    expect(few.feedCells).toHaveLength(12);
    // 'all' — каждая пустая
    expect(root.feedCells).toHaveLength(root.blanks);
  });

  it('порог открытия — доля дырок, в границах [1..дырки]', () => {
    const root = materializeNode(SEED, '', CFG, 0);
    expect(root.unlockCells).toBe(Math.ceil(root.blanks * CFG.unlockShare));
    expect(root.unlockCells).toBeGreaterThanOrEqual(1);
    expect(root.unlockCells).toBeLessThanOrEqual(root.blanks);
  });

  it('🔴 счёт дерева сходится с деревом и даёт настоящий масштаб', () => {
    const { total, byDepth } = countDeep(SEED, CFG);
    const root = materializeNode(SEED, '', CFG, 0);
    expect(byDepth[0]).toBe(1);
    expect(byDepth[1]).toBe(root.feedCells.length);
    // третий слой — сумма кормимых по всем узлам второго
    let leaves = 0;
    for (const [r, c] of root.feedCells) {
      leaves += materializeNode(SEED, childPath('', r, c), CFG, root.solution[r]![c]!).feedCells.length;
    }
    expect(byDepth[2]).toBe(leaves);
    expect(total).toBe(1 + root.feedCells.length + leaves);
    // «их масштаб»: полная глубина-3 партия — тысячи пазлов
    expect(total).toBeGreaterThan(1500);
  });
});
