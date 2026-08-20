/**
 * ГРАДАЦИЯ СЛОЖНОСТИ СУДОКУ ПО ТЕХНИКЕ РЕШЕНИЯ.
 *
 * Зачем это вообще. Сложность мерили числом пустых клеток: `min(58, 34 + lv - 5)`.
 * Это не та ось. Пустые клетки выходят на потолок 58 к 29-му уровню и дальше не
 * растут, а варианты правил после 30-го (метки чётности, точки кропки) не усложняют
 * задачу, а ОБЛЕГЧАЮТ её — они добавляют игроку информацию. Отсюда репорты Вали:
 *   «с 30 по 34 сложность не меняется, абсолютно не становится сложнее»
 *   «с этими точками судоку на 34 уровне стал намного легче, чем на 19»
 *   «начиная с 34 уровня всё очень лёгкое, я так быстро десятый не проходила»
 *
 * Настоящая ось — КАКУЮ ТЕХНИКУ приходится применить, чтобы продвинуться. Здесь
 * логический решатель, который идёт по лестнице техник от простого к сложному и
 * возвращает самую сложную из понадобившихся. Дальше генератор перебирает раскладки,
 * пока не попадёт в целевую полосу уровня.
 *
 * Что учитывается как информация игрока: правило варианта (через isValid ядра),
 * метки чётности и ПОКАЗАННЫЕ точки кропки. Отсутствие точки НЕ считается подсказкой —
 * мы показываем не все грани (см. markerDensity), поэтому пустая грань не означает
 * «связи нет». Это же должно быть сказано в правилах варианта.
 *
 * Суммы sandwich учитываются как границы допустимых позиций 1 и 9: пара позиций
 * остаётся только если сумма между ними может совпасть с подсказкой.
 */
import {
  Cell, Variant, ThermoPN, ArrowMap, CageMap, isValid, generatePuzzle, shuffle, HYPER_BOXES, ORTHO,
} from './sudoku-core';

export type Technique =
  | 'naked_single'    // в клетке остался один кандидат
  | 'hidden_single'   // в блоке/строке цифра помещается только в одну клетку
  | 'locked'          // связанные кандидаты: цифра блока заперта в одной строке (и наоборот)
  | 'naked_subset'    // голая пара/тройка
  | 'hidden_subset'   // скрытая пара
  | 'sandwich_sum'    // вывод из суммы между позициями 1 и 9
  | 'x_wing'          // X-wing
  | 'guess';          // логики не хватило — нужен перебор

export const TECHNIQUE_TIER: Record<Technique, number> = {
  naked_single: 1, hidden_single: 2, locked: 3, naked_subset: 4, sandwich_sum: 4, hidden_subset: 5, x_wing: 6, guess: 9,
};

export interface GradeCtx {
  N: number; BR: number; BC: number;
  variant: Variant;
  regions?: number[][];
  thermo?: ThermoPN;
  arrow?: ArrowMap;
  cages?: CageMap;                           // клетки-суммы: сумма группы + разные цифры внутри
  parity?: number[][];                       // 1 = чётная, 2 = нечётная, 0 = без метки
  kropki?: { h: number[][]; v: number[][] }; // 2 = чёрная, 1 = белая, 0 = ТОЧКА НЕ ПОКАЗАНА
  sandwich?: { rows: number[]; cols: number[] };
}

export interface Grade {
  solved: boolean;
  tier: number;
  hardest: Technique;
  /** Доска, к которой решатель пришёл. Гейт сверяет её с эталоном: если пруннинг где-то
   *  неверен, решатель «решит» ЧУЖУЮ сетку и объявит единственность там, где её нет. */
  grid?: Cell[][];
}

const bit = (v: number) => 1 << (v - 1);
const popcount = (m: number) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
const bitsOf = (m: number, N: number) => { const o: number[] = []; for (let v = 1; v <= N; v++) if (m & bit(v)) o.push(v); return o; };
// Минимум/максимум значения прямо из маски. Раньше правила вариантов гоняли bitsOf в
// тройном цикле и аллоцировали массив на каждую пару клеток — уровень 22 (несоседние)
// собирался 312 с. С масками те же проверки идут за считанные операции.
const loVal = (m: number) => 32 - Math.clz32(m & -m);          // значение младшего бита
const hiVal = (m: number) => 32 - Math.clz32(m);               // значение старшего бита
const atLeast = (k: number) => ~((1 << (k - 1)) - 1);          // маска значений ≥ k
const atMost = (k: number) => (k <= 0 ? 0 : (1 << k) - 1);     // маска значений ≤ k

/** Зоны, внутри которых каждая цифра встречается ровно один раз. */
export function unitsFor(N: number, BR: number, BC: number, variant: Variant, regions?: number[][]): [number, number][][] {
  const units: [number, number][][] = [];
  for (let r = 0; r < N; r++) units.push(Array.from({ length: N }, (_, c) => [r, c] as [number, number]));
  for (let c = 0; c < N; c++) units.push(Array.from({ length: N }, (_, r) => [r, c] as [number, number]));
  if (variant === 'jigsaw' && regions) {
    const byReg = new Map<number, [number, number][]>();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const g = regions[r][c];
      if (!byReg.has(g)) byReg.set(g, []);
      byReg.get(g)!.push([r, c]);
    }
    for (const cells of byReg.values()) units.push(cells);
  } else {
    for (let br = 0; br < N; br += BR) for (let bc = 0; bc < N; bc += BC) {
      const cells: [number, number][] = [];
      for (let i = 0; i < BR; i++) for (let j = 0; j < BC; j++) cells.push([br + i, bc + j]);
      units.push(cells);
    }
  }
  // Диагонали и зоны Windoku — тоже полноценные зоны: игрок ими пользуется, значит и решатель должен.
  if (variant === 'diagonal') {
    units.push(Array.from({ length: N }, (_, i) => [i, i] as [number, number]));
    units.push(Array.from({ length: N }, (_, i) => [i, N - 1 - i] as [number, number]));
  } else if (variant === 'hyper') {
    for (const [hr, hc] of HYPER_BOXES) {
      const cells: [number, number][] = [];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cells.push([hr + i, hc + j]);
      units.push(cells);
    }
  }
  return units;
}

/** Оценка пазла: самая сложная техника, без которой не обойтись. */
export function gradePuzzle(puzzle: Cell[][], ctx: GradeCtx, tierCap = 9): Grade {
  const { N, BR, BC, variant, regions, thermo, arrow, cages, parity, kropki, sandwich } = ctx;
  const grid = puzzle.map((row) => [...row]);
  const FULL = (1 << N) - 1;
  const cand: number[][] = Array.from({ length: N }, () => Array(N).fill(FULL));
  const units = unitsFor(N, BR, BC, variant, regions);
  const unitsOfCell: number[][][] = Array.from({ length: N }, () => Array.from({ length: N }, () => [] as number[]));
  units.forEach((cells, ui) => { for (const [r, c] of cells) unitsOfCell[r][c].push(ui); });

  let maxTier = 0;
  let hardest: Technique = 'naked_single';
  const bump = (t: Technique) => { const tr = TECHNIQUE_TIER[t]; if (tr > maxTier) { maxTier = tr; hardest = t; } };

  const kropkiOk = (d: number, a: number, b: number) => (d === 2 ? Math.max(a, b) === 2 * Math.min(a, b) : Math.abs(a - b) === 1);

  /** Пересчёт кандидатов по всей информации, которая есть у игрока. true = противоречие. */
  const refilter = (): boolean => {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (grid[r][c] !== 0) { cand[r][c] = 0; continue; }
      let m = cand[r][c];
      for (const v of bitsOf(m, N)) {
        let ok = isValid(grid, r, c, v, N, BR, BC, variant, regions, thermo, arrow, cages);
        if (ok && parity && parity[r][c] !== 0) ok = (parity[r][c] === 1) === (v % 2 === 0);
        if (!ok) m &= ~bit(v);
      }
      cand[r][c] = m;
      if (m === 0) return true;
    }
    // ── Несоседние числа: у соседа обязан найтись вариант, отличающийся не на единицу.
    // isValid ловит правило только против УЖЕ известных соседей, а тут оно работает и по
    // кандидатам. Без этого решатель на nonconsec (L22–25) откатывал почти каждое
    // выкалывание и уходил на дорогой путь.
    if (variant === 'nonconsec') {
      // Кандидат v невозможен, если У СОСЕДА не осталось ни одного значения, отличного
      // от v не на единицу — то есть все его кандидаты лежат в {v-1, v+1}.
      for (let pass = 0; pass < 3; pass++) {
        let changed = false;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          if (grid[r][c] !== 0) continue;
          let m = cand[r][c];
          for (const [dr, dc] of ORTHO) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
            const other = grid[nr][nc] !== 0 ? bit(grid[nr][nc]) : cand[nr][nc];
            if (!other) continue;
            for (let v = 1; v <= N; v++) {
              if (!(m & bit(v))) continue;
              const adj = (v > 1 ? bit(v - 1) : 0) | (v < N ? bit(v + 1) : 0);
              if ((other & ~adj) === 0) { m &= ~bit(v); changed = true; }
            }
          }
          cand[r][c] = m;
          if (m === 0) return true;
        }
        if (!changed) break;
      }
    }

    // ── Термометр: вдоль пути от колбы значения строго растут. Отсюда границы —
    // на i-й позиции значение не меньше i+1 и не больше N-(длина-1-i), — и попарная
    // сверка с соседями по пути. isValid знал только про уже заполненных соседей.
    if (variant === 'thermo' && thermo) {
      for (let pass = 0; pass < 4; pass++) {
        let changed = false;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const pn = thermo[r][c];
          if (!pn || grid[r][c] !== 0) continue;
          let allow = (1 << N) - 1;
          if (pn.prev) {
            const pm = grid[pn.prev[0]][pn.prev[1]] !== 0 ? bit(grid[pn.prev[0]][pn.prev[1]]) : cand[pn.prev[0]][pn.prev[1]];
            if (pm) allow &= atLeast(loVal(pm) + 1);             // строго больше предыдущего
          }
          if (pn.next) {
            const nm = grid[pn.next[0]][pn.next[1]] !== 0 ? bit(grid[pn.next[0]][pn.next[1]]) : cand[pn.next[0]][pn.next[1]];
            if (nm) allow &= atMost(hiVal(nm) - 1);              // строго меньше следующего
          }
          const next = cand[r][c] & allow;
          if (next !== cand[r][c]) { cand[r][c] = next; changed = true; }
          if (cand[r][c] === 0) return true;
        }
        if (!changed) break;
      }
    }

    // ── Клетки-суммы: цифры внутри группы разные, и сумма фиксирована. Отсюда два
    // вывода на кандидатах: поставленная в группе цифра уходит из остальных её клеток,
    // а границы «сколько осталось набрать» режут кандидаты каждой открытой клетки.
    // isValid знает то же правило, но только про уже заполненных соседей — по маскам
    // кандидатов оно работает раньше и сильнее (на этом и стоит связка с термометром:
    // границы термометра сужают маску, сужение маски двигает границу суммы, и наоборот).
    if (cages) {
      const lowAt = (k: number) => atLeast(Math.min(N + 1, Math.max(1, k)));
      const highAt = (k: number) => atMost(Math.max(0, Math.min(N, k)));
      for (let pass = 0; pass < 4; pass++) {
        let changed = false;
        for (let id = 0; id < cages.cells.length; id++) {
          const cells = cages.cells[id];
          if (!cells || !cells.length) continue;
          let placed = 0, rest = cages.sum[id];
          const open: [number, number][] = [];
          for (const [r, c] of cells) {
            const v = grid[r][c];
            if (v === 0) { open.push([r, c]); continue; }
            placed |= bit(v); rest -= v;
          }
          for (const [r, c] of open) {
            const next = cand[r][c] & ~placed;
            if (next !== cand[r][c]) { cand[r][c] = next; changed = true; }
            if (next === 0) return true;
          }
          for (const [r, c] of open) {
            let mn = 0, mx = 0;
            for (const [rr, cc] of open) {
              if (rr === r && cc === c) continue;
              const m = cand[rr][cc];
              if (!m) return true;
              mn += loVal(m); mx += hiVal(m);
            }
            const next = cand[r][c] & lowAt(rest - mx) & highAt(rest - mn);
            if (next !== cand[r][c]) { cand[r][c] = next; changed = true; }
            if (next === 0) return true;
          }
        }
        if (!changed) break;
      }
    }

    // ── Стрелка: кружок равен сумме клеток вдоль стрелки. Считаем границы суммы по
    // кандидатам и режем и кружок, и сами клетки стрелки.
    if (variant === 'arrow' && arrow) {
      const mask = (rr: number, cc: number) => (grid[rr][cc] !== 0 ? bit(grid[rr][cc]) : cand[rr][cc]);
      for (let pass = 0; pass < 3; pass++) {
        let changed = false;
        const seen = new Set<number>();
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const m = arrow[r][c];
          if (!m) continue;
          const key = m.circle[0] * N + m.circle[1];
          if (seen.has(key)) continue;
          seen.add(key);
          const [cr, cc] = m.circle;
          let minSum = 0, maxSum = 0;
          for (const [ar, ac] of m.arrows) { const mm = mask(ar, ac); if (!mm) return true; minSum += loVal(mm); maxSum += hiVal(mm); }
          if (grid[cr][cc] === 0) {
            const next = cand[cr][cc] & atLeast(minSum) & atMost(maxSum);
            if (next !== cand[cr][cc]) { cand[cr][cc] = next; changed = true; }
            if (cand[cr][cc] === 0) return true;
          }
          const cm = mask(cr, cc);
          if (!cm) return true;
          const cLo = loVal(cm), cHi = hiVal(cm);
          for (const [ar, ac] of m.arrows) {
            if (grid[ar][ac] !== 0) continue;
            const mm = cand[ar][ac];
            const restMin = minSum - loVal(mm), restMax = maxSum - hiVal(mm);
            const next = mm & atMost(cHi - restMin) & atLeast(cLo - restMax > 0 ? cLo - restMax : 1);
            if (next !== mm) { cand[ar][ac] = next; changed = true; }
            if (cand[ar][ac] === 0) return true;
          }
        }
        if (!changed) break;
      }
    }

    // ── Сэндвич: подсказка = сумма цифр СТРОГО между 1 и 9 в ряду/столбце. Перебираем
    // допустимые пары позиций (1,9) и оставляем единице и девятке только те клетки,
    // где хоть одна пара сходится по границам суммы. Правило раньше решателю не было
    // известно вовсе — оттого сэндвич и оценивался пессимистично.
    if (variant === 'sandwich' && sandwich && N === 9) {
      let usedSandwich = false;
      const line = (idx: number, byRow: boolean) => Array.from({ length: N }, (_, k) => (byRow ? [idx, k] : [k, idx]) as [number, number]);
      for (const byRow of [true, false]) {
        const targets = byRow ? sandwich.rows : sandwich.cols;
        for (let i = 0; i < N; i++) {
          const cells = line(i, byRow);
          const has = (k: number, v: number) => {
            const [rr, cc] = cells[k];
            return grid[rr][cc] !== 0 ? grid[rr][cc] === v : !!(cand[rr][cc] & bit(v));
          };
          // Девять позиций помещаются в один int: без Set/массивов на каждой линии.
          let okPos1 = 0, okPos9 = 0;
          for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
            if (a === b) continue;
            if (!has(a, 1) || !has(b, 9)) continue;
            const [x, y] = a < b ? [a, b] : [b, a];
            let mn = 0, mx = 0;
            for (let k = x + 1; k < y; k++) {
              const [rr, cc] = cells[k];
              const m = grid[rr][cc] !== 0 ? bit(grid[rr][cc]) : cand[rr][cc];
              if (!m) { mn = 1e9; break; }
              mn += loVal(m); mx += hiVal(m);
            }
            if (mn <= targets[i] && targets[i] <= mx) { okPos1 |= 1 << a; okPos9 |= 1 << b; }
          }
          for (let k = 0; k < N; k++) {
            const [rr, cc] = cells[k];
            if (grid[rr][cc] !== 0) continue;
            if ((cand[rr][cc] & bit(1)) && !(okPos1 & (1 << k))) { cand[rr][cc] &= ~bit(1); usedSandwich = true; }
            if ((cand[rr][cc] & bit(9)) && !(okPos9 & (1 << k))) { cand[rr][cc] &= ~bit(9); usedSandwich = true; }
            if (cand[rr][cc] === 0) return true;
          }
        }
      }
      // Само применение суммы — техника игрока, а не «бесплатный» refilter. Без bump
      // пазл, решённый через sandwich, ошибочно оценивался как набор простых одиночек.
      if (usedSandwich) bump('sandwich_sum');
    }

    if (kropki) {
      // Дуговая согласованность по ПОКАЗАННЫМ точкам: кандидат выживает, только если
      // у соседа найдётся значение, с которым точка выполняется. 0 = точки нет = нет информации.
      for (let pass = 0; pass < 3; pass++) {
        let changed = false;
        const edges: [number, number, number, number, number][] = [];
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          if (c < N - 1 && kropki.h[r][c] !== 0) edges.push([r, c, r, c + 1, kropki.h[r][c]]);
          if (r < N - 1 && kropki.v[r][c] !== 0) edges.push([r, c, r + 1, c, kropki.v[r][c]]);
        }
        for (const [ar, ac, br2, bc2, d] of edges) {
          const maskOf = (rr: number, cc: number) => (grid[rr][cc] !== 0 ? bit(grid[rr][cc]) : cand[rr][cc]);
          const prune = (rr: number, cc: number, orr: number, occ: number) => {
            if (grid[rr][cc] !== 0) return;
            const other = maskOf(orr, occ);
            let m = cand[rr][cc];
            for (const v of bitsOf(m, N)) {
              if (!bitsOf(other, N).some((w) => kropkiOk(d, v, w))) { m &= ~bit(v); changed = true; }
            }
            cand[rr][cc] = m;
          };
          prune(ar, ac, br2, bc2);
          prune(br2, bc2, ar, ac);
          if (cand[ar][ac] === 0 && grid[ar][ac] === 0) return true;
          if (cand[br2][bc2] === 0 && grid[br2][bc2] === 0) return true;
        }
        if (!changed) break;
      }
    }
    return false;
  };

  const place = (r: number, c: number, v: number) => { grid[r][c] = v; cand[r][c] = 0; };

  const nakedSingle = (): boolean => {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
      if (grid[r][c] === 0 && popcount(cand[r][c]) === 1) { place(r, c, bitsOf(cand[r][c], N)[0]); bump('naked_single'); return true; }
    return false;
  };

  const hiddenSingle = (): boolean => {
    for (const cells of units) for (let v = 1; v <= N; v++) {
      if (cells.some(([r, c]) => grid[r][c] === v)) continue;
      const spots = cells.filter(([r, c]) => grid[r][c] === 0 && (cand[r][c] & bit(v)));
      if (spots.length === 1) { const [r, c] = spots[0]; place(r, c, v); bump('hidden_single'); return true; }
    }
    return false;
  };

  const locked = (): boolean => {
    for (let ui = 0; ui < units.length; ui++) for (let v = 1; v <= N; v++) {
      const cells = units[ui].filter(([r, c]) => grid[r][c] === 0 && (cand[r][c] & bit(v)));
      if (cells.length < 2 || cells.length > 3) continue;
      // зоны, содержащие ВСЕ эти клетки — там цифру можно вычеркнуть из остальных клеток
      const shared = unitsOfCell[cells[0][0]][cells[0][1]].filter((u) => u !== ui
        && cells.every(([r, c]) => unitsOfCell[r][c].includes(u)));
      for (const u of shared) {
        let hit = false;
        for (const [r, c] of units[u]) {
          if (grid[r][c] !== 0) continue;
          if (cells.some(([cr, cc]) => cr === r && cc === c)) continue;
          if (cand[r][c] & bit(v)) { cand[r][c] &= ~bit(v); hit = true; }
        }
        if (hit) { bump('locked'); return true; }
      }
    }
    return false;
  };

  const nakedSubset = (): boolean => {
    for (const cells of units) {
      const open = cells.filter(([r, c]) => grid[r][c] === 0);
      for (let k = 2; k <= 3; k++) {
        const idx = open.map((_, i) => i).filter((i) => popcount(cand[open[i][0]][open[i][1]]) <= k && popcount(cand[open[i][0]][open[i][1]]) >= 2);
        for (const combo of combos(idx, k)) {
          let mask = 0;
          for (const i of combo) mask |= cand[open[i][0]][open[i][1]];
          if (popcount(mask) !== k) continue;
          let hit = false;
          for (let i = 0; i < open.length; i++) {
            if (combo.includes(i)) continue;
            const [r, c] = open[i];
            if (cand[r][c] & mask) { cand[r][c] &= ~mask; hit = true; if (cand[r][c] === 0) return false; }
          }
          if (hit) { bump('naked_subset'); return true; }
        }
      }
    }
    return false;
  };

  const hiddenSubset = (): boolean => {
    for (const cells of units) {
      const open = cells.filter(([r, c]) => grid[r][c] === 0);
      const spotsOf = new Map<number, number[]>();
      for (let v = 1; v <= N; v++) {
        if (cells.some(([r, c]) => grid[r][c] === v)) continue;
        const s = open.map((_, i) => i).filter((i) => cand[open[i][0]][open[i][1]] & bit(v));
        if (s.length === 2) spotsOf.set(v, s);
      }
      const vs = [...spotsOf.keys()];
      for (const [a, b] of combos(vs, 2)) {
        const sa = spotsOf.get(a)!, sb = spotsOf.get(b)!;
        if (sa[0] !== sb[0] || sa[1] !== sb[1]) continue;
        const keep = bit(a) | bit(b);
        let hit = false;
        for (const i of sa) {
          const [r, c] = open[i];
          if (cand[r][c] & ~keep) { cand[r][c] &= keep; hit = true; }
        }
        if (hit) { bump('hidden_subset'); return true; }
      }
    }
    return false;
  };

  const xWing = (): boolean => {
    for (let v = 1; v <= N; v++) {
      for (const byRow of [true, false]) {
        const lines: number[][] = [];
        for (let i = 0; i < N; i++) {
          const spots: number[] = [];
          for (let j = 0; j < N; j++) {
            const r = byRow ? i : j, c = byRow ? j : i;
            if (grid[r][c] === 0 && (cand[r][c] & bit(v))) spots.push(j);
          }
          lines.push(spots.length === 2 ? spots : []);
        }
        for (let i1 = 0; i1 < N; i1++) for (let i2 = i1 + 1; i2 < N; i2++) {
          const a = lines[i1], b = lines[i2];
          if (a.length !== 2 || b.length !== 2 || a[0] !== b[0] || a[1] !== b[1]) continue;
          let hit = false;
          for (const j of a) for (let i = 0; i < N; i++) {
            if (i === i1 || i === i2) continue;
            const r = byRow ? i : j, c = byRow ? j : i;
            if (grid[r][c] === 0 && (cand[r][c] & bit(v))) { cand[r][c] &= ~bit(v); hit = true; }
          }
          if (hit) { bump('x_wing'); return true; }
        }
      }
    }
    return false;
  };

  // tierCap отсекает техники сверху: так можно спросить «решается ли это БЕЗ техник выше k».
  // На этом стоит ПОЛ сложности: пазл требует технику k, если без неё он не добирается.
  const all: [Technique, () => boolean][] = [
    ['naked_single', nakedSingle], ['hidden_single', hiddenSingle], ['locked', locked],
    ['naked_subset', nakedSubset], ['hidden_subset', hiddenSubset], ['x_wing', xWing],
  ];
  const steps = all.filter(([t]) => TECHNIQUE_TIER[t] <= tierCap).map(([, f]) => f);
  for (let guard = 0; guard < N * N * 25; guard++) {
    if (refilter()) return { solved: false, tier: TECHNIQUE_TIER.guess, hardest: 'guess' };
    let empty = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c] === 0) empty++;
    if (empty === 0) return { solved: true, tier: Math.max(1, maxTier), hardest, grid: grid.map((row) => [...row]) };
    if (!steps.some((f) => f())) break;
  }
  return { solved: false, tier: TECHNIQUE_TIER.guess, hardest: 'guess' };
}

function combos(arr: number[], k: number): number[][] {
  const out: number[][] = [];
  const walk = (start: number, acc: number[]) => {
    if (acc.length === k) { out.push([...acc]); return; }
    for (let i = start; i < arr.length; i++) { acc.push(arr[i]); walk(i + 1, acc); acc.pop(); }
  };
  walk(0, []);
  return out;
}

/**
 * Целевая полоса сложности по уровню. Верх — потолок («сложнее не делаем»),
 * низ — ПОЛ («легче не выпускаем»), и именно пол чинит жалобу «34-й легче 19-го»:
 * у 34-го пол выше, чем потолок у 19-го, так что перепрыгнуть вниз уже нельзя.
 */
export function targetTier(level: number): { min: number; max: number } {
  const lv = Math.max(1, level);
  if (lv <= 4) return { min: 1, max: 1 };    // 6×6, только голые одиночки
  if (lv <= 8) return { min: 1, max: 2 };    // 9×9 классика, скрытые одиночки
  if (lv <= 13) return { min: 2, max: 3 };
  if (lv <= 21) return { min: 3, max: 3 };   // связанные кандидаты
  if (lv <= 29) return { min: 3, max: 4 };   // голые пары/тройки
  if (lv <= 37) return { min: 4, max: 5 };   // скрытые пары
  return { min: 4, max: 6 };                 // выше x-wing не поднимаемся: дальше растит сам вариант
}

/**
 * Доля показываемых меток (чётность / точки кропки) внутри фазы варианта.
 * Метка — это подарок игроку, поэтому к концу фазы подарков меньше.
 * Раньше было наглухо 0.55 для чётности и 1.00 для кропки — оттого «с этими точками
 * стало намного легче».
 */
export function markerDensity(level: number, variant: Variant): number {
  if (variant === 'evenodd') return [0.40, 0.34, 0.28, 0.22][Math.min(3, Math.max(0, level - 30))];
  if (variant === 'kropki') return [0.32, 0.28, 0.24, 0.20][Math.min(3, Math.max(0, level - 34))];
  return 1;
}

/** Прореживание меток до нужной доли. Мутирует копию, исходник не трогаем. */
export function thinMarkers<T extends { parity?: number[][]; kropki?: { h: number[][]; v: number[][] } }>(
  gen: T, level: number, variant: Variant, N: number,
): T {
  const dens = markerDensity(level, variant);
  if (dens >= 1) return gen;
  if (variant === 'evenodd' && gen.parity) {
    const marked: [number, number][] = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (gen.parity[r][c] !== 0) marked.push([r, c]);
    // 0.55 — та доля, что уже проставлена в ядре; здесь снимаем лишнее до целевой
    const keep = Math.round(marked.length * (dens / 0.55));   // 0.55 — доля, уже проставленная ядром
    for (const [r, c] of shuffle(marked).slice(keep)) gen.parity[r][c] = 0;
  }
  if (variant === 'kropki' && gen.kropki) {
    const dots: ['h' | 'v', number, number][] = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (c < N - 1 && gen.kropki.h[r][c] !== 0) dots.push(['h', r, c]);
      if (r < N - 1 && gen.kropki.v[r][c] !== 0) dots.push(['v', r, c]);
    }
    const keep = Math.round(dots.length * dens);
    for (const [k, r, c] of shuffle(dots as any).slice(keep) as ['h' | 'v', number, number][]) gen.kropki[k][r][c] = 0;
  }
  return gen;
}

export type GeneratedPuzzle = ReturnType<typeof generatePuzzle>;

/**
 * Варианты, где логический решатель понимает правило достаточно, чтобы копать от
 * техники. Ограничения вариантов распространяются по маскам кандидатов внутри
 * refilter; если конкретная попытка не укладывается в бюджет, generateLogical всё
 * равно сохраняет прежний безопасный fallback через проверку единственности.
 */
const LOGIC_VARIANTS: readonly Variant[] = ['none', 'diagonal', 'antiknight', 'hyper', 'antiking', 'evenodd', 'kropki', 'sandwich', 'jigsaw', 'nonconsec', 'thermo', 'arrow', 'thermocage'];

/** Потолок пустых клеток на 9×9: доска в 74 дырки решается, но заполнять её долго. */
const MAX_BLANKS_9 = 64;

function gradeOf(gen: GeneratedPuzzle, N: number, BR: number, BC: number, variant: Variant): Grade {
  return gradePuzzle(gen.puzzle, {
    N, BR, BC, variant, regions: gen.regions, thermo: gen.thermo, arrow: gen.arrow, cages: gen.cages,
    parity: gen.parity, kropki: gen.kropki, sandwich: gen.sandwich,
  });
}

/** Одна попытка копания от логики. Возвращает null, если вариант не по этому пути. */
function digByLogic(
  level: number, blanksCap: number, N: number, BR: number, BC: number, variant: Variant, deadline: number,
  tierMax?: number,
): { gen: GeneratedPuzzle; grade: Grade; dug: number } | null {
  const base = generatePuzzle(0, N, BR, BC, variant);   // blanks=0 → только решение и структура варианта
  const sol = base.solution;
  const puzzle = sol.map((row) => [...row]);
  // Потолок техники приходит СНАРУЖИ, когда партия идёт по дороге сложности
  // (services/sudoku-roads): у «полегче» он на ступень ниже, у «пожёстче» — выше.
  // Не передали — прежняя полоса уровня, ровно как было до появления дорог.
  const max = tierMax ?? targetTier(level).max;
  const dens = markerDensity(level, variant);

  const parity = variant === 'evenodd' ? Array.from({ length: N }, () => Array(N).fill(0)) : undefined;
  let kropki = base.kropki;
  if (variant === 'kropki' && kropki) kropki = thinMarkers({ kropki }, level, variant, N).kropki;
  const ctx: GradeCtx = { N, BR, BC, variant, regions: base.regions, thermo: base.thermo, arrow: base.arrow, cages: base.cages, parity, kropki, sandwich: base.sandwich };

  // Лимит пустых держим только на новичковых уровнях, чтобы не пугать доской в дырках.
  // Дальше глубину задаёт ЛОГИКА. Старый лимит (58 к 29-му) как раз и упирался в потолок,
  // из-за чего сложность переставала расти — замер: L5..L37 почти сплошь tier 1.
  // Полные 18 sandwich-подсказок уже добавляют технику уровня 4; выкапывать сверх
  // продуктового лимита 58 клеток ради той же ступени только расходует бюджет.
  const cap = level <= 8 || variant === 'sandwich'
    ? blanksCap
    : (N === 9 ? MAX_BLANKS_9 : N * N);
  let dug = 0;
  for (const p of shuffle(Array.from({ length: N * N }, (_, i) => i))) {
    if (dug >= cap || Date.now() > deadline) break;
    const r = Math.floor(p / N), c = p % N;
    const keep = puzzle[r][c];
    puzzle[r][c] = 0;
    if (parity) parity[r][c] = Math.random() < dens ? (sol[r][c] % 2 === 0 ? 1 : 2) : 0;
    const g = gradePuzzle(puzzle, ctx);
    if (!g.solved || g.tier > max) { puzzle[r][c] = keep; if (parity) parity[r][c] = 0; }
    else dug++;
  }
  // Порог — «получилась ли вообще задача», а не «дотянули ли до идеала». Доска на 30 дырок
  // это нормальное судоку; гнать её на дорогой путь ради лишних клеток не стоит: замер
  // показал 4–20 с на пазл для nonconsec именно там.
  if (dug < Math.min(cap, blanksCap, 30)) return null;
  const gen: GeneratedPuzzle = { ...base, puzzle, parity, kropki };
  return { gen, grade: gradePuzzle(puzzle, ctx), dug };
}

/**
 * Генерация ОТ ЛОГИКИ: выкалываем клетку только если пазл остаётся решаемым техниками
 * не выше потолка уровня. Даёт три вещи разом.
 *
 * 1. Сложность растёт по уровням — потому что растёт потолок техник, а не число дырок.
 * 2. Единственность решения бесплатно: если пазл добирается логикой, каждый шаг вынужден,
 *    значит решение одно. Дорогой countSolutions на этом пути не нужен вовсе.
 * 3. Угадайка исчезает: старый путь на термометрах выдавал раскладки, не решаемые логикой.
 *
 * Метку чётности ставим В МОМЕНТ выкалывания клетки: она видна игроку, значит должна
 * участвовать в оценке прямо во время копания, иначе меряем не ту задачу.
 *
 * Внутри бюджета делаем несколько заходов и берём тот, что ближе к полосе уровня:
 * порядок выкалывания случайный, и от него сложность заметно пляшет.
 */
export function generateLogical(
  level: number, blanksCap: number, N: number, BR: number, BC: number, variant: Variant,
  opts: { budgetMs?: number; tier?: { min: number; max: number } } = {},
): { gen: GeneratedPuzzle; grade: Grade; dug: number; fellBack: boolean } {
  const budget = opts.budgetMs ?? 2200;
  const until = Date.now() + budget;
  /**
   * Полоса техник — целевая сложность партии. Обычно её задаёт уровень; дорога
   * сложности (services/sudoku-roads) передаёт свою, сдвинутую на ступень.
   *
   * ⚠️ Полосу принимаем ГОТОВОЙ, а не считаем здесь по названию дороги: знание о
   * дорогах живёт в одном файле, и градатор не должен обрастать вторым его экземпляром.
   */
  const { min, max } = opts.tier ?? targetTier(level);
  const dist = (t: number) => (t < min ? min - t : t > max ? t - max : 0);

  if (LOGIC_VARIANTS.includes(variant)) {
    let best: { gen: GeneratedPuzzle; grade: Grade; dug: number } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = digByLogic(level, blanksCap, N, BR, BC, variant, until, max);
      if (r && (!best || dist(r.grade.tier) < dist(best.grade.tier))) best = r;
      if (best && dist(best.grade.tier) === 0) break;
      if (Date.now() > until) break;
    }
    if (best) return { ...best, fellBack: false };
  }

  // Вариант не по логическому пути (или логика не потянула) — прежний путь ядра,
  // ровно как сегодня в проде. Пробовали ускорить его логическим пре-фильтром перед
  // countSolutions: на nonconsec это дало доску БЕЗ ЕДИНОЙ пустой клетки — проверка
  // единственности там упирается в бюджет шагов и откатывает каждое выкалывание.
  const gen = thinMarkers(generatePuzzle(blanksCap, N, BR, BC, variant), level, variant, N);
  let left = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (gen.puzzle[r][c] === 0) left++;
  return { gen, grade: gradeOf(gen, N, BR, BC, variant), dug: left, fellBack: true };
}
