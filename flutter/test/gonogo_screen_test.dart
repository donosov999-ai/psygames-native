import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/gonogo/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В «ЖМИ И ДЕРЖИСЬ» ИГРАЕТСЯ НАЖАТИЯМИ ПО ПОЛЮ.
///
/// 🔴 Именно по полю, а не по кнопке снизу: так в веб-версии и так требует приёмка
/// раздела. Проба нажимает сам холст и читает с экрана, что показано — круг или квадрат.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  bool circleShown() => find.byKey(const Key('gonogo-go')).evaluate().isNotEmpty;
  bool squareShown() => find.byKey(const Key('gonogo-nogo')).evaluate().isNotEmpty;

  /// ⚠️ ЖДЁМ СОБЫТИЯ, А НЕ ОТСЧИТЫВАЕМ МИЛЛИСЕКУНДЫ. Первая редакция пробы прокручивала
  /// время фиксированными кусками (окно + пауза) и на шестой пробе теряла стимул: пауза
  /// между пробами СЛУЧАЙНА (600–1000 мс на L1), поэтому лишние миллисекунды съедали
  /// начало следующей пробы, и ошибка копилась. Теперь шаг мелкий, а условие — то, что
  /// видно на экране.
  Future<void> waitStimulus(WidgetTester tester) async {
    for (var i = 0; i < 60; i++) {
      if (circleShown() || squareShown()) {
        return;
      }
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  /// Дождаться итога партии: последняя пауза между пробами тоже случайна, и
  /// фиксированный `pumpAndSettle` после неё ловил экран в середине.
  Future<void> waitDone(WidgetTester tester) async {
    for (var i = 0; i < 80; i++) {
      if (find.text('Уровень пройден').evaluate().isNotEmpty ||
          find.text('Уровень не пройден').evaluate().isNotEmpty) {
        return;
      }
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  Future<void> waitTrialEnd(WidgetTester tester) async {
    for (var i = 0; i < 60; i++) {
      if (!circleShown() && !squareShown()) {
        return;
      }
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  testWidgets('🔴 партия играется нажатиями по полю: круг — жать, квадрат — держаться', (tester) async {
    var clock = 0;
    await tester.pumpWidget(MaterialApp(
      home: GoNoGoScreen(state: state, clock: () => clock, rnd: Random(7)),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Начать'));
    await tester.pump();
    // Первая проба приходит через 800 мс — до неё поле пустое.
    expect(circleShown() || squareShown(), isFalse, reason: 'стимул не должен появляться мгновенно');
    await waitStimulus(tester);

    var circles = 0;
    var squares = 0;
    for (var i = 0; i < 24; i++) {
      expect(circleShown() || squareShown(), isTrue, reason: 'проба ${i + 1}: нет стимула');
      if (circleShown()) {
        circles += 1;
        clock += 350;
        await tester.tap(find.byKey(const Key('gonogo-field')));
        await tester.pump();
        expect(find.byKey(const Key('gonogo-hit')), findsOneWidget, reason: 'проба ${i + 1}: попадание не засчитано');
      } else {
        squares += 1;
      }
      await waitTrialEnd(tester);
      if (i < 23) await waitStimulus(tester);
    }
    await waitDone(tester);

    expect(circles > 0 && squares > 0, isTrue, reason: 'в партии обязаны встретиться обе пробы');
    expect(find.text('Уровень пройден'), findsOneWidget, reason: 'ни одной ошибки — это проход');
    expect(find.textContaining('Поймано $circles'), findsOneWidget);
    expect(find.textContaining('удержано $squares'), findsOneWidget);
    expect(find.textContaining('Среднее время: 350 мс'), findsOneWidget,
        reason: 'отсчёт обязан идти от показа стимула');
  });

  testWidgets('🔴 нажатие на квадрат — ложная тревога, а не «просто ошибка»', (tester) async {
    await tester.pumpWidget(MaterialApp(home: GoNoGoScreen(state: state, rnd: Random(3))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Начать'));
    await waitStimulus(tester);

    for (var i = 0; i < 24; i++) {
      if (squareShown()) {
        await tester.tap(find.byKey(const Key('gonogo-field')));
        await tester.pump();
        expect(find.byKey(const Key('gonogo-false-alarm')), findsOneWidget);
        return;
      }
      await waitTrialEnd(tester);
      await waitStimulus(tester);
    }
    fail('за 24 пробы не выпало ни одного запрета — проверять было нечего');
  });

  testWidgets('🔴 молчание всю партию: пропуски считаются, уровень не засчитан', (tester) async {
    await tester.pumpWidget(MaterialApp(home: GoNoGoScreen(state: state, rnd: Random(11))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Начать'));
    await waitStimulus(tester);
    for (var i = 0; i < 24; i++) {
      await waitTrialEnd(tester);
      await waitStimulus(tester);
    }
    await waitDone(tester);
    expect(find.text('Уровень не пройден'), findsOneWidget);
    expect(find.textContaining('Поймано 0'), findsOneWidget);
    expect(find.textContaining('Среднее время: нет нажатий на цель'), findsOneWidget);
  });
}
