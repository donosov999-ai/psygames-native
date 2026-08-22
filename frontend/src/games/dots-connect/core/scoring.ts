import type { DotsMetrics, DotsPuzzle } from './types';

export const DOTS_CONNECT_PASS_ACCURACY = 0.8;

/**
 * Completion already requires full board coverage. Requiring 0.8 accuracy also
 * limits corrections to at most 25% of the optimal edge count, so a level is
 * cleared after an independently controlled solve rather than brute-force play.
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
  return !metrics.solutionShown
    && metrics.accuracy >= DOTS_CONNECT_PASS_ACCURACY
    && metrics.specific.coverage === 1;
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
