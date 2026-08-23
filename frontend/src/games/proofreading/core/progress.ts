/* psygames-proofreading-series-progress · VER 1 · 23.08.2026 */
/**
 * УРОВЕНЬ СЕРИИ КОРРЕКТУРКИ — ТА ЖЕ МОДЕЛЬ C, ЧТО У СЕРИИ ШУЛЬТЕ.
 *
 * Уровень = РАЗМЕР ПОЛЯ, общий для всех трёх блоков. Растёт только тогда, когда
 * УСТОЙЧИВО взяты ВСЕ блоки; ограничитель — самое слабое звено. Саму арифметику
 * считает `services/series.ts` (`seriesLevelMove`, `bumpStreak`, `seriesStartLevel`),
 * здесь только то, чего ядро знать не может: что «взят» для этих блоков и откуда
 * берётся стартовый размер каждого.
 *
 * 🔴 «БЛОК ВЗЯТ» — БЕЗ АБСОЛЮТНОГО ПОРОГА ПО ВРЕМЕНИ: блок доигран и ошибок не
 * больше допуска, а трудность даёт УСТОЙЧИВОСТЬ (тот же результат `STABLE_RUNS`
 * раз подряд). Порог по времени в этом проекте уже родил уровень, который нельзя
 * взять никогда (`sdmt` L76 требует 246 мс на ответ).
 *
 * 🔴 СТАРТ — С МИНИМАЛЬНОГО РАЗМЕРА ПО БЛОКАМ, ПРЕЖНИЕ ПОКАЗЫВАЮТСЯ ЯВНО.
 * «Слово» человек уже растил в одиночном режиме филвордов на этом же экране, и
 * делать вид, что он там новичок, нечестно; «Знак» и «Смысл» на общем поле живут
 * только внутри серии, у них свой размер. Молча посадить человека на минимум —
 * значит показать откат прогресса, поэтому `proofSeriesEntry` возвращает и общий
 * уровень, и прежние уровни блоков: экран обязан назвать оба.
 *
 * ⚠️ ПРЕРВАННАЯ СЕРИЯ НЕ ДВИГАЕТ НИЧЕГО — ни вверх, ни вниз. Незамеренное не
 * результат: обнулять устойчивость за выход значило бы наказывать за телефонный
 * звонок, а поднимать — считать несыгранное сыгранным.
 */
import {
  STABLE_RUNS,
  bumpStreak,
  seriesComplete,
  seriesLevelMove,
  seriesStartLevel,
  type SeriesBlock,
  type SeriesRun,
} from '@/src/services/series';
import { PROOF_BLOCK_MAX_ERRORS, PROOF_SERIES_PLAN, type ProofBlockKey } from './blocks';
import { PROOF_MIN_SIZE, clampProofSize } from './field';

export type ProofSizes = Record<ProofBlockKey, number>;
export type ProofStreaks = Record<ProofBlockKey, number>;

export interface ProofSeriesProgress {
  /** Достигнутый размер поля по каждому блоку. */
  readonly sizes: ProofSizes;
  /** Сколько прогонов ПОДРЯД блок был взят. Ноль — споткнулся или ещё не играл. */
  readonly streaks: ProofStreaks;
}

const zeroed = <T extends number>(v: T): Record<ProofBlockKey, T> => ({ sign: v, word: v, sense: v });

export const EMPTY_PROOF_PROGRESS: ProofSeriesProgress = {
  sizes: zeroed(PROOF_MIN_SIZE),
  streaks: zeroed(0),
};

/** Разбор сохранённого прогресса. Мусор и пропуски — это минимум, а не падение. */
export function parseProofProgress(raw: string | null): ProofSeriesProgress {
  if (!raw) return EMPTY_PROOF_PROGRESS;
  try {
    const parsed = JSON.parse(raw) as Partial<ProofSeriesProgress>;
    const sizes = { ...EMPTY_PROOF_PROGRESS.sizes };
    const streaks = { ...EMPTY_PROOF_PROGRESS.streaks };
    for (const key of PROOF_SERIES_PLAN) {
      const s = (parsed?.sizes as ProofSizes | undefined)?.[key];
      if (Number.isFinite(s)) sizes[key] = clampProofSize(s as number);
      const k = (parsed?.streaks as ProofStreaks | undefined)?.[key];
      if (Number.isFinite(k) && (k as number) >= 0) streaks[key] = Math.floor(k as number);
    }
    return { sizes, streaks };
  } catch {
    return EMPTY_PROOF_PROGRESS;
  }
}

/** Размеры блоков с поправкой на одиночную лесенку филвордов (блок «Слово»). */
export function proofBlockLevels(progress: ProofSeriesProgress, ladderSize: number): ProofSizes {
  const ladder = clampProofSize(ladderSize);
  return {
    sign: clampProofSize(progress.sizes.sign),
    word: Math.max(clampProofSize(progress.sizes.word), ladder),
    sense: clampProofSize(progress.sizes.sense),
  };
}

/** Вход в серию: общий уровень (минимум по блокам) + прежние уровни для показа. */
export function proofSeriesEntry(
  progress: ProofSeriesProgress,
  ladderSize: number,
): { level: number; perBlock: ProofSizes } {
  const levels = proofBlockLevels(progress, ladderSize);
  const start = seriesStartLevel(levels, PROOF_SERIES_PLAN);
  return { level: clampProofSize(start.level), perBlock: levels };
}

/** Блок взят: доигран до конца и ошибок не больше допуска. Времени здесь нет. */
export function proofBlockTaken(block: SeriesBlock): boolean {
  return block.done && block.errors <= PROOF_BLOCK_MAX_ERRORS;
}

export interface ProofSeriesOutcome {
  readonly progress: ProofSeriesProgress;
  /** Поле выросло — все блоки устойчивы. */
  readonly raised: boolean;
  /** Блок, который держит уровень: у него самая короткая серия удач. */
  readonly weakest: ProofBlockKey;
  /** Размер поля, с которого пойдёт следующая серия. */
  readonly nextLevel: number;
  /** Сколько чистых прогонов подряд ещё нужно слабейшему блоку. */
  readonly runsLeft: number;
}

/** Что стало с уровнем после прогона. Прерванная серия не двигает ничего. */
export function afterProofSeries(
  progress: ProofSeriesProgress,
  run: SeriesRun,
  ladderSize: number,
): ProofSeriesOutcome {
  const level = clampProofSize(run.level);
  if (!seriesComplete(run)) {
    const move = seriesLevelMove(progress.streaks, PROOF_SERIES_PLAN);
    return {
      progress,
      raised: false,
      weakest: move.weakest as ProofBlockKey,
      nextLevel: proofSeriesEntry(progress, ladderSize).level,
      runsLeft: Math.max(0, STABLE_RUNS - (progress.streaks[move.weakest as ProofBlockKey] ?? 0)),
    };
  }

  const streaks = { ...progress.streaks };
  for (const block of run.blocks) {
    const key = block.key as ProofBlockKey;
    streaks[key] = bumpStreak(progress.streaks[key] ?? 0, proofBlockTaken(block));
  }
  const move = seriesLevelMove(streaks, PROOF_SERIES_PLAN);
  const weakest = move.weakest as ProofBlockKey;
  if (!move.raise) {
    return {
      progress: { sizes: progress.sizes, streaks },
      raised: false,
      weakest,
      nextLevel: level,
      runsLeft: Math.max(0, STABLE_RUNS - (streaks[weakest] ?? 0)),
    };
  }

  const grown = clampProofSize(level + 1);
  const raised = grown > level;
  const sizes: ProofSizes = raised
    ? {
      sign: Math.max(progress.sizes.sign, grown),
      word: Math.max(progress.sizes.word, grown),
      sense: Math.max(progress.sizes.sense, grown),
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
