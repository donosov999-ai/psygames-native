import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/pattern/model.dart' show patternLabelKeys;

/// 🔴 ПЕРЕВОД НЕ ТЕРЯЕТ ПОДСТАНОВКИ — ключи девяти экранов «Поиска» и «Счёта» (задача 4b6f863e).
///
/// Случай 02.10.2026: английские `patternRuleSquares` и `patternRuleGrowingDiff` потеряли `{c}` и
/// `({a}, {b}, …)`, хотя у русского и у остальных девяти языков они есть. Английский игрок — а это
/// основной язык с 01.10 — получал правило ряда без чисел. Ни один гейт словаря этого не видел:
/// они проверяют, что перевод ЕСТЬ, а не что в нём те же места под числа.
///
/// Ключи берутся из самих экранов и моделей раздела (`L.t('…')` / `L.f('…')` литералом) и из
/// списка `patternLabelKeys` — так проба сама растёт вместе с экранами.
void main() {
  const sources = [
    'lib/games/math_sprint/screen.dart',
    'lib/games/quick_count/screen.dart',
    'lib/games/number_bonds/screen.dart',
    'lib/games/mahjong/screen.dart',
    'lib/games/ospan/screen.dart',
    'lib/games/ospan/model.dart',
    'lib/games/object_tracker/screen.dart',
    'lib/games/object_tracker/model.dart',
    'lib/games/schulte/screen.dart',
    'lib/games/math_slider/screen.dart',
    'lib/games/pattern/screen.dart',
    'lib/games/pattern/model.dart',
  ];
  const languages = ['en', 'de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar'];

  Map<String, dynamic> bundle(String lang) =>
      jsonDecode(File('assets/l10n/$lang.json').readAsStringSync()) as Map<String, dynamic>;

  test('у каждого ключа раздела во всех 12 языках те же {подстановки}, что в русском', () {
    final keyRe = RegExp(r"L\.[tf]\(\s*'([A-Za-z0-9_]+)'");
    final keys = <String>{...patternLabelKeys};
    for (final f in sources) {
      keys.addAll(keyRe.allMatches(File(f).readAsStringSync()).map((m) => m.group(1)!));
    }
    final slot = RegExp(r'\{(\w+)\}');
    Set<String> slots(String s) => {for (final m in slot.allMatches(s)) m.group(1)!};

    final ru = bundle('ru');
    final bad = <String>[];
    var withSlots = 0;
    for (final k in keys) {
      final source = ru[k];
      if (source is! String) continue; // ключа нет в словаре — это ловит l10n_keys_are_bundled_test
      final want = slots(source);
      if (want.isNotEmpty) withSlots += 1;
      for (final lang in languages) {
        final text = bundle(lang)[k];
        if (text is! String) continue;
        final got = slots(text);
        if (!setEquals(got, want)) bad.add('$lang/$k: ru $want, $lang $got — «$text»');
      }
    }
    expect(keys.length, greaterThan(100), reason: 'ключи не собрались — проба смотрит не туда');
    expect(withSlots, greaterThan(20), reason: 'ключей с подстановками почти нет — проба ничего не сверяет');
    expect(bad, isEmpty, reason: 'перевод потерял или выдумал подстановку:\n${bad.join('\n')}');
  });
}
