/// «МНЕМОТЕХНИКИ» В «АВРОРЕ» (волна 3, 13.11.2026, раздел «Память и слух»).
///
/// Четыре игры — «Дворец памяти», «Лица и имена», «Пары слов», «Прочти эмоцию» — в
/// `auroraReadyRoutes`: под «Авророй» поле получает её тему, а смысловые цвета идут из
/// ролей `GameColors`, не из литералов. Меряем на RMET, где литералы были: зачёркнутый
/// неверный выбор и правильный ответ окрашены ролями «Авроры» в обеих яркостях.
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/rmet/model.dart';
import 'package:psygames_flutter/games/rmet/screen.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/aurora_scope.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_colors.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('четыре «Мнемотехники» в списке готовых к «Авроре»', () {
    for (final r in ['/games/memory-palace', '/games/faces-names', '/games/word-pairs', '/games/rmet']) {
      expect(auroraReadyRoutes, contains(r));
    }
  });

  for (final b in Brightness.values) {
    testWidgets('RMET под «Авророй» ($b): неверный выбор и ответ — роли wrong/correct', (tester) async {
      L.useForTest('ru', const {});
      SharedPreferences.setMockInitialValues({});
      final state = await SharedState.open();
      final content = RmetContent.fromJsonString(File('assets/rmet.json').readAsStringSync());
      await tester.pumpWidget(MaterialApp(
        theme: applyUiTemplate(classicShellTheme(b), UiTemplate.aurora),
        home: AuroraGameScope(route: '/games/rmet', child: RmetScreen(state: state, content: content, trials: 3)),
      ));
      await tester.pump();
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('rmet-start')));
      await tester.pump();
      // Неверный вариант: тот, что не совпадает с правильным ответом на экране.
      final options = tester.allWidgets
          .map((w) => w.key)
          .whereType<ValueKey<String>>()
          .where((k) => k.value.startsWith('rmet-option-'))
          .toSet()
          .toList();
      await tester.tap(find.byKey(options.first));
      await tester.pump();
      final aurora = GameColors.aurora(b);
      final correct = tester.widget<Text>(find.byKey(const ValueKey('rmet-correct')));
      final chosen = find.byKey(const ValueKey('rmet-chosen'));
      if (chosen.evaluate().isNotEmpty) {
        expect(tester.widget<Text>(chosen).style?.color, aurora.wrong, reason: 'зачёркнутый выбор — роль wrong «Авроры»');
        expect(correct.style?.color, aurora.wrong, reason: 'при промахе ответ — роль wrong «Авроры»');
      } else {
        expect(correct.style?.color, aurora.correct, reason: 'верный ответ — роль correct «Авроры»');
      }
      final classic = GameColors.classicFor(classicShellTheme(b).colorScheme);
      expect(correct.style?.color, isNot(anyOf(classic.correct, classic.wrong)),
          reason: 'не классический цвет: поле действительно в «Авроре»');
    });
  }
}
