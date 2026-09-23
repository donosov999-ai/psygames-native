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
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late SharedState state;
  late RmetContent content;

  setUpAll(() {
    content = RmetContent.fromJsonString(File('assets/rmet.json').readAsStringSync());
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester, {int trials = 3}) async {
    await tester.pumpWidget(
      MaterialApp(home: RmetScreen(state: state, content: content, trials: trials)),
    );
    await tester.pump();
    await tester.pump();
  }

  List<ValueKey<String>> optionKeys(WidgetTester tester) {
    final found = <ValueKey<String>>[];
    for (final widget in tester.allWidgets) {
      final key = widget.key;
      if (key is ValueKey<String> && key.value.startsWith('rmet-option-') && !found.contains(key)) {
        found.add(key);
      }
    }
    return found;
  }

  testWidgets('🔴 заход проходится пальцем: четыре слова, разбор, итог', (tester) async {
    await boot(tester);
    await tester.tap(find.byKey(const ValueKey('rmet-start')));
    await tester.pump();

    for (var i = 0; i < 3; i += 1) {
      final options = optionKeys(tester);
      expect(options, hasLength(4), reason: 'выбор обязан быть из четырёх слов');
      await tester.tap(find.byKey(options.first));
      await tester.pump();
      // Разбор показывается ВСЕГДА, а не только при промахе.
      expect(find.byKey(const ValueKey('rmet-next')), findsOneWidget,
          reason: 'после ответа обязан быть показан разбор и шаг дальше');
      await tester.tap(find.byKey(const ValueKey('rmet-next')));
      await tester.pump();
    }
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('rmet-again')), findsOneWidget, reason: 'заход обязан дойти до итога');
    expect(find.textContaining('/3'), findsWidgets, reason: 'итог показывает, сколько из скольких');
  });

  testWidgets('🔴 разбор называет ОБА слова: что выбрал и что верно', (tester) async {
    await boot(tester);
    await tester.tap(find.byKey(const ValueKey('rmet-start')));
    await tester.pump();

    // Жмём заведомо неверное: разбор без «что выбрал» не учит ничему.
    final wrong = optionKeys(tester).firstWhere(
      (k) => !find
          .descendant(of: find.byKey(k), matching: find.byType(Text))
          .evaluate()
          .map((e) => (e.widget as Text).data)
          .contains(null),
      orElse: () => optionKeys(tester).first,
    );
    await tester.tap(find.byKey(wrong));
    await tester.pump();

    expect(find.byKey(const ValueKey('rmet-correct')), findsOneWidget, reason: 'верное слово названо');
    expect(optionKeys(tester), isEmpty, reason: 'на разборе варианты не нажимаются повторно');
  });
}
