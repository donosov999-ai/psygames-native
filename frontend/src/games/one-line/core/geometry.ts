/* psygames-one-line-geometry · VER 2 · 22.08.2026 */
import type { GraphEdge, GraphVertex } from './types';

function cross(a: GraphVertex, b: GraphVertex, c: GraphVertex): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

export function segmentsProperlyIntersect(
  a: GraphVertex,
  b: GraphVertex,
  c: GraphVertex,
  d: GraphVertex,
): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  const epsilon = 1e-9;
  if ([abC, abD, cdA, cdB].some((value) => Math.abs(value) <= epsilon)) return false;
  return Math.sign(abC) !== Math.sign(abD) && Math.sign(cdA) !== Math.sign(cdB);
}

export function visualCrossingCount(vertices: readonly GraphVertex[], edges: readonly GraphEdge[]): number {
  const byId = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  let crossings = 0;
  for (let leftIndex = 0; leftIndex < edges.length; leftIndex += 1) {
    const left = edges[leftIndex] as GraphEdge;
    for (let rightIndex = leftIndex + 1; rightIndex < edges.length; rightIndex += 1) {
      const right = edges[rightIndex] as GraphEdge;
      if ([left.a, left.b].some((id) => id === right.a || id === right.b)) continue;
      const a = byId.get(left.a);
      const b = byId.get(left.b);
      const c = byId.get(right.a);
      const d = byId.get(right.b);
      if (a && b && c && d && segmentsProperlyIntersect(a, b, c, d)) crossings += 1;
    }
  }
  return crossings;
}

export function nearestVertex(
  vertices: readonly GraphVertex[],
  x: number,
  y: number,
  maxDistance: number,
): GraphVertex | null {
  let nearest: GraphVertex | null = null;
  let best = maxDistance;
  for (const vertex of vertices) {
    const distance = Math.hypot(vertex.x - x, vertex.y - y);
    if (distance <= best) {
      best = distance;
      nearest = vertex;
    }
  }
  return nearest;
}

/**
 * КУДА ВЕДЁТ ПАЛЕЦ — ПО РЕБРУ, А НЕ ПО ПОПАДАНИЮ В ТОЧКУ.
 *
 * 🔴 ЧТО БЫЛО ДО 22.08.2026. Ход выбирался ближайшей вершиной в 38 пикселях от
 * пальца (`nearestVertex`), без всякой связи с тем, есть ли туда ребро и вёл ли
 * человек ВДОЛЬ него. Отсюда две беды сразу:
 *   · играть приходилось попаданием в кружки, а не рисованием линии — от игры про
 *     «начерти одним росчерком» оставалось «ткни по очереди в семь кнопок»;
 *   · палец, проехавший мимо чужой точки, звал ход, которого нет, и партия
 *     засчитывала ОШИБКУ. То есть игра наказывала за движение пальцем — за то
 *     самое, чего от человека и хочет.
 *
 * ⚠️ ПОЧЕМУ ДОПУСК СЧИТАЕТСЯ ВБОК, А НЕ УГЛОМ. Угловой допуск ведёт себя
 * противоположно ожиданию: на коротком ребре те же пять градусов — это пара
 * пикселей (не попасть), на длинном — половина экрана (задеть соседнее ребро).
 * Человек же чувствует не угол, а «насколько я промахнулся мимо линии». Поэтому
 * порог здесь — расстояние от пальца до ПРЯМОЙ ребра, одинаковое в пикселях на
 * любой длине.
 *
 * Три условия, и каждое закрывает свою ошибку:
 *   1. палец ушёл почти до конца ребра — иначе ход засчитывался бы от касания;
 *   2. палец идёт ВПЕРЁД по ребру — иначе движение назад читалось бы как ход
 *      вперёд: вбок оно отклоняется ровно так же мало;
 *   3. отклонение вбок меньше порога — «я веду по этой линии, а не по соседней».
 * Из подходящих берётся БЛИЖАЙШАЯ вершина: на развилке из одной точки выигрывает
 * то ребро, которое человек уже прошёл целиком.
 */
export interface EdgeTargetOptions {
  /** Радиус вершины в тех же единицах, что координаты (у нас — доли доски). */
  radius: number;
  /** Допуск вбок, в радиусах вершины. */
  angleBias?: number;
  /** За сколько радиусов до конца ребра ход засчитывается. */
  commitBias?: number;
}

export function edgeTargetVertex(
  from: GraphVertex,
  neighbours: readonly GraphVertex[],
  pointerX: number,
  pointerY: number,
  { radius, angleBias = 1.35, commitBias = 1.5 }: EdgeTargetOptions,
): GraphVertex | null {
  const px = pointerX - from.x;
  const py = pointerY - from.y;
  const pointerLength = Math.hypot(px, py);
  if (pointerLength <= 0) return null;

  let target: GraphVertex | null = null;
  let targetDistance = Number.POSITIVE_INFINITY;
  for (const vertex of neighbours) {
    const vx = vertex.x - from.x;
    const vy = vertex.y - from.y;
    const distance = Math.hypot(vx, vy);
    if (distance <= 0 || distance >= targetDistance) continue;
    if (pointerLength <= distance - radius * commitBias) continue;      // 1. дошёл до конца
    if ((px * vx + py * vy) / distance <= 0) continue;                   // 2. идёт вперёд
    if (Math.abs(px * vy - py * vx) / distance >= radius * angleBias) continue;   // 3. не сбился вбок
    target = vertex;
    targetDistance = distance;
  }
  return target;
}
