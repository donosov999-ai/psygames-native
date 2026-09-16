/* psygames-mental-rotation-section · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача 4f85b6a9 · not an app release */
/**
 * «СРЕЗ»: в фигуре выделен ОДИН слой кубиков — как выглядит этот срез сверху, спереди
 * или справа. Вид всегда поперёк слоя: слой поперёк оси Y смотрят сверху, поперёк Z —
 * спереди, поперёк X — справа. Тогда срез — плоская клетчатая фигура без наложений.
 *
 * ⚠️ ЭТО ОРТОГОНАЛЬНЫЙ ВАРИАНТ, И ЭТО ОСОЗНАННОЕ ОГРАНИЧЕНИЕ (задача 4f85b6a9).
 * Плоскость идёт только по осям, поэтому срез — всегда кубики одного слоя. Косая плоскость
 * дала бы многоугольники (шестиугольник у куба, трапецию) и требует второй геометрии;
 * какой вариант нужен, решает Денис. Этот не ждёт того решения и не мешает ему.
 *
 * 🔴 ОТВЕТ СЧИТАЕТСЯ ТОЙ ЖЕ ФУНКЦИЕЙ, ЧТО У «ПРОЕКЦИИ». Срез — это проекция одних
 * кубиков слоя (`projectShape`), поэтому оси и ориентация сетки у верного варианта ровно
 * те же, что у вида в «Проекции» и «Трёх видах»: человек, выучивший «сверху» в одном
 * задании, не получит здесь перевёрнутый ответ.
 *
 * 🔴 СРЕЗ ОБЯЗАН ОТЛИЧАТЬСЯ ОТ ПРОЕКЦИИ ВСЕЙ ФИГУРЫ. Иначе задание решается без слоя
 * вообще — как «Проекция», и выделение ничего не значит. А проекция всей фигуры — первая
 * подделка: ровно это человек и путает, когда не удерживает слой.
 *
 * 🔴 ПОДДЕЛКИ — ТО, ЧТО ПРАВДА ПУТАЮТ, И КАЖДАЯ СВЕРЯЕТСЯ С ВЕРНЫМ ОТВЕТОМ:
 *   · `whole`     — проекция ВСЕЙ фигуры вдоль той же оси (не удержал слой);
 *   · `neighbour` — срез соседнего слоя (взял не тот слой);
 *   · `mirror`    — зеркало среза (перепутал лево и право вида);
 *   · `turned`    — срез, повёрнутый на четверть оборота (перепутал ориентацию вида);
 *   · `one-cell`  — одна клетка переставлена (не досчитал).
 * Совпавшая с верным ответом подделка — второй верный ответ на экране; такая ловится
 * сравнением сеток и отбрасывается, как у «Проекции».
 */
import { normalizeShape, rotateShape } from './geometry';
import { PROJECTION_VIEWS, gridKey, projectShape, projectionCandidates } from './projection';
import { pick, randomInt, shuffle } from './rng';
import { levelParams } from './rotation';
import { isVolumetric } from './shapes';
import type { Axis, Cell2D, ProjectionView, Rng, SectionFlaw, SectionOption, SectionTask, Shape } from './types';

/** Ось, поперёк которой лежит слой, видимый с этой стороны. Индекс координаты [x, y, z]. */
export const SECTION_AXIS: Readonly<Record<ProjectionView, 0 | 1 | 2>> = { top: 1, front: 2, side: 0 };

/** Кубики слоя: координата по оси вида равна `layer`. */
export function layerOf(shape: Shape, view: ProjectionView, layer: number): Shape {
  const axis = SECTION_AXIS[view];
  return shape.filter((c) => c[axis] === layer);
}

/** Срез: клетки слоя в осях вида. Та же функция, что у «Проекции», — ориентация одна. */
export function sectionOf(shape: Shape, view: ProjectionView, layer: number): Cell2D[] {
  return projectShape(layerOf(shape, view, layer), view);
}

function normalizeGrid(cells: Cell2D[]): Cell2D[] {
  if (cells.length === 0) return [];
  const minCol = Math.min(...cells.map((c) => c.col));
  const minRow = Math.min(...cells.map((c) => c.row));
  return cells.map((c) => ({ col: c.col - minCol, row: c.row - minRow }))
    .sort((p, q) => (p.row - q.row) || (p.col - q.col));
}

/** Зеркало по горизонтали: лево и право вида поменялись. */
export function mirrorGrid(cells: Cell2D[]): Cell2D[] {
  const maxCol = Math.max(...cells.map((c) => c.col));
  return normalizeGrid(cells.map((c) => ({ col: maxCol - c.col, row: c.row })));
}

/** Четверть оборота по часовой стрелке. */
export function turnGrid(cells: Cell2D[]): Cell2D[] {
  const maxRow = Math.max(...cells.map((c) => c.row));
  return normalizeGrid(cells.map((c) => ({ col: maxRow - c.row, row: c.col })));
}

const STEPS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Одна клетка переставлена на свободное место рядом с остальными. Размер тот же. */
export function moveOneCell(cells: Cell2D[], rng: Rng): Cell2D[] | null {
  for (const idx of shuffle(rng, cells.map((_, i) => i))) {
    const rest = cells.filter((_, i) => i !== idx);
    if (rest.length === 0) return null;
    const taken = new Set(cells.map((c) => `${c.col},${c.row}`));
    const spots: Cell2D[] = [];
    for (const c of rest) for (const [dc, dr] of STEPS) {
      const s = { col: c.col + dc, row: c.row + dr };
      if (taken.has(`${s.col},${s.row}`) || spots.some((q) => q.col === s.col && q.row === s.row)) continue;
      spots.push(s);
    }
    if (spots.length) return normalizeGrid([...rest, pick(rng, spots)]);
  }
  return null;
}

const AXES: readonly Axis[] = ['x', 'y', 'z'];

export function buildSectionTask(level: number, rng: Rng): SectionTask {
  const p = levelParams(level);
  const candidates = projectionCandidates(p.minC, p.maxC).filter(isVolumetric);
  if (candidates.length === 0) throw new Error(`section ${level}: нет объёмных фигур размера ${p.minC}–${p.maxC}`);
  for (let attempt = 0; attempt < 200; attempt++) {
    // Ориентация случайная: иначе одна фигура давала бы одни и те же слои.
    let shape = pick(rng, candidates);
    for (const axis of AXES) shape = rotateShape(shape, axis, randomInt(rng, 0, 3));
    shape = normalizeShape(shape);
    const view = pick(rng, PROJECTION_VIEWS);
    const axis = SECTION_AXIS[view];
    const layers = [...new Set(shape.map((c) => c[axis]))].sort((a, b) => a - b);
    if (layers.length < 2) continue;                       // один слой — срез и есть вся фигура
    const whole = projectShape(shape, view);
    const good = shuffle(rng, layers).filter((k) => {
      const s = sectionOf(shape, view, k);
      return s.length >= 2 && gridKey(s) !== gridKey(whole);
    });
    if (good.length === 0) continue;
    const layer = good[0];
    const correct = sectionOf(shape, view, layer);
    // Проекция всей фигуры — первая подделка и берётся ВСЕГДА: от среза она отличается по построению
    // (слой отобран так), а подделка, совпавшая с ней, — повтор, а не новая ловушка.
    const taken = new Set<string>([gridKey(correct), gridKey(whole)]);
    const pool: SectionOption[] = [];
    const add = (cells: Cell2D[] | null, flaw: SectionFlaw) => {
      if (!cells || cells.length === 0) return;
      const key = gridKey(cells);
      if (taken.has(key)) return;                          // совпала с верным или с соседней подделкой
      taken.add(key);
      pool.push({ cells, isMatch: false, flaw });
    };
    for (const k of shuffle(rng, [layer - 1, layer + 1]).filter((k) => layers.includes(k))) add(sectionOf(shape, view, k), 'neighbour');
    add(mirrorGrid(correct), 'mirror');
    add(turnGrid(correct), 'turned');
    for (let i = 0; i < 12; i++) add(moveOneCell(correct, rng), 'one-cell');
    // Остальные подделки — вразнобой по видам ошибки.
    const decoys: SectionOption[] = [{ cells: whole, isMatch: false, flaw: 'whole' }];
    const byFlaw = new Map<SectionFlaw, SectionOption[]>();
    for (const o of shuffle(rng, pool)) byFlaw.set(o.flaw, [...(byFlaw.get(o.flaw) ?? []), o]);
    // По кругу по видам ошибки: одна подделка каждого вида, потом вторая и так далее.
    for (let round = 0; decoys.length < p.optionCount - 1; round++) {
      let added = false;
      for (const flaw of shuffle(rng, [...byFlaw.keys()])) {
        const o = byFlaw.get(flaw)![round];
        if (!o || decoys.length >= p.optionCount - 1) continue;
        decoys.push(o); added = true;
      }
      if (!added) break;
    }
    if (decoys.length < p.optionCount - 1) continue;
    const options = shuffle(rng, [{ cells: correct, isMatch: true, flaw: 'none' as const }, ...decoys]);
    const rest = shape.filter((c) => c[axis] !== layer);
    return { kind: 'section', shape, view, layer, cubes: layerOf(shape, view, layer), rest, options, correctIdx: options.findIndex((o) => o.isMatch) };
  }
  throw new Error(`section ${level}: не собралось задание за 200 попыток`);
}
