/**
 * Фрактальная судоку: сетка, вложенная сама в себя.
 *
 * ЗАЧЕМ ТЕСТ. Связь «решил дочернюю → открылась клетка родителя» — единственное, ради
 * чего вся конструкция существует. Если она разъедется, человек будет решать девять
 * отдельных судоку и не поймёт, зачем их девять. Обнаружится это через час игры.
 *
 * ⚠️ Порог 17 клеток проверяем отдельно: это не круглое число «на глаз», а доказанный
 * минимум подсказок, при котором судоку 9×9 ещё имеет единственное решение. Занизь его —
 * и наверх уйдёт цифра из сетки, которую можно доложить несколькими способами.
 */
import {
  N, UNLOCK_CELLS, FEED_CELL, solvedWithCenter, rootCellForChild,
  solvedCount, isUnlocked, generateFractal,
} from '@/src/services/fractal-sudoku';

describe('связь дочерней сетки с корнем', () => {
  it('девять дочерних — по одной на блок корня, все клетки разные', () => {
    const cells = Array.from({ length: 9 }, (_, i) => rootCellForChild(i).join(','));
    expect(new Set(cells).size).toBe(9);
  });

  it('каждая дочерняя открывает центр СВОЕГО блока', () => {
    for (let i = 0; i < 9; i++) {
      const [r, c] = rootCellForChild(i);
      expect(`${i}: блок ${Math.floor(r / 3) * 3 + Math.floor(c / 3)}`).toBe(`${i}: блок ${i}`);
      expect(`${i}: центр блока ${r % 3 === 1 && c % 3 === 1}`).toBe(`${i}: центр блока true`);
    }
  });

  it('центр дочерней равен цифре, которую она открывает', () => {
    const f = generateFractal(40, 40);
    for (const ch of f.children) {
      const [rr, rc] = ch.feedsCell;
      expect(ch.solution[FEED_CELL[0]][FEED_CELL[1]]).toBe(f.root.solution[rr][rc]);
    }
  });

  it('клетки корня, которые открываются снизу, в задании пусты — иначе вложенность декоративна', () => {
    const f = generateFractal(30, 40);
    for (let i = 0; i < 9; i++) {
      const [r, c] = rootCellForChild(i);
      expect(`клетка ${r},${c}: ${f.root.puzzle[r][c]}`).toBe(`клетка ${r},${c}: 0`);
    }
  });
});

describe('порог открытия', () => {
  it('порог равен доказанному минимуму подсказок для единственности', () => {
    expect(UNLOCK_CELLS).toBe(17);
  });

  it('считает только ВЕРНЫЕ клетки: неверная цифра не прогресс', () => {
    const sol = solvedWithCenter(5);
    const cur = sol.map((row) => [...row]);
    cur[0][0] = sol[0][0] === 9 ? 8 : sol[0][0] + 1;   // одна неверная
    expect(solvedCount(cur, sol)).toBe(N * N - 1);
  });

  it('не открывает раньше порога и открывает на пороге', () => {
    const sol = solvedWithCenter(3);
    const cur = Array.from({ length: N }, () => Array(N).fill(0));
    let put = 0;
    for (let r = 0; r < N && put < UNLOCK_CELLS - 1; r++) {
      for (let c = 0; c < N && put < UNLOCK_CELLS - 1; c++) { cur[r][c] = sol[r][c]; put++; }
    }
    expect(isUnlocked(cur, sol)).toBe(false);
    // добираем одну — ровно порог
    outer: for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) if (cur[r][c] === 0) { cur[r][c] = sol[r][c]; break outer; }
    }
    expect(isUnlocked(cur, sol)).toBe(true);
  });

  it('пустая доска ничего не открывает', () => {
    const sol = solvedWithCenter(7);
    expect(isUnlocked(Array.from({ length: N }, () => Array(N).fill(0)), sol)).toBe(false);
  });
});

describe('сетка с заданным центром', () => {
  it.each([1, 5, 9])('центр равен %i, и сетка валидна', (v) => {
    const b = solvedWithCenter(v);
    expect(b[FEED_CELL[0]][FEED_CELL[1]]).toBe(v);
    for (let r = 0; r < N; r++) {
      expect(new Set(b[r]).size).toBe(N);                                  // строка без повторов
      expect(new Set(b.map((row) => row[r])).size).toBe(N);                // столбец без повторов
    }
  });
});

describe('размер задачи', () => {
  it('глубина два: корень плюс девять дочерних, не больше', () => {
    const f = generateFractal(40, 40);
    expect(f.children.length).toBe(9);
    // Десять сеток против 6555 у оригинала — сознательный предел: дерево из тысяч
    // на лету не соберётся, а заготовки — отдельная работа.
    expect(1 + f.children.length).toBe(10);
  });

  it('подсказки в задании совпадают с решением', () => {
    const f = generateFractal(45, 45);
    const check = (p: number[][], s: number[][]) => {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (p[r][c] !== 0) expect(p[r][c]).toBe(s[r][c]);
    };
    check(f.root.puzzle, f.root.solution);
    for (const ch of f.children) check(ch.puzzle, ch.solution);
  });
});

/**
 * Порог не должен браться подсказками задания.
 *
 * Поймано на первом запуске экрана 12.08: девять плиток сразу показали «17/17».
 * Причина — solvedCount считал совпадения с решением, а подсказки совпадают с ним
 * по определению. При 36 подсказках порог оказывался взят ДО первого хода: все
 * дочерние открыты сразу, корень заполняется сам, играть не во что.
 */
describe('порог считает только ходы человека', () => {
  it('нетронутая сетка с подсказками НЕ открыта', () => {
    const f = generateFractal(50, 45);
    for (const ch of f.children) {
      const given = ch.puzzle.map((row) => row.map((v) => v !== 0));
      expect(isUnlocked(ch.puzzle, ch.solution, given)).toBe(false);
    }
  });

  it('без маски подсказок порог берётся сам собой — ради этого маска и заведена', () => {
    const f = generateFractal(50, 45);
    expect(isUnlocked(f.children[0].puzzle, f.children[0].solution)).toBe(true);
  });

  it('открывается ровно на 17 верных СВОИХ клетках', () => {
    const f = generateFractal(50, 45);
    const ch = f.children[0];
    const given = ch.puzzle.map((row) => row.map((v) => v !== 0));
    const cur = ch.puzzle.map((row) => [...row]);
    let put = 0;
    outer: for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (given[r][c]) continue;
        cur[r][c] = ch.solution[r][c];
        if (++put === UNLOCK_CELLS - 1) break outer;
      }
    }
    expect(isUnlocked(cur, ch.solution, given)).toBe(false);
    outer2: for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) if (!given[r][c] && cur[r][c] === 0) { cur[r][c] = ch.solution[r][c]; break outer2; }
    }
    expect(isUnlocked(cur, ch.solution, given)).toBe(true);
  });
});

/**
 * Уровни фрактальной судоку.
 *
 * ЗАЧЕМ. Игра вышла вообще без уровней — сразу «hard» и всегда одинаково. Уровень
 * крутит два условия: сколько выколото и сколько верных клеток нужно набрать до
 * открытия корневой.
 *
 * ⚠️ ПОРОГ НЕ ДОЛЖЕН ДОРАСТАТЬ ДО ПОЛНОГО РЕШЕНИЯ. Открывать корневую клетку
 * только за полностью решённую дочернюю значит превратить фрактал в девять судоку
 * подряд без единой промежуточной награды — ровно то, ради чего порог и заведён.
 * И порог не может превысить число ВЫКОЛОТЫХ клеток: набрать больше нечем.
 */
import { FRACTAL_MAX_LEVEL, clampFractalLevel, fractalLevel } from '../services/fractalLevels';

describe('уровни фрактальной судоку', () => {
  const ALL = Array.from({ length: FRACTAL_MAX_LEVEL }, (_, i) => i + 1);

  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(FRACTAL_MAX_LEVEL).toBeGreaterThanOrEqual(10);
  });

  it('первый уровень — нынешние условия игры', () => {
    expect(fractalLevel(1).unlockCells).toBe(UNLOCK_CELLS);
  });

  it('оба параметра растут строго', () => {
    const flat: string[] = [];
    for (let n = 2; n <= FRACTAL_MAX_LEVEL; n++) {
      const p = fractalLevel(n - 1), c = fractalLevel(n);
      if (c.childBlanks < p.childBlanks) flat.push(`выколото на ${n}: ${p.childBlanks} → ${c.childBlanks}`);
      if (c.unlockCells < p.unlockCells) flat.push(`порог на ${n}: ${p.unlockCells} → ${c.unlockCells}`);
    }
    expect(flat).toEqual([]);
    expect(fractalLevel(FRACTAL_MAX_LEVEL).childBlanks).toBeGreaterThan(fractalLevel(1).childBlanks);
    expect(fractalLevel(FRACTAL_MAX_LEVEL).unlockCells).toBeGreaterThan(fractalLevel(1).unlockCells);
  });

  it('порог набираем: он не больше числа выколотых клеток', () => {
    const impossible = ALL
      .map((n) => ({ n, ...fractalLevel(n) }))
      .filter((c) => c.unlockCells > c.childBlanks)
      .map((c) => `уровень ${c.n}: нужно ${c.unlockCells}, а выколото всего ${c.childBlanks}`);
    expect(impossible).toEqual([]);
  });

  it('награда остаётся промежуточной — порог меньше половины сетки', () => {
    const tooLate = ALL
      .map((n) => ({ n, u: fractalLevel(n).unlockCells }))
      .filter((c) => c.u > 40)
      .map((c) => `уровень ${c.n}: порог ${c.u} из 81`);
    expect(tooLate).toEqual([]);
  });

  it('сетка не выкалывается в ноль — опоры остаются', () => {
    const empty = ALL
      .map((n) => ({ n, b: fractalLevel(n).childBlanks }))
      .filter((c) => c.b > 64)   // осталось бы меньше 17 подсказок — уже не судоку
      .map((c) => `уровень ${c.n}: выколото ${c.b} из 81`);
    expect(empty).toEqual([]);
  });

  it('порог реально влияет на открытие клетки', () => {
    const sol = solvedWithCenter(5);
    const cur = Array.from({ length: N }, () => Array(N).fill(0));
    let put = 0;
    outer:
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      cur[r][c] = sol[r][c];
      if (++put === 20) break outer;
    }
    expect(isUnlocked(cur, sol, undefined, 17)).toBe(true);    // порог первого уровня взят
    expect(isUnlocked(cur, sol, undefined, 34)).toBe(false);   // порог верхнего — ещё нет
  });

  it('мусор на входе не роняет', () => {
    expect(clampFractalLevel(0)).toBe(1);
    expect(clampFractalLevel(999)).toBe(FRACTAL_MAX_LEVEL);
    expect(clampFractalLevel(NaN)).toBe(1);
  });
});
