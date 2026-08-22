import { AUTHORED_LEVEL_COUNT, authoredLevel } from './authored';
import { visualCrossingCount } from './geometry';
import {
  createRng,
  normalizeSeed,
  randomInt,
  shuffle,
  type Rng,
} from './rng';
import {
  type EulerSolution,
  ONE_LINE_GENERATOR_VERSION,
  type GeneratedOneLinePuzzle,
  type GraphEdge,
  type GraphVertex,
  type OneLinePuzzle,
} from './types';
import {
  edgeAllowsDirection,
  edgeHasUsesLeft,
  edgeKey,
  findEulerTrail,
  validateEulerGraph,
  validateEulerSolution,
} from './validator';

const VERTEX_PROGRESSION = [4, 6, 7, 8, 9, 10, 11, 12] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Сколько точек на уровне.
 *
 * 🔴 СЧИТАЕМ ОТ КОНЦА РИСОВАННЫХ, А НЕ ОТ НОМЕРА. Лестница из восьми ступеней по
 * три уровня заканчивалась на двадцать четвёртом — ровно там, где раньше кончались
 * рисованные фигуры. Фигур стало двадцать четыре, и первый же сгенерированный
 * уровень стал выходить СРАЗУ НА ПОТОЛКЕ: двенадцать точек после девяти у последней
 * рисованной, и дальше расти нечему. Ступень должна отмеряться от того места, где
 * генератор ВСТУПАЕТ, — тогда переход от рисунка к генерации плавный.
 */
function targetVertexCount(level: number): number {
  const step = Math.max(1, level - AUTHORED_LEVEL_COUNT);
  const index = Math.min(VERTEX_PROGRESSION.length - 1, Math.floor((step - 1) / 3));
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
  /**
   * 🔴 РОСТ НЕ ДОЛЖЕН КОНЧАТЬСЯ НА ДВАДЦАТЬ ПЯТОМ. Прежний потолок в три
   * треугольника достигался к 25-му уровню, а число вершин упирается в
   * двенадцать к 22-му — то есть 27 уровней из 48 давали ОДИН И ТОТ ЖЕ граф,
   * только перетасованный. Замер разбора 22.08.2026.
   *
   * Треугольник добавляет каждой своей вершине по два ребра, значит чётность не
   * меняется и росчерк остаётся возможным. Поэтому растить ими безопасно.
   */
  const desired = clamp(Math.floor((level - 9) / 5) + 1, 0, 7);
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

/**
 * РИСОВАННЫЙ УРОВЕНЬ ИДЁТ ПЕРВЫМ, ГЕНЕРАТОР ПОДХВАТЫВАЕТ ДАЛЬШЕ.
 *
 * Первые двенадцать уровней — фигуры руками (домик, конверт, звезда, ключ): их
 * человек узнаёт и запоминает, а генератор такого не даёт — правильный граф это
 * ещё не рисунок. Кончились рисованные — дальше бесконечно считает генератор.
 *
 * ⚠️ ФИГУРА НЕ ЗАВИСИТ ОТ ЗЕРНА. Один и тот же номер уровня — одна и та же
 * фигура у всех: иначе «тот, где звезда» перестаёт быть общим языком, и разговор
 * про уровень теряет смысл. Зерно продолжает решать всё, что дальше двенадцатого.
 */
function authoredPuzzle(level: number, seed: string): GeneratedOneLinePuzzle | null {
  const authored = authoredLevel(level);
  if (!authored) return null;
  const draft: OneLinePuzzle = {
    id: `one-line:authored:${authored.shape}`,
    seed,
    level,
    difficulty: 1,
    vertices: authored.vertices,
    edges: authored.edges,
    visualCrossings: visualCrossingCount(authored.vertices, authored.edges),
    isCircuit: authored.solution[0] === authored.solution[authored.solution.length - 1],
    startHintVertexId: level <= 3 ? (authored.solution[0] ?? null) : null,
    generatorVersion: ONE_LINE_GENERATOR_VERSION,
  };
  const edgeIds: string[] = [];
  for (let step = 1; step < authored.solution.length; step += 1) {
    const from = authored.solution[step - 1] as string;
    const to = authored.solution[step] as string;
    const taken = new Map<string, number>();
    for (const id of edgeIds) taken.set(id, (taken.get(id) ?? 0) + 1);
    const edge = draft.edges.find((candidate) => (
      edgeAllowsDirection(candidate, from, to) && edgeHasUsesLeft(candidate, taken)
    ));
    if (edge) edgeIds.push(edge.id);
  }
  return {
    ...draft,
    difficulty: puzzleDifficulty(
      level,
      draft.vertices.length,
      draft.edges.length,
      draft.visualCrossings,
      draft.isCircuit,
      draft.startHintVertexId !== null,
    ),
    solution: { vertexIds: authored.solution, edgeIds },
  };
}

/**
 * Приправа: одностороннее и двойное ребро поверх уже готового росчерка.
 *
 * Доля растёт с уровнем и остаётся МАЛОЙ. У игры-образца на 808 рёбер всего 13
 * двойных и 12 односторонних — три процента. Приправа работает, пока её мало:
 * доска из одних стрелок это уже не «одна линия», а лабиринт.
 */
function addEdgeKinds(
  draft: OneLinePuzzle,
  solution: EulerSolution,
  level: number,
  rng: Rng,
): { vertices: GraphVertex[]; edges: GraphEdge[]; solution: EulerSolution } {
  const vertices = draft.vertices.map((v) => ({ ...v }));
  const edges = draft.edges.map((e) => ({ ...e }));
  const vertexIds = [...solution.vertexIds];
  const edgeIds = [...solution.edgeIds];

  // Сколько приправы позволяет уровень: одна стрелка с 13-го, дальше по одной
  // за десяток, но не больше десятой части рёбер.
  const arrows = Math.min(
    Math.max(0, Math.floor((level - AUTHORED_LEVEL_COUNT) / 10) + (level > AUTHORED_LEVEL_COUNT ? 1 : 0)),
    Math.floor(edges.length / 10),
  );
  if (arrows > 0) {
    const byId = new Map(edges.map((e) => [e.id, e]));
    const steps = shuffle(rng, edgeIds.map((id, at) => ({ id, at })));
    let done = 0;
    for (const step of steps) {
      if (done >= arrows) break;
      const edge = byId.get(step.id);
      if (!edge || edge.kind) continue;
      const from = vertexIds[step.at];
      const to = vertexIds[step.at + 1];
      if (!from || !to) continue;
      // Ребро проходится ровно один раз — иначе стрелка запретила бы второй проход.
      if (edgeIds.filter((x) => x === step.id).length !== 1) continue;
      edge.a = from;
      edge.b = to;
      edge.kind = 'oneway';
      done += 1;
    }
  }

  // Двойное — отростком: из точки пути выходит ребро в НОВУЮ вершину и
  // проходится туда и обратно. Чётность обеих вершин не меняется.
  /**
   * ⚠️ ЛЕСТНИЦА ПРИПРАВЫ СЧИТАЕТСЯ ОТ КОНЦА РИСОВАННЫХ, А НЕ ОТ НОМЕРА УРОВНЯ.
   * Пока фигур было двенадцать, «с восемнадцатого» означало «через шесть уровней
   * после рисованных». Фигур стало двадцать четыре — и та же цифра стала означать
   * «сразу», то есть первый же сгенерированный уровень выходил с приправой. Считаем
   * от `AUTHORED_LEVEL_COUNT`: правило про ОТСТУП, а не про абсолютный номер.
   */
  const past = level - AUTHORED_LEVEL_COUNT;
  const doubles = past >= 6 ? Math.min(1 + Math.floor((past - 6) / 15), 3) : 0;
  for (let k = 0; k < doubles; k += 1) {
    const at = 1 + Math.floor(rng() * Math.max(1, vertexIds.length - 2));
    const hub = vertexIds[at];
    if (!hub) continue;
    const anchor = vertices.find((v) => v.id === hub);
    if (!anchor) continue;
    // Отросток ставим рядом с точкой, но внутри доски и не поверх соседей.
    const angle = rng() * Math.PI * 2;
    const x = Math.min(0.92, Math.max(0.08, anchor.x + Math.cos(angle) * 0.16));
    const y = Math.min(0.92, Math.max(0.08, anchor.y + Math.sin(angle) * 0.16));
    if (vertices.some((v) => Math.hypot(v.x - x, v.y - y) < 0.13)) continue;
    const tip: GraphVertex = { id: `v${vertices.length}`, x, y };
    const edge: GraphEdge = { id: `e${edges.length}`, a: hub, b: tip.id, kind: 'double' };
    vertices.push(tip);
    edges.push(edge);
    // Вставляем «сходил и вернулся» ровно там, где путь проходит через точку.
    vertexIds.splice(at + 1, 0, tip.id, hub);
    edgeIds.splice(at, 0, edge.id, edge.id);
  }

  return { vertices, edges, solution: { vertexIds, edgeIds } };
}

export function generateOneLinePuzzle(seed: string, requestedLevel: number): GeneratedOneLinePuzzle {
  const normalizedSeed = normalizeSeed(seed);
  const level = Math.max(1, Math.floor(requestedLevel));
  const authored = authoredPuzzle(level, normalizedSeed);
  if (authored) return authored;
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
  /**
   * 🔴 НОВЫЕ ВИДЫ РЁБЕР ПОЯВЛЯЮТСЯ И У ГЕНЕРАТОРА, А НЕ ТОЛЬКО В РИСОВАННЫХ.
   *
   * До 22.08.2026 двойных и односторонних рёбер генератор не ставил ВООБЩЕ: они
   * жили только в двенадцати рисованных уровнях, а дальше словарь механик
   * схлопывался ровно там, где должен расти. Человек знакомился со стрелкой на
   * одиннадцатом уровне и больше не видел её никогда.
   *
   * ⚠️ БЕЗОПАСНОСТЬ ПО ПОСТРОЕНИЮ, А НЕ ПО ПРОВЕРКЕ. Смешанный граф (со
   * стрелками) правилом чётности не описывается, и доказать решаемость перебором
   * дорого. Поэтому оба вида добавляются так, что УЖЕ НАЙДЕННЫЙ путь остаётся
   * рабочим:
   *   · одностороннее делается из ребра, которое путь и так проходит, и
   *     направление берётся то, в котором он его проходит — вариантов у игрока
   *     становится меньше, но решение остаётся;
   *   · двойное подвешивается новой вершиной: из точки пути выходит отросток,
   *     который проходится туда и обратно. Чётность обеих вершин не меняется.
   */
  const spiced = addEdgeKinds(draft, solution, level, rng);
  const startHintVertexId = level <= 3 ? (spiced.solution.vertexIds[0] ?? null) : null;
  draft.vertices = spiced.vertices;
  draft.edges = spiced.edges;
  draft.startHintVertexId = startHintVertexId;
  draft.difficulty = puzzleDifficulty(
    level,
    draft.vertices.length,
    draft.edges.length,
    draft.visualCrossings,
    draft.isCircuit,
    startHintVertexId !== null,
  );
  return { ...draft, solution: spiced.solution };
}

export function publicOneLinePuzzle(puzzle: GeneratedOneLinePuzzle): OneLinePuzzle {
  const { solution: _solution, ...published } = puzzle;
  return published;
}
