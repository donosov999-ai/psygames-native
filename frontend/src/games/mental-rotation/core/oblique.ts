/* psygames-mental-rotation-oblique · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача 4f85b6a9 */
/**
 * «СЕЧЕНИЕ»: КОСАЯ ПЛОСКОСТЬ РЕЖЕТ ПАРАЛЛЕЛЕПИПЕД — КАКОЙ ФОРМЫ РАЗРЕЗ.
 *
 * Решение Дениса 17.09.2026: «косой срез делай». Ортогональный «Срез» (`section.ts`) остаётся
 * младшими ступенями: там плоскость идёт по оси, и разрез — клетчатая фигура одного слоя. Здесь
 * плоскость под углом, и разрез — многоугольник: треугольник, прямоугольник, трапеция,
 * пятиугольник, шестиугольник. Это вторая геометрия рядом с кубиками, и она отдельная:
 *
 *   · тело — выпуклый прямоугольный параллелепипед `dims` (1×1×1, 2×1×1, 2×2×1) — у выпуклого
 *     тела сечение плоскостью всегда один выпуклый многоугольник, без склейки кусков;
 *   · сечение считается по двенадцати рёбрам: где ребро пересекает плоскость, там вершина;
 *   · ответ сравнивается с ТОЧНОСТЬЮ ДО ПОДОБИЯ, поворота и отражения — варианты рисуются одним
 *     размером карточки, и человеку виден только вид многоугольника, а не его длина.
 *
 * 🔴 ВЫРОЖДЕННОЕ — НЕ ЗАДАНИЕ. Плоскость по грани даёт саму грань, а не сечение; плоскость через
 * вершину или ребро — точку или отрезок; мимо тела — пусто. Всё это `slicePolygon` возвращает
 * `null`, и генератор такую плоскость не берёт.
 *
 * 🔴 ПОДДЕЛКИ — ТО, ЧТО ПРАВДА ПУТАЮТ:
 *   · `seen`   — сечение, каким оно видно на рисунке под углом, а не его настоящая форма
 *                (самая частая ошибка: нарисовать то, что видишь);
 *   · `shadow` — тень сечения на ближайшую грань (сплющили вдоль оси);
 *   · `other`  — сечение того же тела другой плоскостью.
 * Каждая сверяется с верным ответом и с соседями по подобию: похожая до неразличимости — второй
 * верный ответ на экране, такая отбрасывается.
 */
import { pick, shuffle } from './rng';
import { levelParams } from './rotation';
import type { ObliqueFlaw, ObliqueOption, ObliqueTask, Rng, Vec2, Vec3 } from './types';

const EPS = 1e-9;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

/** Плоскость `normal · p = offset`, нормаль единичной длины. */
export interface SlicePlane { normal: Vec3; offset: number }

export function boxVertices([a, b, c]: Vec3): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [0, a]) for (const y of [0, b]) for (const z of [0, c]) out.push([x, y, z]);
  return out;
}

/** Двенадцать рёбер параллелепипеда: пары вершин, отличающиеся одной координатой. */
export function boxEdges(dims: Vec3): [Vec3, Vec3][] {
  const v = boxVertices(dims);
  const edges: [Vec3, Vec3][] = [];
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
    const differ = [0, 1, 2].filter((k) => v[i][k] !== v[j][k]).length;
    if (differ === 1) edges.push([v[i], v[j]]);
  }
  return edges;
}

/** Плоскость через три точки; `null`, если точки на одной прямой. */
export function planeThrough(p1: Vec3, p2: Vec3, p3: Vec3): SlicePlane | null {
  const n = cross(sub(p2, p1), sub(p3, p1));
  const len = norm(n);
  if (len < 1e-9) return null;
  const normal = scale(n, 1 / len);
  return { normal, offset: dot(normal, p1) };
}

/**
 * Сечение параллелепипеда плоскостью: вершины многоугольника по обходу, или `null`, если сечения
 * как многоугольника нет (мимо, через вершину или ребро, по грани, слишком тонкое).
 */
export function slicePolygon(dims: Vec3, plane: SlicePlane): Vec3[] | null {
  const side = (p: Vec3) => dot(plane.normal, p) - plane.offset;
  const verts = boxVertices(dims);
  // По грани: четыре вершины в плоскости, а все остальные по одну её сторону. Диагональная плоскость
  // тоже держит четыре вершины, но остальные у неё по обе стороны — это настоящее сечение.
  const onPlane = verts.filter((p) => Math.abs(side(p)) < 1e-7).length;
  const oneSide = verts.every((p) => side(p) > -1e-7) || verts.every((p) => side(p) < 1e-7);
  if (onPlane >= 4 && oneSide) return null;
  const points: Vec3[] = [];
  const add = (p: Vec3) => { if (!points.some((q) => norm(sub(p, q)) < 1e-7)) points.push(p); };
  for (const [a, b] of boxEdges(dims)) {
    const sa = side(a), sb = side(b);
    if (Math.abs(sa) < 1e-7) add(a);
    if (Math.abs(sb) < 1e-7) add(b);
    if ((sa < -1e-7 && sb > 1e-7) || (sa > 1e-7 && sb < -1e-7)) add(sub(a, scale(sub(a, b), sa / (sa - sb))) as Vec3);
  }
  if (points.length < 3) return null;
  const ordered = orderAround(points, plane.normal);
  if (polygonArea2(to2D(ordered, plane.normal)) < 0.05) return null;
  return ordered;
}

/** Упорядочить точки выпуклого многоугольника по обходу вокруг центра в плоскости с нормалью. */
function orderAround(points: Vec3[], normal: Vec3): Vec3[] {
  const c = scale(points.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]] as Vec3, [0, 0, 0]), 1 / points.length);
  const [u, v] = planeBasis(normal);
  return [...points].sort((p, q) => {
    const dp = sub(p, c), dq = sub(q, c);
    return Math.atan2(dot(dp, v), dot(dp, u)) - Math.atan2(dot(dq, v), dot(dq, u));
  });
}

/** Ортонормированный базис плоскости. */
export function planeBasis(normal: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u0 = cross(normal, helper);
  const u = scale(u0, 1 / norm(u0));
  const v = cross(normal, u);
  return [u, v];
}

/** Многоугольник в координатах своей плоскости — настоящая форма сечения. */
export function to2D(points: Vec3[], normal: Vec3): Vec2[] {
  const [u, v] = planeBasis(normal);
  return points.map((p) => [dot(p, u), dot(p, v)]);
}

/** Изометрия рисователя кубиков: (x, y, z) → ((x − z)·√3/2, −y + (x + z)/2). Видны грани +x, +y, +z. */
export function isoProject([x, y, z]: Vec3): Vec2 {
  return [(x - z) * Math.sqrt(3) / 2, -y + (x + z) / 2];
}

function polygonArea2(points: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** Выпуклая оболочка (Эндрю) — для тени и вида под углом: проекция выпуклого многоугольника выпукла. */
export function convexHull(points: Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const crossZ = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const p of pts) { while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-9) lower.pop(); lower.push(p); }
  const upper: Vec2[] = [];
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-9) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Стороны (доли периметра) и внутренние углы (градусы) по обходу. */
export function polygonSignature(points: Vec2[]): { sides: number[]; angles: number[] } {
  const n = points.length;
  const lens = points.map((p, i) => Math.hypot(points[(i + 1) % n][0] - p[0], points[(i + 1) % n][1] - p[1]));
  const per = lens.reduce((s, l) => s + l, 0) || 1;
  const angles = points.map((p, i) => {
    const prev = points[(i - 1 + n) % n], next = points[(i + 1) % n];
    const a: Vec2 = [prev[0] - p[0], prev[1] - p[1]], b: Vec2 = [next[0] - p[0], next[1] - p[1]];
    const cos = (a[0] * b[0] + a[1] * b[1]) / ((Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1])) || 1);
    return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
  });
  return { sides: lens.map((l) => l / per), angles };
}

/**
 * Насколько два многоугольника различимы глазом с точностью до подобия, поворота и отражения.
 * 0 — один вид; `Infinity` — разное число сторон. Мера — наихудшее расхождение по лучшему
 * совмещению: сторона в долях средней стороны, угол в долях 90°.
 */
export function polygonDistance(a: Vec2[], b: Vec2[]): number {
  if (a.length !== b.length) return Infinity;
  const n = a.length;
  const sa = polygonSignature(a), sb = polygonSignature(b);
  let best = Infinity;
  for (const dir of [1, -1]) for (let k = 0; k < n; k++) {
    let worst = 0;
    for (let i = 0; i < n; i++) {
      const j = ((dir === 1 ? i + k : k - i) % n + n) % n;
      // При обходе в обратную сторону сторона i лежит между вершинами j и j−1.
      const sideB = dir === 1 ? sb.sides[j] : sb.sides[(j - 1 + n) % n];
      worst = Math.max(worst, Math.abs(sa.sides[i] - sideB) * n, Math.abs(sa.angles[i] - sb.angles[j]) / 90);
    }
    best = Math.min(best, worst);
  }
  return best;
}

/**
 * Порог различимости двух вариантов. Ниже — два варианта одного вида на экране, то есть
 * второй верный ответ. Подобран замером в пробе mental-rotation-oblique (квадрат против
 * прямоугольника 1:√2 даёт 0,17 — различимы; 1:1,41 против 1:1,5 — 0,03 — нет).
 */
export const OBLIQUE_MIN_DISTANCE = 0.12;

/**
 * Ступени. Три оси трудности сразу: тело (куб → брусья), число сторон сечения и БЛИЗОСТЬ подделок.
 * Замер генератора 17.09.2026 (по 240 заданий на полосу): без порога по ступеням подделки той же
 * сторонности шли вплотную к порогу различимости уже на 24-м уровне (минимум 0,121, десятая доля
 * 0,148) — то есть самое тонкое различие выдавалось с первого же задания. Теперь на младших ступенях
 * подделки заметно дальше от верного ответа, к 42-му сходятся до порога различимости.
 */
export function obliqueLevelSpec(level: number): { dims: Vec3[]; sides: number[]; minDistance: number } {
  if (level < 30) return { dims: [[1, 1, 1]], sides: [3, 4], minDistance: 0.3 };
  if (level < 36) return { dims: [[1, 1, 1]], sides: [4, 5], minDistance: 0.22 };
  if (level < 42) return { dims: [[1, 1, 1], [2, 1, 1]], sides: [5, 6], minDistance: 0.16 };
  return { dims: [[2, 1, 1], [2, 2, 1], [1, 1, 1]], sides: [4, 5, 6], minDistance: OBLIQUE_MIN_DISTANCE };
}

/** Углы, которые глаз читает как углы: не острее 12° и не ближе 8° к развёрнутому. */
export const OBLIQUE_ANGLE_MIN = 12;
export const OBLIQUE_ANGLE_MAX = 172;
export function readableAngles(points: Vec2[]): boolean {
  return polygonSignature(points).angles.every((a) => a >= OBLIQUE_ANGLE_MIN && a <= OBLIQUE_ANGLE_MAX);
}

/**
 * Сечение, годное в задание: многоугольник нужной сторонности, каждый угол которого виден как угол.
 * Замер 17.09.2026 (1080 заданий, 24…50-й уровень): без проверки углов 2 верных ответа были
 * пятиугольниками с углом 176° и 173° — на рисунке четырёхугольник, а спрашивают про пятиугольник.
 */
export function sectionForTask(dims: Vec3, plane: SlicePlane, sides: number[]): { section: Vec3[]; truth: Vec2[] } | null {
  const section = slicePolygon(dims, plane);
  if (!section || !sides.includes(section.length)) return null;
  const truth = to2D(section, plane.normal);
  if (!readableAngles(truth)) return null;
  return { section, truth };
}

const PARAMS = [0, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1];

/** Случайная плоскость через три точки на трёх разных рёбрах тела. */
function randomPlane(dims: Vec3, rng: Rng): SlicePlane | null {
  const edges = shuffle(rng, boxEdges(dims)).slice(0, 3);
  const pts = edges.map(([a, b]) => {
    const t = pick(rng, PARAMS);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] as Vec3;
  });
  return planeThrough(pts[0], pts[1], pts[2]);
}

function shadowOf(points: Vec3[], normal: Vec3): Vec2[] {
  // Тень на ту грань, к которой плоскость ближе всего: отбрасываем ось с наибольшей долей нормали.
  const axis = [0, 1, 2].reduce((best, k) => (Math.abs(normal[k]) > Math.abs(normal[best]) ? k : best), 0);
  const keep = [0, 1, 2].filter((k) => k !== axis);
  return convexHull(points.map((p) => [p[keep[0]], p[keep[1]]]));
}

export function buildObliqueTask(level: number, rng: Rng): ObliqueTask {
  const spec = obliqueLevelSpec(level);
  const optionCount = levelParams(level).optionCount;
  for (let attempt = 0; attempt < 400; attempt++) {
    const dims = pick(rng, spec.dims);
    const plane = randomPlane(dims, rng);
    if (!plane) continue;
    const годное = sectionForTask(dims, plane, spec.sides);
    if (!годное) continue;
    const { section, truth } = годное;
    const options: ObliqueOption[] = [{ points: truth, isMatch: true, flaw: 'none' }];
    // От верного ответа — не ближе порога ступени; друг от друга — не ближе порога различимости.
    const differs = (p: Vec2[]) => polygonDistance(truth, p) >= spec.minDistance
      && options.every((o) => polygonDistance(o.points, p) >= OBLIQUE_MIN_DISTANCE);
    const push = (p: Vec2[] | null, flaw: ObliqueFlaw) => {
      if (!p || p.length < 3 || options.length >= optionCount) return;
      // Нечитаемый угол у подделки — подсказка или обман. Замер 17.09.2026 (1080 заданий): без этой
      // проверки 132 подделки были иглами — «вид под углом» 131, «тень» 1, углы вроде 3°/11°/166°:
      // такую сразу отбрасывают, и выбор сужается сам. А угол у 180° делает из шестиугольника
      // пятиугольник, и мера «разное число сторон — различимы» соврала бы.
      if (!readableAngles(p)) return;
      if (polygonArea2(p) < 1e-3 || !differs(p)) return;
      options.push({ points: p, isMatch: false, flaw });
    };
    push(convexHull(section.map(isoProject)), 'seen');
    push(shadowOf(section, plane.normal), 'shadow');
    for (let k = 0; k < 60 && options.length < optionCount; k++) {
      const otherDims = rng() < 0.7 ? dims : pick(rng, spec.dims);
      const other = randomPlane(otherDims, rng);
      if (!other) continue;
      const s = slicePolygon(otherDims, other);
      if (!s) continue;
      // Та же сторонность — сильнее всего путают; иначе ±1 сторона.
      if (k < 30 && s.length !== section.length) continue;
      push(to2D(s, other.normal), 'other');
    }
    if (options.length < optionCount) continue;
    const mixed = shuffle(rng, options);
    return {
      kind: 'oblique',
      dims,
      plane,
      section,
      options: mixed,
      correctIdx: mixed.findIndex((o) => o.isMatch),
      sides: section.length,
    };
  }
  throw new Error(`oblique ${level}: не собралось задание за 400 попыток`);
}

/** Для рисунка варианта: повернуть многоугольник длинной стороной вниз и вписать в квадрат `size`. */
export function fitPolygon(points: Vec2[], size: number, margin = 8): Vec2[] {
  const n = points.length;
  let longest = 0, idx = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % n];
    const l = Math.hypot(x2 - x1, y2 - y1);
    if (l > longest) { longest = l; idx = i; }
  }
  const [ax, ay] = points[idx], [bx, by] = points[(idx + 1) % n];
  const ang = -Math.atan2(by - ay, bx - ax);
  const c = Math.cos(ang), s = Math.sin(ang);
  let rotated = points.map(([x, y]) => [x * c - y * s, x * s + y * c] as Vec2);
  // Длинная сторона — внизу: если остальная фигура ниже неё, отражаем по вертикали.
  const baseY = rotated[idx][1];
  const meanY = rotated.reduce((t, p) => t + p[1], 0) / n;
  if (meanY > baseY) rotated = rotated.map(([x, y]) => [x, -y] as Vec2);
  const xs = rotated.map((p) => p[0]), ys = rotated.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  const k = (size - 2 * margin) / Math.max(w, h, EPS);
  const ox = (size - w * k) / 2 - Math.min(...xs) * k, oy = (size - h * k) / 2 - Math.min(...ys) * k;
  return rotated.map(([x, y]) => [x * k + ox, y * k + oy]);
}

