/* psygames-sudoku-combo-test · VER 1 · 29.08.2026 */
/**
 * КОМБО-ПОЯС 81–92 (X4, задача 154dfceb) — сложность сложением правил.
 *
 * Класс бага, который тут сторожится (грабля thermocage, записанная в isValid):
 * else-if цепочка отдаёт ход ОДНОМУ правилу из двух, и половина ограничений
 * молча не проверяется — единственность считается по одному правилу, а игрок
 * получает «второе решение с полным правом». Поэтому каждая пара проверяется
 * на РЕШЕНИИ: обе оси обязаны выполняться одновременно.
 */
import {
  generatePuzzle, isValid, levelConfig, countSolutions, type Cell,
} from '@/src/services/sudoku-core';
import { bandPos, targetTier } from '@/src/services/sudoku-grade';

const KNIGHT: [number, number][] = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];

const дырок = (p: Cell[][]) => p.flat().filter((v) => v === 0).length;

describe('комбо-пояс: уровни и полосы', () => {
  it('уровни 81–92 раздают три пары, 58–80 остаются банком', () => {
    expect(levelConfig(80).variant).toBe('none');
    for (let lv = 81; lv <= 84; lv++) expect(levelConfig(lv).variant).toBe('thermoknight');
    for (let lv = 85; lv <= 88; lv++) expect(levelConfig(lv).variant).toBe('sandparity');
    for (let lv = 89; lv <= 92; lv++) expect(levelConfig(lv).variant).toBe('killerdiag');
  });

  it('🔴 bandPos для 81+ считает от своей четвёрки, а не от 38-й', () => {
    // Старая формула (lv−38)%4 дала бы 81→3, 82→0: уровень 82 получил бы полосу
    // НИЖЕ 81-го — ровно баг «level 20 легче level 12», уже чиненный однажды.
    expect([81, 82, 83, 84].map(bandPos)).toEqual([0, 1, 2, 3]);
    expect([85, 86, 87, 88].map(bandPos)).toEqual([0, 1, 2, 3]);
    expect([89, 90, 91, 92].map(bandPos)).toEqual([0, 1, 2, 3]);
  });

  it('обещание сложности внутри пары не падает', () => {
    for (const start of [81, 85, 89]) {
      for (let lv = start; lv < start + 3; lv++) {
        expect(targetTier(lv + 1).min).toBeGreaterThanOrEqual(targetTier(lv).min);
      }
    }
  });
});

describe('комбо-пары: решение удовлетворяет ОБЕИМ осям', () => {
  it('🔴 thermoknight: конь и термометр разом', () => {
    const g = generatePuzzle(30, 9, 3, 3, 'thermoknight');
    const s = g.solution;
    // ось коня
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      for (const [dr, dc] of KNIGHT) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) expect(s[nr][nc]).not.toBe(s[r][c]);
      }
    }
    // ось термометра: строго растёт вдоль prev→next
    expect(g.thermo).toBeTruthy();
    let звеньев = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const pn = g.thermo![r][c];
      if (pn?.next) { звеньев++; expect(s[pn.next[0]][pn.next[1]]).toBeGreaterThan(s[r][c]); }
    }
    expect(звеньев).toBeGreaterThan(0);   // термометры реально легли, ось не потерялась
  });

  it('🔴 killerdiag: диагонали и клетки-суммы разом', () => {
    const g = generatePuzzle(30, 9, 3, 3, 'killerdiag');
    const s = g.solution;
    expect(new Set(Array.from({ length: 9 }, (_, i) => s[i][i])).size).toBe(9);
    expect(new Set(Array.from({ length: 9 }, (_, i) => s[i][8 - i])).size).toBe(9);
    expect(g.cages).toBeTruthy();
    let групп = 0;
    g.cages!.cells.forEach((гр, id) => {
      if (!гр.length) return;
      групп++;
      const vals = гр.map(([r, c]) => s[r][c]);
      expect(new Set(vals).size).toBe(vals.length);                       // внутри группы цифры разные
      expect(vals.reduce((a, b) => a + b, 0)).toBe(g.cages!.sum[id]);     // сумма честная, из решения
    });
    expect(групп).toBeGreaterThan(0);
  });

  it('🔴 sandparity: сэндвич-суммы и чётность из одного решения', () => {
    const g = generatePuzzle(30, 9, 3, 3, 'sandparity');
    const s = g.solution;
    expect(g.parity).toBeTruthy();
    expect(g.sandwich).toBeTruthy();
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const m = g.parity![r][c];
      if (m === 1) expect(s[r][c] % 2).toBe(0);
      if (m === 2) expect(s[r][c] % 2).toBe(1);
    }
    for (let r = 0; r < 9; r++) {
      const line = s[r];
      const i1 = line.indexOf(1), i9 = line.indexOf(9);
      const [a, b] = i1 < i9 ? [i1, i9] : [i9, i1];
      let t = 0; for (let k = a + 1; k < b; k++) t += line[k];
      expect(g.sandwich!.rows[r]).toBe(t);
    }
  });

  it('единственность выданной доски считается с обеими осями', () => {
    // Прямой замер countSolutions по паре досок каждой пары: лимит 2, нашлось 1.
    for (const v of ['thermoknight', 'killerdiag'] as const) {
      const g = generatePuzzle(40, 9, 3, 3, v);
      expect(дырок(g.puzzle)).toBeGreaterThan(0);
      const n = countSolutions(
        g.puzzle.map((r) => [...r]), 9, 3, 3, v, g.regions, 2, { steps: 60000 },
        g.thermo, g.arrow, v === 'killerdiag' ? g.cages : undefined,
      );
      expect(n).toBe(1);
    }
  });

  it('isValid: у thermoknight работают ОБА правила (не первое по цепочке)', () => {
    const grid: Cell[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
    grid[0][0] = 5;
    // конь: (2,1) бьётся из (0,0)
    expect(isValid(grid, 2, 1, 5, 9, 3, 3, 'thermoknight')).toBe(false);
    // термо: сосед по термометру обязан расти
    const thermo = Array.from({ length: 9 }, () => Array(9).fill(null)) as any;
    thermo[4][4] = { prev: null, next: [4, 5] };
    thermo[4][5] = { prev: [4, 4], next: null };
    grid[4][4] = 7;
    expect(isValid(grid, 4, 5, 6, 9, 3, 3, 'thermoknight', undefined, thermo)).toBe(false);
    expect(isValid(grid, 4, 5, 8, 9, 3, 3, 'thermoknight', undefined, thermo)).toBe(true);
  });
});
