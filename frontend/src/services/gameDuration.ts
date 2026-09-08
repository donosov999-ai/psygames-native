/* psygames-game-duration · VER 1 · 08.09.2026 */
/**
 * СКОЛЬКО ИГРА ИДЁТ НА САМОМ ДЕЛЕ — ПО ЗАМЕРУ, А НЕ ПО ОБЪЯВЛЕНИЮ.
 *
 * 🔴 ЗАЧЕМ. Отчёт тестировщиков `c810938d`: «просишь пять минут — получаешь 2:45».
 * Замер по живой базе 08.09.2026 (`cognitive_sessions`, 45 дней) оказался ещё хуже
 * заявленного: 35 зарядок с обещанием пять минут дали медиану 2,3 шага и 116 секунд
 * вместе с переходами — 0,39 от обещанного.
 *
 * Причина не в отборе шагов, а в единице, которой он меряет. `est_duration_sec` в
 * `warmup.ts` и `profiles.ts` — числа, проставленные на глаз при заведении игры, и
 * они завышены примерно вдвое. План набирает шаги, пока сумма ОБЪЯВЛЕННОГО не
 * упрётся в бюджет, — значит завышенная оценка обрывает набор вдвое раньше срока.
 *
 * ⚠️ ПОЭТОМУ ЗДЕСЬ СНИМОК ЗАМЕРА, А НЕ ПОДОБРАННЫЙ КОЭФФИЦИЕНТ. Общий множитель
 * «умножить всё на 0,45» дал бы ту же сумму и остался бы выдумкой: он не знает,
 * что Шульте 5×5 идёт 26 секунд, а 7×7 — 90. Числа ниже сняты запросом, каждое —
 * медиана по игре (и по настройке, где база её различает) при трёх и более партиях.
 *
 * ⚠️ ЭТО СНИМОК, А НЕ ЗАПРОС В РАНТАЙМЕ. Оценка нужна до партии и без сети;
 * тянуть её из базы значило бы поставить сборку плана в зависимость от связи.
 * Снимок пересматривается вручную — запрос лежит рядом, в `docs/`.
 */
import type { PlaylistStep } from '@/src/services/warmup';

/**
 * Стоимость перехода между шагами: заставка, правила, экран итога.
 *
 * 📍 ЗАМЕР 08.09.2026: 18 зарядок по три шага и больше, медиана
 * `(время от первой записи до последней − сумма партий 2..n) / (шагов − 1)` —
 * 11,6 секунды (p25 = 6,0; p75 = 20,1). Округлено вверх до 12.
 *
 * 🔴 Это и есть та часть разрыва, которая ЗАКОННА: `est` обязан включать заставку
 * и переходы, а замер партии — нет. Двукратный запас сверх неё законным не был.
 */
export const STEP_OVERHEAD_SEC = 12;

/**
 * Медиана времени ОДНОЙ партии, секунды. Ключ — `game_id|настройка`, где настройка
 * пишется так же, как её кладёт в базу сам экран (`5x5`, `1-back`, `6 pairs`,
 * `forward`, `3 discs`). Ключ без настройки — запасной, по игре целиком.
 *
 * 📍 ИСТОЧНИК: `cognitive_sessions` за 45 дней до 08.09.2026, партии длиннее 2 и
 * короче 1800 секунд, не менее трёх на ключ.
 */
export const MEASURED_SEC: Record<string, number> = {
  // — по игре и настройке —
  'anagrams|4 letters': 154, 'anagrams|5 letters': 184, 'anagrams|6 letters': 176, 'anagrams|7 letters': 223,
  'ant|easy': 29, 'ant|medium': 42, 'ant|hard': 61,
  'breathing|box': 96, 'breathing|calm478': 114, 'breathing|coherent': 66, 'breathing|sigh': 54,
  'chess_blind|L1': 21, 'chess_blind|L2': 25, 'chess_blind|L3': 37,
  'choice_rt|easy': 27,
  'corsi|forward': 35,
  'counter|3x3': 54, 'counter|4x4': 48, 'counter|5x5': 52, 'counter|6x6': 47,
  'cpt|easy': 92,
  'digit_span|forward': 66,
  'dots_connect|easy': 25,
  'faces_names|easy': 25,
  'find_differences|2 diffs': 39, 'find_differences|3 diffs': 43, 'find_differences|4 diffs': 65,
  'find_differences|5 diffs': 54, 'find_differences|6 diffs': 218,
  'flanker|medium': 37,
  'goods_sort|easy': 30, 'goods_sort|medium': 32, 'goods_sort|hard': 42,
  'hanoi|3 discs': 25, 'hanoi|4 discs': 56, 'hanoi|5 discs': 144, 'hanoi|6 discs': 409,
  'mahjong|easy': 25,
  'math_sprint|easy': 60,
  'memory_matrix|3x3': 38, 'memory_matrix|4x4': 39, 'memory_matrix|5x5': 41, 'memory_matrix|6x6': 36,
  'memory_palace|easy': 66,
  'mental_rotation|easy': 28,
  'mnemonics|5 words': 14, 'mnemonics|6 words': 19,
  'n_back|1-back': 76, 'n_back|2-back': 76, 'n_back|3-back': 82, 'n_back|4-back': 75, 'n_back|5-back': 76,
  'navigator|easy': 11,
  'number_bonds|medium': 122,
  'object_tracker|easy': 10,
  'one_line|easy': 9,
  'pattern|easy': 29,
  'picture_pairs|6 pairs': 17, 'picture_pairs|lvl1': 19, 'picture_pairs|lvl2': 19, 'picture_pairs|lvl3': 24,
  'picture_pairs|lvl4': 38, 'picture_pairs|lvl5': 54, 'picture_pairs|lvl6': 41,
  'posner|easy': 43,
  'prl|easy': 55,
  'proofreading|8x8': 50, 'proofreading|9x8': 31, 'proofreading|10x8': 40, 'proofreading|11x8': 20,
  'proofreading|12x8': 44,
  'quick_count|Level 1': 28, 'quick_count|Level 2': 22,
  'reading_span|easy': 38,
  'rhythm_pitch|easy': 6,
  'scholars_mate|easy': 43, 'scholars_mate|medium': 91,
  'schulte_series|5x5': 24,
  'schulte_table|5x5': 26, 'schulte_table|6x6': 56, 'schulte_table|7x7': 90,
  'sdmt|medium': 60,
  'spatial_span|medium': 7,
  'stroop|ink': 37,
  'sudoku|easy': 124, 'sudoku|medium': 164,
  'switching_task|easy': 36, 'switching_task|medium': 39,
  'trail_making|Trail-A': 15,
  'visual_search|easy': 42, 'visual_search|medium': 61,
  'water_sort|3 colors × 4': 18, 'water_sort|4 colors × 4': 21,
  'word_pairs|4 pairs': 38,

  // — запасные, по игре целиком (когда настройка не совпала) —
  anagrams: 188, ant: 41, breathing: 54, chess_blind: 27, choice_rt: 23, corsi: 35, counter: 53,
  cpt: 92, digit_span: 66, dots_connect: 25, faces_names: 25, find_differences: 55, flanker: 39,
  goods_sort: 34, hanoi: 63, mahjong: 25, math_sprint: 60, memory_matrix: 39, memory_palace: 66,
  mental_rotation: 32, mnemonics: 18, n_back: 76, navigator: 11, number_bonds: 122, object_tracker: 9,
  one_line: 9, pattern: 37, phoneme_pairs: 34, phonemic_fluency: 60, picture_pairs: 30, posner: 44,
  prl: 55, proofreading: 48, quick_count: 25, reading_span: 31, rhythm_pitch: 6, scholars_mate: 44,
  schulte_series: 24, schulte_table: 34, sdmt: 60, semantic_sort: 32, spatial_span: 7, stroop: 37,
  switching_task: 38, trail_making: 15, visual_search: 59, vocab_srs: 24, water_sort: 31, word_pairs: 38,
};

/** Как экран записал бы настройку этого шага в базу. */
function settingKey(step: Pick<PlaylistStep, 'mode' | 'difficulty' | 'settings' | 'trials'>): string | null {
  if (step.mode) return step.mode;
  if (step.difficulty) return step.difficulty;
  return null;
}

/**
 * Замеренная длительность ОДНОЙ партии этого шага, без переходов.
 * `null` — про эту игру замера нет; тогда остаётся объявленное число.
 */
export function measuredStepSec(step: Pick<PlaylistStep, 'game_id' | 'mode' | 'difficulty' | 'settings' | 'trials'>): number | null {
  const key = settingKey(step);
  if (key != null) {
    const exact = MEASURED_SEC[`${step.game_id}|${key}`];
    if (exact != null) return exact;
  }
  const byGame = MEASURED_SEC[step.game_id];
  return byGame != null ? byGame : null;
}

/**
 * Сколько шаг займёт у человека: партия плюс переход.
 *
 * ⚠️ БЕЗ ЗАМЕРА ВОЗВРАЩАЕТСЯ ОБЪЯВЛЕННОЕ ЧИСЛО КАК ЕСТЬ, без прибавки перехода:
 * объявленные числа уже завышены с запасом, и добавлять к ним ещё двенадцать
 * секунд значило бы усугублять ровно тот дефект, который здесь чинится.
 */
export function estimateStepSec(step: PlaylistStep): number {
  const measured = measuredStepSec(step);
  return measured != null ? measured + STEP_OVERHEAD_SEC : step.est_duration_sec;
}
