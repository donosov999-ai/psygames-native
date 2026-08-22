/* psygames-one-line-authored · VER 1 · 22.08.2026 */
/**
 * РИСОВАННЫЕ УРОВНИ «ОДНОЙ ЛИНИИ» — КАЖДЫЙ ПРОИГРЫВАЕТСЯ ХОД ЗА ХОДОМ.
 *
 * 🔴 ПОЧЕМУ НЕ СЧИТАЕМ ЧЁТНОСТЬ. Правило «ноль или две нечётные вершины» верно для
 * НЕОРИЕНТИРОВАННОГО графа. Появилось одностороннее ребро — граф стал смешанным, и
 * это правило про него не отвечает ни да, ни нет. Соврать про решаемость хуже, чем
 * не знать: человек упрётся в задачу без решения и решит, что дело в нём.
 *
 * Поэтому проверка не рассуждает, а ПРОХОДИТ путь: каждый шаг обязан идти по
 * существующему ребру, в разрешённую сторону, и к концу каждое ребро обязано быть
 * пройдено ровно столько раз, сколько положено — двойное дважды, остальные однажды.
 */
import {
  AUTHORED_LEVELS,
  AUTHORED_LEVEL_COUNT,
  authoredLevel,
} from '@/src/games/one-line/core/authored';
import {
  edgeAllowsDirection,
  edgeUses,
  totalEdgeUses,
  validateAuthoredSolution,
  validateEulerGraph,
} from '@/src/games/one-line/core/validator';
import type { OneLinePuzzle } from '@/src/games/one-line/core/types';

const asPuzzle = (index: number): OneLinePuzzle => {
  const level = AUTHORED_LEVELS[index] as (typeof AUTHORED_LEVELS)[number];
  return {
    id: `authored:${level.shape}`,
    seed: 'authored',
    level: index + 1,
    difficulty: 1,
    vertices: level.vertices,
    edges: level.edges,
    visualCrossings: 0,
    isCircuit: false,
    startHintVertexId: null,
    generatorVersion: 1 as never,
  };
};

describe('рисованные уровни решаются', () => {
  it('их дюжина, и счётчик не расходится со списком', () => {
    expect(AUTHORED_LEVEL_COUNT).toBe(AUTHORED_LEVELS.length);
    expect(AUTHORED_LEVEL_COUNT).toBeGreaterThanOrEqual(12);
  });

  it.each(AUTHORED_LEVELS.map((l, i) => [l.shape, i] as const))(
    '«%s» проходится целиком, без невозможных шагов',
    (_shape, index) => {
      const puzzle = asPuzzle(index);
      const level = AUTHORED_LEVELS[index] as (typeof AUTHORED_LEVELS)[number];
      expect(validateAuthoredSolution(puzzle, level.solution)).toEqual([]);
    },
  );

  it('длина пути совпадает с числом ПРОХОДОВ, а не рёбер', () => {
    for (const level of AUTHORED_LEVELS) {
      const passes = totalEdgeUses(level.edges);
      expect(level.solution.length - 1).toBe(passes);
      // Двойные рёбра обязаны делать путь длиннее числа рёбер — иначе они не двойные.
      if (level.edges.some((e) => e.kind === 'double')) {
        expect(passes).toBeGreaterThan(level.edges.length);
      }
    }
  });
});

describe('фигура — это фигура, а не мусор', () => {
  it('точки не дублируются, рёбра не висят в пустоте, петель нет', () => {
    for (const level of AUTHORED_LEVELS) {
      const validation = validateEulerGraph(asPuzzle(AUTHORED_LEVELS.indexOf(level)));
      // Чётность у смешанного графа не проверяем — но мусор в структуре ловим.
      const structural = validation.issues.filter((i) => !/odd|parity|degree/i.test(i));
      expect(structural).toEqual([]);
    }
  });

  it('всё влезает в доску и не липнет к самому краю', () => {
    for (const level of AUTHORED_LEVELS) {
      for (const vertex of level.vertices) {
        expect(vertex.x).toBeGreaterThanOrEqual(0.1);
        expect(vertex.x).toBeLessThanOrEqual(0.9);
        expect(vertex.y).toBeGreaterThanOrEqual(0.1);
        expect(vertex.y).toBeLessThanOrEqual(0.9);
      }
    }
  });

  it('точки не наезжают друг на друга — иначе в них не попасть пальцем', () => {
    for (const level of AUTHORED_LEVELS) {
      for (let i = 0; i < level.vertices.length; i += 1) {
        for (let j = i + 1; j < level.vertices.length; j += 1) {
          const a = level.vertices[i] as { x: number; y: number };
          const b = level.vertices[j] as { x: number; y: number };
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.12);
        }
      }
    }
  });

  it('каждое ребро проходится один раз, двойное — два, и третьего не дано', () => {
    for (const level of AUTHORED_LEVELS) {
      for (const edge of level.edges) {
        expect([1, 2]).toContain(edgeUses(edge));
        expect(edgeUses(edge)).toBe(edge.kind === 'double' ? 2 : 1);
      }
    }
  });
});

describe('лестница ведёт', () => {
  it('первые восемь — чистый росчерк, приправы там нет', () => {
    for (let level = 1; level <= 8; level += 1) {
      const authored = authoredLevel(level);
      expect(authored).not.toBeNull();
      expect((authored as { edges: { kind?: string }[] }).edges.every((e) => !e.kind)).toBe(true);
    }
  });

  it('двойное ребро появляется раньше одностороннего', () => {
    const firstWith = (kind: string) => AUTHORED_LEVELS
      .findIndex((l) => l.edges.some((e) => e.kind === kind));
    expect(firstWith('double')).toBeGreaterThanOrEqual(8);
    expect(firstWith('double')).toBeLessThan(firstWith('oneway'));
  });

  it('за дюжиной рисованных начинается генератор', () => {
    expect(authoredLevel(AUTHORED_LEVEL_COUNT)).not.toBeNull();
    expect(authoredLevel(AUTHORED_LEVEL_COUNT + 1)).toBeNull();
  });
});

/**
 * 🔴 ОБРАТНАЯ СТОРОНА — БЕЗ НЕЁ ПРОВЕРКА ОДНОСТОРОННЯЯ.
 *
 * 22.08.2026 три мутации подряд остались зелёными: одностороннее ребро начало
 * пускать назад, проверка пути перестала смотреть направление, и перестала
 * требовать пройти ВСЁ. Причина одна: гейт спрашивал только «верный путь
 * принимается?» — а на этот вопрос сломанная проверка отвечает правильно.
 * Ровно та же слепота, что нашлась в тот же день у «Ритма и высоты» и
 * «Навигатора». Значит спрашивать надо и обратное: отвергается ли неверный.
 */
describe('неверный путь обязан быть отвергнут', () => {
  const withOneway = AUTHORED_LEVELS.findIndex((l) => l.edges.some((e) => e.kind === 'oneway'));
  const withDouble = AUTHORED_LEVELS.findIndex((l) => l.edges.some((e) => e.kind === 'double'));

  it('одностороннее ребро назад не пускает', () => {
    const edge = { id: 'e', a: 'v1', b: 'v2', kind: 'oneway' as const };
    expect(edgeAllowsDirection(edge, 'v1', 'v2')).toBe(true);
    expect(edgeAllowsDirection(edge, 'v2', 'v1')).toBe(false);
  });

  it('обычное и двойное пускают в обе стороны', () => {
    for (const kind of [undefined, 'double' as const]) {
      const edge = { id: 'e', a: 'v1', b: 'v2', kind };
      expect(edgeAllowsDirection(edge, 'v1', 'v2')).toBe(true);
      expect(edgeAllowsDirection(edge, 'v2', 'v1')).toBe(true);
    }
  });

  it('путь ПРОТИВ стрелки не принимается', () => {
    const level = AUTHORED_LEVELS[withOneway] as (typeof AUTHORED_LEVELS)[number];
    const reversed = [...level.solution].reverse();
    expect(validateAuthoredSolution(asPuzzle(withOneway), reversed).length).toBeGreaterThan(0);
  });

  it('путь, оборванный на середине, не принимается', () => {
    const level = AUTHORED_LEVELS[0] as (typeof AUTHORED_LEVELS)[number];
    const cut = level.solution.slice(0, level.solution.length - 1);
    expect(validateAuthoredSolution(asPuzzle(0), cut).length).toBeGreaterThan(0);
  });

  it('двойное ребро, пройденное однажды, не закрывает уровень', () => {
    const level = AUTHORED_LEVELS[withDouble] as (typeof AUTHORED_LEVELS)[number];
    const puzzle = asPuzzle(withDouble);
    // Тот же путь без последнего шага: один проход двойного ребра остаётся не сделан.
    const short = level.solution.slice(0, level.solution.length - 1);
    expect(validateAuthoredSolution(puzzle, short).length).toBeGreaterThan(0);
  });

  it('шаг между несоединёнными точками не принимается', () => {
    const level = AUTHORED_LEVELS[0] as (typeof AUTHORED_LEVELS)[number];
    const bogus = [level.solution[0] as string, 'v99', level.solution[1] as string];
    expect(validateAuthoredSolution(asPuzzle(0), bogus).length).toBeGreaterThan(0);
  });

  it('пустой путь не принимается', () => {
    expect(validateAuthoredSolution(asPuzzle(0), []).length).toBeGreaterThan(0);
    expect(validateAuthoredSolution(asPuzzle(0), ['v0']).length).toBeGreaterThan(0);
  });
});
