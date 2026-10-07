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
  // Развилки-группы — папка «Apple Glass» (Денис 13.09.2026): три иконки первых игр развилки и четвёртая
  // маленькая; у развилки из развилок («Языки») — их игры поочерёдно; у трёх игр («Шахматы») 4-й слот пуст.
  // Собраны КОДОМ из иконок самих игр, не генерацией: ~/dev/psygames/memory-hearing-chat/icons/compose-group-tiles.py.
  chess_group: require('../../assets/images/game_icons/chess_group.webp'),
  counting_group: require('../../assets/images/game_icons/counting_group.webp'),
  hearing_group: require('../../assets/images/game_icons/hearing_group.webp'),
  languages_group: require('../../assets/images/game_icons/languages_group.webp'),
  mnemonics_group: require('../../assets/images/game_icons/mnemonics_group.webp'),
  search_group: require('../../assets/images/game_icons/search_group.webp'),
  sorting_group: require('../../assets/images/game_icons/sorting_group.webp'),
  spatial_group: require('../../assets/images/game_icons/spatial_group.webp'),
  words_group: require('../../assets/images/game_icons/words_group.webp'),
  'sudoku-samurai': require('../../assets/images/game_icons/sudoku_samurai.webp'),
  'sudoku-fractal': require('../../assets/images/game_icons/sudoku_fractal.webp'),
  // Глубокий «Фрактал» — то же поле, вложенное глубже: иконка та же (экран скрыт из меню, видна в истории и итогах).
  'sudoku-fractal-deep': require('../../assets/images/game_icons/sudoku_fractal.webp'),
};

/**
 * Иконки РЕЖИМОВ и экранов без записи в GAMES — ключ = адрес строки развилки ЦЕЛИКОМ, с режимом:
 * 41 головоломка Тэтхэма, режимы судоку и «Лаборатории», «Найди ход» (01.10.2026, поле игры по снимку
 * её экрана, без текста). Читает выгрузка в приложение `flutter/tools/embed-game-icons.mjs`.
 */
export const MODE_ICONS: Record<string, any> = {
  '/games/puzzles?mode=Black%20Box': require('../../assets/images/game_icons/puzzle_blackbox.webp'),
  '/games/puzzles?mode=Bridges': require('../../assets/images/game_icons/puzzle_bridges.webp'),
  '/games/puzzles?mode=Cube': require('../../assets/images/game_icons/puzzle_cube.webp'),
  '/games/puzzles?mode=Dominosa': require('../../assets/images/game_icons/puzzle_dominosa.webp'),
  '/games/puzzles?mode=Fifteen': require('../../assets/images/game_icons/puzzle_fifteen.webp'),
  '/games/puzzles?mode=Filling': require('../../assets/images/game_icons/puzzle_filling.webp'),
  '/games/puzzles?mode=Flip': require('../../assets/images/game_icons/puzzle_flip.webp'),
  '/games/puzzles?mode=Flood': require('../../assets/images/game_icons/puzzle_flood.webp'),
  '/games/puzzles?mode=Galaxies': require('../../assets/images/game_icons/puzzle_galaxies.webp'),
  '/games/puzzles?mode=Guess': require('../../assets/images/game_icons/puzzle_guess.webp'),
  '/games/puzzles?mode=Inertia': require('../../assets/images/game_icons/puzzle_inertia.webp'),
  '/games/puzzles?mode=Keen': require('../../assets/images/game_icons/puzzle_keen.webp'),
  '/games/puzzles?mode=Light%20Up': require('../../assets/images/game_icons/puzzle_lightup.webp'),
  '/games/puzzles?mode=Loopy': require('../../assets/images/game_icons/puzzle_loopy.webp'),
  '/games/puzzles?mode=Magnets': require('../../assets/images/game_icons/puzzle_magnets.webp'),
  '/games/puzzles?mode=Map': require('../../assets/images/game_icons/puzzle_map.webp'),
  '/games/puzzles?mode=Mines': require('../../assets/images/game_icons/puzzle_mines.webp'),
  '/games/puzzles?mode=Mosaic': require('../../assets/images/game_icons/puzzle_mosaic.webp'),
  '/games/puzzles?mode=Net': require('../../assets/images/game_icons/puzzle_net.webp'),
  '/games/puzzles?mode=Netslide': require('../../assets/images/game_icons/puzzle_netslide.webp'),
  '/games/puzzles?mode=Palisade': require('../../assets/images/game_icons/puzzle_palisade.webp'),
  '/games/puzzles?mode=Pattern': require('../../assets/images/game_icons/puzzle_pattern.webp'),
  '/games/puzzles?mode=Pearl': require('../../assets/images/game_icons/puzzle_pearl.webp'),
  '/games/puzzles?mode=Pegs': require('../../assets/images/game_icons/puzzle_pegs.webp'),
  '/games/puzzles?mode=Range': require('../../assets/images/game_icons/puzzle_range.webp'),
  '/games/puzzles?mode=Rectangles': require('../../assets/images/game_icons/puzzle_rect.webp'),
  '/games/puzzles?mode=Same%20Game': require('../../assets/images/game_icons/puzzle_samegame.webp'),
  '/games/puzzles?mode=Signpost': require('../../assets/images/game_icons/puzzle_signpost.webp'),
  '/games/puzzles?mode=Singles': require('../../assets/images/game_icons/puzzle_singles.webp'),
  '/games/puzzles?mode=Sixteen': require('../../assets/images/game_icons/puzzle_sixteen.webp'),
  '/games/puzzles?mode=Slant': require('../../assets/images/game_icons/puzzle_slant.webp'),
  '/games/puzzles?mode=Slide': require('../../assets/images/game_icons/puzzle_slide.webp'),
  '/games/puzzles?mode=Sokoban': require('../../assets/images/game_icons/puzzle_sokoban.webp'),
  '/games/puzzles?mode=Solo': require('../../assets/images/game_icons/puzzle_solo.webp'),
  '/games/puzzles?mode=Tents': require('../../assets/images/game_icons/puzzle_tents.webp'),
  '/games/puzzles?mode=Towers': require('../../assets/images/game_icons/puzzle_towers.webp'),
  '/games/puzzles?mode=Train%20Tracks': require('../../assets/images/game_icons/puzzle_tracks.webp'),
  '/games/puzzles?mode=Twiddle': require('../../assets/images/game_icons/puzzle_twiddle.webp'),
  '/games/puzzles?mode=Undead': require('../../assets/images/game_icons/puzzle_undead.webp'),
  '/games/puzzles?mode=Unequal': require('../../assets/images/game_icons/puzzle_unequal.webp'),
  '/games/puzzles?mode=Untangle': require('../../assets/images/game_icons/puzzle_untangle.webp'),
  '/games/spatial-lab?mode=net': require('../../assets/images/game_icons/puzzle_net.webp'),
  '/games/spatial-lab?mode=twiddle': require('../../assets/images/game_icons/puzzle_twiddle.webp'),
  '/games/sudoku?mode=towers': require('../../assets/images/game_icons/sudoku_towers.webp'),
  '/games/sudoku?mode=unequal': require('../../assets/images/game_icons/sudoku_unequal.webp'),
  // Временно, до своих картинок (заказ imagegen-codex-mac): киллер — клетки с суммами, как у Keen;
  // «Свободно» — классика без вариантов, как сама судоку.
  '/games/sudoku?mode=killer': require('../../assets/images/game_icons/puzzle_keen.webp'),
  '/games/sudoku?mode=free': require('../../assets/images/game_icons/sudoku.webp'),
  // «Судоку для малышей»: звери из «Пар» (flutter/assets/pairs/animals) в клетках — те же, что на доске.
  '/games/sudoku?mode=junior': require('../../assets/images/game_icons/sudoku_junior.webp'),
  '/games/find-move': require('../../assets/images/game_icons/find_move.webp'),
  // «Конь и ферзи» (39ad8924): своя иконка — поле с восемью ферзями и ходом коня.
  '/games/knights-queens': require('../../assets/images/game_icons/knights_queens.webp'),
  '/games/cats': require('../../assets/images/game_icons/cats.webp'),
  // «Кто спрятался?»: строка развилки «Головоломки» (задача 4a5bb886), Nano Banana 2, 256 px.
  '/games/hidden-character': require('../../assets/images/game_icons/hidden_character.webp'),
  // «Пасьянс-шахматы» (#133) — строка развилки шахмат без своей карточки в GAMES: иконка группы фигур.
  '/games/solitaire-chess': require('../../assets/images/game_icons/chess_group.webp'),
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
