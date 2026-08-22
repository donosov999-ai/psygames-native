import type {
  EulerSolution,
  GraphEdge,
  GraphValidation,
  OneLinePuzzle,
} from './types';

export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function validateEulerGraph(puzzle: OneLinePuzzle): GraphValidation {
  const issues: string[] = [];
  const vertexIds = new Set<string>();
  const degrees: Record<string, number> = {};
  for (const vertex of puzzle.vertices) {
    if (vertexIds.has(vertex.id)) issues.push(`duplicate vertex ${vertex.id}`);
    vertexIds.add(vertex.id);
    degrees[vertex.id] = 0;
    if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.y)
      || vertex.x < 0 || vertex.x > 1 || vertex.y < 0 || vertex.y > 1) {
      issues.push(`vertex ${vertex.id} is outside normalized bounds`);
    }
  }

  const edgeIds = new Set<string>();
  const topology = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const id of vertexIds) adjacency.set(id, []);
  for (const edge of puzzle.edges) {
    if (edgeIds.has(edge.id)) issues.push(`duplicate edge id ${edge.id}`);
    edgeIds.add(edge.id);
    if (edge.a === edge.b) issues.push(`self-loop ${edge.id}`);
    if (!vertexIds.has(edge.a) || !vertexIds.has(edge.b)) {
      issues.push(`edge ${edge.id} references missing vertex`);
      continue;
    }
    const key = edgeKey(edge.a, edge.b);
    if (topology.has(key)) issues.push(`parallel edge ${key}`);
    topology.add(key);
    degrees[edge.a] = (degrees[edge.a] ?? 0) + 1;
    degrees[edge.b] = (degrees[edge.b] ?? 0) + 1;
    adjacency.get(edge.a)?.push(edge.b);
    adjacency.get(edge.b)?.push(edge.a);
  }

  const nonIsolated = [...vertexIds].filter((id) => (degrees[id] ?? 0) > 0);
  const visited = new Set<string>();
  const first = nonIsolated[0];
  if (first) {
    const stack = [first];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const neighbor of adjacency.get(current) ?? []) stack.push(neighbor);
    }
  }
  const connected = nonIsolated.length > 0 && visited.size === nonIsolated.length;
  if (!connected) issues.push('graph is disconnected');
  if (nonIsolated.length !== vertexIds.size) issues.push('graph has isolated vertices');
  const oddVertexIds = [...vertexIds].filter((id) => (degrees[id] ?? 0) % 2 === 1).sort();
  if (oddVertexIds.length !== 0 && oddVertexIds.length !== 2) {
    issues.push(`odd degree count ${oddVertexIds.length}`);
  }
  return {
    valid: issues.length === 0,
    connected,
    oddVertexIds,
    degrees,
    issues,
  };
}

function other(edge: GraphEdge, vertexId: string): string {
  return edge.a === vertexId ? edge.b : edge.a;
}

export function findEulerTrail(puzzle: OneLinePuzzle, requestedStart?: string): EulerSolution | null {
  const validation = validateEulerGraph(puzzle);
  if (!validation.valid) return null;
  const start = requestedStart
    ?? validation.oddVertexIds[0]
    ?? puzzle.vertices.find((vertex) => (validation.degrees[vertex.id] ?? 0) > 0)?.id;
  if (!start) return null;
  if (validation.oddVertexIds.length === 2 && !validation.oddVertexIds.includes(start)) return null;

  const edgeById = new Map(puzzle.edges.map((edge) => [edge.id, edge]));
  const adjacency = new Map<string, string[]>();
  for (const vertex of puzzle.vertices) adjacency.set(vertex.id, []);
  for (const edge of puzzle.edges) {
    adjacency.get(edge.a)?.push(edge.id);
    adjacency.get(edge.b)?.push(edge.id);
  }
  const used = new Set<string>();
  const vertexStack = [start];
  const edgeStack: string[] = [];
  const reversedVertices: string[] = [];
  const reversedEdges: string[] = [];

  while (vertexStack.length > 0) {
    const current = vertexStack[vertexStack.length - 1] as string;
    const edgeId = (adjacency.get(current) ?? []).find((candidate) => !used.has(candidate));
    if (edgeId) {
      used.add(edgeId);
      const edge = edgeById.get(edgeId) as GraphEdge;
      vertexStack.push(other(edge, current));
      edgeStack.push(edgeId);
    } else {
      reversedVertices.push(vertexStack.pop() as string);
      const incoming = edgeStack.pop();
      if (incoming) reversedEdges.push(incoming);
    }
  }
  if (used.size !== puzzle.edges.length) return null;
  return {
    vertexIds: reversedVertices.reverse(),
    edgeIds: reversedEdges.reverse(),
  };
}

export function validateEulerSolution(puzzle: OneLinePuzzle, solution: EulerSolution): boolean {
  if (solution.edgeIds.length !== puzzle.edges.length
    || solution.vertexIds.length !== puzzle.edges.length + 1) return false;
  if (new Set(solution.edgeIds).size !== puzzle.edges.length) return false;
  const edgeById = new Map(puzzle.edges.map((edge) => [edge.id, edge]));
  for (let index = 0; index < solution.edgeIds.length; index += 1) {
    const edge = edgeById.get(solution.edgeIds[index] as string);
    const from = solution.vertexIds[index];
    const to = solution.vertexIds[index + 1];
    if (!edge || !from || !to) return false;
    if (!((edge.a === from && edge.b === to) || (edge.a === to && edge.b === from))) return false;
  }
  return true;
}

/**
 * СКОЛЬКО РАЗ РЕБРО НАДО ПРОЙТИ. Обычное и одностороннее — один, двойное — два.
 */
export function edgeUses(edge: GraphEdge): number {
  return edge.kind === 'double' ? 2 : 1;
}

/** Сколько проходов нужно, чтобы закрыть всю фигуру. Не число рёбер — число ПРОХОДОВ. */
export function totalEdgeUses(edges: readonly GraphEdge[]): number {
  return edges.reduce((sum, edge) => sum + edgeUses(edge), 0);
}

/** Сколько раз каждое ребро уже пройдено. */
export function edgeUseCounts(edgeTrail: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of edgeTrail) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/** Осталось ли по ребру хоть один проход. */
export function edgeHasUsesLeft(edge: GraphEdge, counts: ReadonlyMap<string, number>): boolean {
  return (counts.get(edge.id) ?? 0) < edgeUses(edge);
}

/**
 * Пускает ли ребро из `from` в `to`. У одностороннего направление одно: `a` → `b`.
 * Назад по нему хода нет вовсе — без сообщения и без ошибки, ровно как стена.
 */
export function edgeAllowsDirection(edge: GraphEdge, from: string, to: string): boolean {
  if (edge.kind === 'oneway') return edge.a === from && edge.b === to;
  return (edge.a === from && edge.b === to) || (edge.a === to && edge.b === from);
}

/**
 * ПРОВЕРКА РИСОВАННОГО УРОВНЯ — ПРОИГРЫВАНИЕМ, А НЕ АРИФМЕТИКОЙ ЧЁТНОСТИ.
 *
 * ⚠️ ПОЧЕМУ НЕ ПО ЧЁТНОСТИ СТЕПЕНЕЙ. Правило «ноль или две нечётные вершины»
 * верно для НЕОРИЕНТИРОВАННОГО графа. Появилось одностороннее ребро — граф стал
 * смешанным, и это правило про него уже не отвечает ни да, ни нет. Врать про
 * решаемость хуже, чем не знать: человек упрётся в задачу без решения.
 *
 * Поэтому у рисованного уровня решение лежит рядом, а гейт его ПРОИГРЫВАЕТ:
 * каждый шаг обязан идти по существующему ребру, в разрешённую сторону, и к
 * концу каждое ребро обязано быть пройдено ровно столько раз, сколько положено.
 */
export function validateAuthoredSolution(
  puzzle: OneLinePuzzle,
  solution: readonly string[],
): string[] {
  const issues: string[] = [];
  const byId = new Map(puzzle.vertices.map((vertex) => [vertex.id, vertex]));
  const counts = new Map<string, number>();
  if (solution.length < 2) return ['solution is shorter than one move'];

  for (let step = 1; step < solution.length; step += 1) {
    const from = solution[step - 1] as string;
    const to = solution[step] as string;
    if (!byId.has(from) || !byId.has(to)) { issues.push(`step ${step}: unknown vertex`); continue; }
    const edge = puzzle.edges.find((candidate) => (
      edgeAllowsDirection(candidate, from, to) && edgeHasUsesLeft(candidate, counts)
    ));
    if (!edge) { issues.push(`step ${step}: no free edge ${from} -> ${to}`); continue; }
    counts.set(edge.id, (counts.get(edge.id) ?? 0) + 1);
  }

  for (const edge of puzzle.edges) {
    const done = counts.get(edge.id) ?? 0;
    const need = edgeUses(edge);
    if (done !== need) issues.push(`edge ${edge.id}: passed ${done} of ${need}`);
  }
  return issues;
}
