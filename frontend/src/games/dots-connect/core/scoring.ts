/* psygames-dots-connect-scoring · VER 2 · 23.08.2026 */
import type { DotsMetrics, DotsPuzzle } from './types';

/**
 * @deprecated ⚠️ ПОРОГ БОЛЬШЕ НЕ РЕШАЕТ, ПРОЙДЕН ЛИ УРОВЕНЬ. Число оставлено
 * потому, что на него ссылается описание игры; в `isPassed` его нет — см. ниже.
 */
export const DOTS_CONNECT_PASS_ACCURACY = 0.8;

/**
 * 🔴 РЕШИЛ ЧЕСТНО — ПРОШЁЛ. АККУРАТНОСТЬ ДАЁТ ЗВЁЗДЫ, А НЕ ПРОПУСК ДАЛЬШЕ.
 *
 * Отчёт Дениса 05.09.2026 (e40516e3, v2.37.54): «если ты забрал с десятой
 * попытки, тебе не даёт перейти на следующий уровень В ЛЮБОМ СЛУЧАЕ; если
 * говорить про детский режим, то детей это будет раздражать, они не будут
 * залипать».
 *
 * Здесь стояло третье условие — точность ≥ 0,8, то есть «правок не больше
 * четверти оптимального маршрута». Логика была такая: уровень берут разбором, а
 * не перебором. На деле она наказывала за САМ СПОСОБ решения головоломки. Перебор
 * в игре про соединение точек — это и есть решение: ведёшь, упираешься,
 * отменяешь, ведёшь иначе. Доска сходится ровно тогда, когда человек разобрался,
 * и запирать его на пройденном уровне за десять попыток означает наказывать за
 * старание. Ребёнку это просто говорит «ты не смог», хотя он смог.
 *
 * Аккуратность никуда не делась и по-прежнему видна: из неё считаются ЗВЁЗДЫ
 * (0,97 → три, 0,9 → две, иначе одна). Кто хочет три звезды — ведёт чисто; кто
 * хочет пройти — проходит. Это разные вопросы, и смешивать их было ошибкой.
 *
 * Полное покрытие доски осталось: недорешённая доска не проходит никогда.
 *
 * 🔴 ТРЕТЬЕ УСЛОВИЕ — ЧЕСТНОСТЬ: РЕШЕНИЕ НЕ ПОДСМАТРИВАЛИ.
 *
 * Показ решения (см. `toggleDotsSolution`) кладёт на доску полный ответ. Обвести
 * его пальцем — это и полное покрытие, и точность 1.0: по двум прежним условиям
 * такая партия проходила бы ЛУЧШЕ честной. Значит уровень поднимался бы за
 * нажатие кнопки, а в общую бухгалтерию (звёзды, серия чистых прохождений,
 * `saveSession(passed: true)`) уезжало бы чужое достижение.
 *
 * Здесь и только здесь стоит решение «не в зачёт»: экран игры порог не копирует,
 * он читает `isPassed`, а тот — метку из метрики. Одна копия правила, одно
 * место правки. Сама партия при этом доигрывается до конца и результат
 * показывается: наказание — не в зачёт, а не «отняли доску из-под рук».
 */
export function isPassed(metrics: DotsMetrics): boolean {
  return !metrics.solutionShown && metrics.specific.coverage === 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 8): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export interface DotsScoringInput {
  durationMs: number;
  forwardMoves: number;
  backtracks: number;
  undoCount: number;
  invalidMoves: number;
  /** Смотрели ли решение этой доски. Латч сессии, см. `DotsSession.solutionShown`. */
  solutionShown: boolean;
}

export function scoreDotsCompletion(
  puzzle: DotsPuzzle,
  input: DotsScoringInput,
): DotsMetrics {
  const optimalEdges = puzzle.size * puzzle.size - puzzle.pairCount;
  const corrections = input.backtracks + input.undoCount + input.invalidMoves;
  const accuracy = clamp(optimalEdges / Math.max(1, optimalEdges + corrections), 0, 1);
  const pathEfficiency = clamp(
    optimalEdges / Math.max(optimalEdges, input.forwardMoves),
    0,
    1,
  );
  return {
    accuracy: round(accuracy),
    durationMs: Math.max(0, Math.round(input.durationMs)),
    difficulty: puzzle.difficulty,
    errors: corrections,
    score: Math.round(accuracy * 100),
    seed: puzzle.seed,
    generatorVersion: puzzle.generatorVersion,
    solutionShown: input.solutionShown,
    details: {
      level: puzzle.level,
    },
    specific: {
      gridSize: puzzle.size,
      pairCount: puzzle.pairCount,
      forwardMoves: input.forwardMoves,
      backtracks: input.backtracks,
      undoCount: input.undoCount,
      invalidMoves: input.invalidMoves,
      optimalEdges,
      pathEfficiency: round(pathEfficiency),
      coverage: 1,
    },
  };
}
