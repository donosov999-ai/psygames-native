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
import {
  FRACTAL_MAX_LEVEL, FRACTAL_TIER_STEPS, FRACTAL_CHILDREN,
  clampFractalLevel, fractalLevel, fractalTier, fractalTopTierCount, fractalChildTiers,
} from '../services/fractalLevels';

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
    const f = generateFractal(8, 'тест-фрактал-8');
    for (const ch of f.children) {
      const [rr, rc] = ch.feedsCell;
      expect(ch.solution[FEED_CELL[0]][FEED_CELL[1]]).toBe(f.root.solution[rr][rc]);
    }
  });

  it('клетки корня, которые открываются снизу, в задании пусты — иначе вложенность декоративна', () => {
    const f = generateFractal(8, 'тест-фрактал-8');
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
    const f = generateFractal(8, 'тест-фрактал-8');
    expect(f.children.length).toBe(9);
    // Десять сеток против 6555 у оригинала — сознательный предел: дерево из тысяч
    // на лету не соберётся, а заготовки — отдельная работа.
    expect(1 + f.children.length).toBe(10);
  });

  it('подсказки в задании совпадают с решением', () => {
    const f = generateFractal(8, 'тест-фрактал-8');
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
    const f = generateFractal(8, 'тест-фрактал-8');
    for (const ch of f.children) {
      const given = ch.puzzle.map((row) => row.map((v) => v !== 0));
      expect(isUnlocked(ch.puzzle, ch.solution, given)).toBe(false);
    }
  });

  it('без маски подсказок порог берётся сам собой — ради этого маска и заведена', () => {
    const f = generateFractal(8, 'тест-фрактал-8');
    expect(isUnlocked(f.children[0].puzzle, f.children[0].solution)).toBe(true);
  });

  it('открывается ровно на 17 верных СВОИХ клетках', () => {
    const f = generateFractal(8, 'тест-фрактал-8');
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
 * ЗАЧЕМ. Игра вышла вообще без уровней — сразу «hard» и всегда одинаково.
 *
 * ⚠️ И ПЕРВАЯ ВЕРСИЯ УРОВНЕЙ КРУТИЛА НЕ ТУ ОСЬ: «сколько выколото» (38→56) и
 * «сколько верных клеток набрать» (17→34). Это ровно та ось, на которой сломался
 * обычный судоку — репорт Вали «с 30 по 34 сложность не меняется». Здесь уровень
 * поднимает ПОТОЛОК ТЕХНИКИ, которой пазл добивается, а число дырок оставлено
 * ограничителем. Тест сторожит обе вещи: лестницу техник и то, что порог открытия
 * задан ДОЛЕЙ (иначе он мог бы превысить число дырок конкретной сетки — и она не
 * открылась бы никогда, то есть партия стала бы непроходимой).
 */
describe('уровни фрактальной судоку', () => {
  const ALL = Array.from({ length: FRACTAL_MAX_LEVEL }, (_, i) => i + 1);

  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(FRACTAL_MAX_LEVEL).toBeGreaterThanOrEqual(30);
  });

  it('первый уровень — только голые одиночки, последний — X-wing', () => {
    expect(fractalLevel(1).tier).toBe(1);
    expect(fractalLevel(FRACTAL_MAX_LEVEL).tier).toBe(FRACTAL_TIER_STEPS);
  });

  it('лестница техник не проседает вниз', () => {
    const drops = ALL.slice(1)
      .filter((n) => fractalTier(n) < fractalTier(n - 1))
      .map((n) => `уровень ${n}: ${fractalTier(n - 1)} → ${fractalTier(n)}`);
    expect(drops).toEqual([]);
  });

  it('каждая ступень техники реально встречается — иначе лестница декоративна', () => {
    expect(new Set(ALL.map(fractalTier))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  /**
   * 🔴 ВТОРАЯ ОСЬ. Ступень техники меняется раз в пять уровней, и внутри ступени
   * уровни обязаны отличаться ЧЕМ-ТО ЕЩЁ. До 19.08 они отличались только долей
   * захода в дочернюю — то есть длиной одной и той же работы. Теперь внутри ступени
   * растёт число сеток, которым верхняя техника действительно нужна.
   */
  it('внутри ступени растёт число сеток, требующих верхней техники', () => {
    const flat: string[] = [];
    for (let step = 0; step < FRACTAL_TIER_STEPS; step++) {
      const levels = ALL.filter((n) => fractalTier(n) === step + 1);
      const counts = levels.map(fractalTopTierCount);
      if (step === 0) continue;   // на первой ступени верхняя техника единственная — все девять
      for (let i = 1; i < counts.length; i++) {
        if (counts[i] <= counts[i - 1]) flat.push(`ступень ${step + 1}, уровень ${levels[i]}: ${counts[i - 1]} → ${counts[i]}`);
      }
      if (counts[0] !== 1) flat.push(`ступень ${step + 1} начинается с ${counts[0]} сеток, а не с одной`);
      if (counts[counts.length - 1] !== FRACTAL_CHILDREN) flat.push(`ступень ${step + 1} кончается на ${counts[counts.length - 1]}, а не на девяти`);
    }
    expect(flat).toEqual([]);
  });

  it('вторая ось не декоративна: соседние уровни ступени дают РАЗНЫЕ наборы потолков', () => {
    // Если fractalChildTiers перестанет читать topTierCount, наборы схлопнутся в один
    // и «пять уровней ступени» снова станут одним уровнем, повторённым пять раз.
    const inStep = ALL.filter((n) => fractalTier(n) === 3);
    const shapes = new Set(inStep.map((n) => fractalChildTiers(n).join('')));
    expect(shapes.size).toBe(inStep.length);
    // и в наборе ровно девять сеток, ни больше ни меньше
    for (const n of ALL) expect(fractalChildTiers(n).length).toBe(FRACTAL_CHILDREN);
  });

  it('нижние сетки ступени легче верхних ровно на одну ступень', () => {
    const bad = ALL.filter((n) => {
      const t = fractalTier(n);
      const set = fractalChildTiers(n);
      const top = set.filter((x) => x === t).length;
      if (top !== fractalTopTierCount(n)) return true;
      // на первой ступени понижать некуда — все девять и есть верхняя техника
      const low = t === 1 ? FRACTAL_CHILDREN - top : set.filter((x) => x === t - 1).length;
      return top + low !== FRACTAL_CHILDREN;
    });
    expect(bad).toEqual([]);
  });

  it('глубина захода в дочернюю растёт строго', () => {
    const drops = ALL.slice(1)
      .filter((n) => fractalLevel(n).unlockShare <= fractalLevel(n - 1).unlockShare)
      .map((n) => `уровень ${n}: доля не выросла`);
    expect(drops).toEqual([]);
  });

  it('награда остаётся промежуточной — порог не дорастает до «реши целиком»', () => {
    const tooLate = ALL
      .map((n) => ({ n, u: fractalLevel(n).unlockShare }))
      .filter((c) => c.u > 0.75)
      .map((c) => `уровень ${c.n}: доля ${c.u.toFixed(2)}`);
    expect(tooLate).toEqual([]);
    expect(fractalLevel(1).unlockShare).toBeGreaterThan(0.2);   // и не «поставь одну цифру»
  });

  it('потолок дырок оставляет опоры', () => {
    const empty = ALL
      .map((n) => ({ n, b: fractalLevel(n).childBlanksCap }))
      .filter((c) => c.b > 64)   // осталось бы меньше 17 подсказок — уже не судоку
      .map((c) => `уровень ${c.n}: потолок дырок ${c.b} из 81`);
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
    expect(isUnlocked(cur, sol, undefined, 17)).toBe(true);    // низкий порог взят
    expect(isUnlocked(cur, sol, undefined, 34)).toBe(false);   // высокий — ещё нет
  });

  it('мусор на входе не роняет', () => {
    expect(clampFractalLevel(0)).toBe(1);
    expect(clampFractalLevel(999)).toBe(FRACTAL_MAX_LEVEL);
    expect(clampFractalLevel(NaN)).toBe(1);
  });
});
