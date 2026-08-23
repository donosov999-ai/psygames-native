/* psygames-chess-blind-progress · VER 1 · 23.08.2026 */
/**
 * УРОВЕНЬ СЕРИИ — ЧИСЛО ФИГУР, ОБЩЕЕ ДЛЯ ВСЕХ ТРЁХ БЛОКОВ.
 *
 * Растёт только тогда, когда УСТОЙЧИВО взяты ВСЕ блоки: ограничитель — самое
 * слабое звено. Считает это `services/series.ts` (`seriesLevelMove`, `bumpStreak`,
 * `seriesStartLevel`), здесь только то, чего ядро знать не может: что «взят» для
 * этой игры и откуда берётся стартовый уровень каждого блока.
 *
 * 🔴 «БЛОК ВЗЯТ» — БЕЗ АБСОЛЮТНОГО ПОРОГА ПО ВРЕМЕНИ. Порог по времени в этом
 * проекте уже родил уровень, который нельзя взять никогда (`sdmt` L76 требует
 * 246 мс на ответ — быстрее простой реакции человека). Поэтому «взят» = блок
 * доигран и ошибок не больше `CHESS_BLOCK_MAX_ERRORS`, а трудность даёт
 * УСТОЙЧИВОСТЬ: тот же результат `STABLE_RUNS` раз подряд.
 *
 * ⚠️ ПРЕРВАННАЯ СЕРИЯ НЕ ДВИГАЕТ НИЧЕГО. Ни вверх, ни вниз: незамеренное — не
 * результат. Обнулять устойчивость за выход из партии значило бы наказывать за
 * телефонный звонок, а поднимать — считать несыгранное сыгранным.
 */
import {
  bumpStreak,
  seriesComplete,
  seriesLevelMove,
  seriesStartLevel,
  STABLE_RUNS,
  type SeriesBlock,
  type SeriesRun,
} from '@/src/services/series';
import { CHESS_BLOCK_MAX_ERRORS, CHESS_SERIES_PLAN, type ChessBlockKey } from './blocks';
import { bandForLevel, CHESS_MIN_LEVEL, chessMaxLevel, clampLevel, type PieceBand } from './positions';

export type ChessLevels = Record<ChessBlockKey, number>;
export type ChessStreaks = Record<ChessBlockKey, number>;

export interface ChessSeriesProgress {
  /** Достигнутый уровень по каждому блоку. */
  readonly levels: ChessLevels;
  /** Сколько прогонов ПОДРЯД блок был взят. Ноль — споткнулся или ещё не играл. */
  readonly streaks: ChessStreaks;
}

const filled = <T extends number>(v: T): Record<ChessBlockKey, T> => ({
  square: v, knight: v, recall: v,
});

export const EMPTY_CHESS_PROGRESS: ChessSeriesProgress = {
  levels: filled(CHESS_MIN_LEVEL),
  streaks: filled(0),
};

/** Разбор сохранённого прогресса. Мусор и пропуски — это минимум, а не падение. */
export function parseChessProgress(raw: string | null): ChessSeriesProgress {
  if (!raw) return EMPTY_CHESS_PROGRESS;
  try {
    const parsed = JSON.parse(raw) as Partial<ChessSeriesProgress>;
    const levels = { ...EMPTY_CHESS_PROGRESS.levels };
    const streaks = { ...EMPTY_CHESS_PROGRESS.streaks };
    for (const key of CHESS_SERIES_PLAN) {
      const l = (parsed?.levels as ChessLevels | undefined)?.[key];
      if (Number.isFinite(l)) levels[key] = clampLevel(l as number);
      const s = (parsed?.streaks as ChessStreaks | undefined)?.[key];
      if (Number.isFinite(s) && (s as number) >= 0) streaks[key] = Math.floor(s as number);
    }
    return { levels, streaks };
  } catch {
    return EMPTY_CHESS_PROGRESS;
  }
}

/** Вход в серию: общий уровень (минимум по блокам) плюс прежние уровни для показа. */
export function seriesEntry(progress: ChessSeriesProgress): {
  level: number; band: PieceBand; perBlock: ChessLevels;
} {
  const start = seriesStartLevel(progress.levels, CHESS_SERIES_PLAN);
  const level = clampLevel(start.level);
  return { level, band: bandForLevel(level), perBlock: { ...progress.levels } };
}

/** Блок взят: доигран до конца и ошибок не больше допуска. Времени здесь нет. */
export function blockTaken(block: SeriesBlock): boolean {
  return block.done && block.errors <= CHESS_BLOCK_MAX_ERRORS;
}

export interface ChessSeriesOutcome {
  readonly progress: ChessSeriesProgress;
  readonly raised: boolean;
  readonly weakest: ChessBlockKey;
  readonly nextLevel: number;
  /** Полоса по числу фигур в следующей серии — тот же уровень другими словами. */
  readonly band: PieceBand;
  readonly runsLeft: number;
}

/** Что стало с уровнем после прогона. Прерванная серия не двигает ничего. */
export function afterSeriesRun(progress: ChessSeriesProgress, run: SeriesRun): ChessSeriesOutcome {
  const level = clampLevel(run.level);
  if (!seriesComplete(run)) {
    const move = seriesLevelMove(progress.streaks, CHESS_SERIES_PLAN);
    const weakest = move.weakest as ChessBlockKey;
    const nextLevel = seriesEntry(progress).level;
    return {
      progress,
      raised: false,
      weakest,
      nextLevel,
      band: bandForLevel(nextLevel),
      runsLeft: Math.max(0, STABLE_RUNS - (progress.streaks[weakest] ?? 0)),
    };
  }

  const streaks = { ...progress.streaks };
  for (const block of run.blocks) {
    const key = block.key as ChessBlockKey;
    streaks[key] = bumpStreak(progress.streaks[key] ?? 0, blockTaken(block));
  }
  const move = seriesLevelMove(streaks, CHESS_SERIES_PLAN);
  const weakest = move.weakest as ChessBlockKey;
  if (!move.raise) {
    return {
      progress: { levels: progress.levels, streaks },
      raised: false,
      weakest,
      nextLevel: level,
      band: bandForLevel(level),
      runsLeft: Math.max(0, STABLE_RUNS - (streaks[weakest] ?? 0)),
    };
  }

  const grown = Math.min(chessMaxLevel(), level + 1);
  const raised = grown > level;
  const levels: ChessLevels = raised
    ? {
      square: Math.max(progress.levels.square, grown),
      knight: Math.max(progress.levels.knight, grown),
      recall: Math.max(progress.levels.recall, grown),
    }
    : progress.levels;
  // Новый уровень — новый отсчёт устойчивости: прошлые прогоны были на другой доске.
  return {
    progress: { levels, streaks: raised ? filled(0) : streaks },
    raised,
    weakest,
    nextLevel: grown,
    band: bandForLevel(grown),
    runsLeft: raised ? STABLE_RUNS : 0,
  };
}
