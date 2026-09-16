/* psygames-mental-rotation-formation · VER 1 · 16.09.2026 */
/* psygames-spatial-claude-mac · задача 0d96f48e · not an app release */
/**
 * «ТРИ ВИДА» (в задаче — «Формирование»): даны виды фигуры сверху, спереди и справа —
 * какая из объёмных фигур их даёт. Обратная задача к «Проекции»: там по фигуре
 * ищут вид, здесь по видам — фигуру.
 *
 * 🔴 ТРИ ВИДА НЕ ОПРЕДЕЛЯЮТ ФИГУРУ ОДНОЗНАЧНО — ЭТО НЕ ФОРМАЛЬНОСТЬ. Кубик, спрятанный
 * за другими по всем трём осям, можно переставить или убрать, и все три тени останутся
 * прежними. Такая «подделка» — второй верный ответ. Поэтому каждая подделка сверяется
 * с верной фигурой по ВСЕМ ТРЁМ видам сразу: совпал хоть один вид — это норма, совпали
 * все три — вариант выбрасывается.
 *
 * ⚠️ ВАРИАНТЫ НЕ ПОВОРАЧИВАЮТСЯ. Виды считаются в осях экрана; фигура, нарисованная
 * повёрнутой, дала бы другие виды, и верный ответ перестал бы быть верным. Поворот тут
 * работает иначе: одна из подделок — ТА ЖЕ фигура, но повёрнутая, и её виды другие.
 * Это самая коварная подделка режима: форма знакомая, а тени не те.
 *
 * ⚠️ ФИГУРЫ ТОЛЬКО ОБЪЁМНЫЕ. У плоской один из видов — полоска в клетку шириной, и
 * задача решается подсчётом кубиков в ряд.
 *
 * 🔴 ОДНОГО ВИДА НЕ ДОЛЖНО ХВАТАТЬ (замер 17.09.2026). Первый генератор брал первые
 * годные подделки подряд — и в 90 заданиях из 96 ответ находился по ОДНОМУ виду: у всех
 * подделок, скажем, вид сверху был другим, и два остальных вида можно было не смотреть.
 * Теперь собирается пул годных подделок и из него берётся набор, у которого для каждого
 * вида есть подделка с ТЕМ ЖЕ видом, что у верной фигуры: тогда вид по отдельности не
 * отвечает, их надо сложить в голове вместе.
 */
import { isValidRotation, mirrorShape, normalizeShape, rotateShape, shapeKey } from './geometry';
import { rotationLevelSpec } from './levels';
import { moveOneCube, projectShape, projectionCandidates, sameGrid } from './projection';
import { pick, randomInt, shuffle } from './rng';
import { levelParams } from './rotation';
import { isVolumetric } from './shapes';
import { isFaceConnected } from './split';
import type { Axis, Cell2D, Cube, FormationTask, PieceFlaw, PieceOption, Rng, Shape } from './types';

const AXES: readonly Axis[] = ['x', 'y', 'z'];

/** Три вида фигуры в осях экрана — те же, что у «Проекции». */
export function threeViews(shape: Shape): { top: Cell2D[]; front: Cell2D[]; side: Cell2D[] } {
  return { top: projectShape(shape, 'top'), front: projectShape(shape, 'front'), side: projectShape(shape, 'side') };
}

/** Совпадают ли ВСЕ ТРИ вида. Один совпавший вид — норма, три — второй верный ответ. */
export function sameThreeViews(a: Shape, b: Shape): boolean {
  const va = threeViews(a), vb = threeViews(b);
  return sameGrid(va.top, vb.top) && sameGrid(va.front, vb.front) && sameGrid(va.side, vb.side);
}

/** Та же фигура, повёрнутая хотя бы на четверть оборота так, что картинка другая. */
function turned(shape: Shape, rng: Rng): Shape | null {
  const seen = shapeKey(normalizeShape(shape));
  for (let i = 0; i < 12; i++) {
    let out = shape;
    for (const axis of AXES) out = rotateShape(out, axis, randomInt(rng, 0, 3));
    out = normalizeShape(out);
    if (shapeKey(out) !== seen) return out;
  }
  return null;
}

/**
 * Переставить ОДИН кубик так, чтобы вид вдоль оси `axis` (0 — x, вид справа; 1 — y, сверху;
 * 2 — z, спереди) не изменился: снимаем кубик, только если его столбец вдоль оси не опустеет
 * (или кубик остаётся в том же столбце), и ставим в клетку, чей столбец уже занят. Вид вдоль
 * оси совпадает ПО ПОСТРОЕНИЮ, два других обычно меняются — это подделка, которую один вид
 * не отличает.
 *
 * ⚠️ Первый вариант сдвигал кубик только вдоль самой оси, и на фигурах-цепочках из семи
 * кубиков из 68 сдвигов 68 рвали фигуру: вид справа на 20-м уровне не прикрывался никогда.
 */
export function moveKeepingView(shape: Shape, axis: 0 | 1 | 2, rng: Rng): Shape | null {
  const column = (c: readonly number[]): string => [0, 1, 2].filter((i) => i !== axis).map((i) => c[i]).join(',');
  const occupied = new Set(shape.map((c) => c.join(',')));
  const variants: Shape[] = [];
  for (let from = 0; from < shape.length; from++) {
    const rest = shape.filter((_, i) => i !== from);
    if (!isFaceConnected(rest)) continue;
    const columns = new Set(rest.map(column));
    const own = column(shape[from]);
    const spots = new Map<string, Cube>();
    for (const c of rest) {
      for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const spot: Cube = [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
        const key = spot.join(',');
        if (occupied.has(key)) continue;
        // столбец клетки уже занят остатком — или это столбец снятого кубика, и он не пустеет
        if (!columns.has(column(spot)) && column(spot) !== own) continue;
        if (!columns.has(own) && column(spot) !== own) continue;
        spots.set(key, spot);
      }
    }
    for (const spot of spots.values()) variants.push([...rest, spot]);
  }
  return variants.length ? pick(rng, variants) : null;
}

/** Сколько годных подделок собирать, прежде чем выбирать набор. */
const POOL = 36;
/** Сколько фигур и ориентаций перебрать в поисках набора, где ни один вид не выдаёт ответ. */
const FULL_COVER_TRIES = 24;

const viewsKey = (s: Shape): [string, string, string] => {
  const v = threeViews(s);
  const k = (cells: Cell2D[]) => cells.map((c) => `${c.col},${c.row}`).sort().join('|');
  return [k(v.top), k(v.front), k(v.side)];
};

/**
 * Набор из `count` подделок, при котором ни один вид по отдельности не выдаёт ответ.
 * Подделки группируются по маске совпавших видов (сверху=1, спереди=2, справа=4; масок
 * всего восемь), перебираются сочетания МАСОК, а не подделок: 120 вариантов вместо
 * десятков тысяч. Из равных по охвату — больше разных видов подделок.
 */
function bestDecoys(pool: { option: PieceOption; mask: number }[], count: number, rng: Rng): { decoys: PieceOption[]; covered: number } | null {
  if (pool.length < count) return null;
  const groups = new Map<number, PieceOption[]>();
  for (const { option, mask } of shuffle(rng, pool)) groups.set(mask, [...(groups.get(mask) ?? []), option]);
  const masks = [...groups.keys()];
  let best: number[] | null = null, bestCovered = -1;
  const walk = (from: number, chosen: number[]): void => {
    if (chosen.length === count) {
      const need = new Map<number, number>();
      for (const m of chosen) need.set(m, (need.get(m) ?? 0) + 1);
      if ([...need].some(([m, n]) => (groups.get(m)?.length ?? 0) < n)) return;
      const bits = chosen.reduce((a, m) => a | m, 0);
      const covered = (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1);
      if (covered > bestCovered) { bestCovered = covered; best = [...chosen]; }
      return;
    }
    for (let i = from; i < masks.length; i++) { chosen.push(masks[i]); walk(i, chosen); chosen.pop(); }
  };
  walk(0, []);
  if (!best) return null;
  const used = new Map<number, number>();
  const decoys = (best as number[]).map((m) => { const i = used.get(m) ?? 0; used.set(m, i + 1); return groups.get(m)![i]; });
  return { decoys, covered: bestCovered };
}

export function buildFormationTask(level: number, rng: Rng): FormationTask {
  const p = levelParams(level);
  const spec = rotationLevelSpec(level);
  const candidates = projectionCandidates(p.minC, p.maxC).filter(isVolumetric);
  if (candidates.length === 0) throw new Error(`formation ${level}: нет объёмных фигур размера ${p.minC}–${p.maxC}`);
  let best: { truth: Shape; decoys: PieceOption[]; covered: number } | null = null;
  for (let attempt = 0; attempt < 200; attempt++) {
    // Ориентация эталона случайная: иначе одна и та же фигура давала бы одни и те же виды.
    const truth = turned(pick(rng, candidates), rng) ?? normalizeShape(pick(rng, candidates));
    const others = candidates.filter((s) => !isValidRotation(truth, s));
    const truthViews = viewsKey(truth);
    /*
     * Подделки «один кубик» на уровнях, где их требует спецификация, — но только первую
     * половину попыток. У фигур-цепочек из семи-восьми кубиков при любой ориентации есть ось,
     * вдоль которой НИ ОДНА перестановка кубика не сохраняет вид (замер 17.09: 30 из 30 «нет»),
     * и одним кубиком три вида не прикрыть. Тогда берутся и зеркальные, и повёрнутые — иначе
     * на 20-м и 25-м уровнях ответ находился по одному виду в 16 заданиях из 16.
     */
    const oneCubeOnly = spec.foil === 'one-cube' && attempt < FULL_COVER_TRIES / 2;
    const pool: { option: PieceOption; mask: number }[] = [];
    const keys = new Set([shapeKey(truth)]);
    for (let k = 0; pool.length < POOL && k < 160; k++) {
      const roll = rng();
      // Половина попыток — перестановка, сохраняющая один вид: такая подделка не выдаёт себя им.
      const keep = roll < 0.5;
      const flaw: PieceFlaw = keep || oneCubeOnly || roll < 0.7 ? 'one-cube'
        : roll < 0.82 ? 'other-view' : roll < 0.92 ? 'mirror' : others.length ? 'other' : 'one-cube';
      const raw = keep ? moveKeepingView(truth, (k % 3) as 0 | 1 | 2, rng)
        : flaw === 'one-cube' ? moveOneCube(truth, rng)
        : flaw === 'other-view' ? turned(truth, rng)
        : flaw === 'mirror' ? mirrorShape(truth)
        : turned(pick(rng, others), rng);
      if (!raw) continue;
      const shape = normalizeShape(raw);
      if (!isVolumetric(shape) || keys.has(shapeKey(shape))) continue;
      const v = viewsKey(shape);
      const mask = (v[0] === truthViews[0] ? 1 : 0) | (v[1] === truthViews[1] ? 2 : 0) | (v[2] === truthViews[2] ? 4 : 0);
      if (mask === 7) continue;                                   // все три вида те же — второй верный ответ
      keys.add(shapeKey(shape));
      pool.push({ option: { shape, isMatch: false, flaw }, mask });
    }
    const chosen = bestDecoys(pool, p.optionCount - 1, rng);
    if (!chosen) continue;
    if (!best || chosen.covered > best.covered) best = { truth, decoys: chosen.decoys, covered: chosen.covered };
    // Все три вида прикрыты — лучше не бывает. Иначе пробуем другую фигуру и ориентацию,
    // а после FULL_COVER_TRIES берём лучшее из найденного: партия важнее идеала.
    if (best.covered === 3 || attempt >= FULL_COVER_TRIES) break;
  }
  if (!best) throw new Error(`formation ${level}: не собралось задание с единственным ответом за 200 попыток`);
  const options = shuffle(rng, [{ shape: best.truth, isMatch: true, flaw: 'none' as const }, ...best.decoys]);
  return { kind: 'formation', views: threeViews(best.truth), options, correctIdx: options.findIndex((o) => o.isMatch) };
}
