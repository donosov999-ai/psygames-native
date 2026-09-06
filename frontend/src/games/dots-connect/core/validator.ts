/* psygames-dots-connect-validator · VER 1 · 19.08.2026 */
import { cellKey, isAdjacent, isInBounds, sameCell } from './grid';
import type {
  Cell,
  DotsPaths,
  DotsPuzzle,
  SolutionValidation,
} from './types';

function endpointsMatch(path: readonly Cell[], endpoints: readonly [Cell, Cell]): boolean {
  const first = path[0];
  const last = path[path.length - 1];
  if (!first || !last) return false;
  return (sameCell(first, endpoints[0]) && sameCell(last, endpoints[1]))
    || (sameCell(first, endpoints[1]) && sameCell(last, endpoints[0]));
}

export function validateDotsSolution(
  puzzle: DotsPuzzle,
  paths: DotsPaths,
): SolutionValidation {
  const issues: string[] = [];
  const occupied = new Map<string, string>();
  const validPairIds = new Set(puzzle.pairs.map((pair) => pair.id));
  const endpointOwners = new Map<string, string>();
  for (const pair of puzzle.pairs) {
    for (const endpoint of pair.endpoints) endpointOwners.set(cellKey(endpoint), pair.id);
  }

  for (const pairId of Object.keys(paths)) {
    if (!validPairIds.has(pairId)) issues.push(`unknown pair ${pairId}`);
  }

  for (const pair of puzzle.pairs) {
    const path = paths[pair.id];
    if (!path || path.length < 2) {
      issues.push(`pair ${pair.id} is not connected`);
      continue;
    }
    if (!endpointsMatch(path, pair.endpoints)) {
      issues.push(`pair ${pair.id} has wrong endpoints`);
    }
    for (let index = 0; index < path.length; index += 1) {
      const cell = path[index] as Cell;
      const key = cellKey(cell);
      if (!isInBounds(cell, puzzle.size)) issues.push(`pair ${pair.id} leaves the board at ${key}`);
      if (index > 0 && !isAdjacent(path[index - 1] as Cell, cell)) {
        issues.push(`pair ${pair.id} jumps before ${key}`);
      }
      const endpointOwner = endpointOwners.get(key);
      if (endpointOwner && endpointOwner !== pair.id) {
        issues.push(`pair ${pair.id} enters endpoint of ${endpointOwner}`);
      }
      const priorOwner = occupied.get(key);
      if (priorOwner) issues.push(`cell ${key} is shared by ${priorOwner} and ${pair.id}`);
      else occupied.set(key, pair.id);
    }
    /**
     * 🔴 ПУТЬ НЕ КАСАЕТСЯ САМ СЕБЯ — ЭТО И ЕСТЬ ЕДИНСТВЕННОСТЬ РЕШЕНИЯ.
     *
     * 📍 ЗАМЕР 06.09.2026, независимый перебор всех решений: без этого правила
     * L7, L8, L9 решались НЕСКОЛЬКИМИ способами (игра засчитывала победу на
     * разных ответах), а на 8×8 и выше перебор не успевал даже сосчитать. С
     * правилом — ровно одно решение на восьми уровнях из девяти проверенных.
     *
     * ⚠️ ПРАВИЛО ОБЯЗАНО СТОЯТЬ С ОБЕИХ СТОРОН. Генератор режет путь на
     * самонепересекающиеся куски (`самонепересекающийсяРазрез`), но пока игроку
     * разрешено прижимать линию к себе, у него остаются лишние маршруты — и
     * задача снова угадывается, а не выводится. Одна половина без второй не
     * работает: замер с правилом только в генераторе дал те же ≥2 решения.
     */
    for (let i = 0; i < path.length; i += 1) {
      for (let j = i + 2; j < path.length; j += 1) {
        if (isAdjacent(path[i] as Cell, path[j] as Cell)) {
          issues.push(`pair ${pair.id} touches itself at ${cellKey(path[i] as Cell)}`);
          i = path.length; break;   // одного сообщения на пару достаточно
        }
      }
    }
  }

  const totalCells = puzzle.size * puzzle.size;
  if (occupied.size !== totalCells) {
    issues.push(`coverage ${occupied.size}/${totalCells}`);
  }
  return {
    valid: issues.length === 0,
    complete: issues.length === 0 && occupied.size === totalCells,
    coveredCells: occupied.size,
    totalCells,
    issues,
  };
}
