import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 ИТОГ УРОВНЯ — ТОЛЬКО ОБЩИЙ КАРКАСА (задача e90a53d5, 13.11.2026).
///
/// Замер по main 13.11: 55 игр рисовали свой экран итога с кнопкой «Следующий» / «Дальше сразу»
/// (`L.t('nextLabel')`, `L.t('nextNow')`), автоперехода не было ни у одной. Теперь итог —
/// `shell/level_result.dart` ([LevelResult]): игра отдаёт исход, счёт и старт партии, а кнопки, звёзды и
/// автопереход рисует каркас.
///
/// ХРАПОВИК: [remaining] — игры, ещё не переведённые на общий итог (13.11: 55 → 0). Список только сокращается: новая игра
/// со своим «Следующий» — красный; переведённая игра, оставшаяся в списке, — тоже красный (вычеркни её).
const remaining = <String>{};

/// «Следующий» не как кнопка итога, а подпись в самой партии — законно.
const _ownMeaning = <String, String>{
  // «Следующий: 5» — какую точку соединять, подсказка хода во время партии (не итог).
  'trail_making': 'подсказка хода «Следующий: N»',
  // RMET — замерный тест без уровней: «Следующий» ведёт к следующей фотографии внутри прохода.
  'rmet': 'следующая фотография внутри одного прохода теста',
};

final _pattern = RegExp(r"L\.t\('(nextLabel|nextNow)'\)");
// These buttons advance a card after feedback, not a level after a result.
// Strip just the keyed action; any other match in either game still fails.
final _nextCard = {
  'lib/games/cloze/screen.dart': RegExp(
    r"key: const Key\('cloze-next'\),\s*onPressed: _finishing \? null : _continueAfterReview,\s*child: Text\(L\.t\('nextLabel'\)\)",
  ),
  'lib/games/vocab_srs/screen.dart': RegExp(
    r"key: const Key\('vocab-next-card'\),\s*onPressed: _advanceCard,\s*child: Text\(L\.t\('nextLabel'\)\)",
  ),
};

void main() {
  test('🔴 своего экрана итога со «Следующий» нет ни у одной игры вне храповика', () {
    final own = <String>{};
    for (final f in Directory('lib/games').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart')) continue;
      final p = f.path.replaceAll(r'\', '/');
      final src = f.readAsStringSync();
      final roundAction = _nextCard[p];
      final results = roundAction == null ? src : src.replaceFirst(roundAction, '');
      if (_pattern.hasMatch(results)) own.add(p.split('/')[2]);
    }
    final fresh = own.difference(remaining).difference(_ownMeaning.keys.toSet());
    expect(fresh, isEmpty, reason: 'итог уровня — LevelResult каркаса, не свой экран со «Следующий»');
    final converted = remaining.difference(own);
    expect(converted, isEmpty, reason: 'игра уже на общем итоге — вычеркни её из remaining');
  });
}
