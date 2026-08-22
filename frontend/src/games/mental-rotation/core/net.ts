/* psygames-mental-rotation-net · VER 1 · 23.08.2026 */
/**
 * РАЗВЁРТКА: «КАКОЙ КУБИК СЛОЖИТСЯ ИЗ ЭТОЙ ВЫКРОЙКИ».
 *
 * 🔴 СБОРКА СЧИТАЕТСЯ, А НЕ ПРОПИСЫВАЕТСЯ РУКАМИ. Соблазн был выписать таблицу
 * «клетка креста → грань» и не возиться: выкроек мало, каждую можно сложить в
 * уме. Но выписанная таблица — это место, где опечатку НЕ ВИДНО: «правильный»
 * ответ на экране будет собран не из показанной выкройки, а из соседней, и
 * никакой прогон этого не заметит. Поэтому здесь модель:
 *
 *   кубик КАТИТСЯ по выкройке. Стартует на первой клетке нижней гранью `down`;
 *   переход на соседнюю клетку — перекат через общее ребро; грань, легшая на
 *   клетку, и есть та, в которую эта клетка сложится.
 *
 * Перекат и складывание — одно и то же движение, только в обратную сторону, и
 * именно поэтому катящийся кубик даёт правильное соответствие.
 *
 * ⚠️ ВЫКРОЙКА ПРОВЕРЯЕТСЯ НА СКЛАДЫВАЕМОСТЬ. Из шести связных клеток куб
 * складывается не всегда (35 гексамино, кубов среди них 11). Признак прост и
 * проверяется исполнением: обход обязан накрыть все шесть клеток и раздать им
 * ШЕСТЬ РАЗНЫХ граней. Совпали две — фигура не выкройка куба, и место ей не в
 * задании, а в красном прогоне.
 *
 * 🔴 ПОДДЕЛКИ — ТО, ЧТО ПУТАЮТ, А НЕ ПРОИЗВОЛЬНАЯ РАСКРАСКА:
 *   · ЗЕРКАЛЬНАЯ сборка — три значка стоят в обратном обходе вокруг угла; такой
 *     кубик не совмещается с настоящим НИКАКИМ поворотом;
 *   · ПЕРЕСТАНОВКА двух граней — самый частый промах живого человека.
 *
 * ⚠️ ПОДДЕЛКА СУДИТСЯ ПО ВИДИМОМУ, А НЕ ПО ВСЕМУ КУБУ. На кубике видно три грани
 * из шести, и подделка, отличающаяся только невидимой гранью, с экрана
 * неотличима от правильной — вопрос остался бы без ответа. Поэтому каждый
 * вариант сверяется со ВСЕМИ 24 видимыми тройками настоящего куба, и берётся
 * только тот ракурс, которого у настоящего куба нет.
 */
import {
  allCubeOrientations,
  allVisibleTriples,
  mirrorCube,
  oppositeFace,
  swapFaces,
  visibleTriple,
} from './geometry';
import { pick, shuffle } from './rng';
import { CUBE_FACES, FACE_MARKS } from './types';
import type { CubeFace, CubeNet, FaceMap, FaceMark, NetCell, NetOption, NetTask, Rng } from './types';

/**
 * Выкройки. Все — настоящие развёртки куба; складываемость каждой проверяется
 * прогоном, а не глазами автора (см. шапку).
 */
export const CUBE_NETS: readonly CubeNet[] = [
  // латинский крест: 1–4–1 по вертикали
  { id: 'cross', cells: [{ col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 1, row: 2 }, { col: 1, row: 3 }] },
  // 1–4–1: полоса из четырёх, по клетке сверху и снизу над разными столбцами
  { id: 'strip-mid', cells: [{ col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 }, { col: 2, row: 2 }] },
  { id: 'strip-ends', cells: [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 }, { col: 3, row: 2 }] },
  // 2–3–1 «сапожок»
  { id: 'boot', cells: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 }, { col: 3, row: 2 }] },
  // лесенка 2–2–2
  { id: 'stairs', cells: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 2, row: 2 }, { col: 3, row: 2 }] },
  // 3–3 со сдвигом
  { id: 'double-row', cells: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 2, row: 1 }, { col: 3, row: 1 }, { col: 4, row: 1 }] },
];

export function netCellKey(cell: NetCell): string {
  return `${cell.col},${cell.row}`;
}

/** Ориентация катящегося кубика: какая грань куда смотрит на листе. */
interface RollingCube {
  bottom: CubeFace;   // лежит на клетке — она и станет этой клеткой выкройки
  top: CubeFace;
  north: CubeFace;    // вверх по листу (row − 1)
  south: CubeFace;
  east: CubeFace;     // вправо по листу (col + 1)
  west: CubeFace;
}

const START: RollingCube = {
  bottom: 'down', top: 'up', north: 'back', south: 'front', east: 'right', west: 'left',
};

type RollDir = 'north' | 'south' | 'east' | 'west';

/** Перекат через общее ребро: четыре грани по кругу, две поперечные на месте. */
function roll(o: RollingCube, dir: RollDir): RollingCube {
  if (dir === 'east') return { ...o, bottom: o.east, east: o.top, top: o.west, west: o.bottom };
  if (dir === 'west') return { ...o, bottom: o.west, west: o.top, top: o.east, east: o.bottom };
  if (dir === 'south') return { ...o, bottom: o.south, south: o.top, top: o.north, north: o.bottom };
  return { ...o, bottom: o.north, north: o.top, top: o.south, south: o.bottom };
}

const STEPS: { dir: RollDir; dc: number; dr: number }[] = [
  { dir: 'east', dc: 1, dr: 0 },
  { dir: 'west', dc: -1, dr: 0 },
  { dir: 'south', dc: 0, dr: 1 },
  { dir: 'north', dc: 0, dr: -1 },
];

/**
 * Сложить выкройку: клетка → грань собранного куба.
 * `null` — фигура кубом не складывается (разрыв или две клетки на одной грани).
 */
export function foldNet(net: CubeNet): Map<string, CubeFace> | null {
  if (net.cells.length !== 6) return null;
  const byKey = new Map(net.cells.map((c) => [netCellKey(c), c]));
  if (byKey.size !== 6) return null;                       // две клетки в одном месте

  const faceOfCell = new Map<string, CubeFace>();
  const start = net.cells[0];
  const queue: { cell: NetCell; cube: RollingCube }[] = [{ cell: start, cube: START }];
  faceOfCell.set(netCellKey(start), START.bottom);

  while (queue.length) {
    const { cell, cube } = queue.shift() as { cell: NetCell; cube: RollingCube };
    for (const step of STEPS) {
      const next: NetCell = { col: cell.col + step.dc, row: cell.row + step.dr };
      const key = netCellKey(next);
      if (!byKey.has(key) || faceOfCell.has(key)) continue;
      const rolled = roll(cube, step.dir);
      faceOfCell.set(key, rolled.bottom);
      queue.push({ cell: next, cube: rolled });
    }
  }

  if (faceOfCell.size !== 6) return null;                  // выкройка распалась на куски
  if (new Set(faceOfCell.values()).size !== 6) return null; // две клетки легли на одну грань
  return faceOfCell;
}

export interface AssembledNet {
  faceOfCell: Map<string, CubeFace>;
  markOfCell: Record<string, FaceMark>;
  cube: FaceMap;
}

/** Раздать значки клеткам выкройки и получить куб, который из неё складывается. */
export function assembleNet(net: CubeNet, marks: readonly FaceMark[]): AssembledNet {
  const faceOfCell = foldNet(net);
  if (!faceOfCell) throw new Error(`выкройка «${net.id}» кубом не складывается`);
  if (marks.length !== 6 || new Set(marks).size !== 6) throw new Error('нужно шесть РАЗНЫХ значков');

  const markOfCell: Record<string, FaceMark> = {};
  const cube = {} as FaceMap;
  net.cells.forEach((cell, i) => {
    const key = netCellKey(cell);
    const mark = marks[i] as FaceMark;
    markOfCell[key] = mark;
    cube[faceOfCell.get(key) as CubeFace] = mark;
  });
  return { faceOfCell, markOfCell, cube };
}

/** Соседние (не противоположные) грани — перестановка именно их и путается. */
function adjacentPairs(): [CubeFace, CubeFace][] {
  const pairs: [CubeFace, CubeFace][] = [];
  for (let i = 0; i < CUBE_FACES.length; i++) {
    for (let j = i + 1; j < CUBE_FACES.length; j++) {
      const a = CUBE_FACES[i] as CubeFace;
      const b = CUBE_FACES[j] as CubeFace;
      if (oppositeFace(a) !== b) pairs.push([a, b]);
    }
  }
  return pairs;
}

export interface NetParams { optionCount: number }

export function buildNetTask(params: NetParams, rng: Rng): NetTask {
  const net = pick(rng, CUBE_NETS as CubeNet[]);
  const marks = shuffle(rng, FACE_MARKS);
  const { markOfCell, cube } = assembleNet(net, marks);

  const legal = allVisibleTriples(cube);
  const options: NetOption[] = [];
  const shown = new Set<string>();

  /** Ракурс настоящего куба: любой из 24 — он законен по построению. */
  const truthful = pick(rng, allCubeOrientations(cube));
  options.push({ faces: truthful, isMatch: true, flaw: 'none' });
  shown.add(visibleTriple(truthful));

  /**
   * Подделка берётся только в том ракурсе, которого у настоящего куба НЕТ.
   * Перестановка двух граней оставляет часть углов нетронутыми: взятый вслепую
   * ракурс такого кубика бывает законным видом настоящего — и на экране
   * оказалось бы два правильных ответа.
   */
  const addFrom = (spoiled: FaceMap, flaw: NetOption['flaw']): boolean => {
    for (const cand of shuffle(rng, allCubeOrientations(spoiled))) {
      const triple = visibleTriple(cand);
      if (legal.has(triple) || shown.has(triple)) continue;
      shown.add(triple);
      options.push({ faces: cand, isMatch: false, flaw });
      return true;
    }
    return false;
  };

  addFrom(mirrorCube(cube), 'mirror');
  for (const [a, b] of shuffle(rng, adjacentPairs())) {
    if (options.length >= params.optionCount) break;
    addFrom(swapFaces(cube, a, b), 'swap');
  }

  const mixed = shuffle(rng, options);
  return {
    kind: 'net',
    net,
    markOfCell,
    cube,
    options: mixed,
    correctIdx: mixed.findIndex((o) => o.isMatch),
  };
}

/** Габарит выкройки — нужен отрисовке, чтобы вписать её в квадрат. */
export function netSize(net: CubeNet): { cols: number; rows: number } {
  return {
    cols: Math.max(...net.cells.map((c) => c.col)) + 1,
    rows: Math.max(...net.cells.map((c) => c.row)) + 1,
  };
}
