/* psygames-dots-connect-orders · VER 2 · 22.08.2026 */
import { cellKey } from './grid';
import { randomInt, type Rng } from './rng';
import type { Cell } from './types';

function transformCell(cell: Cell, size: number, rotation: number, reflect: boolean): Cell {
  let row = cell.row;
  let col = reflect ? size - 1 - cell.col : cell.col;
  for (let turn = 0; turn < rotation; turn += 1) {
    [row, col] = [col, size - 1 - row];
  }
  return { row, col };
}

export function transformOrder(
  order: readonly Cell[],
  size: number,
  transformIndex: number,
): Cell[] {
  const rotation = ((transformIndex % 4) + 4) % 4;
  const reflect = Math.floor(transformIndex / 4) % 2 === 1;
  return order.map((cell) => transformCell(cell, size, rotation, reflect));
}

export function serpentineOrder(size: number): Cell[] {
  const cells: Cell[] = [];
  for (let row = 0; row < size; row += 1) {
    if (row % 2 === 0) {
      for (let col = 0; col < size; col += 1) cells.push({ row, col });
    } else {
      for (let col = size - 1; col >= 0; col -= 1) cells.push({ row, col });
    }
  }
  return cells;
}

/** Hamiltonian cycle for even square boards. Last cell is adjacent to first. */
export function hamiltonianCycleOrder(size: number): Cell[] {
  if (size < 2 || size % 2 !== 0) {
    throw new RangeError('Hamiltonian cycle construction requires an even size');
  }
  const cells: Cell[] = [];
  for (let col = 0; col < size; col += 1) cells.push({ row: 0, col });
  for (let row = 1; row < size; row += 1) {
    if (row % 2 === 1) {
      for (let col = size - 1; col >= 1; col -= 1) cells.push({ row, col });
    } else {
      for (let col = 1; col < size; col += 1) cells.push({ row, col });
    }
  }
  for (let row = size - 1; row >= 1; row -= 1) cells.push({ row, col: 0 });
  return cells;
}

export function rotateOrder(order: readonly Cell[], offset: number): Cell[] {
  if (order.length === 0) return [];
  const normalized = ((offset % order.length) + order.length) % order.length;
  return [...order.slice(normalized), ...order.slice(0, normalized)];
}

function uniqueOrders(orders: readonly Cell[][]): Cell[][] {
  const seen = new Set<string>();
  const result: Cell[][] = [];
  for (const order of orders) {
    const key = order.map(cellKey).join('|');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(order);
    }
  }
  return result;
}

/** Candidate traversals understood by the public-endpoint solver. */
export function enumerateConstructionOrders(size: number): Cell[][] {
  const candidates: Cell[][] = [];
  const snake = serpentineOrder(size);
  for (let transform = 0; transform < 8; transform += 1) {
    const transformed = transformOrder(snake, size, transform);
    candidates.push(transformed, [...transformed].reverse());
  }
  if (size % 2 === 0) {
    const cycle = hamiltonianCycleOrder(size);
    for (let transform = 0; transform < 8; transform += 1) {
      const transformed = transformOrder(cycle, size, transform);
      for (let offset = 0; offset < transformed.length; offset += 1) {
        const rotated = rotateOrder(transformed, offset);
        candidates.push(rotated, [...rotated].reverse());
      }
    }
  }
  return uniqueOrders(candidates);
}

/**
 * СЛУЧАЙНЫЙ ГАМИЛЬТОНОВ ПУТЬ ПО СЕТКЕ — «ЗМЕЯ», КОТОРУЮ РАСТРЯСЛИ.
 *
 * 🔴 ЧТО БЫЛО СЛОМАНО. Раскладки строились из ДВУХ заготовок: змейка по строкам
 * (нечётные доски) и один и тот же гамильтонов цикл (чётные), к которым
 * применялись поворот, отражение и сдвиг. Восемь поворотов на две заготовки — и
 * весь запас разнообразия. Разрезанная на куски змейка даёт пары, чьи концы
 * почти всегда лежат в одной строке или в соседних: планировать там нечего,
 * путь угадывается по прямой. Замер 22.08.2026: на доске 4×4 три пары, и одна
 * из них накрывала половину клеток одной горизонталью.
 *
 * ЧЕМ ЗАМЕНЕНО. «Backbite» (перекус хвоста) — стандартный способ получить
 * СЛУЧАЙНЫЙ гамильтонов путь без перебора с возвратом и без единого шанса
 * получить невалидный результат:
 *   1. берём заведомо гамильтонов путь (та же змейка);
 *   2. смотрим на один из его концов и на случайного соседа этого конца по СЕТКЕ;
 *   3. сосед обязательно лежит где-то в пути — разворачиваем кусок пути между
 *      концом и соседом. Ребро «конец—сосед» появляется, ребро внутри пути
 *      исчезает, длина и полнота покрытия не меняются НИКОГДА.
 * Каждый шаг O(n), путь остаётся гамильтоновым по построению, а после ~12n шагов
 * от исходной змейки не остаётся ничего узнаваемого.
 *
 * ⚠️ ПОЧЕМУ НЕ ПОИСК С ВОЗВРАТОМ. Случайный DFS по сетке 10×10 иногда уходит в
 * миллионы шагов и требует лимита, а лимит означает «иногда уровень не
 * соберётся». Здесь отказа не бывает вовсе.
 */
export function randomHamiltonianPath(size: number, rng: Rng, steps?: number): Cell[] {
  const path = serpentineOrder(size);
  const total = path.length;
  if (total < 3) return path;
  // Позиция клетки в пути: без неё каждый шаг стоил бы O(n) на поиск соседа.
  const positionOf = new Int32Array(total);
  const cellIndex = (cell: Cell) => cell.row * size + cell.col;
  for (let i = 0; i < total; i += 1) positionOf[cellIndex(path[i] as Cell)] = i;

  const reverse = (from: number, to: number) => {
    let left = from;
    let right = to;
    while (left < right) {
      const swap = path[left] as Cell;
      path[left] = path[right] as Cell;
      path[right] = swap;
      positionOf[cellIndex(path[left] as Cell)] = left;
      positionOf[cellIndex(path[right] as Cell)] = right;
      left += 1;
      right -= 1;
    }
    if (left === right) positionOf[cellIndex(path[left] as Cell)] = left;
  };

  const shakes = steps ?? Math.max(240, total * 12);
  const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
  for (let shake = 0; shake < shakes; shake += 1) {
    const fromHead = rng() < 0.5;
    const end = path[fromHead ? 0 : total - 1] as Cell;
    const delta = deltas[randomInt(rng, 0, 3)] as readonly [number, number];
    const row = end.row + delta[0];
    const col = end.col + delta[1];
    if (row < 0 || col < 0 || row >= size || col >= size) continue;
    const at = positionOf[row * size + col] as number;
    if (fromHead) {
      // Сосед уже стоит следом за концом — ребро есть, разворачивать нечего.
      if (at <= 1) continue;
      reverse(0, at - 1);
    } else {
      if (at >= total - 2) continue;
      reverse(at + 1, total - 1);
    }
  }
  return path;
}
