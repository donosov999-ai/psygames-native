import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 ИТОГ УРОВНЯ — ТОЛЬКО ОБЩИЙ КАРКАСА (задача e90a53d5, 13.11.2026).
///
/// Замер по main 13.11: 55 игр рисовали свой экран итога с кнопкой «Следующий» / «Дальше сразу»
/// (`L.t('nextLabel')`, `L.t('nextNow')`), автоперехода не было ни у одной. Теперь итог —
/// `shell/level_result.dart` ([LevelResult]): игра отдаёт исход, счёт и старт партии, а кнопки, звёзды и
/// автопереход рисует каркас.
///
/// ХРАПОВИК: [remaining] — игры, ещё не переведённые на общий итог. Список только сокращается: новая игра
/// со своим «Следующий» — красный; переведённая игра, оставшаяся в списке, — тоже красный (вычеркни её).
const remaining = <String>{
  'cats', 'chess_blind', 'chinese_tones', 'cloze', 'corsi', 'counter', 'dictation', 'digit_span', //
  'dots_connect', 'faces_names', 'find_differences', 'find_move', 'hidden_character', 'kids_find',
  'knights_queens', 'lexical_decision', 'listening_span', 'mahjong', 'math_slider', 'math_sprint',
  'memory_matrix', 'memory_palace', 'mental_rotation', 'monster_traits', 'navigator', 'number_bonds',
  'number_run', 'object_tracker', 'one_line', 'ospan', 'pattern', 'phonemic_fluency', 'picture_pairs',
  'pseudoword_echo', 'quick_count', 'reading_span', 'rhythm_pitch', 'rmet', 'roll_and_bank', 'scholars_mate',
  'schulte', 'sdmt', 'search_runner', 'semantic_sort', 'set_game', 'solitaire_chess', 'spatial_lab',
  'spatial_span', 'story_recall', 'submarines', 'traffic_jam', 'trail_making', 'visual_search', 'word_pairs',
};

/// «Следующий» не как кнопка итога, а подпись в самой партии — законно.
const _ownMeaning = <String, String>{
  // «Следующий: 5» — какую точку соединять, подсказка хода.
};

final _pattern = RegExp(r"L\.t\('(nextLabel|nextNow)'\)");

void main() {
  test('🔴 своего экрана итога со «Следующий» нет ни у одной игры вне храповика', () {
    final own = <String>{};
    for (final f in Directory('lib/games').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart')) continue;
      if (_pattern.hasMatch(f.readAsStringSync())) own.add(f.path.split('/')[2]);
    }
    final fresh = own.difference(remaining).difference(_ownMeaning.keys.toSet());
    expect(fresh, isEmpty, reason: 'итог уровня — LevelResult каркаса, не свой экран со «Следующий»');
    final converted = remaining.difference(own);
    expect(converted, isEmpty, reason: 'игра уже на общем итоге — вычеркни её из remaining');
  });
}
