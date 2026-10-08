/* psygames-sudoku-modifiers · VER 1 · 07.10.2026 */
/**
 * 🔴 УДВОИТЕЛИ И ОТРИЦАТЕЛЬНЫЕ (пункт 13 цепочки «14 усложнений», задача f46c796c, типы 2 и 3).
 *
 * Правило (logic-masters.de 000BMB): девять клеток доски — по одной в каждой строке, столбце и блоке,
 * с цифрами 1–9 по разу — «нарушители»: в суммах клеток-групп удвоитель считается вдвое, отрицательная
 * — со знаком минус. Где они — игрок выводит сам; цифры в группе не повторяются, как в киллере.
 *
 * Модель — точное покрытие с суммами сбоку. Вариант клетки — (цифра, нарушитель или нет): 18 на клетку;
 * точные условия — клетка, строка×цифра, столбец×цифра, блок×цифра и у нарушителей — строка, столбец,
 * блок, цифра (по разу) — 360. Суммы групп не точное покрытие: их держит отсечение — взвешенная
 * сумма выбранного плюс наименьшие и наибольшие вклады остальных клеток обязаны накрывать цель.
 *   · `countM` — перебор до `limit` решений;
 *   · `logicM` — мера: вынужденные шаги (у условия один вариант) и вывод на суммах (вариант клетки,
 *     с которым сумма группы не набирается, выбывает). Дошла до конца — решение одно.
 */
import { generateCages, type Cell, type CageMap } from './sudoku-core';

export type ModKind = 'doublers' | 'negators';
export const MOD_WEIGHT: Record<ModKind, number> = { doublers: 2, negators: -1 };

const N = 9;
const PER_CELL = 18;
const NOPT = 81 * PER_CELL, NCOLS = 360;
const OPT_CELL = new Int16Array(NOPT), OPT_DIGIT = new Int8Array(NOPT), OPT_MOD = new Uint8Array(NOPT);
const OPT_COLS: number[][] = [];
const COL_OPTS: number[][] = Array.from({ length: NCOLS }, () => []);
for (let cell = 0; cell < 81; cell++) {
  const r = Math.floor(cell / N), c = cell % N, b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
  for (let d = 1; d <= 9; d++) for (let f = 0; f < 2; f++) {
    const o = cell * PER_CELL + (d - 1) * 2 + f;
    OPT_CELL[o] = cell; OPT_DIGIT[o] = d; OPT_MOD[o] = f;
    const cols = [cell, 81 + r * 9 + d - 1, 162 + c * 9 + d - 1, 243 + b * 9 + d - 1];
    if (f) cols.push(324 + r, 333 + c, 342 + b, 351 + d - 1);
    OPT_COLS[o] = cols;
    for (const col of cols) COL_OPTS[col].push(o);
  }
}

export interface ModState { digits: Cell[][]; mods: number[][] }

class ModCover {
  alive = new Uint8Array(NOPT).fill(1);
  count = new Int32Array(NCOLS);
  done = new Uint8Array(NCOLS);
  chosenOf = new Int32Array(81).fill(-1);
  private killed: number[] = [];
  private doneStack: number[] = [];
  private chosenStack: number[] = [];
  readonly cageOf: Int16Array;
  readonly cageCells: number[][];
  readonly cageSum: number[];
  constructor(cages: CageMap | null, readonly w: number) {
    for (let col = 0; col < NCOLS; col++) this.count[col] = COL_OPTS[col].length;
    this.cageOf = new Int16Array(81).fill(-1);
    this.cageCells = []; this.cageSum = [];
    if (cages) {
      cages.cells.forEach((cs, k) => { this.cageCells[k] = cs.map(([r, c]) => r * N + c); this.cageSum[k] = cages.sum[k]; for (const i of this.cageCells[k]) this.cageOf[i] = k; });
    }
  }
  value(o: number) { return OPT_DIGIT[o] * (OPT_MOD[o] ? this.w : 1); }
  mark() { return [this.killed.length, this.doneStack.length, this.chosenStack.length]; }
  undo([k, d, ch]: number[]) {
    while (this.killed.length > k) { const o = this.killed.pop()!; this.alive[o] = 1; for (const col of OPT_COLS[o]) this.count[col]++; }
    while (this.doneStack.length > d) this.done[this.doneStack.pop()!] = 0;
    while (this.chosenStack.length > ch) this.chosenOf[this.chosenStack.pop()!] = -1;
  }
  kill(o: number) {
    if (!this.alive[o]) return;
    this.alive[o] = 0; this.killed.push(o);
    for (const c2 of OPT_COLS[o]) this.count[c2]--;
  }
  select(o: number): boolean {
    if (!this.alive[o]) return false;
    const cell = OPT_CELL[o];
    this.chosenOf[cell] = o; this.chosenStack.push(cell);
    for (const col of OPT_COLS[o]) {
      this.done[col] = 1; this.doneStack.push(col);
      for (const o2 of COL_OPTS[col]) this.kill(o2);
    }
    // В группе цифры не повторяются: та же цифра у соседей по группе выбывает.
    const k = this.cageOf[cell];
    if (k >= 0) for (const j of this.cageCells[k]) {
      if (j === cell) continue;
      const base = j * PER_CELL + (OPT_DIGIT[o] - 1) * 2;
      this.kill(base); this.kill(base + 1);
    }
    return true;
  }
  /** Пределы вклада клетки по живым вариантам; выбранная — её значение. */
  range(i: number): [number, number] {
    const ch = this.chosenOf[i];
    if (ch >= 0) { const v = this.value(ch); return [v, v]; }
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < PER_CELL; k++) {
      const o = i * PER_CELL + k;
      if (!this.alive[o]) continue;
      const v = this.value(o);
      if (v < lo) lo = v; if (v > hi) hi = v;
    }
    return [lo, hi];
  }
  cageFeasible(k: number): boolean {
    let lo = 0, hi = 0;
    for (const i of this.cageCells[k]) { const [a, b] = this.range(i); if (a === Infinity) return false; lo += a; hi += b; }
    return lo <= this.cageSum[k] && this.cageSum[k] <= hi;
  }
  allCagesFeasible(): boolean {
    for (let k = 0; k < this.cageCells.length; k++) if (this.cageCells[k] && !this.cageFeasible(k)) return false;
    return true;
  }
  tightest(): number {
    let best = -1, bc = 1 << 30;
    for (let col = 0; col < NCOLS; col++) if (!this.done[col] && this.count[col] < bc) { bc = this.count[col]; best = col; if (bc <= 1) break; }
    return best;
  }
  state(): ModState {
    const digits = Array.from({ length: N }, () => Array(N).fill(0));
    const mods = Array.from({ length: N }, () => Array(N).fill(0));
    for (let i = 0; i < 81; i++) { const o = this.chosenOf[i]; if (o < 0) continue; digits[Math.floor(i / N)][i % N] = OPT_DIGIT[o]; mods[Math.floor(i / N)][i % N] = OPT_MOD[o]; }
    return { digits, mods };
  }
}

function seed(digits: Cell[][], cages: CageMap | null, kind: ModKind): ModCover | null {
  const cv = new ModCover(cages, MOD_WEIGHT[kind]);
  // Напечатанная цифра задаёт цифру, но не «нарушитель ли»: оба варианта клетки остаются.
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const d = digits[r][c];
    if (!d) continue;
    const cell = r * N + c;
    for (let k = 0; k < PER_CELL; k++) if (OPT_DIGIT[cell * PER_CELL + k] !== d) cv.kill(cell * PER_CELL + k);
  }
  return cv;
}

/** Сколько решений (цифры И нарушители) до `limit`; `budget.steps` — потолок узлов. */
export function countM(digits: Cell[][], cages: CageMap | null, kind: ModKind, limit = 2, budget: { steps: number } = { steps: 300000 }, out?: { state?: ModState }, rnd?: () => number): number {
  const cv = seed(digits, cages, kind);
  if (!cv) return 0;
  let found = 0;
  const walk = (): void => {
    if (found >= limit || --budget.steps < 0) return;
    const res = propagate(cv);
    if (res === 'dead') return;
    if (res === 'done') { found++; if (out && !out.state) out.state = cv.state(); return; }
    const col = cv.tightest();
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

export interface MLogic { solved: boolean; state: ModState | null; steps: number; cageSteps: number }

/**
 * Распространение: вынужденные шаги и вывод на суммах, пока есть что выводить. Общее у меры и у
 * перебора: перебор без него не укладывался в 400 000 узлов на половине досок (замер 07.10:
 * «единственны 4 из 12» оказалось исчерпанным бюджетом, а не вторым решением).
 * 'dead' — противоречие; 'done' — всё выбрано; 'stuck' — выводить нечего.
 */
function propagate(cv: ModCover, tally?: { steps: number; cageSteps: number }): 'dead' | 'done' | 'stuck' {
  for (let guard = 0; guard < 81 * PER_CELL * 4; guard++) {
    if (!cv.allCagesFeasible()) return 'dead';
    const col = cv.tightest();
    if (col < 0) return 'done';
    if (cv.count[col] === 0) return 'dead';
    if (cv.count[col] === 1) { cv.select(COL_OPTS[col].find((o) => cv.alive[o])!); if (tally) tally.steps++; continue; }
    // Вывод на суммах: вариант клетки, с которым сумма её группы не набирается, выбывает.
    let killed = false;
    for (let k = 0; k < cv.cageCells.length && !killed; k++) {
      const cells = cv.cageCells[k];
      if (!cells) continue;
      for (const i of cells) {
        if (cv.chosenOf[i] >= 0) continue;
        let lo = 0, hi = 0;
        for (const j of cells) if (j !== i) { const [x, y] = cv.range(j); lo += x; hi += y; }
        for (let q = 0; q < PER_CELL; q++) {
          const o = i * PER_CELL + q;
          if (!cv.alive[o]) continue;
          const v = cv.value(o);
          if (lo + v > cv.cageSum[k] || hi + v < cv.cageSum[k]) { cv.kill(o); killed = true; }
        }
      }
    }
    if (!killed) return 'stuck';
    if (tally) { tally.steps++; tally.cageSteps++; }
  }
  return 'stuck';
}

/** Мера: вынужденные шаги и вывод на суммах групп. Без перебора. */
export function logicM(digits: Cell[][], cages: CageMap, kind: ModKind): MLogic {
  const cv = seed(digits, cages, kind);
  if (!cv) return { solved: false, state: null, steps: 0, cageSteps: 0 };
  const tally = { steps: 0, cageSteps: 0 };
  const res = propagate(cv, tally);
  return { solved: res === 'done', state: res === 'done' ? cv.state() : null, ...tally };
}

export const sameDigits = (a: Cell[][], b: Cell[][]) => a.every((row, r) => row.every((v, c) => v === b[r][c]));

const emptyDigits = (): Cell[][] => Array.from({ length: N }, () => Array(N).fill(0));

/** Полная сетка с нарушителями: перебор с пустой доски в случайном порядке (без групп). */
export function generateSolutionM(kind: ModKind, rnd: () => number = Math.random): ModState {
  for (let attempt = 0; attempt < 200; attempt++) {
    const out: { state?: ModState } = {};
    if (countM(emptyDigits(), null, kind, 1, { steps: 20000 }, out, rnd) === 1 && out.state) return out.state;
  }
  throw Error('сетка с нарушителями не собирается за 200 заходов — модель покрытия сломана');
}

/** Группы по сетке и их ВЗВЕШЕННЫЕ суммы: удвоитель — вдвое, отрицательная — со знаком минус. */
export function weightedCages(sol: ModState, kind: ModKind, rnd: () => number = Math.random): CageMap {
  const raw = generateCages(sol.digits, N, rnd);
  const w = MOD_WEIGHT[kind];
  // Номера групп — подряд: у `generateCages` после слияния одиночек в номерах дыры, и в выгрузке они
  // стали бы null в суммах.
  const cells = raw.cells.filter(Boolean);
  const cageOf = Array.from({ length: N }, () => Array(N).fill(-1));
  cells.forEach((cs, k) => { for (const [r, c] of cs) cageOf[r][c] = k; });
  const sum = cells.map((cs) => cs.reduce((t, [r, c]) => t + sol.digits[r][c] * (sol.mods[r][c] ? w : 1), 0));
  const anchor = cells.map((cs) => Math.min(...cs.map(([r, c]) => r * N + c)));
  return { cageOf, sum, anchor, cells };
}

export interface ModBoard { puzzle: Cell[][]; solution: ModState; cages: CageMap; logic: MLogic }

/**
 * Доска: сетка, группы, снятие цифр, пока мера доходит до тех же цифр И тех же нарушителей.
 * null — при всех цифрах мера нарушителей не вывела (группы неудачные), вызывающий повторит.
 */
export function generateBoardM(kind: ModKind, rnd: () => number = Math.random, cap = 81): ModBoard | null {
  const sol = generateSolutionM(kind, rnd);
  const cages = weightedCages(sol, kind, rnd);
  const same = (l: MLogic) => l.solved && sameDigits(l.state!.digits, sol.digits) && sameDigits(l.state!.mods, sol.mods);
  if (!same(logicM(sol.digits, cages, kind))) return null;
  const puzzle = sol.digits.map((row) => [...row]);
  const order = Array.from({ length: 81 }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let dug = 0;
  for (const p of order) {
    if (dug >= cap) break;
    const r = Math.floor(p / N), c = p % N, keep = puzzle[r][c];
    puzzle[r][c] = 0;
    if (!same(logicM(puzzle, cages, kind))) puzzle[r][c] = keep; else dug++;
  }
  return { puzzle, solution: sol, cages, logic: logicM(puzzle, cages, kind) };
}
