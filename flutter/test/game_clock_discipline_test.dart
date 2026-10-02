import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 ДИСЦИПЛИНА ЧАСОВ В ИГРАХ — ХРАПОВИК (задача 430d1299, 30.09.2026).
///
/// Время партии во Flutter обязано идти по игровым часам `lib/shell/game_clock.dart`
/// (`gameNow`, `gameTimeout`, `gameInterval`): они стоят, пока поверх игры пауза, разбор
/// или приложение в фоне. Веб держит то же правило гейтом `game-clock-discipline`.
///
/// На 30.09 настенные часы (`DateTime.now()`, голый `Timer(`/`Timer.periodic(`) стоят в
/// 89 файлах 69 игр — переводить их разделам, каждый свои. Поэтому здесь не запрет, а
/// ХРАПОВИК: число вызовов в файле расти не может, новый файл с настенными часами — красный.
/// Перевёл файл — снизь его строку в той же правке (иначе проба напомнит, что список протух).
///
/// ⚠️ ЗАКОННОЕ — ПОМЕЧАЙ СТРОКУ, А НЕ ПОДНИМАЙ БАЗУ. Календарь, а не длительность партии
/// (зерно раздачи, id партии, отметка времени сохранения, срок повторения слова) под паузой
/// стоять не должен. Такую строку помечай комментарием на ней же:
///     final seed = DateTime.now().millisecondsSinceEpoch; // wall-clock: зерно раздачи
/// Помеченная строка не считается. Причина после двоеточия обязательна — пустая метка не
/// работает. Анимация интерфейса (вспышка, тряска) — тоже не партия, но её честнее вести
/// `AnimationController`, а не `Timer`.
const _baseline = <String, int>{
  'anagrams/screen.dart': 1,
  'animal_queue/screen.dart': 2,
  'ant/model.dart': 1,
  'ant/screen.dart': 6,
  'bart/screen.dart': 1,
  'cake_sort/screen.dart': 1,
  'chinese_tones/screen.dart': 3,
  'choice_rt/model.dart': 1,
  'choice_rt/screen.dart': 3,
  'cloze/screen.dart': 5,
  'counter/screen.dart': 4,
  'cpt/model.dart': 1,
  'cpt/screen.dart': 4,
  'dictation/screen.dart': 3,
  'faces_names/screen.dart': 1,
  'find_differences/screen.dart': 2,
  'flanker/model.dart': 1,
  'flanker/screen.dart': 3,
  'fractal/levels.dart': 1,
  'fractal/screen.dart': 1,
  'gonogo/model.dart': 1,
  'gonogo/screen.dart': 3,
  'goods_sort/screen.dart': 1,
  'hanoi/screen.dart': 1,
  'hidden_character/screen.dart': 3,
  'inhibition/model.dart': 1,
  'inhibition/screen.dart': 5,
  'iowa/screen.dart': 2,
  'kids_sort/screen.dart': 1,
  'lexical_decision/screen.dart': 4,
  'mahjong/screen.dart': 1,
  'math_slider/screen.dart': 2,
  'math_sprint/screen.dart': 1,
  'memory_palace/screen.dart': 1,
  'mental_rotation/screen.dart': 10,
  'number_bonds/screen.dart': 2,
  'ospan/screen.dart': 1,
  'pattern/screen.dart': 1,
  'phoneme_pairs/screen.dart': 3,
  'phonemic_fluency/screen.dart': 2,
  'picture_pairs/screen.dart': 7,
  'posner/model.dart': 1,
  'posner/screen.dart': 5,
  'prl/screen.dart': 2,
  'proofreading/model.dart': 1,
  'proofreading/screen.dart': 2,
  'pseudoword_echo/screen.dart': 2,
  'puzzles/screen.dart': 2,
  'quick_count/screen.dart': 2,
  'rmet/screen.dart': 1,
  // «Ритм и высота» пришла в main (#67) после снятия базы — внесено как есть, переводит «Языки».
  'rhythm_pitch/screen.dart': 1,
  'rhythm_pitch/tones.dart': 1,
  'roll_and_bank/screen.dart': 4,
  'samurai/levels.dart': 1,
  'samurai/screen.dart': 1,
  'scholars_mate/screen.dart': 2,
  'schulte/screen.dart': 2,
  'sdmt/screen.dart': 1,
  'semantic_sort/screen.dart': 2,
  'set_game/screen.dart': 2,
  'simon/model.dart': 1,
  'simon/screen.dart': 3,
  'sort_tubes/screen.dart': 2,
  'spatial_span/screen.dart': 4,
  'stop_signal/model.dart': 1,
  'stop_signal/screen.dart': 4,
  'story_recall/screen.dart': 2,
  'stroop/model.dart': 1,
  'stroop/screen.dart': 2,
  'stroop_emotional/model.dart': 1,
  'stroop_emotional/screen.dart': 3,
  'sudoku/levels.dart': 1,
  'sudoku/modes.dart': 1,
  'switching_task/model.dart': 1,
  'switching_task/screen.dart': 3,
  'targets/model.dart': 1,
  'targets/screen.dart': 6,
  'tower_london/screen.dart': 1,
  'visual_search/screen.dart': 2,
  'vocab_srs/model.dart': 1,
  'vocab_srs/screen.dart': 3,
  'vocab_srs/typing.dart': 1,
  'wcst/screen.dart': 1,
  'word_pairs/screen.dart': 1,
};

final _marked = RegExp(r'//\s*wall-clock:\s*\S');
final _wall = RegExp(r'DateTime\.now\(\)|(?<![A-Za-z_])Timer(\.periodic)?\(');

Map<String, int> _measure() {
  final out = <String, int>{};
  for (final e in Directory('lib/games').listSync(recursive: true)) {
    if (e is! File || !e.path.endsWith('.dart')) continue;
    // Строка с меткой `// wall-clock: <причина>` — законный календарь, не считается (см. шапку).
    final code = e
        .readAsStringSync()
        .split('\n')
        .where((line) => !_marked.hasMatch(line))
        .join('\n')
        .replaceAll(RegExp(r'//[^\n]*'), '');
    final n = _wall.allMatches(code).length;
    if (n > 0) out[e.path.substring('lib/games/'.length)] = n;
  }
  return out;
}

void main() {
  test('🔴 настенных часов в играх не прибавляется (храповик)', () {
    final now = _measure();
    final grew = <String>[
      for (final e in now.entries)
        if (e.value > (_baseline[e.key] ?? 0))
          '${e.key}: ${_baseline[e.key] ?? 0} → ${e.value} — время партии веди по gameNow/gameTimeout/gameInterval (lib/shell/game_clock.dart)',
    ];
    final total = now.values.fold<int>(0, (a, b) => a + b);
    // ignore: avoid_print
    print('ЧАСЫ В ИГРАХ: настенных вызовов $total в ${now.length} файлах (база ${_baseline.values.fold<int>(0, (a, b) => a + b)} в ${_baseline.length})');
    expect(grew, isEmpty);
  });

  test('список храповика не протух: переведённый файл снижает свою строку', () {
    final now = _measure();
    final stale = <String>[
      for (final e in _baseline.entries)
        if ((now[e.key] ?? 0) < e.value) '${e.key}: в списке ${e.value}, в коде ${now[e.key] ?? 0} — снизь строку',
    ];
    expect(stale, isEmpty);
  });
}
