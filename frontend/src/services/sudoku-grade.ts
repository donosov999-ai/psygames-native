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
  Overlays, levelConfig,
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
          // ⚠️ −1 = подсказка НЕ показана (см. thinSandwich). Считать по ней нельзя:
          // игрок её не видит, и доска, взятая через неё, была бы оценена не по той задаче.
          if ((targets[i] as number) < 0) continue;
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
/**
 * Место уровня ВНУТРИ полосы своего варианта: 0 — первый уровень правила, 3 — последний.
 * Полосы вариантов идут по четыре начиная с 38-го (сэндвич, термометры, стрелки, джигсо,
 * ThermoCage); ниже 38-го считать нечего — там полоса техник и так меняется чаще.
 */
export function bandPos(level: number): number {
  const lv = Math.max(1, level);
  return lv < 38 ? 0 : (lv - 38) % 4;
}

/**
 * Целевая полоса техник уровня.
 *
 * 🔴 ВЫШЕ 37-го ДВАДЦАТЬ УРОВНЕЙ БЫЛИ НЕОТЛИЧИМЫ. Полоса возвращала одно и то же
 * `{4, 6}` на всё от 38-го до 57-го, число дырок упиралось в потолок 58 ещё на 29-м,
 * а правило варианта меняется раз в четыре уровня. Замер по `levelConfig` + `targetTier`:
 * на отрезке 30..57 всего СЕМЬ различимых наборов, и с 38-го внутри каждой четвёрки
 * не отличается ровно ничего — ни клетки, ни техники, ни подсказки. Человек проходил
 * 39-й и получал 40-й, который не отличается от него ничем, кроме номера.
 *
 * Лечим полосой: внутри четвёрки цель растёт от «голые пары» к «X-wing». Это не
 * косметика — потолок ПРЯМО управляет копанием (клетка не выкалывается, если поднимает
 * ступень выше потолка), поэтому доска действительно становится труднее.
 *
 * ⚠️ Пол остаётся ЦЕЛЬЮ, а не гарантией, и это написано честно: на термометрах он
 * достижим не всегда (замер: 0 из 12 досок 45-го уровня дотянули до четвёртой ступени).
 * Гарантируется ПОТОЛОК — доска берётся логикой и перебора не требует.
 */
/**
 * 🔴 ВЕРХНЯЯ ПОЛОСА (цель ровно 6) — ЗАМЕР 23.08.2026, ЧТОБЫ НЕ ПЕРЕОТКРЫВАТЬ.
 *
 * Вопрос был: шестая ступень на верхних уровнях недостижима в принципе или просто
 * не успевает? Ответ — НЕ УСПЕВАЕТ, и это меняет лекарство.
 *
 * Боевым путём (`logicalBuilder`), бюджет 20–60 с вместо боевых 2200 мс:
 *   L41 сэндвич     4:5 5:2 6:1  → шестая берётся, 1 из 8
 *   L45 термометр   4:3 5:4 6:1  → 1 из 8
 *   L49 стрелка     4:1 5:7 6:2  → 2 из 10 (при 60 с; при 20 с — ни разу из 8)
 *   L53 джигсо      4:2 5:2 6:4  → 4 из 8, самый податливый
 *   L57 термоклетка 4:3 5:7      → 🔴 за 10 заходов по 60 с шестая НЕ ВЫПАЛА НИ РАЗУ
 * Медиана одного захода 5–9 с. Боевой бюджет 2200 мс, поэтому человек её и не видит.
 *
 * ⚠️ ЧТО ИЗ ЭТОГО НЕ СЛЕДУЕТ: опускать полосу до 5–6. Третья ступенька полосы уже
 * 5–6, и тогда две последние стали бы одинаковыми — рост сложности исчез бы совсем.
 * Лечится удешевлением ЗАХОДА (инкрементальное распространение кандидатов вместо
 * пересчёта всей сетки в `refilter`) либо переносом верхних двух ступеней в
 * посчитанный офлайн банк. Ни то, ни другое здесь не сделано.
 *
 * ⚠️ И отдельно: сырой `generatePuzzle` на этих уровнях логикой почти не берётся
 * (замер: 29 досок из 30 на L41 решатель не закрыл вовсе). Мерить верхнюю полосу по
 * нему бессмысленно — играются доски логического пути, а не эти.
 */
/**
 * 🔴 ПОТОЛОК СТУПЕНИ У КАЖДОГО ВАРИАНТА СВОЙ — ЗАМЕР 26.08.2026.
 *
 * Полоса верхних уровней требовала у ВСЕХ вариантов одного и того же: ровно
 * шестую ступень. Замер по последнему уровню каждой полосы, 8 досок, бюджет
 * 6000 мс (втрое больше боевых 2200), цель снята — просили максимум, какой доска
 * потянет:
 *   диагональ 5 · антиконь 6 · гипер 5 · несоседние 5 · антикороль 6
 *   чёт-нечет 5 · кропки 6 · СЭНДВИЧ 4 · термометр 6 · СТРЕЛКА 5
 *   джигсо 6 · ТЕРМОКЛЕТКА 5
 * Сэндвич дал ровно четвёрку ВОСЕМЬ РАЗ ИЗ ВОСЬМИ. Стрелка и термоклетка не
 * дотянули до шестой ни разу. То есть три полосы из двенадцати обещали то, чего
 * генератор при вменяемом ожидании не производит.
 *
 * ⚠️ ЭТО ПОТОЛОК ПРИ БЮДЖЕТЕ, А НЕ АБСОЛЮТНЫЙ. Замер выше по файлу (23.08, бюджет
 * 20–60 с) показал у сэндвича одну шестёрку из восьми. Противоречия нет: за
 * минуту ожидания доска иногда находится, за шесть секунд — нет. Человек минуту
 * не ждёт, поэтому калибруем по тому, что достижимо в игре, а не в лаборатории.
 *
 * ⚠️ ОПУСКАЕТСЯ ТОЛЬКО ПОЛ, ПОТОЛОК ОСТАЁТСЯ. Пол — это «мимо, пересобери»; если
 * он выше достижимого, сборщик тратит все заходы впустую и всё равно отдаёт что
 * получилось. Потолок — это «слишком сложно, отвергни»; опустив его, мы начали бы
 * ВЫБРАСЫВАТЬ те редкие трудные доски, ради которых всё и затевалось.
 */
/**
 * ⚠️ ПОТОЛОК — ЭТО «БЕРЁТСЯ РЕГУЛЯРНО», А НЕ «ВЫПАЛО ОДИН РАЗ». Первая редакция
 * взяла МАКСИМУМ из восьми досок, и термометр получил шестёрку, выпавшую 1 раз из
 * 8 (12%). Результат замера: попаданий 0 из 5 — редкое событие было принято за
 * достижимое, и полоса снова требовала невозможного.
 * Здесь стоит наибольшая ступень, до которой дотянулись ХОТЯ БЫ ДВЕ доски из
 * восьми. Раскладки замера 26.08 (последний уровень каждой полосы, бюджет 6000 мс):
 *   диагональ 4×6 5×2 · антиконь 3×2 4×3 5×1 6×2 · гипер 2×1 3×4 4×2 5×1
 *   несоседние 2×2 3×2 4×3 5×1 · антикороль 3×2 4×5 6×1 · чёт-нечет 4×7 5×1
 *   кропки 4×5 5×2 6×1 · сэндвич 4×8 · термометр 4×6 5×1 6×1
 *   стрелка 3×1 4×4 5×3 · джигсо 2×1 3×3 4×2 5×1 6×1 · термоклетка 3×2 4×4 5×2
 * ⚠️ Клампится ТОЛЬКО полоса уровней 38+; для вариантов ниже цифры здесь
 * справочные — их цели и так лежат под потолком.
 */
const VARIANT_TIER_CEILING: Partial<Record<Variant, number>> = {
  diagonal: 5, antiknight: 6, hyper: 4, nonconsec: 4, antiking: 4,
  evenodd: 4, kropki: 5, sandwich: 4, thermo: 5, arrow: 5, jigsaw: 5, thermocage: 5,
};

export function targetTier(level: number): { min: number; max: number } {
  const lv = Math.max(1, level);
  if (lv <= 4) return { min: 1, max: 1 };    // 6×6, только голые одиночки
  if (lv <= 8) return { min: 1, max: 2 };    // 9×9 классика, скрытые одиночки
  if (lv <= 13) return { min: 2, max: 3 };
  if (lv <= 21) return { min: 3, max: 3 };   // связанные кандидаты
  if (lv <= 29) return { min: 3, max: 4 };   // голые пары/тройки
  if (lv <= 37) return { min: 4, max: 5 };   // скрытые пары
  // 38+: четыре ступени внутри каждой полосы варианта — 3..4, 4..5, 5..6, 6..6.
  const band = [{ min: 3, max: 4 }, { min: 4, max: 5 }, { min: 5, max: 6 }, { min: 6, max: 6 }][bandPos(lv)] as { min: number; max: number };
  const ceiling = VARIANT_TIER_CEILING[levelConfig(lv).variant as Variant];
  if (ceiling === undefined) return band;
  return { min: Math.min(band.min, ceiling), max: band.max };
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

/**
 * ПРОРЕЖИВАНИЕ, КОТОРОЕ УХОДИТ ВНУТРЬ ГЕНЕРАТОРА.
 *
 * 🔴 Зачем так, а не `thinMarkers` после генерации. Копать надо ТЕМИ ЖЕ подсказками,
 * что увидит человек. Пока метки резались после, доска выходила единственной для
 * движка и неоднозначной для игрока — гейт выдавал «L30 evenodd → решений 2», ровно
 * репорт Вали. Теперь генератор получает эту функцию и прореживает ДО копания.
 */
export function overlayThinner(level: number, variant: Variant, N: number): (ov: Overlays) => Overlays {
  const dens = markerDensity(level, variant);
  return (ov) => {
    const out: Overlays = { ...ov };
    if (out.parity && dens < 1) {
      const marked: [number, number][] = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (out.parity[r][c] !== 0) marked.push([r, c]);
      const copy = out.parity.map((row) => [...row]);
      for (const [r, c] of shuffle(marked).slice(Math.round(marked.length * dens))) copy[r][c] = 0;
      out.parity = copy;
    }
    if (out.kropki && dens < 1) {
      const dots: ['h' | 'v', number, number][] = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (c < N - 1 && out.kropki.h[r][c] !== 0) dots.push(['h', r, c]);
        if (r < N - 1 && out.kropki.v[r][c] !== 0) dots.push(['v', r, c]);
      }
      const h = out.kropki.h.map((row) => [...row]);
      const v = out.kropki.v.map((row) => [...row]);
      for (const [k, r, c] of (shuffle(dots) as ['h' | 'v', number, number][]).slice(Math.round(dots.length * dens))) {
        if (k === 'h') h[r][c] = 0; else v[r][c] = 0;
      }
      out.kropki = { h, v };
    }
    out.sandwich = thinSandwich(out.sandwich, level, variant);
    return out;
  };
}

export type GeneratedPuzzle = ReturnType<typeof generatePuzzle>;

/**
 * Варианты, где логический решатель понимает правило достаточно, чтобы копать от
 * техники. Ограничения вариантов распространяются по маскам кандидатов внутри
 * refilter; если конкретная попытка не укладывается в бюджет, generateLogical всё
 * равно сохраняет прежний безопасный fallback через проверку единственности.
 */
const LOGIC_VARIANTS: readonly Variant[] = ['none', 'diagonal', 'antiknight', 'hyper', 'antiking', 'evenodd', 'kropki', 'sandwich', 'jigsaw', 'nonconsec', 'thermo', 'arrow', 'thermocage'];

/**
 * Сколько раз проходим доску, пытаясь убрать ещё клетку. Больше трёх бюджет обычно
 * не позволяет, а прибавки к ступени после третьего прохода замер уже не показывает.
 */
const DIG_PASSES = 3;

/** Сколько досок пробует запасной путь, прежде чем отдать лучшую по расстоянию до полосы. */
const FALLBACK_ATTEMPTS = 6;

/** Сколько заходов делает пошаговый сборщик, прежде чем отдать лучшее из найденного. */
const BUILD_STEPS = 4;

/**
 * Сколько ждём доску, прежде чем взять лучшее из найденного. Потолок ступени этим
 * сроком НЕ уступается — только пол: доска выше потолка логикой не берётся вовсе.
 */
const BUILD_WAIT_MS = 6000;

/** Потолок пустых клеток на 9×9: доска в 74 дырки решается, но заполнять её долго. */
const MAX_BLANKS_9 = 64;

/**
 * РЕШАТЕЛЬ ПРИШЁЛ К ТОЙ ЖЕ ДОСКЕ, ЧТО И ГЕНЕРАТОР?
 *
 * 🔴 СЕТЬ БЫЛА НАТЯНУТА ТОЛЬКО НА БУМАГЕ. У поля `Grade.grid` написано прямо:
 * «если пруннинг где-то неверен, решатель "решит" ЧУЖУЮ сетку и объявит
 * единственность там, где её нет». На этом допущении стоит вся единственность
 * режима уровней («решение единственно по построению»). А читалось это поле по
 * всему коду в ОДНОМ месте — в проверке фрактала. Копание классической судоку
 * принимало выкалывание по одному только `solved` и в доску решателя не смотрело.
 *
 * Проверка стоит 81 сравнение на шаг — против молчаливой потери единственности,
 * которая у игрока звучит как «оба варианта были возможны».
 *
 * ⚠️ Доска нерешённая сравнению не подлежит: `grid` там нет вовсе, и «нет
 * расхождения» означало бы «мы не смотрели». Такой случай — не совпадение, а отказ.
 */
export function solvedSameBoard(grade: Grade, solution: Cell[][]): boolean {
  if (!grade.solved || !grade.grid) return false;
  for (let r = 0; r < solution.length; r++) {
    const row = grade.grid[r];
    if (!row) return false;
    for (let c = 0; c < (solution[r] as Cell[]).length; c++) {
      if (row[c] !== (solution[r] as Cell[])[c]) return false;
    }
  }
  return true;
}

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
  // Сэндвич-подсказки прореживаем ДО копания: доска обязана проверяться ровно той
  // задачей, которую увидит человек (см. thinSandwich).
  const sandwich = thinSandwich(base.sandwich, level, variant);
  const ctx: GradeCtx = { N, BR, BC, variant, regions: base.regions, thermo: base.thermo, arrow: base.arrow, cages: base.cages, parity, kropki, sandwich };

  // Лимит пустых держим только на новичковых уровнях, чтобы не пугать доской в дырках.
  // Дальше глубину задаёт ЛОГИКА. Старый лимит (58 к 29-му) как раз и упирался в потолок,
  // из-за чего сложность переставала расти — замер: L5..L37 почти сплошь tier 1.
  //
  // 🔴 СЭНДВИЧ БОЛЬШЕ НЕ ИСКЛЮЧЕНИЕ (23.08.2026). Здесь стояло «полные 18 sandwich-подсказок
  // уже добавляют технику уровня 4, выкапывать сверх 58 ради той же ступени только расходует
  // бюджет» — и это оказалось ровно тем, что держало L38–41 на четвёртой ступени. Замер:
  // при цели 5–6 сэндвич давал ступень 4 восемнадцать раз из восемнадцати, потолок 4 при
  // любом бюджете времени. Довод «сверх 58 будет та же ступень» проверен не был; проверка
  // показала обратное. Сэндвич — вариант-ОВЕРЛЕЙ: его подсказки ДОБАВЛЯЮТ игроку сведения,
  // значит доске нужно МЕНЬШЕ подсказок при равной трудности, а лимит был скопирован с
  // классики, где такой прибавки нет.
  const cap = level <= 8 ? blanksCap : (N === 9 ? MAX_BLANKS_9 : N * N);
  let dug = 0;
  /**
   * 🔴 ПРОХОДОВ НЕСКОЛЬКО, А НЕ ОДИН. Клетка, которую нельзя было убрать в начале
   * (доска ещё не «созрела»), часто убирается позже — когда рядом уже пусто и работают
   * другие техники. Один проход по случайному порядку останавливался на первом же
   * плато, и доска выходила ЛЕГЧЕ своей полосы: замер по настоящим доскам показал на
   * 42-м уровне ступени 3, 2, 3 при 26-м уровне 3, 3, 4 — то есть «сложнее» оказалось
   * проще. Повторяем проходы, пока целый проход не перестанет убирать хоть что-нибудь.
   */
  for (let pass = 0; pass < DIG_PASSES; pass++) {
    let removed = 0;
    for (const p of shuffle(Array.from({ length: N * N }, (_, i) => i))) {
      if (dug >= cap || Date.now() > deadline) break;
      const r = Math.floor(p / N), c = p % N;
      if (puzzle[r][c] === 0) continue;   // уже выколота на прошлом проходе
      const keep = puzzle[r][c];
      puzzle[r][c] = 0;
      if (parity) parity[r][c] = Math.random() < dens ? (sol[r][c] % 2 === 0 ? 1 : 2) : 0;
      const g = gradePuzzle(puzzle, ctx);
      // Сеть безопасности: решатель обязан прийти К ТОЙ ЖЕ доске (см. solvedSameBoard).
      if (!g.solved || g.tier > max || !solvedSameBoard(g, sol)) { puzzle[r][c] = keep; if (parity) parity[r][c] = 0; }
      else { dug++; removed++; }
    }
    if (removed === 0 || dug >= cap || Date.now() > deadline) break;
  }
  // Порог — «получилась ли вообще задача», а не «дотянули ли до идеала». Доска на 30 дырок
  // это нормальное судоку; гнать её на дорогой путь ради лишних клеток не стоит: замер
  // показал 4–20 с на пазл для nonconsec именно там.
  if (dug < Math.min(cap, blanksCap, 30)) return null;
  const gen: GeneratedPuzzle = { ...base, puzzle, parity, kropki, sandwich };
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
/**
 * СБОРКА ДОСКИ ПО ШАГАМ — чтобы экран не замирал.
 *
 * 🔴 ЗАЧЕМ. `generateLogical` синхронна, и на верхних уровнях она держит поток
 * ДЕСЯТКИ СЕКУНД. Замер по настоящим доскам (Mac, 5 партий на уровень):
 *
 *     L38 сэндвич     худшее  0,8 с
 *     L42 термометры  худшее  4,0 с
 *     L50 джигсо      худшее  9,7 с
 *     L53 джигсо      худшее 29,2 с
 *
 * Двадцать девять секунд человек смотрит в неподвижный экран и не знает, думает
 * игра или повисла. Поставить рядом «идёт сборка» нельзя: состояние, поменянное
 * перед тяжёлым циклом в том же обработчике, не доезжает до экрана.
 *
 * Шаг = ОДИН заход генератора. Между шагами экран получает кадр (`runSteps`),
 * рисует строку ожидания и показывает честный номер захода. Ровно так уже собран
 * самурай (`samuraiBuilder`) — здесь тот же шов, а не второй его экземпляр.
 */
/**
 * ДОВЕСТИ ДОСКУ ДО ПОТОЛКА — последний рубеж, работающий всегда.
 *
 * 🔴 ЗАЧЕМ. Запасной путь пробует несколько досок и берёт лучшую, но «лучшая из
 * плохих» всё равно бывает выше потолка: на джигсо гейт мигал именно так — то
 * зелёный, то ступень 9 (перебор). Пока это «почти всегда», это не гарантия.
 *
 * Возвращаем в доску по одной клетке из решения, пока она не станет браться
 * логикой в пределах потолка. Такое всегда достижимо: полностью заполненная
 * доска берётся голыми одиночками, то есть первой ступенью. Цена — несколько
 * лишних подсказок на редкой доске; плата за обратное — партия, которую нельзя
 * решить, и человек, который не понимает, что упёрся не он.
 */
export function easeToCeiling(
  gen: GeneratedPuzzle, N: number, BR: number, BC: number, variant: Variant, max: number,
): { gen: GeneratedPuzzle; grade: Grade } {
  let grade = gradeOf(gen, N, BR, BC, variant);
  if (grade.solved && grade.tier <= max) return { gen, grade };
  const puzzle = gen.puzzle.map((row) => [...row]);
  const blanks = shuffle(
    Array.from({ length: N * N }, (_, i) => i).filter((i) => puzzle[Math.floor(i / N)][i % N] === 0),
  );
  for (const idx of blanks) {
    const r = Math.floor(idx / N), c = idx % N;
    puzzle[r][c] = gen.solution[r][c];
    const next = { ...gen, puzzle };
    grade = gradeOf(next, N, BR, BC, variant);
    if (grade.solved && grade.tier <= max) return { gen: next, grade };
  }
  return { gen: { ...gen, puzzle }, grade };
}

export function logicalBuilder(
  level: number, blanksCap: number, N: number, BR: number, BC: number, variant: Variant,
  opts: { budgetMs?: number; tier?: { min: number; max: number } } = {},
): {
  steps: number;
  step: () => { gen: GeneratedPuzzle; grade: Grade; dug: number; fellBack: boolean };
  enough: (r: { grade: Grade; fellBack: boolean }) => boolean;
} {
  const { min, max } = opts.tier ?? targetTier(level);
  const dist = (t: number) => (t < min ? min - t : t > max ? t - max : 0);
  const perStep = Math.max(400, Math.round((opts.budgetMs ?? 2200) / 2));
  /**
   * ⚠️ ОЖИДАНИЕ ТОЖЕ ИМЕЕТ ЦЕНУ. Узкая цель верхних ступеней (на последнем уровне
   * полосы это `6..6`) достижима редко, и без этого срока сборщик честно выбирал бы
   * все заходы до единого: замер дал 25,5 с на 50-м уровне. Доска чуть легче
   * задуманной играется; доска, которой ждут полминуты, — нет.
   */
  const deadline = Date.now() + BUILD_WAIT_MS;
  let best: { gen: GeneratedPuzzle; grade: Grade; dug: number; fellBack: boolean } | null = null;

  return {
    steps: BUILD_STEPS,
    step: () => {
      const r = generateLogical(level, blanksCap, N, BR, BC, variant, { budgetMs: perStep, tier: { min, max } });
      const over = !r.grade.solved || r.grade.tier > max;
      const bestOver = best ? (!best.grade.solved || best.grade.tier > max) : true;
      // Доска выше потолка проигрывает любой доске в полосе — даже более далёкой от пола.
      if (!best || (bestOver && !over) || (bestOver === over && dist(r.grade.tier) < dist(best.grade.tier))) best = r;
      return best;
    },
    /**
     * ⚠️ ПОТОЛОК — УСЛОВИЕ ОСТАНОВКИ, ПОЛ — НЕТ. Доска выше потолка логикой не
     * берётся: её отдавать нельзя, и ради этого стоит потратить ещё заход. Доска
     * ниже пола просто легче задуманного — она играется, и держать человека ради
     * лишней ступени было бы хуже, чем отдать ему партию.
     */
    enough: (r) => r.grade.solved && r.grade.tier <= max
      && (dist(r.grade.tier) === 0 || Date.now() > deadline),
  };
}

/**
 * Прореживание сэндвич-подсказок по месту уровня в полосе.
 *
 * 🔴 ЗАЧЕМ. Четыре уровня сэндвича (38–41) выдавали ступень 4 и только 4 — полоса
 * техник их не разводила, потому что все восемнадцать подсказок показаны всегда и
 * задача целиком определяется ими. Убирая часть, мы заставляем добирать остальное
 * обычными техниками — и уровни внутри полосы наконец отличаются друг от друга.
 *
 * −1 значит «эта подсказка не показана»: ноль там законное значение (единица и
 * девятка стоят рядом), поэтому отдельный признак обязателен.
 */
export function thinSandwich(
  sw: { rows: number[]; cols: number[] } | undefined, level: number, variant: Variant,
): { rows: number[]; cols: number[] } | undefined {
  if (!sw || variant !== 'sandwich') return sw;
  const keep = SANDWICH_KEEP[bandPos(level)] as number;
  if (keep >= 1) return sw;
  const hide = (line: number[]): number[] => {
    const idx = shuffle(Array.from({ length: line.length }, (_, i) => i));
    const drop = Math.round(line.length * (1 - keep));
    const out = [...line];
    for (let k = 0; k < drop; k++) out[idx[k] as number] = -1;
    return out;
  };
  return { rows: hide(sw.rows), cols: hide(sw.cols) };
}

/** Доля показанных сэндвич-подсказок по месту в полосе: дальше — меньше подарков. */
const SANDWICH_KEEP = [1, 0.78, 0.56, 0.34];

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

  /**
   * Вариант не по логическому пути (или логика не потянула) — прежний путь ядра.
   * Пробовали ускорить его логическим пре-фильтром перед countSolutions: на nonconsec
   * это дало доску БЕЗ ЕДИНОЙ пустой клетки — проверка единственности там упирается в
   * бюджет шагов и откатывает каждое выкалывание.
   *
   * 🔴 НО ПОТОЛОК ТЕПЕРЬ ДЕРЖИМ И ЗДЕСЬ. Логический путь потолок соблюдает по
   * построению: он откатывает любое выкалывание, поднявшее ступень выше `max`. А
   * запасной не проверял ступень ВООБЩЕ — и именно он выдавал доски, которые логикой
   * не берутся совсем (ступень 9 = только перебор). Замер по настоящим доскам:
   *
   *     джигсо L50: 1 доска из 10 выше потолка — ВСЕ по запасному пути
   *     джигсо L53: 1 из 10 — по запасному
   *     ThermoCage L54: 1 из 10 — по запасному
   *
   * Трижды из трёх виноват был запасной путь. Доска, которую нельзя взять логикой, —
   * это не «сложный уровень», а сломанная задача: игрок упирается в неё и не знает,
   * что упёрся не он. Поэтому берём лучшую попытку из нескольких, а не первую попавшуюся.
   */
  const fbUntil = Date.now() + Math.max(600, Math.round(budget * 0.6));
  let fb: { gen: GeneratedPuzzle; grade: Grade } | null = null;
  for (let attempt = 0; attempt < FALLBACK_ATTEMPTS; attempt++) {
    // ⚠️ Прореживание уходит ВНУТРЬ генератора: копать надо теми же подсказками,
    // что увидит человек. Прежде тут стояли `thinMarkers` и `thinSandwich` ПОСЛЕ
    // генерации — и доска, единственная для движка, оказывалась неоднозначной для
    // игрока («L30 evenodd → решений 2»). Разбор в шапке `overlayThinner`.
    const g = generatePuzzle(blanksCap, N, BR, BC, variant, overlayThinner(level, variant, N));
    const grade = gradeOf(g, N, BR, BC, variant);
    if (!fb || dist(grade.tier) < dist(fb.grade.tier)) fb = { gen: g, grade };
    /**
     * ⚠️ ПОКА ДОСКА ВЫШЕ ПОТОЛКА — ЧАСЫ НЕ АРГУМЕНТ. Первая редакция этой правки
     * обрывалась по бюджету и всё равно отдавала ступень 9: одна попытка джигсо
     * дороже отведённого времени, и цикл выходил после неё же. Потолок — это
     * гарантия («доска берётся логикой»), а не пожелание; за секунду ожидания
     * платить можно, за нерешаемую доску — нет. Пол полосы, наоборот, уступаем
     * времени: слишком лёгкая доска играется, просто хуже.
     */
    const over = !fb.grade.solved || fb.grade.tier > max;
    if (!over && (dist(fb.grade.tier) === 0 || Date.now() > fbUntil)) break;
  }
  // Последний рубеж: доска обязана браться логикой, даже если все заходы дали хуже.
  const eased = easeToCeiling((fb as { gen: GeneratedPuzzle; grade: Grade }).gen, N, BR, BC, variant, max);
  const gen = eased.gen;
  let left = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (gen.puzzle[r][c] === 0) left++;
  return { gen, grade: eased.grade, dug: left, fellBack: true };
}
