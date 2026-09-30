// Кастомные иконки игр (Nano Banana 2, единый глянец-3D мини-тайл, 256px PNG).
// Реестр id → картинка. GameCard подставляет её вместо Ionicons (фолбэк — Ionicons,
// если для id нет картинки), поэтому раскатка безопасна и постепенна.
export const GAME_ICONS: Record<string, any> = {
  // Развилка судоку берёт иконку судоку: она ведёт именно туда.
  anagrams: require('../../assets/images/game_icons/anagrams.webp'),
  ant: require('../../assets/images/game_icons/ant.webp'),
  attention_conflict: require('../../assets/images/game_icons/attention_conflict.webp'),
  ball_sort: require('../../assets/images/game_icons/ball_sort.webp'),
  bart: require('../../assets/images/game_icons/bart.webp'),
  breathing: require('../../assets/images/game_icons/breathing.webp'),
  cake_sort: require('../../assets/images/game_icons/cake_sort.webp'),
  chess_blind: require('../../assets/images/game_icons/chess_blind.webp'),
  chinese_tones: require('../../assets/images/game_icons/chinese_tones.webp'),
  choice_rt: require('../../assets/images/game_icons/choice_rt.webp'),
  cloze: require('../../assets/images/game_icons/cloze.webp'),
  corsi: require('../../assets/images/game_icons/corsi.webp'),
  counter: require('../../assets/images/game_icons/counter.webp'),
  cpt: require('../../assets/images/game_icons/cpt.webp'),
  dictation: require('../../assets/images/game_icons/dictation.webp'),
  digit_span: require('../../assets/images/game_icons/digit_span.webp'),
  dots_connect: require('../../assets/images/game_icons/dots_connect.webp'),
  eye_gym: require('../../assets/images/game_icons/eye_gym.webp'),
  faces_names: require('../../assets/images/game_icons/faces_names.webp'),
  find_differences: require('../../assets/images/game_icons/find_differences.webp'),
  flanker: require('../../assets/images/game_icons/flanker.webp'),
  go_no_go: require('../../assets/images/game_icons/go_no_go.webp'),
  goods_sort: require('../../assets/images/game_icons/goods_sort.webp'),
  hanoi: require('../../assets/images/game_icons/hanoi.webp'),
  inhibition: require('../../assets/images/game_icons/inhibition.webp'),
  iowa: require('../../assets/images/game_icons/iowa.webp'),
  lexical_decision: require('../../assets/images/game_icons/lexical_decision.webp'),
  listening_span: require('../../assets/images/game_icons/listening_span.webp'),
  mahjong: require('../../assets/images/game_icons/mahjong.webp'),
  math_slider: require('../../assets/images/game_icons/math_slider.webp'),
  math_sprint: require('../../assets/images/game_icons/math_sprint.webp'),
  memory_matrix: require('../../assets/images/game_icons/memory_matrix.webp'),
  memory_palace: require('../../assets/images/game_icons/memory_palace.webp'),
  mental_rotation: require('../../assets/images/game_icons/mental_rotation.webp'),
  mnemonics: require('../../assets/images/game_icons/mnemonics.webp'),
  n_back: require('../../assets/images/game_icons/n_back.webp'),
  navigator: require('../../assets/images/game_icons/navigator.webp'),
  number_bonds: require('../../assets/images/game_icons/number_bonds.webp'),
  number_run: require('../../assets/images/game_icons/number_run.webp'),
  nut_sort: require('../../assets/images/game_icons/nut_sort.webp'),
  object_tracker: require('../../assets/images/game_icons/object_tracker.webp'),
  one_line: require('../../assets/images/game_icons/one_line.webp'),
  ospan: require('../../assets/images/game_icons/ospan.webp'),
  pattern: require('../../assets/images/game_icons/pattern.webp'),
  pause: require('../../assets/images/game_icons/pause.webp'),
  phoneme_pairs: require('../../assets/images/game_icons/phoneme_pairs.webp'),
  phonemic_fluency: require('../../assets/images/game_icons/phonemic_fluency.webp'),
  picture_pairs: require('../../assets/images/game_icons/picture_pairs.webp'),
  pizza_sort: require('../../assets/images/game_icons/pizza_sort.webp'),
  posner: require('../../assets/images/game_icons/posner.webp'),
  prl: require('../../assets/images/game_icons/prl.webp'),
  proofreading: require('../../assets/images/game_icons/proofreading.webp'),
  pseudoword_echo: require('../../assets/images/game_icons/pseudoword_echo.webp'),
  puzzles: require('../../assets/images/game_icons/puzzles.webp'),
  quick_count: require('../../assets/images/game_icons/quick_count.webp'),
  reading_span: require('../../assets/images/game_icons/reading_span.webp'),
  rhythm_pitch: require('../../assets/images/game_icons/rhythm_pitch.webp'),
  rmet: require('../../assets/images/game_icons/rmet.webp'),
  scholars_mate: require('../../assets/images/game_icons/scholars_mate.webp'),
  schulte_table: require('../../assets/images/game_icons/schulte_table.webp'),
  sdmt: require('../../assets/images/game_icons/sdmt.webp'),
  semantic_sort: require('../../assets/images/game_icons/semantic_sort.webp'),
  set_game: require('../../assets/images/game_icons/set_game.webp'),
  simon: require('../../assets/images/game_icons/simon.webp'),
  span_group: require('../../assets/images/game_icons/span_group.webp'),
  spatial_lab: require('../../assets/images/game_icons/spatial_lab.webp'),
  spatial_span: require('../../assets/images/game_icons/spatial_span.webp'),
  stop_signal: require('../../assets/images/game_icons/stop_signal.webp'),
  story_recall: require('../../assets/images/game_icons/story_recall.webp'),
  stroop: require('../../assets/images/game_icons/stroop.webp'),
  stroop_emotional: require('../../assets/images/game_icons/stroop_emotional.webp'),
  sudoku: require('../../assets/images/game_icons/sudoku.webp'),
  sudoku_group: require('../../assets/images/game_icons/sudoku.webp'),
  switching_task: require('../../assets/images/game_icons/switching_task.webp'),
  targets: require('../../assets/images/game_icons/targets.webp'),
  tower_london: require('../../assets/images/game_icons/tower_london.webp'),
  trail_making: require('../../assets/images/game_icons/trail_making.webp'),
  visual_search: require('../../assets/images/game_icons/visual_search.webp'),
  vocab_srs: require('../../assets/images/game_icons/vocab_srs.webp'),
  water_sort: require('../../assets/images/game_icons/water_sort.webp'),
  wcst: require('../../assets/images/game_icons/wcst.webp'),
  word_pairs: require('../../assets/images/game_icons/word_pairs.webp'),
};

/** Кастомная иконка игры по id (undefined → GameCard покажет Ionicons-фолбэк). */
export function gameIcon(id?: string) {
  return id ? GAME_ICONS[id] : undefined;
}

// Иконка по nameKey (для GameIntro, который не знает id игры). Карта nameKey→id
// строится ЛЕНИВО через require('./games') — без top-level импорта, чтобы исключить
// риск циклической зависимости/порядка инициализации модулей.
let _byNameKey: Record<string, string> | null = null;
export function gameIconByNameKey(nameKey?: string) {
  if (!nameKey) return undefined;
  if (!_byNameKey) {
    _byNameKey = {};
    try {
      const { GAMES } = require('./games');
      (GAMES as any[]).forEach((g) => { if (g?.nameKey && g?.id) _byNameKey![g.nameKey] = g.id; });
    } catch { /* no-op */ }
  }
  return gameIcon(_byNameKey[nameKey]);
}
