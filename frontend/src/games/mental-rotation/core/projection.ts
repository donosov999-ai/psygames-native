/* psygames-mental-rotation-projection · VER 1 · 23.08.2026 */
/**
 * ПРОЕКЦИЯ: «КАК ЭТА ФИГУРА ВЫГЛЯДИТ СВЕРХУ».
 *
 * Правильный ответ здесь не рисуется руками и не подбирается на глаз: это
 * ВЫЧИСЛЕННОЕ множество клеток, занятых кубиками вдоль оси взгляда. Одна и та же
 * функция даёт и правильный вариант, и раскладку для отрисовки — иначе верный
 * ответ оказался бы на экране повёрнутым, и правым был бы вариант-подделка.
 *
 * 🔴 ПОДДЕЛКИ ОБЯЗАНЫ БЫТЬ ПРАВДОПОДОБНЫМИ. Случайный узор из клеток отсекается
 * взглядом за полсекунды: задание превращается в «найди непохожее» и перестаёт
 * измерять пространственное мышление. Поэтому неверные варианты — это ровно то,
 * что человек и правда путает:
 *   · проекция ТОЙ ЖЕ фигуры вдоль ДРУГОЙ оси (перепутал вид сверху с видом сбоку);
 *   · проекция фигуры, у которой ОДИН кубик переставлен (не досчитал ряд).
 *
 * ⚠️ КАЖДАЯ ПОДДЕЛКА СВЕРЯЕТСЯ С ПРАВИЛЬНЫМ ОТВЕТОМ. Проекция вдоль другой оси
 * запросто СОВПАДАЕТ с правильной (у симметричной фигуры вид сверху и вид сбоку
 * бывают одинаковы), а переставленный кубик может спрятаться за соседним и не
 * изменить проекцию вовсе. Вариант, совпавший с правильным, — это второй верный
 * ответ на экране; поэтому он не отбрасывается «на всякий случай», а именно
 * ловится сравнением множеств клеток.
 */
import { pick, shuffle } from './rng';
import { isVolumetric, shapesOfSize } from './shapes';
import type { Cell2D, ProjectionOption, ProjectionTask, ProjectionView, Rng, Shape } from './types';

export const PROJECTION_VIEWS: readonly ProjectionView[] = ['top', 'front', 'side'];

/**
 * Клетка, в которую попадает кубик при взгляде вдоль оси.
 *
 * Ось экрана: y — вверх, x — вправо, z — на зрителя (та же изометрия, что в
 * отрисовке). Отсюда:
 *   сверху  — смотрим вниз вдоль Y: вправо x, вниз по экрану z (ближнее — ниже);
 *   спереди — смотрим вдоль Z: вправо x, вниз −y;
 *   справа  — смотрим вдоль X: вправо −z, вниз −y.
 */
function cellOf(view: ProjectionView, [x, y, z]: [number, number, number]): Cell2D {
  if (view === 'top') return { col: x, row: z };
  if (view === 'front') return { col: x, row: -y };
  return { col: -z, row: -y };
}

/** Отпечаток сетки: порядок клеток ничего не значит, поэтому сортируем. */
export function gridKey(cells: Cell2D[]): string {
  return cells.map((c) => `${c.col},${c.row}`).sort().join('|');
}

export function sameGrid(a: Cell2D[], b: Cell2D[]): boolean {
  return gridKey(a) === gridKey(b);
}

/** Проекция фигуры: множество занятых клеток, сдвинутое в неотрицательный угол. */
export function projectShape(shape: Shape, view: ProjectionView): Cell2D[] {
  const raw = shape.map((c) => cellOf(view, c));
  if (raw.length === 0) return [];
  const minCol = Math.min(...raw.map((c) => c.col));
  const minRow = Math.min(...raw.map((c) => c.row));
  const seen = new Set<string>();
  const out: Cell2D[] = [];
  for (const c of raw) {
    const cell = { col: c.col - minCol, row: c.row - minRow };
    const key = `${cell.col},${cell.row}`;
    if (seen.has(key)) continue;    // за передним кубиком стоит задний — клетка одна
    seen.add(key);
    out.push(cell);
  }
  return out.sort((p, q) => (p.row - q.row) || (p.col - q.col));
}

export function gridSize(cells: Cell2D[]): { cols: number; rows: number } {
  if (cells.length === 0) return { cols: 1, rows: 1 };
  return {
    cols: Math.max(...cells.map((c) => c.col)) + 1,
    rows: Math.max(...cells.map((c) => c.row)) + 1,
  };
}

const NEIGHBOURS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

function isConnected(shape: Shape): boolean {
  if (shape.length === 0) return false;
  const keys = new Set(shape.map((c) => c.join(',')));
  const seen = new Set<string>([shape[0].join(',')]);
  const queue = [shape[0]];
  while (queue.length) {
    const [x, y, z] = queue.shift() as [number, number, number];
    for (const [dx, dy, dz] of NEIGHBOURS) {
      const next: [number, number, number] = [x + dx, y + dy, z + dz];
      const key = next.join(',');
      if (!keys.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return seen.size === shape.length;
}

/**
 * Переставить ОДИН кубик на свободное место рядом с фигурой.
 *
 * Фигура остаётся связной и того же размера — она обязана выглядеть как та же
 * самая, иначе подделка отсекается взглядом, а не мышлением. Если после снятия
 * кубика остаток распался, берём другой кубик.
 */
export function moveOneCube(shape: Shape, rng: Rng): Shape | null {
  const order = shuffle(rng, shape.map((_, i) => i));
  for (const idx of order) {
    const rest = shape.filter((_, i) => i !== idx);
    if (!isConnected(rest)) continue;
    const occupied = new Set(rest.map((c) => c.join(',')));
    const spots: Shape = [];
    for (const [x, y, z] of rest) {
      for (const [dx, dy, dz] of NEIGHBOURS) {
        const spot: [number, number, number] = [x + dx, y + dy, z + dz];
        if (occupied.has(spot.join(','))) continue;
        if (spots.some((s) => s.join(',') === spot.join(','))) continue;
        spots.push(spot);
      }
    }
    if (spots.length === 0) continue;
    return [...rest, pick(rng, spots)];
  }
  return null;
}

/**
 * Фигуры для проекции — объёмные. Плоская даёт вид сверху в одну строку: считать
 * там нечего, и вопрос перестаёт быть про пространство. Если объёмных в
 * размерной полосе нет вовсе, берём полосу целиком — партия важнее отбора.
 */
export function projectionCandidates(minCubes: number, maxCubes: number): Shape[] {
  const band = shapesOfSize(minCubes, maxCubes);
  const solid = band.filter(isVolumetric);
  return solid.length > 0 ? solid : band;
}

export interface ProjectionParams {
  minCubes: number;
  maxCubes: number;
  optionCount: number;
}

export function buildProjectionTask(params: ProjectionParams, rng: Rng): ProjectionTask {
  const candidates = projectionCandidates(params.minCubes, params.maxCubes);
  if (candidates.length === 0) throw new Error(`нет фигур размера ${params.minCubes}–${params.maxCubes}`);
  const shape = pick(rng, candidates);
  const view = pick(rng, PROJECTION_VIEWS);
  const correct = projectShape(shape, view);

  const options: ProjectionOption[] = [{ cells: correct, isMatch: true, flaw: 'none' }];
  const taken = new Set<string>([gridKey(correct)]);

  const add = (cells: Cell2D[], flaw: ProjectionOption['flaw']): boolean => {
    if (cells.length === 0) return false;
    const key = gridKey(cells);
    if (taken.has(key)) return false;      // совпало с правильным или с соседней подделкой
    taken.add(key);
    options.push({ cells, isMatch: false, flaw });
    return true;
  };

  // Сначала — вид вдоль другой оси: самая честная путаница из возможных.
  for (const other of shuffle(rng, PROJECTION_VIEWS.filter((v) => v !== view))) {
    if (options.length >= params.optionCount) break;
    add(projectShape(shape, other), 'other-view');
  }

  // Добираем переставленным кубиком. Попытки ограничены: у мелкой фигуры
  // свободных мест немного, и повторы отсеиваются по отпечатку сетки.
  for (let attempt = 0; options.length < params.optionCount && attempt < 60; attempt++) {
    const edited = moveOneCube(shape, rng);
    if (edited) add(projectShape(edited, view), 'edited-shape');
  }

  const mixed = shuffle(rng, options);
  return {
    kind: 'projection',
    shape,
    view,
    options: mixed,
    correctIdx: mixed.findIndex((o) => o.isMatch),
  };
}
