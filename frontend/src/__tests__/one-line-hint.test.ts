/* psygames-one-line-hint · VER 1 · 22.08.2026 */
/**
 * ПОДСКАЗКА «ОДНОЙ ЛИНИИ» — ОДИН ХОД, А НЕ СПИСОК СОСЕДЕЙ.
 *
 * 🔴 ЧЕМ БЫЛА ПЛОХА ПРЕЖНЯЯ. Она подсвечивала ВСЕХ соседей, до кого ещё есть
 * ребро. На плотной фигуре это половина доски — и, что хуже, почти все
 * подсвеченные ходы ведут в тупик. Человек платил за подсказку и получал
 * перечисление того, что и так видит.
 *
 * ⚠️ ПОЧЕМУ НЕ «СЛЕДУЮЩИЙ ИЗ СОХРАНЁННОГО ПУТИ», КАК В ОБРАЗЦЕ. Там подсказка
 * тычет в заготовленное решение и молча ломается, стоит свернуть с него на первом
 * ходу: дальше она показывает шаги чужого маршрута. Здесь ход ищется ОТ ТЕКУЩЕГО
 * МЕСТА, поэтому работает и после того, как человек пошёл своим путём.
 *
 * ⚠️ И ТО, ЧЕГО У ОБРАЗЦА НЕТ ВОВСЕ: если фигуру отсюда уже НЕ ЗАКРЫТЬ, это
 * видно. Сейчас человек может забрести в тупик и молотиться в него, пока не
 * кончится время, ни разу не узнав, что проиграл двадцать ходов назад.
 */
import { AUTHORED_LEVELS } from '@/src/games/one-line/core/authored';
import { nextMoveFrom } from '@/src/games/one-line/core/validator';
import type { OneLinePuzzle } from '@/src/games/one-line/core/types';

const asPuzzle = (index: number): OneLinePuzzle => {
  const level = AUTHORED_LEVELS[index] as (typeof AUTHORED_LEVELS)[number];
  return {
    id: `authored:${level.shape}`,
    seed: 'hint',
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

/** Пройти путь до шага `steps` и вернуть след вершин и рёбер. */
function walk(index: number, steps: number) {
  const level = AUTHORED_LEVELS[index] as (typeof AUTHORED_LEVELS)[number];
  const puzzle = asPuzzle(index);
  const vertexTrail: string[] = [level.solution[0] as string];
  const edgeTrail: string[] = [];
  for (let step = 1; step <= steps && step < level.solution.length; step += 1) {
    const from = vertexTrail[vertexTrail.length - 1] as string;
    const to = level.solution[step] as string;
    const counts = new Map<string, number>();
    for (const id of edgeTrail) counts.set(id, (counts.get(id) ?? 0) + 1);
    const edge = puzzle.edges.find((e) => {
      const uses = e.kind === 'double' ? 2 : 1;
      const left = (counts.get(e.id) ?? 0) < uses;
      const dir = e.kind === 'oneway'
        ? (e.a === from && e.b === to)
        : ((e.a === from && e.b === to) || (e.a === to && e.b === from));
      return left && dir;
    });
    if (!edge) break;
    edgeTrail.push(edge.id);
    vertexTrail.push(to);
  }
  return { puzzle, vertexTrail, edgeTrail };
}

describe('подсказка даёт ровно один ход', () => {
  it.each(AUTHORED_LEVELS.map((l, i) => [l.shape, i] as const))(
    '«%s»: с начала пути подсказка ведёт к завершению',
    (_shape, index) => {
      const { puzzle, vertexTrail, edgeTrail } = walk(index, 0);
      const hint = nextMoveFrom(puzzle, vertexTrail, edgeTrail);
      expect(hint.vertexId).not.toBeNull();
      expect(hint.deadEnd).toBe(false);
    },
  );

  it('на середине пути подсказка тоже одна и рабочая', () => {
    for (let index = 0; index < AUTHORED_LEVELS.length; index += 1) {
      const level = AUTHORED_LEVELS[index] as (typeof AUTHORED_LEVELS)[number];
      const middle = Math.floor((level.solution.length - 1) / 2);
      const { puzzle, vertexTrail, edgeTrail } = walk(index, middle);
      const hint = nextMoveFrom(puzzle, vertexTrail, edgeTrail);
      expect(`${level.shape}: ${hint.vertexId === null ? 'нет хода' : 'есть ход'}`)
        .toBe(`${level.shape}: есть ход`);
    }
  });

  it('доигранная фигура подсказок больше не просит', () => {
    const level = AUTHORED_LEVELS[0] as (typeof AUTHORED_LEVELS)[number];
    const { puzzle, vertexTrail, edgeTrail } = walk(0, level.solution.length - 1);
    const hint = nextMoveFrom(puzzle, vertexTrail, edgeTrail);
    expect(hint.vertexId).toBeNull();
    expect(hint.deadEnd).toBe(false);   // не тупик, а конец
  });
});

describe('🔴 тупик виден, а не замалчивается', () => {
  /**
   * Домик: квадрат с крышей. Если увести линию в крышу первым ходом и вернуться,
   * низ останется недоступен — фигуру уже не закрыть. Прежняя подсказка в этом
   * месте бодро подсвечивала соседей, будто всё в порядке.
   */
  it('заведомо загубленный путь честно называется тупиком', () => {
    /**
     * ⚠️ ФИГУРУ ИЩЕМ ПО СВОЙСТВУ, А НЕ ПО ИМЕНИ. Раньше здесь стоял «домик» по
     * названию — набор фигур переписали, имя пропало, и гейт свалился на пустом
     * месте. Нужна не конкретная фигура, а ЛЮБАЯ, где первый же ход способен
     * загубить партию: именно про такой случай и должна честно сказать подсказка.
     */
    let puzzle: OneLinePuzzle | null = null;
    let found: { vertexTrail: string[]; edgeTrail: string[] } | null = null;
    for (let i = 0; i < AUTHORED_LEVELS.length && !found; i += 1) {
      const p = asPuzzle(i);
      for (const edge of p.edges) {
        const trail = { vertexTrail: [edge.a, edge.b], edgeTrail: [edge.id] };
        if (nextMoveFrom(p, trail.vertexTrail, trail.edgeTrail).deadEnd) { puzzle = p; found = trail; break; }
      }
    }
    expect(found).not.toBeNull();
    expect(puzzle).not.toBeNull();
    const hint = nextMoveFrom(puzzle as OneLinePuzzle, (found as NonNullable<typeof found>).vertexTrail, (found as NonNullable<typeof found>).edgeTrail);
    expect(hint.deadEnd).toBe(true);
    expect(hint.vertexId).toBeNull();
  });

  it('живой путь тупиком НЕ называется — иначе подсказка врёт в обратную сторону', () => {
    for (let index = 0; index < AUTHORED_LEVELS.length; index += 1) {
      const { puzzle, vertexTrail, edgeTrail } = walk(index, 1);
      expect(nextMoveFrom(puzzle, vertexTrail, edgeTrail).deadEnd).toBe(false);
    }
  });

  /**
   * Перебор упёрся в потолок — молчим про тупик. Сказать «отсюда не закрыть», не
   * досчитав, значит соврать; лучше не дать подсказки, чем дать ложную.
   */
  it('недосчитанный перебор тупиком не объявляется', () => {
    const { puzzle, vertexTrail, edgeTrail } = walk(5, 1);
    const starved = nextMoveFrom(puzzle, vertexTrail, edgeTrail, 1);
    expect(starved.deadEnd).toBe(false);
  });

  it('без начатого пути подсказки этого рода нет', () => {
    expect(nextMoveFrom(asPuzzle(0), [], []).vertexId).toBeNull();
  });
});
