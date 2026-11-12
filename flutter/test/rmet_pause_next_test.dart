/// «ПРОЧТИ ЭМОЦИЮ»: ПОСЛЕ ОТВЕТА ПЕРЕХОД ДАЛЬШЕ — САМ (отзыв eb9607bb, 10.10.2026).
///
/// Отзыв: «пауза держит переход дальше». Веб (`rmet.tsx`) после ответа сам идёт к
/// следующему пункту через 800 мс; натив при переносе это потерял и стоял на разборе,
/// пока не нажмут «Следующий». Меряем: сам переход, паузу каркаса (часы партии стоят —
/// перехода нет, после «Продолжить» — есть) и ранний «Следующий» без двойного шага.
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

  Future<void> answerFirst(WidgetTester tester) async {
    await tester.tap(find.byKey(const ValueKey('rmet-start')));
    await tester.pump();
    await tester.tap(find.byKey(optionKeys(tester).first));
    await tester.pump();
    expect(find.byKey(const ValueKey('rmet-next')), findsOneWidget, reason: 'разбор ответа показан');
  }

  String progress(WidgetTester tester) => tester
      .widgetList<Text>(find.byType(Text))
      .map((t) => t.data ?? '')
      .firstWhere((t) => RegExp(r'^\d+/\d+$').hasMatch(t), orElse: () => '');

  testWidgets('🔴 после ответа следующий заход открывается сам, без нажатия (отзыв eb9607bb)', (tester) async {
    await boot(tester);
    await answerFirst(tester);
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byKey(const ValueKey('rmet-next')), findsOneWidget, reason: 'до 800 мс разбор ещё виден');
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const ValueKey('rmet-next')), findsNothing, reason: 'через 800 мс разбор закрыт сам');
    expect(optionKeys(tester), hasLength(4), reason: 'следующее задание на экране');
  });

  testWidgets('пауза каркаса держит часы: на паузе перехода нет, после «Продолжить» — есть', (tester) async {
    await boot(tester);
    await answerFirst(tester);
    await tester.tap(find.byTooltip(L.t('teachPause')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 3));
    // Меню паузы — непрозрачная страница: игра под ней «за кадром», ищем и там.
    expect(find.byKey(const ValueKey('rmet-next'), skipOffstage: false), findsOneWidget,
        reason: 'под паузой часы партии стоят — разбор не пролистан за спиной');
    await tester.tap(find.byKey(const Key('pause-resume')));
    await tester.pump();
    // Часы партии отпускаются, когда меню паузы закрылось (≈0,5 с анимации), затем 0,8 с.
    // Шагами, как кадры: таймер перевзводится только после того, как часы отпустили.
    for (var i = 0; i < 4; i++) {
      await tester.pump(const Duration(milliseconds: 500));
    }
    expect(find.byKey(const ValueKey('rmet-next')), findsNothing, reason: 'после «Продолжить» переход дошёл');
    expect(optionKeys(tester), hasLength(4));
  });

  testWidgets('ранний «Следующий» переходит сразу и не даёт второго шага от таймера', (tester) async {
    await boot(tester);
    await answerFirst(tester);
    final before = progress(tester);
    await tester.tap(find.byKey(const ValueKey('rmet-next')));
    await tester.pump();
    final after = progress(tester);
    expect(after, isNot(before), reason: 'нажатие перешло сразу');
    await tester.pump(const Duration(seconds: 2));
    expect(progress(tester), after, reason: 'таймер снят — лишнего шага без ответа нет');
    expect(optionKeys(tester), hasLength(4));
  });
}
