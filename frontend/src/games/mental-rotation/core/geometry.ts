/* psygames-mental-rotation-geometry · VER 1 · 23.08.2026 */
/**
 * ГЕОМЕТРИЯ: ОДИН ДВИЖОК ПОВОРОТА НА ФИГУРЫ И НА ГРАНИ КУБА.
 *
 * 🔴 ПОЧЕМУ ДВИЖОК ОДИН. Заданий три, и в каждом свой вопрос «а это тот же
 * объект?»: у фигуры — совпадают ли множества кубиков, у выкройки — совпадает ли
 * раскраска граней. Если крутить фигуры одними функциями, а грани — вторыми,
 * рано или поздно они разъедутся на знаке, и «зеркало» будет помечено верным
 * ответом. Поэтому грань представлена своей НОРМАЛЬЮ — тем же вектором [x,y,z],
 * что и кубик, — и крутится теми же тремя функциями.
 *
 * ⚠️ 24 ОРИЕНТАЦИИ ПЕРЕБИРАЮТСЯ, А НЕ ВЫПИСЫВАЮТСЯ. Композиция Rx^a·Ry^b·Rz^c по
 * a,b,c ∈ 0..3 даёт 64 произведения, среди которых ровно 24 различных поворота
 * куба — это и есть вся группа вращений. Выписанный руками список из 24 матриц
 * был бы местом для опечатки, которую не видно: пропущенная ориентация тихо
 * превращает верный поворот в «зеркало». Проба в тестах считает мощность набора.
 *
 * ⚠️ ЗЕРКАЛО ≠ ПОВОРОТ, И ЭТО ПРОВЕРЯЕТСЯ ПЕРЕБОРОМ, А НЕ ЧУТЬЁМ. Отражение
 * меняет ориентацию пространства, и никакой поворот его не компенсирует — но у
 * СИММЕТРИЧНОЙ фигуры зеркальная копия может совпасть с самой фигурой. Поэтому
 * «это зеркало» нигде не берётся по построению: спрашивается `isValidRotation`.
 */
import type { Axis, Cube, CubeFace, FaceMap, Shape } from './types';

// ─── повороты на 90° вокруг осей ──────────────────────────────────────────

export function rotateX([x, y, z]: Cube): Cube { return [x, -z, y]; }
export function rotateY([x, y, z]: Cube): Cube { return [z, y, -x]; }
export function rotateZ([x, y, z]: Cube): Cube { return [-y, x, z]; }

export function rotator(axis: Axis): (c: Cube) => Cube {
  return axis === 'x' ? rotateX : axis === 'y' ? rotateY : rotateZ;
}

/** Поворот фигуры на `times` четвертей вокруг оси. Отрицательные значения допустимы. */
export function rotateShape(shape: Shape, axis: Axis, times = 1): Shape {
  const fn = rotator(axis);
  const n = ((times % 4) + 4) % 4;
  let out = shape;
  for (let i = 0; i < n; i++) out = out.map(fn);
  return out;
}

/** Сдвиг фигуры в неотрицательный угол: сравнивать можно только нормализованные. */
export function normalizeShape(shape: Shape): Shape {
  if (shape.length === 0) return shape;
  const minX = Math.min(...shape.map((c) => c[0]));
  const minY = Math.min(...shape.map((c) => c[1]));
  const minZ = Math.min(...shape.map((c) => c[2]));
  return shape.map(([x, y, z]) => [x - minX, y - minY, z - minZ] as Cube);
}

/** Отпечаток фигуры: порядок кубиков в наборе не значит ничего, поэтому сортируем. */
export function shapeKey(shape: Shape): string {
  return shape.map((c) => c.join(',')).sort().join('|');
}

export function sameShape(a: Shape, b: Shape): boolean {
  return shapeKey(normalizeShape(a)) === shapeKey(normalizeShape(b));
}

/** Все РАЗЛИЧНЫЕ ориентации фигуры (нормализованные). У несимметричной их 24. */
export function allOrientations(shape: Shape): Shape[] {
  const seen = new Map<string, Shape>();
  for (let rx = 0; rx < 4; rx++) {
    for (let ry = 0; ry < 4; ry++) {
      for (let rz = 0; rz < 4; rz++) {
        const cand = normalizeShape(rotateShape(rotateShape(rotateShape(shape, 'x', rx), 'y', ry), 'z', rz));
        const key = shapeKey(cand);
        if (!seen.has(key)) seen.set(key, cand);
      }
    }
  }
  return [...seen.values()];
}

/** `b` — законный поворот `a` (а не зеркало и не другая фигура). */
export function isValidRotation(a: Shape, b: Shape): boolean {
  const target = shapeKey(normalizeShape(a));
  return allOrientations(b).some((o) => shapeKey(o) === target);
}

/** Отражение по оси X. Меняет ориентацию пространства — поворотом не компенсируется. */
export function mirrorShape(shape: Shape): Shape {
  return shape.map(([x, y, z]) => [-x, y, z] as Cube);
}

// ─── грани куба как нормали ───────────────────────────────────────────────

/**
 * Нормали граней. Согласованы с изометрией экрана: y — вверх, z — на зрителя,
 * x — вправо. Видимые в отрисовке грани — ровно `up`, `front`, `right`.
 */
export const FACE_NORMALS: Record<CubeFace, Cube> = {
  up: [0, 1, 0],
  down: [0, -1, 0],
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
};

const NORMAL_TO_FACE = new Map<string, CubeFace>(
  (Object.keys(FACE_NORMALS) as CubeFace[]).map((f) => [FACE_NORMALS[f].join(','), f]),
);

export function faceOfNormal(n: Cube): CubeFace {
  const face = NORMAL_TO_FACE.get(n.join(','));
  if (!face) throw new Error(`не грань куба: [${n.join(',')}]`);
  return face;
}

/** Поворот раскрашенного куба: значок едет вместе со своей гранью. */
export function rotateFaces(cube: FaceMap, axis: Axis, times = 1): FaceMap {
  const fn = rotator(axis);
  const n = ((times % 4) + 4) % 4;
  let out = cube;
  for (let i = 0; i < n; i++) {
    const next = {} as FaceMap;
    for (const face of Object.keys(out) as CubeFace[]) {
      next[faceOfNormal(fn(FACE_NORMALS[face]))] = out[face];
    }
    out = next;
  }
  return out;
}

export function faceKey(cube: FaceMap): string {
  return (Object.keys(FACE_NORMALS) as CubeFace[]).map((f) => `${f}:${cube[f]}`).join('|');
}

/** Все различные ориентации раскрашенного куба. При шести разных значках их 24. */
export function allCubeOrientations(cube: FaceMap): FaceMap[] {
  const seen = new Map<string, FaceMap>();
  for (let rx = 0; rx < 4; rx++) {
    for (let ry = 0; ry < 4; ry++) {
      for (let rz = 0; rz < 4; rz++) {
        const cand = rotateFaces(rotateFaces(rotateFaces(cube, 'x', rx), 'y', ry), 'z', rz);
        const key = faceKey(cand);
        if (!seen.has(key)) seen.set(key, cand);
      }
    }
  }
  return [...seen.values()];
}

/**
 * ЧТО ЧЕЛОВЕК ВИДИТ НА ВАРИАНТЕ — три значка на верхней, передней и правой гранях.
 *
 * 🔴 ПОЧЕМУ ОТВЕТ СУДИТСЯ ИМЕННО ПО ЭТОЙ ТРОЙКЕ, А НЕ ПО ВСЕМУ КУБУ. На кубике
 * видно три грани из шести. Подделка, отличающаяся только НЕВИДИМЫМИ гранями,
 * с экрана неотличима от правильной — и вопрос становится без ответа. Поэтому
 * вариант считается верным тогда и только тогда, когда его видимая тройка
 * встречается среди 24 видимых троек настоящего куба.
 */
export function visibleTriple(cube: FaceMap): string {
  return `${cube.up}|${cube.front}|${cube.right}`;
}

export function allVisibleTriples(cube: FaceMap): Set<string> {
  return new Set(allCubeOrientations(cube).map(visibleTriple));
}

/** Зеркальная сборка: левая и правая грани меняются значками. */
export function mirrorCube(cube: FaceMap): FaceMap {
  return { ...cube, right: cube.left, left: cube.right };
}

/** Перестановка значков двух граней — то, что человек путает чаще всего. */
export function swapFaces(cube: FaceMap, a: CubeFace, b: CubeFace): FaceMap {
  return { ...cube, [a]: cube[b], [b]: cube[a] };
}

/** Противоположная грань. Нужна, чтобы подделка «переставили две грани» брала СОСЕДНИЕ. */
export function oppositeFace(face: CubeFace): CubeFace {
  const n = FACE_NORMALS[face];
  return faceOfNormal([-n[0], -n[1], -n[2]]);
}
