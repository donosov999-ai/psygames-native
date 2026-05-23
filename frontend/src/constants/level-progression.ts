/**
 * LEVEL PROGRESSION SYSTEM (2026-05-17)
 *
 * Per Денис: «хочу чтобы усложнение было доступно для коммерческих профилей
 * только после того как они пройдут первый уровень и покажут результаты
 * определённого уровня — типа набрал уровень, делаешь Шульте 5×5 за 10 сек
 * → доступен 6×6».
 *
 * Manifest: для каждой игры — упорядоченный список уровней + threshold
 * для перехода. Первый уровень всегда unlocked. Следующие открываются
 * через достижение порога.
 *
 * Применяется ТОЛЬКО для themed-profiles (chess/kids/vasilyeva/nzt48/...).
 * Personal profiles (Денис/Алекс/Валя/Юля) — всё доступно сразу.
 *
 * Пороги основаны на population norms:
 *   - Schulte 5×5: norm 30-60с, threshold 25с (немного выше нормы)
 *   - Digit span: norm 7±2, threshold 5
 *   - N-back 2-back: norm d'≈1.5
 *   - и т.д.
 *
 * Threshold-проверка происходит автоматически в saveSession() в api.ts.
 */

/** Условие разблокировки следующего уровня. */
export interface UnlockCondition {
  /** Минимальный результат (single best) для разблокировки. */
  metric: 'time_seconds_max' | 'time_seconds_min' | 'score_min' | 'accuracy_min' | 'max_span_min' | 'd_prime_min' | 'hits_min' | 'mean_rt_max';
  /** Пороговое значение (направление зависит от metric). */
  threshold: number;
  /** Сколько раз должен достичь подряд (по умолчанию 1). */
  consecutive?: number;
  /** Доп. контекст для UI: «Сделай Шульте 5×5 за ≤25 сек». */
  human_hint: string;
}

export interface LevelDef {
  /** Уникальный ключ уровня внутри игры (соответствует session.difficulty или session.mode). */
  key: string;
  /** UI-метка. */
  label: string;
  /** Условие разблокировки (для первого уровня — undefined, всегда открыт). */
  unlock?: UnlockCondition;
}

export interface GameLevels {
  game_id: string;
  /** Что сопоставляем с уровнем: 'difficulty' (default) или 'mode'. */
  match_by?: 'difficulty' | 'mode';
  levels: LevelDef[];
}

// ─── 10 ключевых игр с порогами ─────────────────────────────────────────

export const LEVEL_PROGRESSION: GameLevels[] = [
  // Schulte: размер таблицы. Игра сохраняет в session.difficulty = '5x5'/'6x6'/...
  {
    game_id: 'schulte_table',
    match_by: 'difficulty',
    levels: [
      { key: '5x5', label: '5×5 (старт)' },
      { key: '6x6', label: '6×6', unlock: { metric: 'time_seconds_max', threshold: 25, human_hint: 'Пройди Шульте 5×5 за ≤25 сек' } },
      { key: '7x7', label: '7×7', unlock: { metric: 'time_seconds_max', threshold: 45, consecutive: 2, human_hint: 'Пройди Шульте 6×6 за ≤45 сек два раза подряд' } },
      { key: '8x8', label: '8×8', unlock: { metric: 'time_seconds_max', threshold: 75, consecutive: 2, human_hint: 'Пройди Шульте 7×7 за ≤75 сек два раза подряд' } },
      { key: '9x9', label: '9×9', unlock: { metric: 'time_seconds_max', threshold: 115, consecutive: 2, human_hint: 'Пройди Шульте 8×8 за ≤115 сек два раза подряд' } },
      { key: '10x10', label: '10×10 (мастер)', unlock: { metric: 'time_seconds_max', threshold: 160, consecutive: 2, human_hint: 'Пройди Шульте 9×9 за ≤160 сек два раза подряд' } },
    ],
  },

  // N-back: уровень N. Игра сохраняет difficulty='1-back'/'2-back'/'3-back'.
  {
    game_id: 'n_back',
    match_by: 'difficulty',
    levels: [
      { key: '1-back', label: '1-back (старт)' },
      { key: '2-back', label: '2-back', unlock: { metric: 'd_prime_min', threshold: 1.5, human_hint: 'Достигни d′ ≥ 1.5 на 1-back' } },
      { key: '3-back', label: '3-back', unlock: { metric: 'd_prime_min', threshold: 1.5, consecutive: 2, human_hint: 'Достигни d′ ≥ 1.5 на 2-back два раза подряд' } },
      { key: '4-back', label: '4-back (продвинутый)', unlock: { metric: 'd_prime_min', threshold: 1.5, consecutive: 2, human_hint: 'Достигни d′ ≥ 1.5 на 3-back два раза подряд' } },
    ],
  },

  // Digit span: направление (forward → backward, последний харднее).
  // Игра сохраняет difficulty=direction = 'forward'/'backward'.
  {
    game_id: 'digit_span',
    match_by: 'difficulty',
    levels: [
      { key: 'forward', label: 'Forward (старт)' },
      { key: 'backward', label: 'Backward', unlock: { metric: 'max_span_min', threshold: 5, human_hint: 'Достигни span ≥ 5 на forward' } },
    ],
  },

  // Corsi blocks. Игра сохраняет difficulty=mode.
  {
    game_id: 'corsi',
    match_by: 'difficulty',
    levels: [
      { key: 'forward', label: 'Forward (старт)' },
      { key: 'backward', label: 'Backward', unlock: { metric: 'max_span_min', threshold: 4, human_hint: 'Достигни Corsi span ≥ 4 на forward' } },
    ],
  },

  // Memory Matrix: размер сетки. Игра сохраняет difficulty='3x3'/'4x4'/...
  {
    game_id: 'memory_matrix',
    match_by: 'difficulty',
    levels: [
      { key: '3x3', label: '3×3 (старт)' },
      { key: '4x4', label: '4×4', unlock: { metric: 'hits_min', threshold: 8, human_hint: '8 правильных подряд на 3×3' } },
      { key: '5x5', label: '5×5', unlock: { metric: 'hits_min', threshold: 6, consecutive: 2, human_hint: '6 правильных на 4×4 два раза' } },
      { key: '6x6', label: '6×6', unlock: { metric: 'hits_min', threshold: 6, consecutive: 2, human_hint: '6 правильных на 5×5 два раза' } },
    ],
  },

  // Picture Pairs: число пар. Игра сохраняет difficulty='${N} pairs'.
  {
    game_id: 'picture_pairs',
    match_by: 'difficulty',
    levels: [
      { key: '6 pairs', label: '6 пар (старт)' },
      { key: '8 pairs', label: '8 пар', unlock: { metric: 'time_seconds_max', threshold: 60, human_hint: 'Пройди 6 пар за ≤60 сек' } },
      { key: '12 pairs', label: '12 пар', unlock: { metric: 'time_seconds_max', threshold: 90, consecutive: 2, human_hint: 'Пройди 8 пар за ≤90 сек два раза' } },
    ],
  },

  // Math Sprint: время сессии
  {
    game_id: 'math_sprint',
    match_by: 'difficulty',
    levels: [
      { key: 'easy', label: 'Лёгкий (+/−, до 10)' },
      { key: 'medium', label: 'Средний (×/÷, до 100)', unlock: { metric: 'score_min', threshold: 15, human_hint: '15+ задач за 30 сек на лёгком' } },
      { key: 'hard', label: 'Тяжёлый (двузначные)', unlock: { metric: 'score_min', threshold: 20, consecutive: 2, human_hint: '20+ за 30 сек на среднем два раза' } },
    ],
  },

  // Pattern: следующее число в последовательности
  {
    game_id: 'pattern',
    match_by: 'difficulty',
    levels: [
      { key: 'easy', label: 'Лёгкий (старт)' },
      { key: 'medium', label: 'Средний', unlock: { metric: 'accuracy_min', threshold: 80, human_hint: 'Точность ≥80% на лёгком (5 trials)' } },
      { key: 'hard', label: 'Тяжёлый', unlock: { metric: 'accuracy_min', threshold: 80, consecutive: 2, human_hint: 'Точность ≥80% на среднем два раза' } },
    ],
  },

  // CPT: продолжительность сессии
  {
    game_id: 'cpt',
    match_by: 'mode',
    levels: [
      { key: '4min', label: '4 минуты (старт)' },
      { key: '8min', label: '8 минут', unlock: { metric: 'accuracy_min', threshold: 85, human_hint: 'Точность ≥85% на 4-мин CPT' } },
      { key: '12min', label: '12 минут (full)', unlock: { metric: 'accuracy_min', threshold: 85, consecutive: 2, human_hint: 'Точность ≥85% на 8-мин два раза' } },
    ],
  },

  // Mental Rotation: 1/2/3 axes (easy/medium/hard)
  {
    game_id: 'mental_rotation',
    match_by: 'difficulty',
    levels: [
      { key: 'easy', label: '1 ось (Z, старт)' },
      { key: 'medium', label: '2 оси (X+Y)', unlock: { metric: 'accuracy_min', threshold: 80, human_hint: 'Точность ≥80% на 1 оси' } },
      { key: 'hard', label: '3 оси + composite', unlock: { metric: 'accuracy_min', threshold: 80, consecutive: 2, human_hint: 'Точность ≥80% на 2 осях два раза' } },
    ],
  },
];

/** Lookup by game_id. */
export const LEVELS_BY_GAME: Record<string, GameLevels> = LEVEL_PROGRESSION.reduce(
  (acc, gl) => { acc[gl.game_id] = gl; return acc; },
  {} as Record<string, GameLevels>
);

/** True if this game has level progression configured. */
export function hasLevelProgression(gameId: string): boolean {
  return gameId in LEVELS_BY_GAME;
}
