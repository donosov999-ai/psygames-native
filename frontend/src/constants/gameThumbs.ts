// Превью игр для фона карточки. 48 взяты готовыми с промо-сайта psy-games.pro
// (public/gamethumbs) — их уже отрисовали для страницы «Все 48 тренажёров».
// Ещё 13 (breathing, chess_blind, cloze, eye_gym, goods_sort, lexical_decision,
// listening_span, mahjong, phoneme_pairs, pseudoword_echo, quick_count,
// semantic_sort, vocab_srs) дорисованы тем же стилем: SVG 160x160 → sharp → webp.
// ~2-4 КБ каждое. Игры без превью показывают карточку как раньше (фолбэк).
const THUMBS: Record<string, any> = {
  anagrams: require('../../assets/images/gamethumbs/anagrams.webp'),
  ant: require('../../assets/images/gamethumbs/ant.webp'),
  attention_conflict: require('../../assets/images/gamethumbs/attention_conflict.webp'),
  bart: require('../../assets/images/gamethumbs/bart.webp'),
  breathing: require('../../assets/images/gamethumbs/breathing.webp'),
  chess_blind: require('../../assets/images/gamethumbs/chess_blind.webp'),
  choice_rt: require('../../assets/images/gamethumbs/choice_rt.webp'),
  cloze: require('../../assets/images/gamethumbs/cloze.webp'),
  corsi: require('../../assets/images/gamethumbs/corsi.webp'),
  counter: require('../../assets/images/gamethumbs/counter.webp'),
  cpt: require('../../assets/images/gamethumbs/cpt.webp'),
  digit_span: require('../../assets/images/gamethumbs/digit_span.webp'),
  eye_gym: require('../../assets/images/gamethumbs/eye_gym.webp'),
  find_differences: require('../../assets/images/gamethumbs/find_differences.webp'),
  flanker: require('../../assets/images/gamethumbs/flanker.webp'),
  go_no_go: require('../../assets/images/gamethumbs/go_no_go.webp'),
  goods_sort: require('../../assets/images/gamethumbs/goods_sort.webp'),
  hanoi: require('../../assets/images/gamethumbs/hanoi.webp'),
  inhibition: require('../../assets/images/gamethumbs/inhibition.webp'),
  iowa: require('../../assets/images/gamethumbs/iowa.webp'),
  lexical_decision: require('../../assets/images/gamethumbs/lexical_decision.webp'),
  listening_span: require('../../assets/images/gamethumbs/listening_span.webp'),
  mahjong: require('../../assets/images/gamethumbs/mahjong.webp'),
  math_sprint: require('../../assets/images/gamethumbs/math_sprint.webp'),
  memory_matrix: require('../../assets/images/gamethumbs/memory_matrix.webp'),
  mental_rotation: require('../../assets/images/gamethumbs/mental_rotation.webp'),
  mnemonics: require('../../assets/images/gamethumbs/mnemonics.webp'),
  n_back: require('../../assets/images/gamethumbs/n_back.webp'),
  number_bonds: require('../../assets/images/gamethumbs/number_bonds.webp'),
  ospan: require('../../assets/images/gamethumbs/ospan.webp'),
  pattern: require('../../assets/images/gamethumbs/pattern.webp'),
  phoneme_pairs: require('../../assets/images/gamethumbs/phoneme_pairs.webp'),
  phonemic_fluency: require('../../assets/images/gamethumbs/phonemic_fluency.webp'),
  picture_pairs: require('../../assets/images/gamethumbs/picture_pairs.webp'),
  posner: require('../../assets/images/gamethumbs/posner.webp'),
  prl: require('../../assets/images/gamethumbs/prl.webp'),
  proofreading: require('../../assets/images/gamethumbs/proofreading.webp'),
  pseudoword_echo: require('../../assets/images/gamethumbs/pseudoword_echo.webp'),
  quick_count: require('../../assets/images/gamethumbs/quick_count.webp'),
  reading_span: require('../../assets/images/gamethumbs/reading_span.webp'),
  rmet: require('../../assets/images/gamethumbs/rmet.webp'),
  schulte_table: require('../../assets/images/gamethumbs/schulte_table.webp'),
  sdmt: require('../../assets/images/gamethumbs/sdmt.webp'),
  semantic_sort: require('../../assets/images/gamethumbs/semantic_sort.webp'),
  set_game: require('../../assets/images/gamethumbs/set_game.webp'),
  simon: require('../../assets/images/gamethumbs/simon.webp'),
  span_group: require('../../assets/images/gamethumbs/span_group.webp'),
  spatial_span: require('../../assets/images/gamethumbs/spatial_span.webp'),
  stop_signal: require('../../assets/images/gamethumbs/stop_signal.webp'),
  story_recall: require('../../assets/images/gamethumbs/story_recall.webp'),
  stroop: require('../../assets/images/gamethumbs/stroop.webp'),
  stroop_emotional: require('../../assets/images/gamethumbs/stroop_emotional.webp'),
  sudoku: require('../../assets/images/gamethumbs/sudoku.webp'),
  switching_task: require('../../assets/images/gamethumbs/switching_task.webp'),
  targets: require('../../assets/images/gamethumbs/targets.webp'),
  tower_london: require('../../assets/images/gamethumbs/tower_london.webp'),
  trail_making: require('../../assets/images/gamethumbs/trail_making.webp'),
  visual_search: require('../../assets/images/gamethumbs/visual_search.webp'),
  vocab_srs: require('../../assets/images/gamethumbs/vocab_srs.webp'),
  wcst: require('../../assets/images/gamethumbs/wcst.webp'),
  word_pairs: require('../../assets/images/gamethumbs/word_pairs.webp'),
};

export function gameThumb(id?: string) {
  return id ? THUMBS[id] : undefined;
}

// Текстовые игры: превью — плотный абзац текста, на 0.22 он спорит с названием
// карточки (скрин Дениса 22.07). Им фактуру глушим сильнее.
const SUBTLE_IDS = new Set(['story_recall', 'reading_span', 'mnemonics', 'proofreading', 'cloze']);

export function gameThumbOpacity(id?: string): number {
  return id && SUBTLE_IDS.has(id) ? 0.1 : 0.22;
}
