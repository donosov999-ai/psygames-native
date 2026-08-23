/* psygames-chess-blind-knight · VER 1 · 23.08.2026 */
/**
 * КРАТЧАЙШИЙ МАРШРУТ КОНЯ — СВОЙ ОБХОД В ШИРИНУ ПО 64 КЛЕТКАМ.
 *
 * Здесь чужой библиотеке делать нечего: это граф на 64 вершинах, а не правила
 * шахмат. Обход в ширину по нему — десяток строк, и он же даёт нам главное
 * свойство, на котором держится блок: расстояние считается ПО ПУСТОЙ ДОСКЕ.
 *
 * 🔴 ФИГУРЫ МАРШРУТУ НЕ МЕШАЮТ, И ЭТО НАРОЧНО, А НЕ УПРОЩЕНИЕ. Блок «конь» обязан
 * отличаться от блока «поле» РОВНО НА ОДНО добавленное требование — правило хода
 * коня. Учёт фигур добавил бы ВТОРОЕ: держать в голове ещё и занятость клеток. В
 * разность T₂ − T₁ тогда попадали бы два звена сразу, и назвать её ценой правила
 * хода стало бы нельзя. Позиция при этом на доске стоит — блок 3 замеряет именно
 * её удержание, — но маршрут её не видит.
 *
 * 🔴 ПОЧЕМУ НЕВЕРНЫЙ ОТВЕТ ДАЁТСЯ РАССТОЯНИЕМ N+2, А НЕ N+1.
 * Конь каждым ходом МЕНЯЕТ цвет поля. Значит чётность кратчайшего расстояния
 * жёстко связана с цветом: расстояние чётное ⇔ поля одного цвета. Пара с
 * расстоянием N+1 отличается от пары с расстоянием N чётностью, то есть ЦВЕТОМ, —
 * и вопрос «дойдёт ли за N ходов» решался бы приёмом «чётность суммы координат»,
 * тем самым, который человек только что применял в блоке 1. Блок 2 перестал бы
 * мерить правило хода коня и стал бы вторым замером блока 1, а разность T₂ − T₁
 * схлопнулась бы в шум. При расстоянии N+2 цвет у «да» и «нет» ОДИНАКОВ, подсказка
 * исчезает вовсе, и досчитать маршрут приходится по-настоящему.
 * Связь чётности и цвета проверяется значениями в пробе, а не принимается на веру.
 *
 * ⚠️ ОТСЮДА ЖЕ ПОТОЛОК N = 3. Неверный ответ при N = 4 требует расстояния 6, а на
 * доске 8×8 таких упорядоченных пар ВСЕГО ЧЕТЫРЕ (углы a1↔h8 и a8↔h1). Четыре
 * пары на всю игру запоминаются как картинка за пару прогонов, и вопрос
 * перестаёт быть вопросом.
 */
import { BOARD_SIDE, BOARD_SQUARES, fileOf, rankOf } from './board';

const JUMPS: readonly (readonly [number, number])[] = [
  [1, 2], [2, 1], [2, -1], [1, -2],
  [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];

/** Куда конь может прыгнуть с поля. Пустая доска: занятость клеток не смотрится. */
export function knightMoves(from: number): number[] {
  const file = fileOf(from);
  const rank = rankOf(from);
  const out: number[] = [];
  for (const [df, dr] of JUMPS) {
    const f = file + df;
    const r = rank + dr;
    if (f < 0 || f >= BOARD_SIDE || r < 0 || r >= BOARD_SIDE) continue;
    out.push(r * BOARD_SIDE + f);
  }
  return out;
}

/** Расстояния от поля до всех 64 клеток. Обход в ширину, один проход. */
export function knightDistances(from: number): number[] {
  const dist = new Array<number>(BOARD_SQUARES).fill(-1);
  dist[from] = 0;
  const queue: number[] = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const square = queue[head];
    for (const next of knightMoves(square)) {
      if (dist[next] >= 0) continue;
      dist[next] = dist[square] + 1;
      queue.push(next);
    }
  }
  return dist;
}

/** За сколько ходов конь дойдёт с `from` на `to` по пустой доске. */
export function knightDistance(from: number, to: number): number {
  return knightDistances(from)[to];
}

/**
 * Сам маршрут — для разбора после ответа: показать, что дойти и правда можно.
 * Первый элемент — `from`, последний — `to`; длина пути на единицу больше числа ходов.
 */
export function knightPath(from: number, to: number): number[] {
  const dist = knightDistances(from);
  const path: number[] = [to];
  let cursor = to;
  while (cursor !== from) {
    const step = knightMoves(cursor).find((sq) => dist[sq] === dist[cursor] - 1);
    if (step === undefined) throw new Error(`Маршрута нет: ${from} → ${to}`);
    cursor = step;
    path.push(cursor);
  }
  return path.reverse();
}

/** Все поля, до которых от `from` ровно `steps` ходов. */
export function squaresAtDistance(from: number, steps: number): number[] {
  const dist = knightDistances(from);
  const out: number[] = [];
  for (let i = 0; i < BOARD_SQUARES; i += 1) if (dist[i] === steps) out.push(i);
  return out;
}

/**
 * Пара полей с заданным расстоянием. Сначала берётся начало, потом конец из тех,
 * что и правда стоят на нужном расстоянии, — поэтому «не нашлось» здесь означает
 * только одно: пар с таким расстоянием на доске нет вовсе.
 */
export function pairAtDistance(
  steps: number,
  random: () => number,
): { from: number; to: number } | null {
  const starts = shuffledSquares(random);
  for (const from of starts) {
    const targets = squaresAtDistance(from, steps);
    if (targets.length === 0) continue;
    return { from, to: targets[Math.floor(random() * targets.length) % targets.length] };
  }
  return null;
}

function shuffledSquares(random: () => number): number[] {
  const all = Array.from({ length: BOARD_SQUARES }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

/** Сколько упорядоченных пар на доске имеют такое расстояние. Считается, не помнится. */
export function pairsAtDistanceCount(steps: number): number {
  let total = 0;
  for (let from = 0; from < BOARD_SQUARES; from += 1) total += squaresAtDistance(from, steps).length;
  return total;
}
