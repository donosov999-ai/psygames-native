/* psygames-sudoku-schrodinger · VER 1 · 07.10.2026 */
/**
 * 🔴 КЛЕТКИ ШРЁДИНГЕРА (пункт 13 цепочки «14 усложнений», задача f46c796c).
 *
 * Правило (logic-masters.de, Cracking the Cryptic): цифры 0–9; в каждой строке, столбце и блоке
 * каждая из десяти цифр по разу; ровно одна клетка строки, столбца и блока — клетка Шрёдингера, в
 * ней ДВЕ цифры. Где эти клетки — игрок выводит сам.
 *
 * Модель — точное покрытие, а не «одна цифра в клетке»: вариант клетки — одна цифра (10) или пара
 * (45), всего 55; условия — клетка (81), строка×цифра, столбец×цифра, блок×цифра (по 90) и «одна
 * пара» на строку, столбец и блок (по 9) — 378. Отсюда два прибора одной моделью:
 *   · `countS` — перебор (алгоритм X, столбец с наименьшим числом вариантов) до `limit` решений;
 *   · `logicS` — мера: только вынужденные шаги «у условия остался один вариант» — это и голая
 *     одиночка клетки, и скрытая одиночка цифры, и «пара может стоять только здесь». Дошла до
 *     конца — доска решается логикой без перебора, значит и решение одно.
 * Клетка в сетке — массив цифр по возрастанию: [] пусто, [d] одна, [a, b] клетка Шрёдингера.
 */
export type SCell = number[];
export type SGrid = SCell[][];

const N = 9, D = 10;
const PAIRS: [number, number][] = [];
for (let a = 0; a < D; a++) for (let b = a + 1; b < D; b++) PAIRS.push([a, b]);
const PER_CELL = D + PAIRS.length;   // 55
const NCOLS = 81 + 3 * 90 + 3 * 9;   // 378

/** Варианты: [клетка, цифры]; столбцы покрытия каждого варианта. */
const OPT_CELL = new Int16Array(81 * PER_CELL);
const OPT_DIGITS: SCell[] = [];
const OPT_COLS: number[][] = [];
const COL_OPTS: number[][] = Array.from({ length: NCOLS }, () => []);
for (let cell = 0; cell < 81; cell++) {
  const r = Math.floor(cell / N), c = cell % N, b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
  for (let k = 0; k < PER_CELL; k++) {
    const o = cell * PER_CELL + k;
    const ds = k < D ? [k] : PAIRS[k - D];
    OPT_CELL[o] = cell;
    OPT_DIGITS[o] = ds;
    const cols = [cell];
    for (const d of ds) cols.push(81 + r * D + d, 171 + c * D + d, 261 + b * D + d);
    if (ds.length === 2) cols.push(351 + r, 360 + c, 369 + b);
    OPT_COLS[o] = cols;
    for (const col of cols) COL_OPTS[col].push(o);
  }
}
const optionOf = (cell: number, ds: SCell): number => {
  if (ds.length === 1) return cell * PER_CELL + ds[0];
  const [a, b] = ds[0] < ds[1] ? ds : [ds[1], ds[0]];
  return cell * PER_CELL + D + PAIRS.findIndex(([x, y]) => x === a && y === b);
};

/** Состояние покрытия с откатом. */
class Cover {
  alive = new Uint8Array(81 * PER_CELL).fill(1);
  count = new Int32Array(NCOLS);
  done = new Uint8Array(NCOLS);
  chosen: number[] = [];
  private killed: number[] = [];
  private doneStack: number[] = [];
  constructor() { for (let col = 0; col < NCOLS; col++) this.count[col] = COL_OPTS[col].length; }
  mark() { return [this.killed.length, this.doneStack.length, this.chosen.length]; }
  undo([k, d, ch]: number[]) {
    while (this.killed.length > k) { const o = this.killed.pop()!; this.alive[o] = 1; for (const col of OPT_COLS[o]) this.count[col]++; }
    while (this.doneStack.length > d) this.done[this.doneStack.pop()!] = 0;
    this.chosen.length = ch;
  }
  /** Взять вариант: его столбцы закрыты, все конфликтующие варианты выбывают. false — вариант уже выбыл. */
  select(o: number): boolean {
    if (!this.alive[o]) return false;
    this.chosen.push(o);
    for (const col of OPT_COLS[o]) {
      this.done[col] = 1; this.doneStack.push(col);
      for (const o2 of COL_OPTS[col]) {
        if (!this.alive[o2]) continue;
        this.alive[o2] = 0; this.killed.push(o2);
        for (const c2 of OPT_COLS[o2]) this.count[c2]--;
      }
    }
    return true;
  }
  /** Открытый столбец с наименьшим числом живых вариантов; −1 — все закрыты. */
  tightest(): number {
    let best = -1, bc = 1 << 30;
    for (let col = 0; col < NCOLS; col++) if (!this.done[col] && this.count[col] < bc) { bc = this.count[col]; best = col; if (bc <= 1) break; }
    return best;
  }
}

function seed(puzzle: SGrid): Cover | null {
  const cv = new Cover();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const ds = puzzle[r][c];
    if (ds.length && !cv.select(optionOf(r * N + c, ds))) return null;
  }
  return cv;
}

function toGrid(chosen: number[]): SGrid {
  const g: SGrid = Array.from({ length: N }, () => Array.from({ length: N }, () => [] as SCell));
  for (const o of chosen) { const cell = OPT_CELL[o]; g[Math.floor(cell / N)][cell % N] = [...OPT_DIGITS[o]]; }
  return g;
}

/** Сколько решений (до `limit`); `budget.steps` — потолок узлов перебора, исчерпан — ответ ненадёжен. */
export function countS(puzzle: SGrid, limit = 2, budget: { steps: number } = { steps: 200000 }, out?: { grid?: SGrid }, rnd?: () => number): number {
  const cv = seed(puzzle);
  if (!cv) return 0;
  let found = 0;
  const walk = (): void => {
    if (found >= limit || --budget.steps < 0) return;
    const col = cv.tightest();
    if (col < 0) { found++; if (out && !out.grid) out.grid = toGrid(cv.chosen); return; }
    if (cv.count[col] === 0) return;
    const opts = COL_OPTS[col].filter((o) => cv.alive[o]);
    if (rnd) for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    for (const o of opts) {
      const m = cv.mark();
      cv.select(o);
      walk();
      cv.undo(m);
      if (found >= limit || budget.steps < 0) return;
    }
  };
  walk();
  return found;
}

/**
 * Полная сетка Шрёдингера: перебор с пустой доски в случайном порядке. Обычно — с первого захода за
 * миллисекунды (замер 07.10: 0–3 мс); 200 заходов без сетки — поломка модели, а не невезение:
 * падаем громко, а не висим (07.10 мутация «нет условия одна пара на ряд» вешала генератор).
 */
export function generateSolutionS(rnd: () => number = Math.random): SGrid {
  for (let attempt = 0; attempt < 200; attempt++) {
    const out: { grid?: SGrid } = {};
    if (countS(emptyS(), 1, { steps: 20000 }, out, rnd) === 1 && out.grid) return out.grid;
  }
  throw Error('сетка Шрёдингера не собирается за 200 заходов — модель покрытия сломана');
}

export const emptyS = (): SGrid => Array.from({ length: N }, () => Array.from({ length: N }, () => [] as SCell));

export interface SLogic {
  solved: boolean;
  grid: SGrid | null;
  /** Вынужденных шагов всего и сколько из них — про клетку Шрёдингера (пара выведена или исключена). */
  steps: number;
  pairSteps: number;
}

/**
 * Мера: только вынужденные шаги — у открытого условия остался ОДИН живой вариант. Дошла до конца —
 * решение одно. Шаг «про пару» — когда вынужденный вариант пара или условие — «одна пара на ряд».
 */
export function logicS(puzzle: SGrid): SLogic {
  const cv = seed(puzzle);
  if (!cv) return { solved: false, grid: null, steps: 0, pairSteps: 0 };
  let steps = 0, pairSteps = 0;
  for (;;) {
    const col = cv.tightest();
    if (col < 0) return { solved: true, grid: toGrid(cv.chosen), steps, pairSteps };
    if (cv.count[col] !== 1) return { solved: false, grid: null, steps, pairSteps };   // 0 — противоречие, >1 — логики мало
    const o = COL_OPTS[col].find((x) => cv.alive[x])!;
    cv.select(o);
    steps++;
    if (OPT_DIGITS[o].length === 2 || col >= 351) pairSteps++;
  }
}

/** Одна и та же ли сетка. */
export function sameS(a: SGrid, b: SGrid): boolean {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x = a[r][c], y = b[r][c];
    if (x.length !== y.length || x.some((v, i) => v !== y[i])) return false;
  }
  return true;
}

/** Задача: снимаем клетки, пока мера доходит до той же сетки. */
export function digS(solution: SGrid, rnd: () => number = Math.random, cap = 81): SGrid {
  const puzzle = solution.map((row) => row.map((ds) => [...ds]));
  const order = Array.from({ length: 81 }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let dug = 0;
  for (const p of order) {
    if (dug >= cap) break;
    const r = Math.floor(p / N), c = p % N, keep = puzzle[r][c];
    puzzle[r][c] = [];
    const l = logicS(puzzle);
    if (!l.solved || !sameS(l.grid!, solution)) puzzle[r][c] = keep;
    else dug++;
  }
  return puzzle;
}

/**
 * Клетка в доске и в выгрузке — одно целое, как у остальных вариантов (сетки экранов — числа):
 * 0 — пусто; одна цифра d — d + 1 (1..10); пара a < b — 100 + 10·a + b. Цифра 0 — настоящая цифра
 * правила, поэтому «пусто» и «ноль» кодируются по-разному.
 */
export function encodeS(ds: SCell): number {
  if (!ds.length) return 0;
  if (ds.length === 1) return ds[0] + 1;
  const [a, b] = ds[0] < ds[1] ? ds : [ds[1], ds[0]];
  return 100 + 10 * a + b;
}
export function decodeS(v: number): SCell {
  if (!v) return [];
  if (v < 100) return [v - 1];
  return [Math.floor((v - 100) / 10), (v - 100) % 10];
}
export const encodeGridS = (g: SGrid): number[][] => g.map((row) => row.map(encodeS));
export const decodeGridS = (g: number[][]): SGrid => g.map((row) => row.map(decodeS));
