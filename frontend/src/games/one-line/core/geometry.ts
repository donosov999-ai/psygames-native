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
