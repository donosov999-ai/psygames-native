/* psygames-schulte-series-progress · VER 1 · 23.08.2026 */
/**
 * УРОВЕНЬ СЕРИИ — МОДЕЛЬ C ИЗ §12, ПРИШИТАЯ К ШУЛЬТЕ.
 *
 * Уровень серии = РАЗМЕР ПОЛЯ, общий для всех трёх блоков. Растёт только тогда,
 * когда УСТОЙЧИВО взяты ВСЕ блоки; ограничитель — самое слабое звено. Считает это
 * `services/series.ts` (`seriesLevelMove`, `bumpStreak`, `seriesStartLevel`), здесь
 * только то, чего ядро знать не может: что «взят» для Шульте и откуда берётся
 * стартовый размер каждого блока.
 *
 * 🔴 «БЛОК ВЗЯТ» — БЕЗ АБСОЛЮТНОГО ПОРОГА ПО ВРЕМЕНИ. Порог по времени в этом
 * проекте уже родил уровень, который нельзя взять никогда (`sdmt` L76 требует
 * 246 мс на ответ — быстрее простой реакции человека). Поэтому «взят» = блок
 * доигран и ошибок не больше `SERIES_BLOCK_MAX_ERRORS`, а трудность даёт
 * УСТОЙЧИВОСТЬ: тот же результат `STABLE_RUNS` раз подряд.
 *
 * 🔴 СТАРТ — С МИНИМАЛЬНОГО РАЗМЕРА ПО БЛОКАМ, И ПРЕЖНИЕ ПОКАЗЫВАЮТСЯ ЯВНО.
 * Человек с седьмым полем в обычном Шульте начнёт серию с пятого, потому что счёт
 * у него ещё на пятом. Молча посадить его на минимум — значит показать откат
 * прогресса, поэтому `seriesEntry` возвращает и общий уровень, и прежние уровни
 * блоков: экран обязан назвать оба.
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
import {
  clampSeriesSize,
  SCHULTE_SERIES_PLAN,
  SERIES_BLOCK_MAX_ERRORS,
  SERIES_MIN_SIZE,
  type SchulteBlockKey,
} from './blocks';

export type SeriesSizes = Record<SchulteBlockKey, number>;
export type SeriesStreaks = Record<SchulteBlockKey, number>;

export interface SchulteSeriesProgress {
  /** Достигнутый размер поля по каждому блоку. Он же «уровень блока» из §12.5. */
  readonly sizes: SeriesSizes;
  /** Сколько прогонов ПОДРЯД блок был взят. Ноль — споткнулся или ещё не играл. */
  readonly streaks: SeriesStreaks;
}

const zeroed = <T extends number>(v: T): Record<SchulteBlockKey, T> => ({
  order: v, alternate: v, sum: v,
});

export const EMPTY_SERIES_PROGRESS: SchulteSeriesProgress = {
  sizes: zeroed(SERIES_MIN_SIZE),
  streaks: zeroed(0),
};

/** Разбор сохранённого прогресса. Мусор и пропуски — это минимум, а не падение. */
export function parseSeriesProgress(raw: string | null): SchulteSeriesProgress {
  if (!raw) return EMPTY_SERIES_PROGRESS;
  try {
    const parsed = JSON.parse(raw) as Partial<SchulteSeriesProgress>;
    const sizes = { ...EMPTY_SERIES_PROGRESS.sizes };
    const streaks = { ...EMPTY_SERIES_PROGRESS.streaks };
    for (const key of SCHULTE_SERIES_PLAN) {
      const s = (parsed?.sizes as SeriesSizes | undefined)?.[key];
      if (Number.isFinite(s)) sizes[key] = clampSeriesSize(s as number);
      const k = (parsed?.streaks as SeriesStreaks | undefined)?.[key];
      if (Number.isFinite(k) && (k as number) >= 0) streaks[key] = Math.floor(k as number);
    }
    return { sizes, streaks };
  } catch {
    return EMPTY_SERIES_PROGRESS;
  }
}

/**
 * Размеры блоков с поправкой на обычную лесенку Шульте: «поиск» человек уже растил
 * в одиночной игре, и делать вид, что он там новичок, нечестно. Остальные два
 * блока в одиночных играх не существуют — у них только свой, серийный размер.
 */
export function seriesBlockLevels(progress: SchulteSeriesProgress, ladderSize: number): SeriesSizes {
  const ladder = clampSeriesSize(ladderSize);
  return {
    order: Math.max(clampSeriesSize(progress.sizes.order), ladder),
    alternate: clampSeriesSize(progress.sizes.alternate),
    sum: clampSeriesSize(progress.sizes.sum),
  };
}

/** Вход в серию: общий уровень (минимум по блокам) + прежние уровни для показа. */
export function seriesEntry(
  progress: SchulteSeriesProgress,
  ladderSize: number,
): { level: number; perBlock: SeriesSizes } {
  const levels = seriesBlockLevels(progress, ladderSize);
  const start = seriesStartLevel(levels, SCHULTE_SERIES_PLAN);
  return { level: clampSeriesSize(start.level), perBlock: levels };
}

/** Блок взят: доигран до конца и ошибок не больше допуска. Времени здесь нет. */
export function blockTaken(block: SeriesBlock): boolean {
  return block.done && block.errors <= SERIES_BLOCK_MAX_ERRORS;
}

export interface SeriesOutcome {
  readonly progress: SchulteSeriesProgress;
  /** Поле выросло — все блоки устойчивы. */
  readonly raised: boolean;
  /** Блок, который держит уровень: у него самая короткая серия удач. */
  readonly weakest: SchulteBlockKey;
  /** Размер поля, с которого пойдёт следующая серия. */
  readonly nextLevel: number;
  /** Сколько чистых прогонов подряд ещё нужно слабейшему блоку. */
  readonly runsLeft: number;
}

/** Что стало с уровнем после прогона. Прерванная серия не двигает ничего. */
export function afterSeriesRun(
  progress: SchulteSeriesProgress,
  run: SeriesRun,
  ladderSize: number,
): SeriesOutcome {
  const level = clampSeriesSize(run.level);
  if (!seriesComplete(run)) {
    const move = seriesLevelMove(progress.streaks, SCHULTE_SERIES_PLAN);
    return {
      progress,
      raised: false,
      weakest: move.weakest as SchulteBlockKey,
      nextLevel: seriesEntry(progress, ladderSize).level,
      runsLeft: Math.max(0, STABLE_RUNS - (progress.streaks[move.weakest as SchulteBlockKey] ?? 0)),
    };
  }

  const streaks = { ...progress.streaks };
  for (const block of run.blocks) {
    const key = block.key as SchulteBlockKey;
    streaks[key] = bumpStreak(progress.streaks[key] ?? 0, blockTaken(block));
  }
  const move = seriesLevelMove(streaks, SCHULTE_SERIES_PLAN);
  const weakest = move.weakest as SchulteBlockKey;
  if (!move.raise) {
    return {
      progress: { sizes: progress.sizes, streaks },
      raised: false,
      weakest,
      nextLevel: level,
      runsLeft: Math.max(0, STABLE_RUNS - (streaks[weakest] ?? 0)),
    };
  }

  const grown = clampSeriesSize(level + 1);
  const raised = grown > level;
  const sizes: SeriesSizes = raised
    ? {
      order: Math.max(progress.sizes.order, grown),
      alternate: Math.max(progress.sizes.alternate, grown),
      sum: Math.max(progress.sizes.sum, grown),
    }
    : progress.sizes;
  // Новый размер — новый отсчёт устойчивости: прошлые прогоны были на другом поле.
  return {
    progress: { sizes, streaks: raised ? zeroed(0) : streaks },
    raised,
    weakest,
    nextLevel: grown,
    runsLeft: raised ? STABLE_RUNS : 0,
  };
}
