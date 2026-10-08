/* psygames-sudoku-chaos · VER 1 · 07.10.2026 */
/**
 * 🔴 САМОСБОРКА ОБЛАСТЕЙ (Chaos Construction; пункт 12 цепочки «14 усложнений», задача 6cee3610).
 *
 * Блоков нет: доска делится на N связных по сторонам областей по N клеток, в каждой строке, столбце и
 * области цифры 1..N по разу, а границы областей выводит сам игрок. Одних цифр для этого мало — у
 * полной сетки решений много разбиений (их и перебирает `regionsFromSolution`), — поэтому, как во
 * всех задачах жанра на logic-masters.de, у доски есть подсказки границ: число в клетке — сколько
 * из четырёх её сторон лежат на границе области (край доски тоже граница). Это подсказка «Палисада».
 *
 * Решатель разбиения — перенос `palisade.c` из коллекции Саймона Тэтхэма (MIT, файл LICENCE в
 * ~/dev/puzzles, ревизия 428913c): те же шесть выводов на рёбрах и DSF областей. Своё — седьмой
 * вывод: две области, где уже есть одна и та же напечатанная цифра, слиться не могут (в области
 * цифры по разу) — так цифры и границы выводятся вместе, а не двумя независимыми задачами.
 * Разбиение решено, когда границы сами делят доску на области ровно по N клеток: тогда оно и
 * единственно — каждый вывод вынужден.
 */
import type { Cell } from './sudoku-core';

const U = 1, R = 2, D = 4, L = 8;
const DIRS = [U, R, D, L] as const;
const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1];
const flip = (d: number) => (d + 2) % 4;
const bitcount = (x: number) => ((x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1));

/** Подсказки границ разбиения: сколько сторон клетки — граница области (край доски — тоже). */
export function borderCounts(regions: number[][], N: number): number[][] {
  return regions.map((row, r) => row.map((id, c) => {
    let n = 0;
    for (let d = 0; d < 4; d++) {
      const rr = r + DR[d], cc = c + DC[d];
      if (rr < 0 || rr >= N || cc < 0 || cc >= N || regions[rr][cc] !== id) n++;
    }
    return n;
  }));
}

export interface PartitionResult {
  /** Номер области каждой клетки (0..N−1 по порядку первой клетки) или null — разбиение не выведено. */
  regions: number[][] | null;
  /** Проходов, давших хоть один вывод, и сколько из них — на цифрах (седьмой вывод). */
  passes: number;
  byDigits: number;
}

/**
 * Решатель разбиения. `clues[r][c]` — подсказка границ или −1; `givens` — напечатанные цифры (0 —
 * пусто), их седьмой вывод. Возвращает области, если границы выведены целиком.
 */
export function solvePartition(clues: number[][], givens: Cell[][] | null, N: number): PartitionResult {
  const k = N, wh = N * N;
  const borders = new Uint8Array(wh);
  for (let c = 0; c < N; c++) { borders[c] |= U; borders[wh - 1 - c] |= D; }
  for (let r = 0; r < N; r++) { borders[r * N] |= L; borders[wh - 1 - r * N] |= R; }
  const clue = new Int8Array(wh);
  for (let i = 0; i < wh; i++) clue[i] = clues[Math.floor(i / N)][i % N];

  // DSF областей: корень, размер, маска напечатанных цифр.
  const parent = Int32Array.from({ length: wh }, (_, i) => i);
  const size = new Int32Array(wh).fill(1);
  const digits = new Int32Array(wh);
  if (givens) for (let i = 0; i < wh; i++) { const v = givens[Math.floor(i / N)][i % N]; if (v) digits[i] = 1 << v; }
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const nb = (i: number, d: number) => {
    const r = Math.floor(i / N) + DR[d], c = (i % N) + DC[d];
    return r < 0 || r >= N || c < 0 || c >= N ? -1 : r * N + c;
  };
  const connected = (i: number, j: number) => find(i) === find(j);
  const disconnected = (i: number, d: number) => (borders[i] & DIRS[d]) !== 0;
  const maybe = (i: number, d: number) => {
    if (disconnected(i, d)) return false;   // порядок важен: край доски — граница, соседа нет
    return !connected(i, nb(i, d));
  };
  const connect = (i: number, j: number) => {
    const a = find(i), b = find(j);
    if (a === b) return;
    parent[b] = a; size[a] += size[b]; digits[a] |= digits[b];
  };
  const disconnect = (i: number, d: number) => {
    const j = nb(i, d);
    borders[i] |= DIRS[d];
    if (j >= 0) borders[j] |= DIRS[flip(d)];
  };

  // Две соседние подсказки без границы между ними дают нижнюю оценку размера области.
  for (let i = 0; i < wh; i++) {
    if (clue[i] < 0) continue;
    for (let d = 0; d < 4; d++) {
      const j = nb(i, d);
      if (j < 0 || disconnected(i, d) || clue[j] < 0) continue;
      if (8 - clue[i] - clue[j] > k || (clue[i] === 3 && clue[j] === 3 && k !== 2)) disconnect(i, d);
    }
  }

  const numberExhausted = () => {
    let changed = false;
    for (let i = 0; i < wh; i++) {
      if (clue[i] < 0) continue;
      if (bitcount(borders[i]) === clue[i]) {
        for (let d = 0; d < 4; d++) if (maybe(i, d)) { connect(i, nb(i, d)); changed = true; }
        continue;
      }
      let off = 0;
      for (let d = 0; d < 4; d++) if (!disconnected(i, d) && connected(i, nb(i, d))) off++;
      if (clue[i] === 4 - off) for (let d = 0; d < 4; d++) if (maybe(i, d)) { disconnect(i, d); changed = true; }
    }
    return changed;
  };
  const notTooBig = () => {
    let changed = false;
    for (let i = 0; i < wh; i++) for (let d = 0; d < 4; d++) {
      if (!maybe(i, d)) continue;
      if (size[find(i)] + size[find(nb(i, d))] <= k) continue;
      disconnect(i, d); changed = true;
    }
    return changed;
  };
  const notTooSmall = () => {
    const outs = new Int32Array(wh).fill(-1);
    for (let i = 0; i < wh; i++) {
      const ci = find(i);
      if (size[ci] === k) continue;
      for (let d = 0; d < 4; d++) {
        if (!maybe(i, d)) continue;
        const cj = find(nb(i, d));
        if (outs[ci] === -1) outs[ci] = cj; else if (outs[ci] !== cj) outs[ci] = -2;
      }
    }
    let changed = false;
    for (let i = 0; i < wh; i++) {
      if (i !== find(i) || outs[i] < 0) continue;
      connect(i, outs[i]); changed = true;   // расти больше некуда
    }
    return changed;
  };
  const noDanglingEdges = () => {
    let changed = false;
    for (let r = 1; r < N; r++) for (let c = 1; c < N; c++) {
      const i = r * N + c, j = i - N - 1;
      const squares = [i, j, j, i];   // у вершины: вверх от i, вправо от j, вниз от j, влево от i
      let noline = 0, e = -1, f = -1, de = -1, df = -1;
      for (let d = 0; d < 4; d++) {
        const s = squares[d];
        if (!connected(s, nb(s, d))) {
          df = d; f = s;
          if (e !== -1) continue;
          e = f; de = df;
        } else noline++;
      }
      if (4 - noline === 1) { disconnect(e, de); changed = true; continue; }
      if (4 - noline !== 2) continue;
      if (borders[e] & DIRS[de]) {
        if (!(borders[f] & DIRS[df])) { disconnect(f, df); changed = true; }
      } else if (borders[f] & DIRS[df]) { disconnect(e, de); changed = true; }
    }
    return changed;
  };
  const equivalentEdges = () => {
    let changed = false;
    for (let i = 0; i < wh; i++) {
      if (clue[i] < 1 || clue[i] > 3) continue;
      let on = 0, off = 0;
      if (clue[i] === 2) for (let d = 0; d < 4; d++) {
        if (disconnected(i, d)) on++; else if (connected(i, nb(i, d))) off++;
      }
      for (let dj = 0; dj < 4; dj++) {
        if (!maybe(i, dj)) continue;
        const j = nb(i, dj);
        for (let dk = dj + 1; dk < 4; dk++) {
          if (!maybe(i, dk)) continue;
          const kk = nb(i, dk);
          if (!connected(j, kk)) continue;
          if (on + 2 > clue[i]) { connect(i, j); connect(i, kk); changed = true; }
          else if (off + 2 > 4 - clue[i]) { disconnect(i, dj); disconnect(i, dk); changed = true; }
        }
      }
    }
    return changed;
  };
  // Седьмой вывод (свой): в двух областях одна и та же напечатанная цифра — между ними граница.
  const digitsApart = () => {
    let changed = false;
    for (let i = 0; i < wh; i++) for (let d = 0; d < 4; d++) {
      if (!maybe(i, d)) continue;
      if ((digits[find(i)] & digits[find(nb(i, d))]) === 0) continue;
      disconnect(i, d); changed = true;
    }
    return changed;
  };

  let passes = 0, byDigits = 0;
  for (let guard = 0; guard < wh * 8; guard++) {
    let changed = false;
    changed = numberExhausted() || changed;
    changed = notTooBig() || changed;
    changed = notTooSmall() || changed;
    changed = noDanglingEdges() || changed;
    changed = equivalentEdges() || changed;
    if (givens && digitsApart()) { changed = true; byDigits++; }
    if (!changed) break;
    passes++;
  }

  // Решено, если границы сами делят доску на области ровно по k, подсказки сходятся, лишних границ нет.
  const p2 = Int32Array.from({ length: wh }, (_, i) => i);
  const f2 = (i: number): number => { while (p2[i] !== i) { p2[i] = p2[p2[i]]; i = p2[i]; } return i; };
  for (let i = 0; i < wh; i++) {
    if (i % N + 1 < N && !(borders[i] & R)) p2[f2(i + 1)] = f2(i);
    if (i + N < wh && !(borders[i] & D)) p2[f2(i + N)] = f2(i);
  }
  const cnt = new Map<number, number>();
  for (let i = 0; i < wh; i++) cnt.set(f2(i), (cnt.get(f2(i)) ?? 0) + 1);
  let ok = [...cnt.values()].every((v) => v === k);
  for (let i = 0; ok && i < wh; i++) {
    if (clue[i] >= 0 && bitcount(borders[i]) !== clue[i]) ok = false;
    if (i % N + 1 < N && (borders[i] & R) && f2(i) === f2(i + 1)) ok = false;
    if (i + N < wh && (borders[i] & D) && f2(i) === f2(i + N)) ok = false;
  }
  if (!ok) return { regions: null, passes, byDigits };
  const ids = new Map<number, number>();
  const regions = Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => {
    const root = f2(r * N + c);
    if (!ids.has(root)) ids.set(root, ids.size);
    return ids.get(root)!;
  }));
  return { regions, passes, byDigits };
}

/** Те же ли области (номера областей могут отличаться). */
export function samePartition(a: number[][], b: number[][]): boolean {
  const map = new Map<number, number>(), back = new Map<number, number>();
  for (let r = 0; r < a.length; r++) for (let c = 0; c < a.length; c++) {
    const x = a[r][c], y = b[r][c];
    if ((map.has(x) && map.get(x) !== y) || (back.has(y) && back.get(y) !== x)) return false;
    map.set(x, y); back.set(y, x);
  }
  return true;
}
