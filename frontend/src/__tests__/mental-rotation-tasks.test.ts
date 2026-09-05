/* psygames-mental-rotation-tasks-gate · VER 1 · 23.08.2026 */
/**
 * ГЕОМЕТРИЯ ТРЁХ ЗАДАНИЙ ДОКАЗЫВАЕТСЯ, А НЕ РИСУЕТСЯ НА ГЛАЗ.
 *
 * 🔴 ЧЕМ ОПАСНЫ ИМЕННО ЭТИ ТРИ ЗАДАНИЯ. Ошибка в пространственной задаче не
 * выглядит ошибкой: экран рисуется, варианты нажимаются, партия засчитывается —
 * а верный ответ при этом не верен. Три способа соврать, каждый из которых уже
 * ловился здесь руками:
 *   · проекция посчитана вдоль ДРУГОЙ оси (вид сверху нарисован как вид сбоку);
 *   · зеркальная сборка помечена правильной («его же можно повернуть» — нельзя);
 *   · разбор доводит эталон не до того варианта, который назван ответом.
 * Ни один обычный прогон этого не заметит: типы сходятся, исключений нет.
 *
 * ⚠️ ПОЭТОМУ ПРОВЕРКИ СЧИТАЮТ САМИ, А НЕ СПРАШИВАЮТ МОДУЛЬ. Проба, которая
 * сверяет ответ модуля с ответом того же модуля, зелена при любой поломке: сломай
 * `projectShape` — и «правильный вариант равен проекции» останется верным, потому
 * что обе стороны равенства поехали вместе. Здесь у проверок СВОЯ арифметика:
 * свои матрицы поворота, своё определение проекции, свой перебор 24 ориентаций.
 * Совпасть они с модулем обязаны по СМЫСЛУ, а не по общему коду.
 *
 * ⚠️ И ПОЭТОМУ ЖЕ ПРОБЫ ГОНЯЮТСЯ ПО СЕМЕНАМ, А НЕ ПО ОДНОМУ ПРИМЕРУ. Подделка,
 * совпавшая с правильным ответом, — событие редкое: один пример её не поймает, а
 * человек в бою поймает обязательно. Каждая проверка ниже прогоняет сотни проб и
 * называет семя, на котором сломалась.
 *
 * ⚠️ ЧТО ЗДЕСЬ НЕ ПРОВЕРЯЕТСЯ. Вёрстка. Ни один тест не смотрит в исходник
 * экрана регуляркой: «слово в файле» уже трижды в этом проекте держало гейт
 * зелёным при сломанной механике. Исключение одно и оговорённое — поиск
 * ВЫЗОВОВ ключей словаря (мёртвый ключ иначе не поймать), и там комментарии
 * срезаются, а сам срез проверяется отдельной пробой.
 */
import {
  allCubeOrientations,
  allOrientations,
  allVisibleTriples,
  angleResponseSlope,
  assembleNet,
  buildNetTask,
  buildProjectionTask,
  buildRotationTask,
  buildTask,
  CUBE_NETS,
  faceKey,
  FACE_MARKS,
  foldNet,
  getMentalRotationStrings,
  gridKey,
  isChiral,
  KIND_UNLOCK,
  levelParams,
  meanSlopeRt,
  MENTAL_ROTATION_LOCALES,
  MIN_ROTATION_SHARE,
  mirrorCube,
  mirrorShape,
  netCellKey,
  planTaskKinds,
  projectShape,
  rotationReplay,
  SHAPE_LIBRARY,
  shapeKey,
  slopeSamples,
  taskKindCounts,
  createRng,
  type Cell2D,
  type CubeFace,
  type CubeNet,
  type FaceMap,
  type MentalRotationLocale,
  type ProjectionTask,
  type ProjectionView,
  type RotationTask,
  type NetTask,
  type Shape,
  type TrialRecord,
} from '@/src/games/mental-rotation/core';

declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync, existsSync } = require('fs');
const { join } = require('path');

const SRC = join(__dirname, '..');
const APP = join(__dirname, '../../app');
const read = (p: string): string => readFileSync(p, 'utf8') as string;

// ─────────────────────── СВОЯ АРИФМЕТИКА ПРОВЕРОК ───────────────────────
// Ниже — независимая от модуля геометрия. Она короткая нарочно: её можно
// прочитать глазами и убедиться, что это и есть определение из учебника.

type Vec = [number, number, number];

/** Поворот на 90°: правая тройка осей, y — вверх. Выписано по определению. */
const turn = {
  x: ([x, y, z]: Vec): Vec => [x, -z, y],
  y: ([x, y, z]: Vec): Vec => [z, y, -x],
  z: ([x, y, z]: Vec): Vec => [-y, x, z],
};

function ownNormalize(shape: Vec[]): Vec[] {
  const mx = Math.min(...shape.map((c) => c[0]));
  const my = Math.min(...shape.map((c) => c[1]));
  const mz = Math.min(...shape.map((c) => c[2]));
  return shape.map(([x, y, z]) => [x - mx, y - my, z - mz] as Vec);
}

function ownKey(shape: Vec[]): string {
  return ownNormalize(shape).map((c) => c.join(',')).sort().join('|');
}

function ownTurn(shape: Vec[], axis: 'x' | 'y' | 'z', times = 1): Vec[] {
  let out = shape;
  for (let i = 0; i < times; i++) out = out.map(turn[axis]);
  return out;
}

/** Все ориентации перебором Rx^a·Ry^b·Rz^c — вся группа вращений куба. */
function ownOrientationKeys(shape: Vec[]): Set<string> {
  const keys = new Set<string>();
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      for (let c = 0; c < 4; c++) {
        keys.add(ownKey(ownTurn(ownTurn(ownTurn(shape, 'x', a), 'y', b), 'z', c)));
      }
    }
  }
  return keys;
}

const ownIsRotation = (a: Vec[], b: Vec[]): boolean => ownOrientationKeys(b).has(ownKey(a));

/**
 * СВОЁ определение проекции — то самое, ради которого задание и заведено:
 * «клетка занята, если вдоль оси взгляда стоит хотя бы один кубик».
 *   сверху — вдоль Y, на плоскости остаются (x, z);
 *   спереди — вдоль Z, остаются (x, −y);
 *   справа — вдоль X, остаются (−z, −y).
 */
function ownProjectionKey(shape: Vec[], view: ProjectionView): string {
  const flat = shape.map(([x, y, z]) => {
    if (view === 'top') return [x, z];
    if (view === 'front') return [x, -y];
    return [-z, -y];
  });
  const minA = Math.min(...flat.map((c) => c[0]));
  const minB = Math.min(...flat.map((c) => c[1]));
  return [...new Set(flat.map(([a, b]) => `${a - minA},${b - minB}`))].sort().join('|');
}

const cellsKey = (cells: Cell2D[]): string =>
  [...new Set(cells.map((c) => `${c.col},${c.row}`))].sort().join('|');

/** Все фигуры, получаемые переносом РОВНО одного кубика на свободное соседнее место. */
function oneCubeMoves(shape: Vec[]): Vec[][] {
  const near: Vec[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const out: Vec[][] = [];
  shape.forEach((_, i) => {
    const rest = shape.filter((__, j) => j !== i);
    const busy = new Set(rest.map((c) => c.join(',')));
    for (const [x, y, z] of rest) {
      for (const [dx, dy, dz] of near) {
        const spot: Vec = [x + dx, y + dy, z + dz];
        if (busy.has(spot.join(','))) continue;
        out.push([...rest, spot]);
      }
    }
  });
  return out;
}

/** Связность по граням — чтобы «фигура» не оказалась двумя кусками. */
function isConnected(shape: Vec[]): boolean {
  const keys = new Set(shape.map((c) => c.join(',')));
  const seen = new Set([shape[0].join(',')]);
  const queue: Vec[] = [shape[0]];
  const near: Vec[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  while (queue.length) {
    const [x, y, z] = queue.shift() as Vec;
    for (const [dx, dy, dz] of near) {
      const k = [x + dx, y + dy, z + dz].join(',');
      if (keys.has(k) && !seen.has(k)) { seen.add(k); queue.push([x + dx, y + dy, z + dz]); }
    }
  }
  return seen.size === shape.length;
}

const OPPOSITE: Record<CubeFace, CubeFace> = {
  up: 'down', down: 'up', front: 'back', back: 'front', right: 'left', left: 'right',
};

const asVecs = (shape: Shape): Vec[] => shape.map((c) => [...c] as Vec);

// ───────────────────────────── библиотека фигур ─────────────────────────────

describe('библиотека фигур', () => {
  it('есть что проверять — иначе прогон зелен вслепую', () => {
    expect(SHAPE_LIBRARY.length).toBeGreaterThanOrEqual(10);
  });

  it('🔴 каждая фигура связна по граням', () => {
    const broken = SHAPE_LIBRARY
      .map((s, i) => ({ i, ok: isConnected(asVecs(s)) }))
      .filter((r) => !r.ok)
      .map((r) => `фигура ${r.i} распадается на куски`);
    expect(broken).toEqual([]);
  });

  /**
   * Две фигуры, оказавшиеся поворотами друг друга, сделали бы отвлекающий
   * вариант «другая фигура» ВТОРЫМ ВЕРНЫМ ответом.
   */
  it('🔴 никакие две фигуры не являются поворотами друг друга', () => {
    const clashes: string[] = [];
    for (let i = 0; i < SHAPE_LIBRARY.length; i++) {
      for (let j = i + 1; j < SHAPE_LIBRARY.length; j++) {
        if (SHAPE_LIBRARY[i].length !== SHAPE_LIBRARY[j].length) continue;
        if (ownIsRotation(asVecs(SHAPE_LIBRARY[i]), asVecs(SHAPE_LIBRARY[j]))) clashes.push(`${i} и ${j}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  /**
   * Плоскую фигуру можно перевернуть в пространстве — её зеркало ЯВЛЯЕТСЯ
   * поворотом. Киральную нельзя. Модуль обязан различать эти два случая: на этом
   * держится зеркальный отвлекающий вариант.
   */
  it('🔴 киральность считается верно: плоская фигура зеркалу равна, объёмная — нет', () => {
    const wrong: string[] = [];
    SHAPE_LIBRARY.forEach((shape, i) => {
      const mineSaysChiral = isChiral(shape);
      const trulyChiral = !ownIsRotation(asVecs(shape), asVecs(mirrorShape(shape)));
      if (mineSaysChiral !== trulyChiral) wrong.push(`фигура ${i}: модуль ${mineSaysChiral}, счёт ${trulyChiral}`);
    });
    expect(wrong).toEqual([]);
    // И то и другое в библиотеке есть — иначе проверка выше ничего не различает.
    expect(SHAPE_LIBRARY.some(isChiral)).toBe(true);
    expect(SHAPE_LIBRARY.some((s) => !isChiral(s))).toBe(true);
  });

  it('🔴 перебор ориентаций модуля совпадает со своим счётом', () => {
    const wrong: string[] = [];
    SHAPE_LIBRARY.forEach((shape, i) => {
      const mine = new Set(allOrientations(shape).map(shapeKey));
      const own = ownOrientationKeys(asVecs(shape));
      if (mine.size !== own.size) wrong.push(`фигура ${i}: модуль ${mine.size}, счёт ${own.size}`);
      for (const k of own) if (!mine.has(k)) wrong.push(`фигура ${i}: модуль потерял ориентацию ${k}`);
    });
    expect(wrong).toEqual([]);
  });
});

// ─────────────────────────────── ПРОЕКЦИЯ ───────────────────────────────

describe('задание на проекцию', () => {
  const LEVELS = [3, 4, 6, 8, 11, 13, 15];
  const tasks: { seed: string; task: ProjectionTask }[] = [];
  for (const level of LEVELS) {
    const p = levelParams(level);
    for (let i = 0; i < 40; i++) {
      const seed = `proj-${level}-${i}`;
      tasks.push({
        seed,
        task: buildProjectionTask({ minCubes: p.minC, maxCubes: p.maxC, optionCount: p.optionCount }, createRng(seed)),
      });
    }
  }

  it('есть что проверять — иначе прогон зелен вслепую', () => {
    expect(tasks.length).toBeGreaterThanOrEqual(200);
  });

  it('🔴 правильный вариант РАВЕН множеству проекций кубиков вдоль оси задания', () => {
    const bad: string[] = [];
    for (const { seed, task } of tasks) {
      const correct = task.options[task.correctIdx];
      const own = ownProjectionKey(asVecs(task.shape), task.view);
      if (cellsKey(correct.cells) !== own) {
        bad.push(`${seed}: вид «${task.view}» — вариант ${cellsKey(correct.cells)}, счёт ${own}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  /**
   * ⚠️ И ОБРАТНАЯ СТОРОНА: правильный вариант не должен совпадать с проекцией
   * вдоль ДРУГОЙ оси случайно. Если совпал — на экране два верных ответа, и это
   * ловится следующей пробой; здесь же проверяется, что ось задания вообще
   * что-то значит хотя бы на части проб.
   */
  it('🔴 ось задания различима: хотя бы у части проб виды по осям разные', () => {
    const distinguishing = tasks.filter(({ task }) => {
      const own = ownProjectionKey(asVecs(task.shape), task.view);
      return (['top', 'front', 'side'] as ProjectionView[])
        .filter((v) => v !== task.view)
        .some((v) => ownProjectionKey(asVecs(task.shape), v) !== own);
    });
    expect(distinguishing.length).toBeGreaterThan(tasks.length * 0.8);
  });

  it('🔴 ни один неверный вариант не равен правильному', () => {
    const bad: string[] = [];
    for (const { seed, task } of tasks) {
      const correct = cellsKey(task.options[task.correctIdx].cells);
      task.options.forEach((o, i) => {
        if (i === task.correctIdx) return;
        if (cellsKey(o.cells) === correct) bad.push(`${seed}: вариант ${i} совпал с правильным`);
      });
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('🔴 варианты не повторяются между собой', () => {
    const bad: string[] = [];
    for (const { seed, task } of tasks) {
      const keys = task.options.map((o) => cellsKey(o.cells));
      if (new Set(keys).size !== keys.length) bad.push(`${seed}: одинаковые сетки среди вариантов`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  /**
   * 🔴 ПОДДЕЛКА ОБЯЗАНА БЫТЬ ПРАВДОПОДОБНОЙ, а не случайным узором. Проверяется
   * ЗНАЧЕНИЕМ: «вид с другой стороны» обязан совпасть с проекцией ТОЙ ЖЕ фигуры
   * вдоль одной из двух других осей, а «переставленный кубик» — с проекцией
   * одной из фигур, полученных переносом ровно одного кубика.
   */
  it('🔴 каждый неверный вариант — правдоподобная путаница, а не случайный узор', () => {
    const bad: string[] = [];
    for (const { seed, task } of tasks) {
      const moves = oneCubeMoves(asVecs(task.shape))
        .filter(isConnected)
        .map((s) => ownProjectionKey(s, task.view));
      const movesSet = new Set(moves);
      const otherViews = new Set(
        (['top', 'front', 'side'] as ProjectionView[])
          .filter((v) => v !== task.view)
          .map((v) => ownProjectionKey(asVecs(task.shape), v)),
      );
      task.options.forEach((o, i) => {
        if (i === task.correctIdx) return;
        const key = cellsKey(o.cells);
        if (o.flaw === 'other-view' && !otherViews.has(key)) {
          bad.push(`${seed}: вариант ${i} назван видом с другой стороны, а таким не является`);
        }
        if (o.flaw === 'edited-shape' && !movesSet.has(key)) {
          bad.push(`${seed}: вариант ${i} назван переносом кубика, а получен иначе`);
        }
        if (o.flaw === 'none') bad.push(`${seed}: неверный вариант ${i} помечен как правильный`);
      });
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('🔴 в пробе ровно один правильный вариант и их столько, сколько просил уровень', () => {
    const bad: string[] = [];
    for (const level of [3, 6, 11]) {
      const p = levelParams(level);
      for (let i = 0; i < 20; i++) {
        const seed = `count-${level}-${i}`;
        const task = buildProjectionTask({ minCubes: p.minC, maxCubes: p.maxC, optionCount: p.optionCount }, createRng(seed));
        const matches = task.options.filter((o) => o.isMatch).length;
        if (matches !== 1) bad.push(`${seed}: правильных вариантов ${matches}`);
        if (task.options.length !== p.optionCount) bad.push(`${seed}: вариантов ${task.options.length}, ждали ${p.optionCount}`);
        if (!task.options[task.correctIdx]?.isMatch) bad.push(`${seed}: correctIdx указывает не туда`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 сетка нормализована: ни отрицательных клеток, ни дублей', () => {
    const bad: string[] = [];
    for (const { seed, task } of tasks) {
      for (const o of task.options) {
        if (o.cells.some((c) => c.col < 0 || c.row < 0)) bad.push(`${seed}: клетка за пределами сетки`);
        if (new Set(o.cells.map((c) => `${c.col},${c.row}`)).size !== o.cells.length) bad.push(`${seed}: клетка повторена`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('🔴 проекция схлопывает кубики, стоящие друг за другом', () => {
    // Два кубика на одной линии взгляда сверху дают ОДНУ клетку, а не две.
    const column: Shape = [[0, 0, 0], [0, 1, 0], [0, 2, 0]];
    expect(cellsKey(projectShape(column, 'top'))).toBe('0,0');
    // Те же кубики сбоку — столбик из трёх клеток.
    expect(projectShape(column, 'side').length).toBe(3);
    expect(cellsKey(projectShape(column, 'front'))).toBe(cellsKey([
      { col: 0, row: 0 }, { col: 0, row: 1 }, { col: 0, row: 2 },
    ]));
  });

  it('🔴 отпечаток сетки не зависит от порядка клеток', () => {
    const a: Cell2D[] = [{ col: 0, row: 1 }, { col: 1, row: 0 }];
    const b: Cell2D[] = [{ col: 1, row: 0 }, { col: 0, row: 1 }];
    expect(gridKey(a)).toBe(gridKey(b));
    expect(gridKey(a)).not.toBe(gridKey([{ col: 0, row: 0 }, { col: 1, row: 1 }]));
  });
});

// ─────────────────────────────── РАЗВЁРТКА ───────────────────────────────

describe('задание на развёртку', () => {
  /**
   * НЕЗАВИСИМАЯ ПРОВЕРКА СБОРКИ. Классический признак развёртки куба: две
   * клетки, стоящие в одну линию через одну (средняя тоже на месте), складываются
   * в ПРОТИВОПОЛОЖНЫЕ грани, а соседние по ребру — в СМЕЖНЫЕ. Признак выведен из
   * самого куба и никакого отношения к коду складывания не имеет — потому им и
   * можно этот код проверять.
   */
  const foldedNets = CUBE_NETS.map((net) => ({ net, folded: foldNet(net) }));

  it('есть что проверять — иначе прогон зелен вслепую', () => {
    expect(CUBE_NETS.length).toBeGreaterThanOrEqual(5);
  });

  it('🔴 каждая выкройка складывается: шесть клеток — шесть РАЗНЫХ граней', () => {
    const bad: string[] = [];
    for (const { net, folded } of foldedNets) {
      if (!folded) { bad.push(`${net.id}: не складывается вовсе`); continue; }
      if (folded.size !== 6) bad.push(`${net.id}: накрыто ${folded.size} клеток из 6`);
      if (new Set(folded.values()).size !== 6) bad.push(`${net.id}: две клетки легли на одну грань`);
    }
    expect(bad).toEqual([]);
  });

  it('🔴 клетки через одну в линию дают противоположные грани', () => {
    const bad: string[] = [];
    for (const { net, folded } of foldedNets) {
      if (!folded) continue;
      const has = (col: number, row: number) => folded.has(netCellKey({ col, row }));
      const at = (col: number, row: number) => folded.get(netCellKey({ col, row })) as CubeFace;
      for (const c of net.cells) {
        for (const [dc, dr] of [[1, 0], [0, 1]] as [number, number][]) {
          const mid = [c.col + dc, c.row + dr] as [number, number];
          const far = [c.col + 2 * dc, c.row + 2 * dr] as [number, number];
          if (!has(mid[0], mid[1]) || !has(far[0], far[1])) continue;
          const a = at(c.col, c.row);
          const b = at(far[0], far[1]);
          if (OPPOSITE[a] !== b) bad.push(`${net.id}: ${netCellKey(c)} и ${far.join(',')} → ${a}/${b}, а должны быть напротив`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 соседние клетки дают смежные грани, а не противоположные', () => {
    const bad: string[] = [];
    for (const { net, folded } of foldedNets) {
      if (!folded) continue;
      for (const c of net.cells) {
        for (const [dc, dr] of [[1, 0], [0, 1]] as [number, number][]) {
          const nb = netCellKey({ col: c.col + dc, row: c.row + dr });
          if (!folded.has(nb)) continue;
          const a = folded.get(netCellKey(c)) as CubeFace;
          const b = folded.get(nb) as CubeFace;
          if (OPPOSITE[a] === b) bad.push(`${net.id}: соседи ${netCellKey(c)}/${nb} легли на противоположные грани ${a}/${b}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 фигура, которая кубом НЕ складывается, отвергается', () => {
    // Прямоугольник 2×3: шесть связных клеток, кубом не сворачивается.
    const rect: CubeNet = {
      id: 'rect-2x3',
      cells: [
        { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 },
        { col: 0, row: 1 }, { col: 1, row: 1 }, { col: 2, row: 1 },
      ],
    };
    expect(foldNet(rect)).toBeNull();
    // И разорванная выкройка тоже: клетка на отшибе.
    const torn: CubeNet = {
      id: 'torn',
      cells: [
        { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 },
        { col: 1, row: 1 }, { col: 1, row: 2 }, { col: 5, row: 5 },
      ],
    };
    expect(foldNet(torn)).toBeNull();
  });

  it('🔴 собранный куб несёт ровно значки выкройки, и раскладка совпадает с выкройкой', () => {
    const bad: string[] = [];
    for (const net of CUBE_NETS) {
      const { faceOfCell, markOfCell, cube } = assembleNet(net, FACE_MARKS);
      const onCube = Object.values(cube).sort();
      if (onCube.join(',') !== [...FACE_MARKS].sort().join(',')) bad.push(`${net.id}: значки на кубе не те, что на выкройке`);
      for (const cell of net.cells) {
        const key = netCellKey(cell);
        if (cube[faceOfCell.get(key) as CubeFace] !== markOfCell[key]) {
          bad.push(`${net.id}: клетка ${key} и её грань несут разные значки`);
        }
      }
      // Тот же независимый признак, но уже на ЗНАЧКАХ: через одну в линию —
      // значки на противоположных гранях куба.
      for (const cell of net.cells) {
        for (const [dc, dr] of [[1, 0], [0, 1]] as [number, number][]) {
          const mid = netCellKey({ col: cell.col + dc, row: cell.row + dr });
          const far = netCellKey({ col: cell.col + 2 * dc, row: cell.row + 2 * dr });
          if (!markOfCell[mid] || !markOfCell[far]) continue;
          const faceA = faceOfCell.get(netCellKey(cell)) as CubeFace;
          const faceB = faceOfCell.get(far) as CubeFace;
          if (OPPOSITE[faceA] !== faceB) bad.push(`${net.id}: значки ${markOfCell[netCellKey(cell)]}/${markOfCell[far]} не оказались напротив`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 у раскрашенного куба ровно 24 ориентации и 24 разных видимых тройки', () => {
    const { cube } = assembleNet(CUBE_NETS[0], FACE_MARKS);
    expect(allCubeOrientations(cube).length).toBe(24);
    expect(allVisibleTriples(cube).size).toBe(24);
  });

  /**
   * 🔴 ЗЕРКАЛЬНУЮ СБОРКУ НЕ СОВМЕСТИТЬ С НАСТОЯЩЕЙ НИКАКИМ ПОВОРОТОМ. Проверяется
   * не словом «зеркало», а перебором: ни одна из 24 ориентаций зеркального куба
   * не совпадает с настоящим, и ни одна его видимая тройка не встречается среди
   * видимых троек настоящего.
   */
  it('🔴 зеркальная сборка не совпадает с настоящей ни в одной из 24 ориентаций', () => {
    const bad: string[] = [];
    for (const net of CUBE_NETS) {
      const { cube } = assembleNet(net, FACE_MARKS);
      const truthful = new Set(allCubeOrientations(cube).map(faceKey));
      const mirrored = mirrorCube(cube);
      for (const o of allCubeOrientations(mirrored)) {
        if (truthful.has(faceKey(o))) bad.push(`${net.id}: зеркало совпало с настоящим кубом`);
      }
      const seen = allVisibleTriples(cube);
      for (const t of allVisibleTriples(mirrored)) {
        if (seen.has(t)) bad.push(`${net.id}: зеркало показывает ракурс настоящего куба`);
      }
    }
    expect(bad).toEqual([]);
  });

  const netTasks: { seed: string; task: NetTask }[] = [];
  for (const level of [5, 8, 11, 15]) {
    for (let i = 0; i < 50; i++) {
      const seed = `net-${level}-${i}`;
      netTasks.push({ seed, task: buildNetTask({ optionCount: levelParams(level).optionCount }, createRng(seed)) });
    }
  }

  it('🔴 правильный вариант — настоящий куб выкройки в одном из своих ракурсов', () => {
    const bad: string[] = [];
    for (const { seed, task } of netTasks) {
      const truthful = new Set(allCubeOrientations(task.cube).map(faceKey));
      const correct = task.options[task.correctIdx];
      if (!correct?.isMatch) { bad.push(`${seed}: correctIdx указывает не туда`); continue; }
      if (!truthful.has(faceKey(correct.faces))) bad.push(`${seed}: «правильный» куб не является поворотом собранного`);
      // И сам собранный куб обязан быть сборкой ПОКАЗАННОЙ выкройки.
      const rebuilt = assembleNet(task.net, task.net.cells.map((c) => task.markOfCell[netCellKey(c)]));
      if (faceKey(rebuilt.cube) !== faceKey(task.cube)) bad.push(`${seed}: показанная выкройка складывается в другой куб`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('🔴 ни один неверный вариант нельзя получить поворотом настоящего куба', () => {
    const bad: string[] = [];
    for (const { seed, task } of netTasks) {
      const seen = allVisibleTriples(task.cube);
      task.options.forEach((o, i) => {
        if (i === task.correctIdx) return;
        const triple = `${o.faces.up}|${o.faces.front}|${o.faces.right}`;
        if (seen.has(triple)) bad.push(`${seed}: вариант ${i} показывает законный ракурс настоящего куба`);
        if (o.isMatch) bad.push(`${seed}: вариант ${i} помечен правильным вторым`);
      });
      const matches = task.options.filter((o) => o.isMatch).length;
      if (matches !== 1) bad.push(`${seed}: правильных вариантов ${matches}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('🔴 вариант, названный зеркалом, действительно зеркальная сборка', () => {
    const bad: string[] = [];
    let mirrors = 0;
    for (const { seed, task } of netTasks) {
      const truthful = new Set(allCubeOrientations(task.cube).map(faceKey));
      const mirrored = new Set(allCubeOrientations(mirrorCube(task.cube)).map(faceKey));
      for (const o of task.options) {
        if (o.flaw !== 'mirror') continue;
        mirrors++;
        if (!mirrored.has(faceKey(o.faces))) bad.push(`${seed}: «зеркало» не является зеркальной сборкой`);
        if (truthful.has(faceKey(o.faces))) bad.push(`${seed}: «зеркало» оказалось поворотом настоящего куба`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    // Зеркальный отвлекающий вариант должен и правда попадать в пробы.
    expect(mirrors).toBeGreaterThan(netTasks.length * 0.8);
  });

  it('🔴 вариант, названный перестановкой, отличается от куба ровно двумя гранями', () => {
    const bad: string[] = [];
    let swaps = 0;
    for (const { seed, task } of netTasks) {
      for (const o of task.options) {
        if (o.flaw !== 'swap') continue;
        swaps++;
        // Ищем поворот куба, при котором расходятся ровно две грани — это и есть
        // «переставили две грани», а не «раскрасили заново».
        const distances = allCubeOrientations(task.cube).map((cand) => (
          (Object.keys(cand) as CubeFace[]).filter((f) => cand[f] !== o.faces[f]).length
        ));
        if (Math.min(...distances) !== 2) bad.push(`${seed}: «перестановка» расходится с кубом на ${Math.min(...distances)} граней`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(swaps).toBeGreaterThan(0);
  });

  it('🔴 варианты не повторяются: два одинаковых кубика — вопрос без ответа', () => {
    const bad: string[] = [];
    for (const { seed, task } of netTasks) {
      const triples = task.options.map((o) => `${o.faces.up}|${o.faces.front}|${o.faces.right}`);
      if (new Set(triples).size !== triples.length) bad.push(`${seed}: одинаковые кубики среди вариантов`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('🔴 вариантов столько, сколько обещано уровнем, и зеркало среди них есть', () => {
    const bad: string[] = [];
    for (const level of [5, 8, 11, 15]) {
      const want = levelParams(level).optionCount;
      for (let i = 0; i < 25; i++) {
        const seed = `netcount-${level}-${i}`;
        const task = buildNetTask({ optionCount: want }, createRng(seed));
        if (task.options.length !== want) bad.push(`${seed}: вариантов ${task.options.length}, ждали ${want}`);
        if (!task.options.some((o) => o.flaw === 'mirror')) bad.push(`${seed}: зеркальной подделки не оказалось`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});

// ────────────────────────── ПОВОРОТ И РАЗБОР ОТВЕТА ──────────────────────────

describe('задание на поворот и разбор ответа', () => {
  const rotTasks: { seed: string; level: number; task: RotationTask }[] = [];
  for (const level of [1, 2, 4, 6, 8, 11, 13, 15]) {
    for (let i = 0; i < 40; i++) {
      const seed = `rot-${level}-${i}`;
      rotTasks.push({ seed, level, task: buildRotationTask(level, createRng(seed)) });
    }
  }

  it('есть что проверять — иначе прогон зелен вслепую', () => {
    expect(rotTasks.length).toBeGreaterThanOrEqual(300);
  });

  it('🔴 правильный вариант — поворот эталона (по своему счёту, не по счёту модуля)', () => {
    const bad: string[] = [];
    for (const { seed, task } of rotTasks) {
      const correct = task.options[task.correctIdx];
      if (!correct?.isMatch) { bad.push(`${seed}: correctIdx указывает не туда`); continue; }
      if (!ownIsRotation(asVecs(task.base), asVecs(correct.shape))) bad.push(`${seed}: «правильный» вариант поворотом не является`);
      if (ownKey(asVecs(correct.shape)) === ownKey(asVecs(task.base))) bad.push(`${seed}: вариант совпал с эталоном — крутить нечего`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('🔴 ни один неверный вариант не является поворотом эталона', () => {
    const bad: string[] = [];
    for (const { seed, task } of rotTasks) {
      task.options.forEach((o, i) => {
        if (i === task.correctIdx) return;
        if (ownIsRotation(asVecs(task.base), asVecs(o.shape))) bad.push(`${seed}: вариант ${i} тоже поворот эталона`);
      });
      const matches = task.options.filter((o) => o.isMatch).length;
      if (matches !== 1) bad.push(`${seed}: правильных вариантов ${matches}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('🔴 вариант, названный зеркалом, и есть зеркало эталона', () => {
    const bad: string[] = [];
    let mirrors = 0;
    for (const { seed, task } of rotTasks) {
      for (const o of task.options) {
        if (o.flaw !== 'mirror') continue;
        mirrors++;
        if (!ownIsRotation(asVecs(mirrorShape(task.base)), asVecs(o.shape))) {
          bad.push(`${seed}: «зеркало» зеркалом эталона не является`);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(mirrors).toBeGreaterThan(0);
  });

  it('🔴 угол задания = 90° × число записанных шагов', () => {
    const bad: string[] = [];
    for (const { seed, task } of rotTasks) {
      if (task.steps.length === 0) bad.push(`${seed}: путь поворота пуст`);
      if (task.angleSum !== task.steps.length * 90) bad.push(`${seed}: угол ${task.angleSum} при ${task.steps.length} шагах`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  /**
   * 🔴 ГЛАВНОЕ ПРО РАЗБОР. Кадры обязаны ВЕСТИ от эталона к правильному варианту:
   * первый — эталон, каждый следующий отличается ровно одним поворотом на 90°
   * вокруг названной оси, последний совпадает с правильным вариантом. Разбор,
   * приводящий не туда, врёт убедительнее, чем молчание.
   */
  it('🔴 разбор доводит эталон РОВНО до правильного варианта', () => {
    const bad: string[] = [];
    for (const { seed, task } of rotTasks) {
      const frames = rotationReplay(task);
      if (frames.length !== task.steps.length + 1) { bad.push(`${seed}: кадров ${frames.length} при ${task.steps.length} шагах`); continue; }
      if (ownKey(asVecs(frames[0].shape)) !== ownKey(asVecs(task.base))) bad.push(`${seed}: первый кадр не эталон`);
      if (frames[0].axis !== null) bad.push(`${seed}: у первого кадра названа ось, хотя поворота ещё не было`);
      for (let i = 1; i < frames.length; i++) {
        const axis = frames[i].axis;
        if (axis !== task.steps[i - 1].axis) { bad.push(`${seed}: кадр ${i} назвал ось ${axis}`); continue; }
        const expected = ownKey(ownTurn(asVecs(frames[i - 1].shape), axis as 'x' | 'y' | 'z', 1));
        if (ownKey(asVecs(frames[i].shape)) !== expected) bad.push(`${seed}: кадр ${i} получен не поворотом на 90° вокруг ${axis}`);
      }
      const last = frames[frames.length - 1];
      const correct = task.options[task.correctIdx];
      if (ownKey(asVecs(last.shape)) !== ownKey(asVecs(correct.shape))) {
        bad.push(`${seed}: последний кадр разбора не равен правильному варианту`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('🔴 каждый кадр разбора — законный поворот эталона, а не промежуточное «нечто»', () => {
    const bad: string[] = [];
    for (const { seed, task } of rotTasks.slice(0, 120)) {
      for (const f of rotationReplay(task)) {
        if (!ownIsRotation(asVecs(task.base), asVecs(f.shape))) bad.push(`${seed}: кадр ${f.index} не поворот эталона`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('🔴 на каждом уровне вариантов столько, сколько обещано настройкой уровня', () => {
    const bad: string[] = [];
    for (const { seed, level, task } of rotTasks) {
      const want = levelParams(level).optionCount;
      if (task.options.length !== want) bad.push(`${seed}: вариантов ${task.options.length}, ждали ${want}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});

// ───────────────────── СМЕСЬ ЗАДАНИЙ И БИОМАРКЕР ─────────────────────

describe('смесь заданий не портит наклон RT по углу', () => {
  it('🔴 план партии держит долю поворотных проб и начинается с поворота', () => {
    const bad: string[] = [];
    for (const level of [1, 2, 3, 4, 5, 8, 11, 15]) {
      for (const trials of [5, 10, 15]) {
        for (let i = 0; i < 12; i++) {
          const plan = planTaskKinds(level, trials, createRng(`plan-${level}-${trials}-${i}`));
          const tag = `L${level}×${trials}#${i}`;
          if (plan.length !== trials) bad.push(`${tag}: проб ${plan.length}`);
          if (plan[0] !== 'rotation') bad.push(`${tag}: партия начинается не с поворота`);
          const rotations = plan.filter((k) => k === 'rotation').length;
          if (rotations / trials < MIN_ROTATION_SHARE) bad.push(`${tag}: поворотных ${rotations} из ${trials}`);
          for (const kind of plan) {
            if (level < KIND_UNLOCK[kind]) bad.push(`${tag}: ${kind} появился раньше уровня ${KIND_UNLOCK[kind]}`);
          }
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('🔴 новые виды заданий и правда появляются, а не остались задумкой', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) for (const k of planTaskKinds(11, 15, createRng(`mix-${i}`))) seen.add(k);
    expect([...seen].sort()).toEqual(['net', 'projection', 'rotation']);
    // …и на первом уровне не появляются: там ещё учат поворот.
    const early = new Set(planTaskKinds(1, 15, createRng('early')));
    expect([...early]).toEqual(['rotation']);
  });

  /**
   * 🔴 ЦЕНА ВОПРОСА. Наклон считается по точкам (угол, время). Если в него
   * попадут проекция и развёртка, у которых угла нет, величина превратится в шум,
   * а выглядеть будет по-прежнему измерением. Проба задаёт ТОЧНУЮ прямую по
   * поворотным пробам и подмешивает посторонние записи с диким временем: наклон
   * обязан остаться прежним до сотых.
   */
  it('🔴 проекция и развёртка не попадают в наклон', () => {
    const clean: TrialRecord[] = [
      { kind: 'rotation', angle: 90, rt: 680, correct: true },
      { kind: 'rotation', angle: 180, rt: 860, correct: true },
      { kind: 'rotation', angle: 270, rt: 1040, correct: true },
    ];
    // rt = 500 + 2·угол → наклон ровно 2 мс/градус
    expect(angleResponseSlope(clean)).toBeCloseTo(2, 10);

    const polluted: TrialRecord[] = [
      clean[0],
      { kind: 'projection', angle: 0, rt: 9000, correct: true },
      clean[1],
      { kind: 'net', angle: 0, rt: 12000, correct: true },
      clean[2],
      { kind: 'projection', angle: 0, rt: 30, correct: true },
    ];
    expect(angleResponseSlope(polluted)).toBeCloseTo(2, 10);
    expect(slopeSamples(polluted)).toEqual([
      { angle: 90, rt: 680 }, { angle: 180, rt: 860 }, { angle: 270, rt: 1040 },
    ]);
    expect(meanSlopeRt(polluted)).toBe(Math.round((680 + 860 + 1040) / 3));
  });

  it('🔴 ошибочный ответ временем не измеряется', () => {
    const withMiss: TrialRecord[] = [
      { kind: 'rotation', angle: 90, rt: 680, correct: true },
      { kind: 'rotation', angle: 180, rt: 20000, correct: false },
      { kind: 'rotation', angle: 180, rt: 860, correct: true },
      { kind: 'rotation', angle: 270, rt: 1040, correct: true },
    ];
    expect(angleResponseSlope(withMiss)).toBeCloseTo(2, 10);
    expect(slopeSamples(withMiss).length).toBe(3);
  });

  it('наклон без точек — ноль, а не выдуманное число', () => {
    expect(angleResponseSlope([])).toBe(0);
    expect(angleResponseSlope([{ kind: 'rotation', angle: 90, rt: 700, correct: true }])).toBe(0);
    // Все углы одинаковы — прямую провести не по чему.
    expect(angleResponseSlope([
      { kind: 'rotation', angle: 90, rt: 700, correct: true },
      { kind: 'rotation', angle: 90, rt: 900, correct: true },
    ])).toBe(0);
  });

  it('🔴 разбивка по видам заданий считается и сходится с числом проб', () => {
    const log: TrialRecord[] = [
      { kind: 'rotation', angle: 90, rt: 700, correct: true },
      { kind: 'projection', angle: 0, rt: 1200, correct: false },
      { kind: 'net', angle: 0, rt: 1500, correct: true },
      { kind: 'rotation', angle: 180, rt: 900, correct: true },
    ];
    expect(taskKindCounts(log)).toEqual({ rotation: 2, projection: 1, net: 1 });
    const counts = taskKindCounts(log);
    expect(counts.rotation + counts.projection + counts.net).toBe(log.length);
  });

  it('🔴 угол есть только у поворотной пробы', () => {
    const bad: string[] = [];
    for (const level of [5, 11, 15]) {
      for (let i = 0; i < 20; i++) {
        const rng = createRng(`kinds-${level}-${i}`);
        for (const kind of ['rotation', 'projection', 'net'] as const) {
          const task = buildTask(kind, level, rng);
          if (task.kind !== kind) bad.push(`L${level}#${i}: просили ${kind}, получили ${task.kind}`);
          if (kind === 'rotation' && (task as RotationTask).angleSum <= 0) bad.push(`L${level}#${i}: у поворота нет угла`);
          if (kind !== 'rotation' && 'angleSum' in task) bad.push(`L${level}#${i}: у ${kind} завёлся угол`);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});

// ────────────────────────── СЛОВАРЬ МОДУЛЯ ──────────────────────────

/**
 * Правила те же, что у общего гейта `games-module-i18n`: полнота двенадцати
 * языков проверяется по РЕАЛЬНО ВОЗВРАЩЁННЫМ объектам, а «ключ живой» — по
 * исходнику БЕЗ КОММЕНТАРИЕВ (иначе имя ключа в шапке файла засчиталось бы за
 * вызов). Отдельная проба ниже доказывает, что срез комментариев работает.
 */
function stripComments(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (c === '/' && n === '*') {
      const e = s.indexOf('*/', i + 2);
      out += ' ';
      i = e < 0 ? s.length : e + 2;
      continue;
    }
    if (c === '/' && n === '/') {
      const e = s.indexOf('\n', i);
      out += ' ';
      i = e < 0 ? s.length : e;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === c) break;
        j++;
      }
      out += s.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function gameCode(): string {
  const dir = join(SRC, 'games/mental-rotation');
  let code = '';
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true }) as any[]) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(entry.name) && !p.endsWith(join('core', 'i18n.ts'))) code += stripComments(read(p));
    }
  };
  walk(dir);
  const screen = join(APP, 'games', 'mental-rotation.tsx');
  if (existsSync(screen)) code += stripComments(read(screen));
  return code;
}

function usedKeys(code: string): Set<string> {
  const used = new Set<string>();
  for (const m of code.matchAll(/\b\w*[Ss]trings\.(\w+)\b/g)) used.add(m[1]);
  for (const m of code.matchAll(/Strings\([^)]*\)\.(\w+)/g)) used.add(m[1]);
  return used;
}

/** Языки приложения — читаем из самого LanguageContext, а не переписываем сюда. */
const APP_LOCALES: string[] = (() => {
  const dict = read(join(SRC, 'contexts/LanguageContext.tsx'));
  const decl = /type Language =([^;]+);/.exec(dict)!;
  return [...decl[1].matchAll(/'([a-z]{2})'/g)].map((m) => m[1]).sort();
})();

/**
 * Совпадение с английским разрешено ПОИМЁННО и С ПРИЧИНОЙ: гейт, который
 * краснеет на верном переводе, перестают читать. Список закрыт, а проба ниже
 * роняет прогон, если запись протухла — то есть перевод изменился и совпадения
 * больше нет.
 */
const SAME_AS_EN: Record<string, string> = {
  'fr.taskRotation': 'французское «Rotation» пишется ровно так же, как английское',
  'fr.taskProjection': 'французское «Projection» пишется ровно так же, как английское',
};

describe('словарь модуля знает все двенадцать языков', () => {
  it('в списке языков приложения ровно двенадцать — иначе сверять не с чем', () => {
    expect(APP_LOCALES.length).toBe(12);
  });

  it('🔴 языки модуля и языки приложения — один список', () => {
    expect([...MENTAL_ROTATION_LOCALES].sort()).toEqual(APP_LOCALES);
  });

  it('🔴 в каждом языке те же ключи, что в русском, и ни один не пуст', () => {
    const ruKeys = Object.keys(getMentalRotationStrings('ru')).sort();
    expect(ruKeys.length).toBeGreaterThan(15);
    const holes: string[] = [];
    for (const locale of APP_LOCALES as MentalRotationLocale[]) {
      const s = getMentalRotationStrings(locale) as unknown as Record<string, string>;
      if (!s || typeof s !== 'object') { holes.push(`${locale}: словаря нет вовсе`); continue; }
      const keys = Object.keys(s).sort();
      for (const k of ruKeys) if (!keys.includes(k)) holes.push(`${locale}: нет ключа ${k}`);
      for (const k of keys) if (!ruKeys.includes(k)) holes.push(`${locale}: лишний ключ ${k}`);
      for (const [k, v] of Object.entries(s)) {
        if (typeof v !== 'string' || v.trim().length === 0) holes.push(`${locale}.${k}: пустая строка`);
      }
    }
    expect(holes).toEqual([]);
  });

  it('🔴 ни одна строка не осталась английской копией', () => {
    const en = getMentalRotationStrings('en') as unknown as Record<string, string>;
    const stub: string[] = [];
    for (const locale of MENTAL_ROTATION_LOCALES) {
      if (locale === 'en') continue;
      const s = getMentalRotationStrings(locale) as unknown as Record<string, string>;
      for (const [k, v] of Object.entries(s)) {
        if (v === en[k] && !SAME_AS_EN[`${locale}.${k}`]) stub.push(`${locale}.${k}: «${v}» — как по-английски`);
      }
    }
    expect(stub).toEqual([]);
  });

  it('исключение не протухло: перечисленные строки и правда совпадают с английской', () => {
    const en = getMentalRotationStrings('en') as unknown as Record<string, string>;
    const stale: string[] = [];
    for (const [entry, why] of Object.entries(SAME_AS_EN)) {
      const [locale, key] = entry.split('.');
      const mine = (getMentalRotationStrings(locale as MentalRotationLocale) as unknown as Record<string, string>)[key];
      if (mine !== en[key]) stale.push(`${entry}: совпадения больше нет — убрать из списка`);
      if (why.length < 25) stale.push(`${entry}: причина написана для галочки`);
    }
    expect(stale).toEqual([]);
  });

  it('🔴 у локалей со своей письменностью текст написан своими знаками', () => {
    const SCRIPTS: Record<string, RegExp> = {
      ru: /[Ѐ-ӿ]/, zh: /[一-鿿]/, ja: /[぀-ヿ一-鿿]/,
      ko: /[가-힯]/, ar: /[؀-ۿ]/, hi: /[ऀ-ॿ]/,
    };
    const bad: string[] = [];
    for (const [locale, re] of Object.entries(SCRIPTS)) {
      const s = getMentalRotationStrings(locale as MentalRotationLocale) as unknown as Record<string, string>;
      for (const [k, v] of Object.entries(s)) {
        const bare = String(v).replace(/\{\w+\}/g, '').replace(/[^\p{L}]/gu, '');
        if (bare.length > 2 && !re.test(String(v))) bad.push(`${locale}.${k}: «${v}»`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 подстановки шаблонов на месте во всех языках', () => {
    const TEMPLATES: Record<string, string[]> = {
      projectionPrompt: ['{view}'],
      reviewStep: ['{n}', '{axis}'],
      a11yOption: ['{n}'],
    };
    const bad: string[] = [];
    for (const locale of MENTAL_ROTATION_LOCALES) {
      const s = getMentalRotationStrings(locale) as unknown as Record<string, string>;
      for (const [key, holes] of Object.entries(TEMPLATES)) {
        for (const hole of holes) if (!s[key].includes(hole)) bad.push(`${locale}.${key}: потеряна подстановка ${hole}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('🔴 каждый ключ словаря вызывается в коде игры', () => {
    const used = usedKeys(gameCode());
    const dead = Object.keys(getMentalRotationStrings('ru')).filter((k) => !used.has(k));
    expect(dead).toEqual([]);
  });

  it('проба на мёртвый ключ умеет отличать вызов от упоминания в комментарии', () => {
    expect([...usedKeys('const x = strings.netPrompt;')]).toContain('netPrompt');
    expect([...usedKeys('getMentalRotationStrings(locale).reviewNext')]).toContain('reviewNext');
    expect([...usedKeys(stripComments('/* strings.netPrompt в шапке */\n// strings.reviewNext\n'))]).toEqual([]);
    // И проба не молчит вхолостую: в коде игры вызовы действительно находятся.
    expect(usedKeys(gameCode()).size).toBeGreaterThan(10);
  });
});

/**
 * 🔴 ВРАЩЕНИЕ НЕ РЕШАЕТСЯ СЧЁТОМ КУБИКОВ.
 *
 * 📍 ОТЧЁТ ДЕНИСА 05.09.2026 со скриншотом: «картинки на редкость уродские».
 * Замер по 60 заданиям объяснил, что там на самом деле: в 54 из них у
 * отвлекающего было ДРУГОЕ число кубиков (пять против четырёх). Поворот число
 * кубиков не меняет — значит такой вариант отбрасывается счётом, и упражнение
 * на мысленное вращение решалось не вращая. И выглядел он «не той фигурой»,
 * потому что ею и был.
 */
describe('🔴 отвлекающий не отличается размером', () => {
  const УРОВНИ = [1, 3, 6, 10, 15, 22, 30];

  it('у всех вариантов столько же кубиков, сколько у эталона', () => {
    const плохо: string[] = [];
    for (const level of УРОВНИ) {
      for (let seed = 1; seed <= 30; seed++) {
        const t = buildRotationTask(level, createRng(`fair-${level}-${seed}`));
        for (const o of t.options) {
          if (o.shape.length !== t.base.length) {
            плохо.push(`L${level} seed ${seed}: эталон ${t.base.length}, вариант ${o.shape.length}`);
          }
        }
      }
    }
    expect(плохо.slice(0, 6)).toEqual([]);
  });

  it('вариантов по-прежнему столько, сколько обещает уровень', () => {
    const плохо: string[] = [];
    for (const level of УРОВНИ) {
      const надо = levelParams(level).optionCount;
      for (let seed = 1; seed <= 20; seed++) {
        const t = buildRotationTask(level, createRng(`cnt-${level}-${seed}`));
        if (t.options.length !== надо) плохо.push(`L${level} seed ${seed}: вариантов ${t.options.length}, надо ${надо}`);
      }
    }
    expect(плохо.slice(0, 6)).toEqual([]);
  });

  it('верный вариант ровно один — сужение отбора второго не создало', () => {
    const плохо: string[] = [];
    for (const level of УРОВНИ) {
      for (let seed = 1; seed <= 20; seed++) {
        const t = buildRotationTask(level, createRng(`one-${level}-${seed}`));
        const верных = t.options.filter((o) => o.isMatch).length;
        if (верных !== 1) плохо.push(`L${level} seed ${seed}: верных ${верных}`);
      }
    }
    expect(плохо.slice(0, 6)).toEqual([]);
  });
});
