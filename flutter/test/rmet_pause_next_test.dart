/// ПАРТИЯ «ПРОЧТИ ЭМОЦИЮ» ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// Ядро знает правила, но не знает, доходит ли круг пальцем: есть ли на экране
/// четыре слова, показывается ли разбор и доводится ли заход до итога.
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/rmet/model.dart';
import 'package:psygames_flutter/games/rmet/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late SharedState state;
  late RmetContent content;

  setUpAll(() {
    content = RmetContent.fromJsonString(
      File('assets/rmet.json').readAsStringSync(),
    );
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester, {int trials = 3}) async {
    await tester.pumpWidget(
      MaterialApp(
        home: RmetScreen(state: state, content: content, trials: trials),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  List<ValueKey<String>> optionKeys(WidgetTester tester) {
    final found = <ValueKey<String>>[];
    for (final widget in tester.allWidgets) {
      final key = widget.key;
      if (key is ValueKey<String> &&
          key.value.startsWith('rmet-option-') &&
          !found.contains(key)) {
        found.add(key);
      }
    }
    return found;
  }

  testWidgets(
    'пауза каркаса не держит переход «дальше» после «Продолжить» (отзыв eb9607bb)',
    (tester) async {
      await boot(tester);
      await tester.tap(find.byKey(const ValueKey('rmet-start')));
      await tester.pump();
      await tester.tap(find.byKey(optionKeys(tester).first));
      await tester.pump();
      expect(find.byKey(const ValueKey('rmet-next')), findsOneWidget);

      // Пауза посреди разбора и «Продолжить».
      await tester.tap(find.byTooltip(L.t('teachPause')));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      await tester.tap(find.byKey(const Key('pause-resume')));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));

      await tester.tap(find.byKey(const ValueKey('rmet-next')));
      await tester.pump();
      expect(
        find.byKey(const ValueKey('rmet-next')),
        findsNothing,
        reason: 'после «дальше» разбор закрыт, показан следующий заход',
      );
      expect(
        optionKeys(tester),
        hasLength(4),
        reason: 'следующее задание на экране',
      );
    },
  );
}
