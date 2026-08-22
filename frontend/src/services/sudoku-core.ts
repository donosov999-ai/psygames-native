/**
 * sudoku-core — чистая логика судоку (генерация, варианты, солвер), вынесена из
 * app/games/sudoku.tsx (v1.111.0) для unit-тестов и unique-check.
 *
 * v1.111.0: generatePuzzle выкалывает клетки С ПРОВЕРКОЙ ЕДИНСТВЕННОСТИ решения
 * (баг-репорт Вали 2026-07-05: пазл с двумя решениями = несправедливая «ошибка»,
 * т.к. ввод сверяется с одним зашитым solution).
 */

import { translateFor } from '../contexts/LanguageContext';

export type Cell = number; // 0 = empty
export type Variant = 'none' | 'diagonal' | 'antiknight' | 'hyper' | 'nonconsec' | 'jigsaw' | 'antiking' | 'evenodd' | 'kropki' | 'sandwich' | 'thermo' | 'arrow' | 'thermocage';

export const HYPER_BOXES = [[1, 1], [1, 5], [5, 1], [5, 5]] as const;   // Windoku: 4 доп. зоны 3×3 (левые-верхние углы)
export const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] as const;
export const KING = [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const;   // anti-king: диагональные соседи (ортогональные уже закрыты строкой/столбцом)
export const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

// C2: размер РАЗВЯЗАН от сложности — селектор 6×6 / 9×9; сложность = плотность пустых клеток.
export function dimsForSize(size: 6 | 9) {
  return size === 9 ? { N: 9, BR: 3, BC: 3 } : { N: 6, BR: 2, BC: 3 };
}
export function blanksFor(size: 6 | 9, diff: 'easy' | 'medium' | 'hard') {
  if (size === 9) return diff === 'easy' ? 36 : diff === 'medium' ? 46 : 54;   // из 81
  return diff === 'easy' ? 12 : diff === 'medium' ? 18 : 24;                    // из 36
}

export function inHyper(r: number, c: number): readonly [number, number] | null {
  for (const [hr, hc] of HYPER_BOXES) if (r >= hr && r < hr + 3 && c >= hc && c < hc + 3) return [hr, hc];
  return null;
}

/** v1.137: подписи/правила вариантов живут в словаре LanguageContext
 *  (sudokuVariant* / sudokuRule*) — берутся через translateFor, чтобы 10
 *  оверлейных языков не падали на английский. lang — код языка ('ru'|'en'|…). */
const VARIANT_KEY_SUFFIX: Record<Exclude<Variant, 'none'>, string> = {
  diagonal: 'Diagonal', antiknight: 'Antiknight', hyper: 'Hyper', nonconsec: 'Nonconsec',
  jigsaw: 'Jigsaw', antiking: 'Antiking', evenodd: 'Evenodd', kropki: 'Kropki',
  sandwich: 'Sandwich', thermo: 'Thermo', arrow: 'Arrow', thermocage: 'Thermocage',
};
export function variantLabel(v: Variant, lang: string): string {
  if (v === 'none') return '';
  return translateFor(lang, 'sudokuVariant' + VARIANT_KEY_SUFFIX[v]);
}
export function variantRule(v: Variant, lang: string): string {
  if (v === 'none') return '';
  return translateFor(lang, 'sudokuRule' + VARIANT_KEY_SUFFIX[v]);
}

export function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Jigsaw: 9 связных регионов по 9 клеток. Region-growing «расти меньший растущий», рестарт при тупике.
export function generateRegions(N: number): number[][] {
  for (let attempt = 0; attempt < 400; attempt++) {
    const reg: number[][] = Array.from({ length: N }, () => Array(N).fill(-1));
    const sizes = Array(N).fill(0);
    shuffle(Array.from({ length: N * N }, (_, i) => i)).slice(0, N).forEach((p, id) => { reg[Math.floor(p / N)][p % N] = id; sizes[id] = 1; });
    let filled = N, stuck = false;
    while (filled < N * N) {
      // анти-orphan: назначаем самую «угловую» неназначенную клетку (мин. свободных соседей),
      // у которой есть растущий сосед-регион, её НАИМЕНЬШЕМУ соседнему региону → карманы не остаются.
      let target = -1, tFree = 99, tReg = -1;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (reg[r][c] === -1) {
        let free = 0; const adj: number[] = [];
        for (const [dr, dc] of ORTHO) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < N && nc >= 0 && nc < N) { const v = reg[nr][nc]; if (v === -1) free++; else if (sizes[v] < N) adj.push(v); } }
        if (!adj.length) continue;
        if (free < tFree) { tFree = free; target = r * N + c; tReg = adj.sort((a, b) => sizes[a] - sizes[b])[0]; }
      }
      if (target < 0) { stuck = true; break; }
      reg[Math.floor(target / N)][target % N] = tReg; sizes[tReg]++; filled++;
    }
    if (!stuck && filled === N * N && sizes.every((s) => s === N)) return reg;
  }
  // фолбэк: квадратные блоки
  const { BR, BC } = dimsForSize(N as 6 | 9);
  const perRow = Math.floor(N / BC);
  const reg: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) reg[r][c] = Math.floor(r / BR) * perRow + Math.floor(c / BC);
  return reg;
}

// KILLER: отдельный режим.
export function killerBlanks(diff: 'easy' | 'medium' | 'hard'): number {
  return diff === 'easy' ? 44 : diff === 'medium' ? 52 : 60;   // из 81 — cages помогают дедукции, можно больше пустых
}

/**
 * КЛЕТКИ-СУММЫ. `cageOf[r][c]` — номер группы, −1 = клетка вне групп (так живёт
 * ThermoCage: суммы закрывают только часть доски, вторую половину подсказок даёт
 * термометр).
 *
 * ⚠️ `cells` лежит РЯДОМ с картой, а не считается по месту. Правило суммы проверяется
 * в солвере на КАЖДЫЙ кандидат каждой клетки; собирать состав группы обходом доски —
 * это N² на вызов, и перебор встаёт. Собрать из снимка партии: `cageCells()`.
 */
export interface CageMap { cageOf: number[][]; sum: number[]; anchor: number[]; cells: [number, number][][] }

/** Состав групп по карте — снимок незаконченной партии хранит только cageOf/sum/anchor. */
export function cageCells(cageOf: number[][], N: number): [number, number][][] {
  const cells: [number, number][][] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const id = cageOf[r][c];
    if (id < 0) continue;
    if (!cells[id]) cells[id] = [];
    cells[id].push([r, c]);
  }
  return cells;
}

/** Собрать CageMap из полей снимка партии (rehydrate после перезапуска приложения). */
export function cageMapFrom(cageOf: number[][], sum: number[], anchor: number[], N: number): CageMap {
  return { cageOf, sum, anchor, cells: cageCells(cageOf, N) };
}

// Разбиение решения на cages: связные группы 2–4 клеток с РАЗНЫМИ цифрами (правило Killer) + сумма каждой.
export function generateCages(sol: Cell[][], N: number): CageMap {
  const cageOf: number[][] = Array.from({ length: N }, () => Array(N).fill(-1));
  const sum: number[] = [], anchor: number[] = [];
  let cid = 0;
  for (const start of shuffle(Array.from({ length: N * N }, (_, i) => i))) {
    const sr = Math.floor(start / N), sc = start % N;
    if (cageOf[sr][sc] !== -1) continue;
    const target = 2 + Math.floor(Math.random() * 3);   // 2..4 клетки
    const cells: [number, number][] = [[sr, sc]];
    const digits = new Set<number>([sol[sr][sc]]);
    cageOf[sr][sc] = cid;
    while (cells.length < target) {
      const fr: [number, number][] = [];
      for (const [r, c] of cells) for (const [dr, dc] of ORTHO) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < N && nc >= 0 && nc < N && cageOf[nr][nc] === -1 && !digits.has(sol[nr][nc])) fr.push([nr, nc]); }
      if (!fr.length) break;
      const [nr, nc] = fr[Math.floor(Math.random() * fr.length)];
      cageOf[nr][nc] = cid; cells.push([nr, nc]); digits.add(sol[nr][nc]);
    }
    cid++;
  }
  // вливаем одиночные cage в соседний (разные цифры, цель < 5) — чтобы не было «1-клеточных» групп
  const cellsOf = (id: number) => { const a: [number, number][] = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (cageOf[r][c] === id) a.push([r, c]); return a; };
  for (let id = 0; id < cid; id++) {
    const cells = cellsOf(id);
    if (cells.length !== 1) continue;
    const [r, c] = cells[0], d = sol[r][c];
    for (const [dr, dc] of shuffle(ORTHO.map((x) => x))) {
      const nr = r + dr, nc = c + dc; if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      const nid = cageOf[nr][nc]; if (nid === id) continue;
      const tgt = cellsOf(nid);
      if (tgt.length >= 5 || tgt.some(([rr, cc]) => sol[rr][cc] === d)) continue;
      cageOf[r][c] = nid; break;
    }
  }
  // суммы + якоря по финальным cage (id могут иметь пропуски после слияния — это ок)
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const id = cageOf[r][c];
    sum[id] = (sum[id] || 0) + sol[r][c];
    anchor[id] = anchor[id] === undefined ? r * N + c : Math.min(anchor[id], r * N + c);
  }
  return { cageOf, sum, anchor, cells: cageCells(cageOf, N) };
}

/**
 * ThermoCage: клетки-суммы ОСТРОВАМИ. Берём готовое разбиение `generateCages` и
 * оставляем только группы, не соприкасающиеся сторонами.
 *
 * Почему не всю доску, как в killer:
 *   · суммы обязаны быть ЧАСТЬЮ подсказок — вторую часть даёт термометр, а залитая
 *     целиком доска его прячет под тонировкой;
 *   · подкрас группы на экране берётся из её номера (`id % 6` в sudoku.tsx), поэтому
 *     две соседние группы могут получить один цвет и слиться в одну. Пока группы не
 *     касаются сторонами, спутать их нельзя: между ними всегда есть клетка без заливки.
 *
 * Группы строятся ИЗ РЕШЕНИЯ (цифры внутри разные, сумма считается по нему) — значит
 * решение удовлетворяет и суммам, и термометру одновременно, и противоречия на
 * пересечении двух правил взяться неоткуда.
 */
export function generateThermoCages(sol: Cell[][], N: number): CageMap {
  let best: CageMap | null = null;
  let bestCells = -1;
  for (let attempt = 0; attempt < 8; attempt++) {
    const full = generateCages(sol, N);
    const ids: number[] = [];
    for (let id = 0; id < full.cells.length; id++) if (full.cells[id] && full.cells[id].length >= 2) ids.push(id);
    // соседство групп по стороне
    const adj = new Map<number, Set<number>>();
    for (let id = 0; id < full.cells.length; id++) if (full.cells[id]) adj.set(id, new Set());
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (const [dr, dc] of ORTHO) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      const a = full.cageOf[r][c], b = full.cageOf[nr][nc];
      if (a === b || a < 0 || b < 0) continue;
      adj.get(a)!.add(b); adj.get(b)!.add(a);
    }
    const keep: number[] = [];
    let covered = 0;
    for (const id of shuffle(ids)) {
      if (keep.some((k) => adj.get(id)!.has(k))) continue;
      keep.push(id); covered += full.cells[id].length;
    }
    if (covered <= bestCells) continue;
    // перенумеровываем оставшиеся подряд: сумма и якорь адресуются номером группы
    const cageOf: number[][] = Array.from({ length: N }, () => Array(N).fill(-1));
    keep.forEach((id, i) => { for (const [r, c] of full.cells[id]) cageOf[r][c] = i; });
    const sum: number[] = [], anchor: number[] = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const id = cageOf[r][c];
      if (id < 0) continue;
      sum[id] = (sum[id] || 0) + sol[r][c];
      anchor[id] = anchor[id] === undefined ? r * N + c : Math.min(anchor[id], r * N + c);
    }
    best = { cageOf, sum, anchor, cells: cageCells(cageOf, N) };
    bestCells = covered;
  }
  return best!;
}

// SUDOKU-LVL: уровневая прогрессия. 1–4 = 6×6, 5–8 = 9×9, 9–13 = диагональ, далее фазы-варианты.
export interface LevelCfg { size: 6 | 9; N: number; BR: number; BC: number; blanks: number; variant: Variant; hintMax: number; }
export function levelConfig(level: number): LevelCfg {
  const lv = Math.max(1, level);
  const size: 6 | 9 = lv <= 4 ? 6 : 9;
  const { N, BR, BC } = dimsForSize(size);
  let variant: Variant = 'none';
  if (lv >= 9 && lv <= 13) variant = 'diagonal';
  else if (lv >= 14 && lv <= 17) variant = 'antiknight';
  else if (lv >= 18 && lv <= 21) variant = 'hyper';
  else if (lv >= 22 && lv <= 25) variant = 'nonconsec';
  else if (lv >= 26 && lv <= 29) variant = 'antiking';
  else if (lv >= 30 && lv <= 33) variant = 'evenodd';
  else if (lv >= 34 && lv <= 37) variant = 'kropki';
  else if (lv >= 38 && lv <= 41) variant = 'sandwich';
  else if (lv >= 42 && lv <= 45) variant = 'thermo';
  else if (lv >= 46 && lv <= 49) variant = 'arrow';
  else if (lv >= 50 && lv <= 53) variant = 'jigsaw';
  else if (lv >= 54) variant = 'thermocage';   // ThermoCage: термометр И клетки-суммы на одной доске
  // v1.113.0: ЕДИНАЯ монотонная кривая для всего 9×9-диапазона (было: диагональ росла до 58
  // пустых к L13, затем при смене правила на L14 сбрасывалась на 44 — резкий провал сложности,
  // баг-репорт Вали «как level 20 может быть легче level 12»). Раньше расчёт зависел от variant
  // и сбрасывался на границе фаз; теперь variant НЕ участвует — только уровень. +1 пустая клетка
  // за уровень, потолок 58 (тот же безопасный максимум, что раньше держала классика/диагональ)
  // достигается к L29 и дальше держится ровно — новое правило само добавляет сложность поверх.
  const blanks = size === 6
    ? Math.min(24, 8 + lv * 3)                                   // L1..4 → 11,14,17,20
    : Math.min(58, 34 + (lv - 5));                               // L5+ → 34..58, без сбросов на границах правил
  const hintMax = lv <= 4 ? 3 : lv <= 8 ? 2 : 1;
  return { size, N, BR, BC, blanks, variant, hintMax };
}

export type SudokuDifficultyTier = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert' | 'extreme';

/**
 * Читаемая ступень сложности для карты уровней. Это не отдельная шкала:
 * первые две ступени следуют из числа подсказок, средние — из плотности пустых
 * клеток, старшие — из уже существующих семейств variant в levelConfig.
 */
export function sudokuDifficultyTier(level: number): SudokuDifficultyTier {
  const cfg = levelConfig(level);
  if (cfg.hintMax >= 3) return 'beginner';
  if (cfg.hintMax === 2) return 'easy';
  if (cfg.blanks < 43) return 'medium';       // diagonal, L9–13
  if (cfg.blanks < 51) return 'hard';         // anti-knight + hyper, L14–21
  if (cfg.variant === 'nonconsec' || cfg.variant === 'antiking' || cfg.variant === 'evenodd') return 'expert';
  return 'extreme';                           // kropki и все следующие варианты, L34+
}

// THERMO: prev/next-карта на клетку (строгое возрастание вдоль пути от колбы). null = клетка не на термометре.
export type ThermoPN = ({ prev: [number, number] | null; next: [number, number] | null } | null)[][];
export function generateThermo(N: number): ThermoPN {
  const used: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));
  const paths: [number, number][][] = [];
  for (let attempt = 0; attempt < 40 && paths.length < 6; attempt++) {
    const starts: [number, number][] = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!used[r][c]) starts.push([r, c]);
    if (!starts.length) break;
    const [sr, sc] = starts[Math.floor(Math.random() * starts.length)];
    const len = 3 + Math.floor(Math.random() * 3);   // 3..5 (≤ N, цифры строго растут)
    const path: [number, number][] = [[sr, sc]]; used[sr][sc] = true; let cr = sr, cc = sc;
    for (let s = 1; s < len; s++) {
      const nb = ORTHO.map(([dr, dc]) => [cr + dr, cc + dc] as [number, number]).filter(([nr, nc]) => nr >= 0 && nr < N && nc >= 0 && nc < N && !used[nr][nc]);
      if (!nb.length) break;
      const [nr, nc] = nb[Math.floor(Math.random() * nb.length)];
      used[nr][nc] = true; path.push([nr, nc]); cr = nr; cc = nc;
    }
    if (path.length >= 3) paths.push(path);
  }
  const pn: ThermoPN = Array.from({ length: N }, () => Array(N).fill(null));
  for (const path of paths) for (let k = 0; k < path.length; k++) {
    const [r, c] = path[k];
    pn[r][c] = { prev: k > 0 ? path[k - 1] : null, next: k < path.length - 1 ? path[k + 1] : null };
  }
  return pn;
}

// ARROW: кружок (path[0], = сумма) + стрелка (path[1..], в сумме = кружок).
export type ArrowCell = { circle: [number, number]; arrows: [number, number][]; isCircle: boolean; prev: [number, number] | null; next: [number, number] | null };
export type ArrowMap = (ArrowCell | null)[][];
export function generateArrow(N: number): ArrowMap {
  const used: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));
  const groups: [number, number][][] = [];
  for (let attempt = 0; attempt < 30 && groups.length < 6; attempt++) {
    const starts: [number, number][] = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!used[r][c]) starts.push([r, c]);
    if (!starts.length) break;
    const [sr, sc] = starts[Math.floor(Math.random() * starts.length)];
    const len = 2 + Math.floor(Math.random() * 2);   // стрелка 2-3 клетки → сумма ≤ N=9
    const path: [number, number][] = [[sr, sc]]; used[sr][sc] = true; let cr = sr, cc = sc;
    for (let s = 1; s <= len; s++) {
      const nb = ORTHO.map(([dr, dc]) => [cr + dr, cc + dc] as [number, number]).filter(([nr, nc]) => nr >= 0 && nr < N && nc >= 0 && nc < N && !used[nr][nc]);
      if (!nb.length) break;
      const [nr, nc] = nb[Math.floor(Math.random() * nb.length)];
      used[nr][nc] = true; path.push([nr, nc]); cr = nr; cc = nc;
    }
    if (path.length >= 3) groups.push(path);   // кружок + ≥2 стрелки
  }
  const map: ArrowMap = Array.from({ length: N }, () => Array(N).fill(null));
  for (const g of groups) {
    const circle = g[0], arrows = g.slice(1);
    for (let k = 0; k < g.length; k++) {
      const [r, c] = g[k];
      map[r][c] = { circle, arrows, isCircle: k === 0, prev: k > 0 ? g[k - 1] : null, next: k < g.length - 1 ? g[k + 1] : null };
    }
  }
  return map;
}

export function isValid(grid: Cell[][], r: number, c: number, val: number, N: number, BR: number, BC: number, variant: Variant = 'none', regions?: number[][], thermo?: ThermoPN, arrow?: ArrowMap, cages?: CageMap): boolean {
  for (let i = 0; i < N; i++) if (grid[r][i] === val || grid[i][c] === val) return false;
  if (variant === 'jigsaw' && regions) {
    const reg = regions[r][c];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (regions[i][j] === reg && grid[i][j] === val) return false;   // бокс заменён регионом
  } else {
    const br = Math.floor(r / BR) * BR, bc = Math.floor(c / BC) * BC;
    for (let i = 0; i < BR; i++) for (let j = 0; j < BC; j++) if (grid[br + i][bc + j] === val) return false;
  }
  if (variant === 'diagonal') {
    if (r === c) { for (let i = 0; i < N; i++) if (grid[i][i] === val) return false; }                 // главная диагональ
    if (r + c === N - 1) { for (let i = 0; i < N; i++) if (grid[i][N - 1 - i] === val) return false; }  // побочная
  } else if (variant === 'antiknight') {
    for (const [dr, dc] of KNIGHT) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < N && nc >= 0 && nc < N && grid[nr][nc] === val) return false; }
  } else if (variant === 'hyper') {
    const h = inHyper(r, c); if (h) { const [hr, hc] = h; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (grid[hr + i][hc + j] === val) return false; }
  } else if (variant === 'nonconsec') {
    for (const [dr, dc] of ORTHO) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < N && nc >= 0 && nc < N) { const v = grid[nr][nc]; if (v !== 0 && Math.abs(v - val) === 1) return false; } }
  } else if (variant === 'antiking') {
    for (const [dr, dc] of KING) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < N && nc >= 0 && nc < N && grid[nr][nc] === val) return false; }
  } else if ((variant === 'thermo' || variant === 'thermocage') && thermo) {
    const pn = thermo[r][c];
    if (pn) {
      if (pn.prev) { const pv = grid[pn.prev[0]][pn.prev[1]]; if (pv !== 0 && val <= pv) return false; }   // строго больше предыдущего на термометре
      if (pn.next) { const nv = grid[pn.next[0]][pn.next[1]]; if (nv !== 0 && val >= nv) return false; }   // строго меньше следующего
    }
  } else if (variant === 'arrow' && arrow) {
    const m = arrow[r][c];
    if (m) {
      const cv = m.isCircle ? val : grid[m.circle[0]][m.circle[1]];
      let asum = 0, empty = 0;
      for (const [ar, ac] of m.arrows) { const v = (ar === r && ac === c) ? val : grid[ar][ac]; if (v === 0) empty++; else asum += v; }
      if (empty === 0) { if (cv !== 0 && cv !== asum) return false; }   // стрелка заполнена → кружок = сумме
      else { if (asum + empty > N) return false; if (cv !== 0 && asum + empty > cv) return false; }   // прун: мин-сумма ≤ кружок и ≤ N
    }
  }
  // ⚠️ КЛЕТКИ-СУММЫ ПРОВЕРЯЮТСЯ ОТДЕЛЬНОЙ ВЕТКОЙ, А НЕ ЧЕРЕЗ `else if`. У ThermoCage
  // на доске два правила РАЗОМ: цепочка термометра и сумма группы. Встань сумма
  // очередным «иначе-если», термометр забрал бы ход первым — и половина ограничений
  // просто не проверялась бы, а единственность решения считалась бы по одному правилу.
  if (cages) {
    const id = cages.cageOf[r][c];
    if (id >= 0) {
      let filled = 0, empty = 0;
      for (const [rr, cc] of cages.cells[id]) {
        if (rr === r && cc === c) continue;
        const v = grid[rr][cc];
        if (v === 0) { empty++; continue; }
        if (v === val) return false;   // цифры внутри клетки-суммы не повторяются
        filled += v;
      }
      const rest = cages.sum[id] - filled - val;
      // Остаток обязан быть набираемым РАЗНЫМИ цифрами: минимум 1+2+…, максимум N+(N−1)+…
      if (rest < (empty * (empty + 1)) / 2) return false;
      if (rest > empty * N - (empty * (empty - 1)) / 2) return false;
    }
  }
  return true;
}

export function solve(grid: Cell[][], N: number, BR: number, BC: number, variant: Variant = 'none', regions?: number[][], budget?: { steps: number }, thermo?: ThermoPN, arrow?: ArrowMap, cages?: CageMap): boolean {
  // MRV: заполняем самую ОГРАНИЧЕННУЮ пустую клетку (минимум кандидатов) — почти без бэктрекинга.
  let bR = -1, bC = -1, bCands: number[] | null = null, bCount = N + 1;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c] === 0) {
    const cands: number[] = [];
    for (let n = 1; n <= N; n++) if (isValid(grid, r, c, n, N, BR, BC, variant, regions, thermo, arrow, cages)) cands.push(n);
    if (cands.length < bCount) { bCount = cands.length; bR = r; bC = c; bCands = cands; if (bCount === 0) return false; }
  }
  if (bR < 0) return true;   // пустых нет → решено
  if (budget) { if (budget.steps <= 0) return false; budget.steps--; }   // лимит шагов: нерешаемую jigsaw-раскладку бросаем быстро
  for (const n of shuffle(bCands!)) { grid[bR][bC] = n; if (solve(grid, N, BR, BC, variant, regions, budget, thermo, arrow, cages)) return true; grid[bR][bC] = 0; }
  return false;
}

/**
 * Счёт решений (до limit, обычно 2 — «одно или больше одного»). MRV как solve.
 * При исчерпании бюджета шагов возвращает limit — консервативно считаем
 * «не доказали единственность» (клетку при выкалывании не трогаем).
 * Мутирует grid во время обхода, но возвращает его в исходное состояние.
 */
export function countSolutions(grid: Cell[][], N: number, BR: number, BC: number, variant: Variant = 'none', regions?: number[][], limit = 2, budget: { steps: number } = { steps: 8000 }, thermo?: ThermoPN, arrow?: ArrowMap, cages?: CageMap): number {
  let count = 0;
  const walk = (): boolean => {   // true = стоп (достигли limit или кончился бюджет)
    let bR = -1, bC = -1, bCands: number[] | null = null, bCount = N + 1;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c] === 0) {
      const cands: number[] = [];
      for (let n = 1; n <= N; n++) if (isValid(grid, r, c, n, N, BR, BC, variant, regions, thermo, arrow, cages)) cands.push(n);
      if (cands.length < bCount) { bCount = cands.length; bR = r; bC = c; bCands = cands; if (bCount === 0) return false; }
    }
    if (bR < 0) { count++; return count >= limit; }
    if (budget.steps-- <= 0) { count = limit; return true; }
    for (const n of bCands!) {
      grid[bR][bC] = n;
      const stop = walk();
      grid[bR][bC] = 0;
      if (stop) return true;
    }
    return false;
  };
  walk();
  return count;
}

// Варианты, чья ПОЛНАЯ логика зашита в isValid → единственность проверяема честно.
// evenodd/kropki/sandwich дают игроку оверлеи-ПОДСКАЗКИ (метки чётности, точки, суммы),
// которых isValid не знает — проверка была бы ложно-строгой (выкалывалось бы слишком мало).
// TODO(unique): научить countSolutions оверлеям и включить эти варианты + killer-cages.
// v1.156 (репорт Вали L30 «два варианта возможно» + эмпирика 20/20 неоднозначных):
// evenodd/kropki/sandwich — маркерные варианты, движок их констрейнт НЕ enforces
// (isValid их не знает → считает как базовый судоку). Раньше они копались БЕЗ
// проверки уникальности → пазл имел 2+ базовых решения → игрок ставил валидную
// альтернативу, а сверка с зашитым solution засчитывала «ошибку» (нечестно, до
// потери всех жизней). Добавлены в проверку: теперь дырки копаются только пока
// БАЗОВОЕ решение единственно → любой верный ход совпадает с solution.
// thermocage здесь ОБЯЗАН быть: единственность решения у него считается по ДВУМ
// правилам сразу (isValid знает и цепочку, и сумму). Доска, единственная по каждому
// правилу порознь, вместе может иметь второе решение — и наоборот.
const UNIQUE_CHECKED: readonly Variant[] = ['none', 'diagonal', 'antiknight', 'hyper', 'nonconsec', 'antiking', 'jigsaw', 'thermo', 'arrow', 'evenodd', 'kropki', 'sandwich', 'thermocage'];

/**
 * Готовая сетка для «несоседних чисел» — БЕЗ перебора.
 *
 * Правило «ортогональные соседи не отличаются на единицу» режет пространство так, что
 * обычный поиск залипает: замер одной сетки — 90 СЕКУНД, и это был живой прод (уровни
 * 22–25 подвешивали игру на генерации). Перезапуски с бюджетом шагов дали 6–15 с и
 * дикий разброс, при steps=120 стало ещё хуже — 175 с. Перебор тут просто не тот
 * инструмент.
 *
 * Зато такая сетка СТРОИТСЯ формулой: v(r,c) = (3·(r mod 3) + ⌊r/3⌋ + m·c + shift) mod 9 + 1.
 *   • строки/столбцы/боксы — свойство классической «сдвиговой» сетки судоку;
 *   • по горизонтали соседи отличаются на m (mod 9), по вертикали — на 3 либо на 4–5;
 *     ни одно из этих значений не даёт разницу в единицу, если m ∉ {1, 8}.
 * Множитель m ∈ {2,4,5,7} (взаимно прост с 9 и не даёт единицы), сдвиг 0..8, плюс
 * транспонирование и разворот цифр v→10−v: 144 разные сетки, любая за микросекунды.
 * Все 36 комбинаций m×shift проверены настоящим isValid с правилом nonconsec.
 */
export function buildNonconsecSolution(): Cell[][] {
  const m = [2, 4, 5, 7][Math.floor(Math.random() * 4)];
  const shift = Math.floor(Math.random() * 9);
  let g: Cell[][] = Array.from({ length: 9 }, (_, r) =>
    Array.from({ length: 9 }, (_, c) => ((3 * (r % 3) + Math.floor(r / 3) + m * c + shift) % 9) + 1));
  if (Math.random() < 0.5) g = g[0].map((_, c) => g.map((row) => row[c]));       // транспонирование
  if (Math.random() < 0.5) g = g.map((row) => row.map((v) => 10 - v));           // разворот цифр: |a−b| не меняется
  return g;
}

export function generatePuzzle(blanks: number, N: number, BR: number, BC: number, variant: Variant = 'none'): { puzzle: Cell[][]; solution: Cell[][]; regions?: number[][]; parity?: number[][]; kropki?: { h: number[][]; v: number[][] }; sandwich?: { rows: number[]; cols: number[] }; thermo?: ThermoPN; arrow?: ArrowMap; cages?: CageMap } {
  const sol: Cell[][] = Array.from({ length: N }, () => Array(N).fill(0));
  let regions: number[][] | undefined;
  let thermo: ThermoPN | undefined;
  let arrow: ArrowMap | undefined;
  let cages: CageMap | undefined;
  if (variant === 'jigsaw') {
    let ok = false;
    for (let t = 0; t < 60 && !ok; t++) { regions = generateRegions(N); for (const row of sol) row.fill(0); ok = solve(sol, N, BR, BC, 'jigsaw', regions, { steps: 1500 }); }   // budget низкий: ~90% раскладок нерешаемы, дешёвый отказ + ретрай
    if (!ok) { regions = undefined; for (const row of sol) row.fill(0); solve(sol, N, BR, BC, 'none'); }   // редкий фолбэк на классику
  } else if (variant === 'thermo') {
    let ok = false;
    for (let t = 0; t < 60 && !ok; t++) { thermo = generateThermo(N); for (const row of sol) row.fill(0); ok = solve(sol, N, BR, BC, 'thermo', undefined, { steps: 2000 }, thermo); }   // ~5 ретраев, констрейн решаем
    if (!ok) { thermo = undefined; for (const row of sol) row.fill(0); solve(sol, N, BR, BC, 'none'); }
  } else if (variant === 'thermocage') {
    // Порядок важен: сначала решение ПОД термометр, потом суммы ИЗ этого решения.
    // Обратный порядок (сначала суммы, потом искать решение) — лишний перебор на
    // ровном месте: любые две системы правил, выведенные из одной сетки, совместимы.
    let ok = false;
    for (let t = 0; t < 60 && !ok; t++) { thermo = generateThermo(N); for (const row of sol) row.fill(0); ok = solve(sol, N, BR, BC, 'thermo', undefined, { steps: 2000 }, thermo); }
    if (!ok) { thermo = undefined; for (const row of sol) row.fill(0); solve(sol, N, BR, BC, 'none'); }   // без термометра остаются суммы — доска решаемая
    cages = generateThermoCages(sol, N);
  } else if (variant === 'arrow') {
    let ok = false;
    for (let t = 0; t < 60 && !ok; t++) { arrow = generateArrow(N); for (const row of sol) row.fill(0); ok = solve(sol, N, BR, BC, 'arrow', undefined, { steps: 3000 }, undefined, arrow); }   // ~2 ретрая, констрейн-сумма решаем
    if (!ok) { arrow = undefined; for (const row of sol) row.fill(0); solve(sol, N, BR, BC, 'none'); }
  } else if (variant === 'nonconsec' && N === 9) {
    const g = buildNonconsecSolution();   // строим формулой, перебор тут не тот инструмент — см. комментарий выше
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) sol[r][c] = g[r][c];
  } else {
    solve(sol, N, BR, BC, variant);
  }
  const puzzle: Cell[][] = sol.map((row) => [...row]);
  const positions = shuffle(Array.from({ length: N * N }, (_, i) => i));
  const effVariant = (variant === 'jigsaw' && !regions) || (variant === 'thermo' && !thermo) || (variant === 'arrow' && !arrow) || (variant === 'thermocage' && !cages) ? 'none' : variant;   // фолбэк генерации → чекаем как классику
  if (UNIQUE_CHECKED.includes(effVariant)) {
    // v1.111.0 — dig-with-uniqueness: выкалываем клетку только если решение остаётся
    // ЕДИНСТВЕННЫМ (иначе честный игрок мог поставить цифру второго решения и получить
    // несправедливую «ошибку» — ввод сверяется с зашитым solution). Если безопасных
    // клеток меньше blanks — пазл выйдет чуть легче, но честным.
    // Дедлайн: nonconsec на слабом железе мог бы жевать секунды (замер: 0.5–3.3с на M-чипе) —
    // по таймауту прекращаем выкалывание, оставшееся не трогаем (легче, но без фриза UI).
    const deadline = Date.now() + 2500;
    let dug = 0;
    for (const p of positions) {
      if (dug >= blanks || Date.now() > deadline) break;
      const r = Math.floor(p / N), c = p % N;
      const keep = puzzle[r][c];
      puzzle[r][c] = 0;
      if (countSolutions(puzzle, N, BR, BC, effVariant, regions, 2, { steps: 8000 }, thermo, arrow, effVariant === 'thermocage' ? cages : undefined) !== 1) puzzle[r][c] = keep;
      else dug++;
    }
  } else {
    for (let i = 0; i < blanks; i++) {
      const p = positions[i];
      puzzle[Math.floor(p / N)][p % N] = 0;
    }
  }
  let parity: number[][] | undefined;
  if (variant === 'evenodd') {   // помечаем ~55% пустых клеток их чётностью: 1 = чёт (квадрат), 2 = нечёт (круг)
    parity = Array.from({ length: N }, () => Array(N).fill(0));
    const blank: [number, number][] = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (puzzle[r][c] === 0) blank.push([r, c]);
    for (const [r, c] of shuffle(blank).slice(0, Math.round(blank.length * 0.55))) parity[r][c] = sol[r][c] % 2 === 0 ? 1 : 2;
  }
  let kropki: { h: number[][]; v: number[][] } | undefined;
  if (variant === 'kropki') {   // точки из решения: 2 = чёрная (одно вдвое больше), 1 = белая (±1), 0 = нет
    const dot = (a: number, b: number) => (Math.max(a, b) === 2 * Math.min(a, b) ? 2 : Math.abs(a - b) === 1 ? 1 : 0);
    const h = Array.from({ length: N }, () => Array(N).fill(0));   // h[r][c]: грань между (r,c) и (r,c+1)
    const vrt = Array.from({ length: N }, () => Array(N).fill(0)); // vrt[r][c]: грань между (r,c) и (r+1,c)
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (c < N - 1) h[r][c] = dot(sol[r][c], sol[r][c + 1]);
      if (r < N - 1) vrt[r][c] = dot(sol[r][c], sol[r + 1][c]);
    }
    kropki = { h, v: vrt };
  }
  let sandwich: { rows: number[]; cols: number[] } | undefined;
  if (variant === 'sandwich') {   // сумма цифр СТРОГО между позициями 1 и 9 в ряду/столбце
    const between = (line: number[]) => {
      const i1 = line.indexOf(1), i9 = line.indexOf(9);
      if (i1 < 0 || i9 < 0) return 0;
      const [a, b] = i1 < i9 ? [i1, i9] : [i9, i1];
      let s = 0; for (let k = a + 1; k < b; k++) s += line[k];
      return s;
    };
    const rows = sol.map((row) => between(row));
    const cols = Array.from({ length: N }, (_, c) => between(sol.map((row) => row[c])));
    sandwich = { rows, cols };
  }
  return { puzzle, solution: sol, regions, parity, kropki, sandwich, thermo, arrow, cages };
}

/**
 * ПОЧЕМУ ЦИФРА НЕ ПОДОШЛА — НАЗЫВАЕМ ПРАВИЛО, А НЕ ПРОСТО ВИБРИРУЕМ.
 *
 * 🔴 ЧТО НАШЛОСЬ 22.08.2026 по отчётам Вали (три подряд за ночь, и в них
 * «я писала о нём раз 10 уже», «удаляю программу»). Она ставила цифру, игра
 * отвечала ошибкой, а по всем правилам, которые Валя знает, цифра подходила.
 *
 * ⚠️ И ГЕНЕРАЦИЯ ПРИ ЭТОМ ИСПРАВНА. Замер 32 досок сэндвича (уровни 38–41):
 * 31 из 32 действительно НЕОДНОЗНАЧНА как обычное судоку — «семёрка и девятка
 * могут стоять по-разному», ровно как она пишет. И НИ ОДНА не неоднозначна по
 * ВИДИМЫМ правилам: подсказка сэндвича разводит их всегда. То есть пазл честный,
 * а человек об этом не знает — в ту же ночь она дважды написала «правила
 * сэндвича непонятны вообще».
 *
 * Поэтому чинить надо не генератор (десять заходов туда и не помогли), а ОТВЕТ.
 * Если цифра проходит по строке, столбцу и боксу, но не совпала с решением —
 * значит её отвергло ДОПОЛНИТЕЛЬНОЕ правило варианта, и назвать его обязаны мы.
 */
export interface RejectionContext {
  regions?: number[][];
  thermo?: ThermoPN;
  arrow?: ArrowMap;
  cages?: CageMap;
  parity?: number[][];
  kropki?: { h: number[][]; v: number[][] };
}

export function rejectionReason(
  grid: Cell[][], r: number, c: number, n: number, N: number, BR: number, BC: number,
  variant: Variant, lang: string, ctx: RejectionContext = {},
): string {
  const test = grid.map((row) => [...row]);
  test[r][c] = 0;

  // 1. Базовое правило нарушено — конфликт человек видит сам, доска его подсвечивает.
  if (!isValid(test, r, c, n, N, BR, BC, 'none')) return '';

  // 2. Правило варианта нарушено ДОКАЗУЕМО — вот теперь называем именно его.
  if (variant !== 'none') {
    if (!isValid(test, r, c, n, N, BR, BC, variant, ctx.regions, ctx.thermo, ctx.arrow, ctx.cages)) {
      return variantRule(variant, lang);
    }
    // Метки движок не проверяет — проверяем здесь, руками и точно.
    if (variant === 'evenodd' && ctx.parity) {
      const mark = ctx.parity[r]?.[c] ?? 0;                       // 1 = чёт, 2 = нечет, 0 = метки нет
      if ((mark === 1 && n % 2 !== 0) || (mark === 2 && n % 2 === 0)) return variantRule(variant, lang);
    }
    if (variant === 'kropki' && ctx.kropki) {
      const okDot = (dot: number, a: number, b: number): boolean => {
        if (dot === 1) return Math.abs(a - b) === 1;              // белая: разница в единицу
        if (dot === 2) return a === b * 2 || b === a * 2;         // чёрная: вдвое
        return true;                                              // точки нет — ограничения нет
      };
      const near: [number, number, number][] = [
        [r, c - 1, ctx.kropki.h[r]?.[c - 1] ?? 0],
        [r, c + 1, ctx.kropki.h[r]?.[c] ?? 0],
        [r - 1, c, ctx.kropki.v[r - 1]?.[c] ?? 0],
        [r + 1, c, ctx.kropki.v[r]?.[c] ?? 0],
      ];
      for (const [nr, nc, dot] of near) {
        const other = test[nr]?.[nc] ?? 0;
        if (dot && other && !okDot(dot, n, other)) return variantRule(variant, lang);
      }
    }
  }

  /**
   * 3. ДОКАЗАТЬ ВИНУ НЕЧЕМ — И ТОГДА МЫ ЕЁ НЕ ПРИПИСЫВАЕМ.
   *
   * 🔴 ПЕРВАЯ РЕДАКЦИЯ ЭТОЙ ФУНКЦИИ ВРАЛА. Она рассуждала так: «цифра прошла по
   * строке, столбцу и боксу — значит виноват вариант». Это неверно: цифра может
   * быть законной по ВСЕМ правилам и просто не совпадать с решением, потому что
   * в этой клетке стоит другая по цепочке выводов. Замер разбора 22.08.2026:
   * ложных обвинений в сэндвиче 100 %, кропки 95,7 %, термометре 95,2 %,
   * джигсо 91,9 %. Человек терял жизнь и читал «нарушено правило сэндвича» там,
   * где сэндвич эту цифру РАЗРЕШАЕТ.
   *
   * Уверенно неправильное объяснение хуже молчания: молчание человек спишет на
   * скупость игры, а ложное обвинение — на её глупость, и перестанет верить всем
   * подсказкам разом.
   *
   * Поэтому здесь честный ответ: конфликт есть, но он НЕ МЕСТНЫЙ — соседей
   * проверять бесполезно, надо смотреть строку, столбец и квадрат целиком.
   */
  return translateFor(lang, 'sudokuWhyNotLocal');
}
