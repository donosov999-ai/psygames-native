import { visualCrossingCount } from './geometry';
import {
  createRng,
  normalizeSeed,
  randomInt,
  shuffle,
  type Rng,
} from './rng';
import {
  ONE_LINE_GENERATOR_VERSION,
  type GeneratedOneLinePuzzle,
  type GraphEdge,
  type GraphVertex,
  type OneLinePuzzle,
} from './types';
import {
  edgeKey,
  findEulerTrail,
  validateEulerGraph,
  validateEulerSolution,
} from './validator';

const VERTEX_PROGRESSION = [4, 6, 7, 8, 9, 10, 11, 12] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function targetVertexCount(level: number): number {
  const index = Math.min(
    VERTEX_PROGRESSION.length - 1,
    Math.floor((Math.max(1, level) - 1) / 3),
  );
  return VERTEX_PROGRESSION[index] as number;
}

function addEdge(edges: GraphEdge[], a: string, b: string): void {
  edges.push({ id: `e${edges.length}`, a, b });
}

function chooseEarSize(rng: Rng, remaining: number): number {
  if (remaining <= 3) return remaining;
  const candidate = rng() < 0.5 ? 2 : 3;
  return remaining - candidate === 1 ? (candidate === 2 ? 3 : 2) : candidate;
}

function addClosedEars(
  vertexIds: string[],
  edges: GraphEdge[],
  rng: Rng,
  target: number,
): void {
  while (vertexIds.length < target) {
    const existingCount = vertexIds.length;
    const anchor = vertexIds[randomInt(rng, 0, existingCount - 1)] as string;
    const earSize = chooseEarSize(rng, target - existingCount);
    const ear: string[] = [];
    for (let index = 0; index < earSize; index += 1) {
      const id = `v${vertexIds.length}`;
      vertexIds.push(id);
      ear.push(id);
    }
    let previous = anchor;
    for (const id of ear) {
      addEdge(edges, previous, id);
      previous = id;
    }
    addEdge(edges, previous, anchor);
  }
}

function addOptionalTriangles(
  vertexIds: readonly string[],
  edges: GraphEdge[],
  rng: Rng,
  level: number,
): void {
  const desired = clamp(Math.floor((level - 9) / 8) + 1, 0, 3);
  for (let triangle = 0; triangle < desired; triangle += 1) {
    let added = false;
    for (let attempt = 0; attempt < 80 && !added; attempt += 1) {
      const [a, b, c] = shuffle(rng, vertexIds).slice(0, 3) as [string, string, string];
      const occupied = new Set(edges.map((edge) => edgeKey(edge.a, edge.b)));
      if ([edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)].some((key) => occupied.has(key))) {
        continue;
      }
      addEdge(edges, a, b);
      addEdge(edges, b, c);
      addEdge(edges, c, a);
      added = true;
    }
  }
}

function polarLayout(order: readonly string[], rng: Rng, variedRadius: boolean): GraphVertex[] {
  const offset = rng() * Math.PI * 2;
  return order.map((id, index) => {
    const angle = offset + index / order.length * Math.PI * 2;
    const radius = variedRadius ? 0.31 + rng() * 0.11 : 0.38;
    return {
      id,
      x: 0.5 + Math.cos(angle) * radius,
      y: 0.5 + Math.sin(angle) * radius,
    };
  });
}

function layoutGraph(
  vertexIds: readonly string[],
  edges: readonly GraphEdge[],
  rng: Rng,
  level: number,
): { vertices: GraphVertex[]; crossings: number } {
  if (level <= 3) {
    const vertices = polarLayout(vertexIds, rng, false);
    return { vertices, crossings: visualCrossingCount(vertices, edges) };
  }

  let best = polarLayout(shuffle(rng, vertexIds), rng, true);
  let bestCrossings = visualCrossingCount(best, edges);
  const attempts = 24 + Math.min(48, level);
  for (let attempt = 1; attempt < attempts; attempt += 1) {
    const candidate = polarLayout(shuffle(rng, vertexIds), rng, true);
    const crossings = visualCrossingCount(candidate, edges);
    if (crossings > bestCrossings) {
      best = candidate;
      bestCrossings = crossings;
    }
  }
  return { vertices: best, crossings: bestCrossings };
}

function shouldCreateCircuit(level: number): boolean {
  return level === 1 || level % 3 === 1;
}

function puzzleDifficulty(
  level: number,
  vertexCount: number,
  edgeCount: number,
  crossings: number,
  isCircuit: boolean,
  hasStartHint: boolean,
): number {
  return clamp(Math.round(
    6
    + level * 1.2
    + (vertexCount - 4) * 4
    + (edgeCount - 4) * 2
    + Math.min(18, crossings * 1.5)
    + (isCircuit ? 2 : 5)
    + (hasStartHint ? 0 : 8),
  ), 1, 100);
}

export function generateOneLinePuzzle(seed: string, requestedLevel: number): GeneratedOneLinePuzzle {
  const normalizedSeed = normalizeSeed(seed);
  const level = Math.max(1, Math.floor(requestedLevel));
  const rng = createRng(`${normalizedSeed}:${level}:${ONE_LINE_GENERATOR_VERSION}`);
  const vertexIds = ['v0', 'v1', 'v2', 'v3'];
  const edges: GraphEdge[] = [];
  addEdge(edges, 'v0', 'v1');
  addEdge(edges, 'v1', 'v2');
  addEdge(edges, 'v2', 'v3');
  addEdge(edges, 'v3', 'v0');

  addClosedEars(vertexIds, edges, rng, targetVertexCount(level));
  addOptionalTriangles(vertexIds, edges, rng, level);

  const circuit = shouldCreateCircuit(level);
  if (!circuit) {
    edges.splice(randomInt(rng, 0, edges.length - 1), 1);
  }
  edges.forEach((edge, index) => { edge.id = `e${index}`; });

  const layout = layoutGraph(vertexIds, edges, rng, level);
  const draft: OneLinePuzzle = {
    id: `one-line:${normalizedSeed}:${level}`,
    seed: normalizedSeed,
    level,
    difficulty: 1,
    vertices: layout.vertices,
    edges,
    visualCrossings: layout.crossings,
    isCircuit: circuit,
    startHintVertexId: null,
    generatorVersion: ONE_LINE_GENERATOR_VERSION,
  };
  const validation = validateEulerGraph(draft);
  if (!validation.valid) {
    throw new Error(`Generated invalid Euler graph: ${validation.issues.join(', ')}`);
  }
  const solution = findEulerTrail(draft);
  if (!solution || !validateEulerSolution(draft, solution)) {
    throw new Error('Independent Euler solver could not consume every generated edge');
  }
  const startHintVertexId = level <= 3 ? (solution.vertexIds[0] ?? null) : null;
  draft.startHintVertexId = startHintVertexId;
  draft.difficulty = puzzleDifficulty(
    level,
    draft.vertices.length,
    draft.edges.length,
    draft.visualCrossings,
    draft.isCircuit,
    startHintVertexId !== null,
  );
  return { ...draft, solution };
}

export function publicOneLinePuzzle(puzzle: GeneratedOneLinePuzzle): OneLinePuzzle {
  const { solution: _solution, ...published } = puzzle;
  return published;
}
