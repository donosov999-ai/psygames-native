/* counting/ladderWork · VER 1 · 06.09.2026 */
/**
 * Метрика «работа поиска» для замеров лестницы «Состав числа».
 * ЕДИНСТВЕННАЯ реализация — её импортируют оба замерных инструмента:
 * counting-chat/sim-ladder.mjs (отчёт+гейт) и src/__tests__/number-bonds-ladder.test.ts (гейт).
 * Приложение её НЕ использует (она о том, как трудно человеку, а не как играть).
 *
 * Модель (зафиксирована замером старой лестницы 06.09.2026, реф counting-chat §2):
 * перебор подмножеств фишек от коротких к длинным, внутри размера случайно;
 * для размера k с N_k кандидатами и S_k решениями ожидание проверок до первого
 * попадания = (N_k+1)/(S_k+1); решений размера k нет — платит все N_k и идёт
 * дальше. Цена проверки = (k−1) сложений × (1 + 0,5·переносы через десяток).
 * Абсолютных секунд не выдаёт — только отношения; масштаб задаёт живой якорь.
 */
import type { BondsPuzzle } from './numberBondsLadder';

function* combos(arr: number[], k: number, start = 0, acc: number[] = []): Generator<number[]> {
  if (acc.length === k) { yield acc; return; }
  for (let i = start; i <= arr.length - (k - acc.length); i++) {
    yield* combos(arr, k, i + 1, [...acc, arr[i]]);
  }
}

function carries(vals: number[]): number {
  let run = 0, c = 0;
  for (const v of vals) { if (run % 10 + v % 10 >= 10) c++; run += v; }
  return c;
}

/** Ожидаемая работа поиска решения одной задачи (maxSize — до какого размера ищем). */
export function puzzleWork(p: BondsPuzzle, maxSize: number): number {
  let work = 0, found = false;
  for (let k = 2; k <= maxSize && !found; k++) {
    let Nk = 0, Sk = 0, addW = 0;
    for (const c of combos(p.chips, k)) {
      Nk++;
      addW += (k - 1) * (1 + 0.5 * carries(c));
      if (c.reduce((a, b) => a + b, 0) === p.target) Sk++;
    }
    const mean = Nk ? addW / Nk : 0;
    if (Sk > 0) { work += ((Nk + 1) / (Sk + 1)) * mean; found = true; }
    else work += Nk * mean;
  }
  return work;
}

/** Детерминированный PRNG для проб (mulberry32) — гейт не должен мигать от сида. */
export function seededRnd(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
