import { cellKey } from './grid';
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
