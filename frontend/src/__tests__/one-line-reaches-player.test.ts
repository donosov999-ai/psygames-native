/* psygames-one-line-reaches-player · VER 1 · 22.08.2026 */
/**
 * ПОСЧИТАНО — ЗНАЧИТ ПОКАЗАНО. И НЕ ВЗЯТО ДЕНЕГ ЗА ПОИСК СТАРТА.
 *
 * 🔴 ЧТО НАШЛОСЬ РАЗБОРОМ 22.08.2026, через час после того, как я это написал.
 * Признак «отсюда фигуру уже не закрыть» вычислялся, лежал в сессии, был покрыт
 * проверкой — и НЕ ВЫВОДИЛСЯ никуда. То единственное, чем мы лучше обеих
 * игр-образцов, до игрока не доезжало: он по-прежнему молотился в тупик, пока не
 * кончится время. Проверка на устройство была, проверки на ДОСТАВКУ не было.
 *
 * 🔴 И ВТОРОЕ. Касание не той вершины при поиске старта шло в `invalidMoves` → в
 * точность → в зачёт уровня. Человек, ещё не начавший играть, УЖЕ терял зачёт —
 * и молча. На половине уровней начать можно только с двух точек из десяти, и
 * найти их можно единственным способом: потыкать. Обе чужие игры пускают начать
 * откуда угодно бесплатно.
 */
import { generateOneLinePuzzle } from '@/src/games/one-line/core/generator';
import { scoreOneLineCompletion } from '@/src/games/one-line/core/scoring';
import { totalEdgeUses, validateEulerGraph } from '@/src/games/one-line/core/validator';
import {
  createOneLineSession,
  getCurrentOneLinePuzzle,
  selectOneLineVertex,
  startOneLineTraining,
  advanceFromOneLineTraining,
} from '@/src/games/one-line/core/session';
import { getOneLineStrings } from '@/src/games/one-line/core/i18n';

declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');
declare const __dirname: string;
const read = (p: string): string => readFileSync(join(__dirname, p), 'utf8') as string;
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('🔴 то, что посчитано, доезжает до экрана', () => {
  const screen = code(read('../games/one-line/OneLineGame.tsx'));

  it('признак тупика выводится, а не лежит мёртвым грузом', () => {
    expect(screen).toMatch(/session\.hintDeadEnd/);
    expect(screen).toMatch(/strings\.deadEnd/);
  });

  it('отказ старта тоже виден — молчание читается как «игра не отвечает»', () => {
    expect(screen).toMatch(/session\.startRejected/);
    expect(screen).toMatch(/strings\.startElsewhere/);
  });

  it('оба сообщения есть во всех двенадцати языках', () => {
    for (const locale of ['ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar'] as const) {
      const strings = getOneLineStrings(locale);
      expect(`${locale}: ${strings.deadEnd.length > 10}`).toBe(`${locale}: true`);
      expect(`${locale}: ${strings.startElsewhere.length > 10}`).toBe(`${locale}: true`);
    }
  });
});

describe('🔴 поиск старта ничего не стоит', () => {
  /**
   * ⚠️ ФИГУРУ БЕРЁМ ТУ, ЧТО РЕАЛЬНО ЛЕЖИТ В ПАРТИИ, и ищем уровень, где начать
   * можно ровно с двух точек. Первая редакция этой проверки молча выходила
   * (`return`), когда фигура оказывалась замкнутой, — и обе мутации проходили
   * зелёными на пустом месте. Не нашли подходящего уровня — это провал проверки,
   * а не повод промолчать.
   */
  /**
   * ⚠️ ДО НАСТОЯЩЕЙ ФИГУРЫ НАДО ПРОЙТИ ТРЕНИРОВОЧНУЮ. `advanceFromOneLineTraining`
   * из фазы `training` не делает НИЧЕГО: он ждёт `training-complete`. Первая
   * редакция этого помощника про это не знала, брала тренировочный треугольник —
   * замкнутый, начинать в нём можно откуда угодно — и все три проверки внутри
   * оказывались беспредметными.
   */
  const openSession = () => {
    for (let level = 13; level <= 48; level += 1) {
      let session = startOneLineTraining(createOneLineSession({ seed: `start-${level}`, level }));
      for (const id of session.trainingPuzzle.solution.vertexIds) {
        session = selectOneLineVertex(session, id, 0);
      }
      session = advanceFromOneLineTraining(session, 0);
      if (session.phase !== 'playing') continue;
      const live = getCurrentOneLinePuzzle(session);
      const odd = validateEulerGraph(live).oddVertexIds;
      if (odd.length === 2) return { session, live, odd };
    }
    return null;
  };

  it('уровень, где начать можно не отовсюду, вообще существует', () => {
    expect(openSession()).not.toBeNull();
  });

  it('касание не той точки НЕ идёт в ошибки', () => {
    const found = openSession();
    expect(found).not.toBeNull();
    const { session: fresh, live, odd } = found as NonNullable<typeof found>;
    const wrong = live.vertices.find((v) => !odd.includes(v.id));
    expect(wrong).toBeDefined();

    const before = fresh.invalidMoves;
    const after = selectOneLineVertex(fresh, (wrong as { id: string }).id, 1000);
    expect(after.invalidMoves).toBe(before);
    expect(after.startRejected).toBeGreaterThan(0);
    expect(after.vertexTrail).toEqual([]);    // линия и правда не пошла
  });

  it('верный старт принимается и счётчик отказов ГАСНЕТ', () => {
    const found = openSession();
    expect(found).not.toBeNull();
    const { session: fresh, live, odd } = found as NonNullable<typeof found>;
    const wrong = live.vertices.find((v) => !odd.includes(v.id)) as { id: string };
    // Сначала ткнуть мимо — иначе гаснуть нечему и проверка беспредметна.
    const rejected = selectOneLineVertex(fresh, wrong.id, 1000);
    expect(rejected.startRejected).toBeGreaterThan(0);

    const started = selectOneLineVertex(rejected, odd[0] as string, 2000);
    expect(started.vertexTrail).toEqual([odd[0]]);
    expect(started.startRejected).toBe(0);
  });
});

describe('🔴 точность считает проходы, а не рёбра', () => {
  /**
   * У ключа шесть рёбер и восемь проходов: два ребра двойные. Точность делилась на
   * ШЕСТЬ — то есть уровни с двойными рёбрами тайно требовали играть чище прочих.
   */
  it('уровень с двойными рёбрами не строже соседей (двойное — с 13-й фигуры)', () => {
    const withDouble = generateOneLinePuzzle('x', 13);
    expect(withDouble.edges.some((e) => e.kind === 'double')).toBe(true);
    const passes = totalEdgeUses(withDouble.edges);
    expect(passes).toBeGreaterThan(withDouble.edges.length);

    const plain = generateOneLinePuzzle('x', 8);
    const input = { durationMs: 10_000, undoCount: 1, hintsUsed: 0, invalidMoves: 0 };
    // Один и тот же промах на фигуре с бо́льшим числом ходов обязан стоить МЕНЬШЕ,
    // а не больше: ходов больше — доля ошибки меньше.
    const a = scoreOneLineCompletion(withDouble, input).accuracy;
    const b = scoreOneLineCompletion(plain, input).accuracy;
    expect(`двойные ${a > b ? 'мягче' : 'строже'} обычных`).toBe(
      `двойные ${passes > totalEdgeUses(plain.edges) ? 'мягче' : 'строже'} обычных`,
    );
  });

  it('знаменатель — это число ПРОХОДОВ', () => {
    const p = generateOneLinePuzzle('x', 13);
    const passes = totalEdgeUses(p.edges);
    const m = scoreOneLineCompletion(p, { durationMs: 0, undoCount: 1, hintsUsed: 0, invalidMoves: 0 });
    expect(m.accuracy).toBeCloseTo(passes / (passes + 1), 6);
  });
});
