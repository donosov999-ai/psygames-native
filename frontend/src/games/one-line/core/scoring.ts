import type { OneLineMetrics, OneLinePuzzle } from './types';
import { totalEdgeUses } from './validator';

export const ONE_LINE_PASS_ACCURACY = 0.8;

/**
 * A result already proves that every edge was consumed in one continuous trail.
 * At 0.8 accuracy, weighted corrections (undo/invalid = 1, hint = 0.5) may use
 * at most 25% of the graph's edge count, allowing recovery without brute force.
 */
export function isPassed(metrics: OneLineMetrics): boolean {
  // Время вышло — фигура не закрыта, и никакая точность этого не заменит.
  if (metrics.specific.timedOut) return false;
  return metrics.accuracy >= ONE_LINE_PASS_ACCURACY;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 8): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export interface OneLineScoringInput {
  durationMs: number;
  undoCount: number;
  hintsUsed: number;
  invalidMoves: number;
  /** Партию оборвало время, а не закрытая фигура. */
  timedOut?: boolean;
}

export function scoreOneLineCompletion(
  puzzle: OneLinePuzzle,
  input: OneLineScoringInput,
): OneLineMetrics {
  /**
   * 🔴 СЧИТАЕМ ПРОХОДЫ, А НЕ РЁБРА. С появлением двойных рёбер число рёбер
   * перестало быть числом ходов: у ключа шесть рёбер и восемь проходов. Точность
   * при этом делилась на ШЕСТЬ — то есть уровни с двойными рёбрами тайно требовали
   * играть чище остальных, и заметить это можно было только сравнив зачёты.
   */
  const edgeCount = totalEdgeUses(puzzle.edges);
  const errors = input.undoCount + input.invalidMoves;
  const weightedCorrections = errors + input.hintsUsed * 0.5;
  const accuracy = clamp(edgeCount / Math.max(1, edgeCount + weightedCorrections), 0, 1);
  const pathEfficiency = clamp(
    edgeCount / Math.max(edgeCount, edgeCount + input.undoCount + input.invalidMoves),
    0,
    1,
  );
  return {
    accuracy: round(accuracy),
    durationMs: Math.max(0, Math.round(input.durationMs)),
    difficulty: puzzle.difficulty,
    errors,
    // Счёт партии — ОСТАТОК сползающего таймера, а не производная от точности:
    // одно число на экране обязано означать ровно то, что человек на нём видел.
    score: Math.round(input.timedOut === true ? 0 : oneLineScoreAt(input.durationMs)),
    seed: puzzle.seed,
    generatorVersion: puzzle.generatorVersion,
    details: {
      level: puzzle.level,
    },
    specific: {
      vertexCount: puzzle.vertices.length,
      edgeCount,
      visualCrossings: puzzle.visualCrossings,
      isCircuit: puzzle.isCircuit,
      undoCount: input.undoCount,
      hintsUsed: input.hintsUsed,
      invalidMoves: input.invalidMoves,
      pathEfficiency: round(pathEfficiency),
      timedOut: input.timedOut === true,
      scoreLeft: Math.round(input.timedOut === true ? 0 : oneLineScoreAt(input.durationMs)),
    },
  };
}

/**
 * ОЧКИ — ЭТО ТАЙМЕР. ОДНО ЧИСЛО ДЕЛАЕТ ДВЕ РАБОТЫ.
 *
 * Взято из игры-образца, которую дал Денис: там на экране одно число, оно
 * начинается со ста и сползает к нулю. Оно же и торопит, и оказывается наградой —
 * в рекорд уровня уходит то, что осталось. Отдельного таймера рядом нет, потому что
 * второе число на экране заставляет выбирать, на какое смотреть.
 *
 * ⚠️ НИЖЕ ПОЛОВИНЫ СПОЛЗАЕТ ВДВОЕ МЕДЛЕННЕЕ — И ЭТО НЕ МЕЛОЧЬ. Ровная скорость
 * добивает того, кто и так отстал: к середине задачи он видит, что не успевает, и
 * бросает. Замедление даёт доиграть — при этом первая половина остаётся напряжённой,
 * потому что там скорость полная.
 *
 * ⚠️ ФОРМУЛА ЗАМКНУТАЯ, А НЕ НАКОПЛЕНИЕ ПО КАДРАМ. Образец вычитает по дельте
 * каждого кадра; на слабом телефоне кадров меньше — и время у него идёт медленнее,
 * то есть игра становится легче ровно там, где и так тяжелее. Здесь время берётся
 * из часов один раз.
 */
export const ONE_LINE_START_SCORE = 100;

/** Ниже этого рубежа сползание замедляется вдвое. */
export const ONE_LINE_SLOW_BELOW = 50;

/** Очков в секунду в первой половине. Во второй — вдвое меньше. */
export const ONE_LINE_DRAIN_PER_SEC = 1;

export function oneLineScoreAt(elapsedMs: number): number {
  const seconds = Math.max(0, elapsedMs) / 1000;
  const fast = (ONE_LINE_START_SCORE - ONE_LINE_SLOW_BELOW) / ONE_LINE_DRAIN_PER_SEC;
  if (seconds <= fast) return ONE_LINE_START_SCORE - seconds * ONE_LINE_DRAIN_PER_SEC;
  const slow = (seconds - fast) * (ONE_LINE_DRAIN_PER_SEC / 2);
  return Math.max(0, ONE_LINE_SLOW_BELOW - slow);
}

/** Сколько всего даётся на партию, пока очки не дойдут до нуля. */
export function oneLineTimeLimitMs(): number {
  const fast = (ONE_LINE_START_SCORE - ONE_LINE_SLOW_BELOW) / ONE_LINE_DRAIN_PER_SEC;
  const slow = ONE_LINE_SLOW_BELOW / (ONE_LINE_DRAIN_PER_SEC / 2);
  return Math.round((fast + slow) * 1000);
}

/** Кончилось ли время. Ноль — партия проиграна, но уровень НЕ понижается. */
export function oneLineTimeIsUp(elapsedMs: number): boolean {
  return oneLineScoreAt(elapsedMs) <= 0;
}
