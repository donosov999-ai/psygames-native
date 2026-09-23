import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/simon/model.dart';
import 'package:psygames_flutter/games/simon/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В «ЦВЕТ ПРОТИВ ПОЗИЦИИ» ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// Проба читает с экрана ЦВЕТ квадрата и сторону, где он вспыхнул, и жмёт кнопку
/// по правилу цвета. Правила через модель не зовутся.
///
/// 🔴 Часы подставные: между показом стимула и нажатием проходит ровно заданное
/// число миллисекунд. Между рождением пробы и показом стоит пауза 500–1100 мс на
/// L1 — если отсчёт начать с рождения, среднее время вырастет на неё.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  /// Квадрат стимула на экране: его цвет и сторона.
  ({SimonColor color, SimonSide side}) stimulus(WidgetTester tester) {
    final box = tester.widgetList<Container>(find.byWidgetPredicate(
      (w) => w is Container && w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('simon-stimulus-'),
    )).single;
    final side = (box.key! as ValueKey<String>).value.endsWith('left') ? SimonSide.left : SimonSide.right;
    final color = (box.decoration! as BoxDecoration).color!;
    final blue = Color(int.parse(simonBlueHex.substring(1), radix: 16) | 0xFF000000);
    return (color: color == blue ? SimonColor.blue : SimonColor.red, side: side);
  }

  Finder answerFor(SimonSide s) => find.byKey(Key('simon-answer-${s.name}'));
  bool stimulusVisible() => find
      .byWidgetPredicate((w) =>
          w is Container && w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('simon-stimulus-'))
      .evaluate()
      .isNotEmpty;

  /// Пауза перед стимулом на L1 — не длиннее 1100 мс.
  const preWait = Duration(milliseconds: 1200);

  testWidgets('🔴 партия проходится нажатиями по ЦВЕТУ, а сторона вспышки на ответ не влияет', (tester) async {
    var clock = 0;
    await tester.pumpWidget(MaterialApp(home: SimonScreen(state: state, clock: () => clock, rnd: Random(7))));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Начать'));
    await tester.pump();
    expect(stimulusVisible(), isFalse, reason: 'стимул обязан появиться ПОСЛЕ паузы, а не сразу');

    var conflicts = 0;
    for (var i = 0; i < 16; i++) {
      await tester.pump(preWait);
      expect(stimulusVisible(), isTrue, reason: 'проба ${i + 1}: нет стимула');
      final s = stimulus(tester);
      if (s.side != correctSide(s.color)) conflicts += 1;
      clock += 430;
      // Жмём по ЦВЕТУ. Если экран подключён к стороне вспышки, конфликтные пробы покраснеют.
      await tester.tap(answerFor(correctSide(s.color)));
      await tester.pump();
      expect(find.byKey(const Key('simon-hit')), findsOneWidget, reason: 'проба ${i + 1}: верный ответ не засчитан');
      await tester.pump(const Duration(milliseconds: 360));
    }
    await tester.pumpAndSettle();

    expect(conflicts > 0, isTrue, reason: 'без конфликтных проб партия ничего не мерила бы');
    expect(find.text('Уровень пройден'), findsOneWidget);
    expect(find.textContaining('Верно 16 из 16'), findsOneWidget);
    expect(find.textContaining('Среднее время: 430 мс'), findsOneWidget,
        reason: 'отсчёт обязан идти от показа стимула');
    expect(find.textContaining('Эффект Саймона: 0 мс'), findsOneWidget,
        reason: 'все пробы шли поровну — разность половин ноль');
  });

  testWidgets('🔴 ответ по СТОРОНЕ вспышки, а не по цвету — ошибка', (tester) async {
    await tester.pumpWidget(MaterialApp(home: SimonScreen(state: state, rnd: Random(4))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Начать'));
    await tester.pump();

    // Идём по пробам, пока не встретим конфликтную, и жмём сторону вспышки.
    for (var i = 0; i < 16; i++) {
      await tester.pump(preWait);
      final s = stimulus(tester);
      if (s.side != correctSide(s.color)) {
        await tester.tap(answerFor(s.side));
        await tester.pump();
        expect(find.byKey(const Key('simon-wrong')), findsOneWidget,
            reason: 'сторона вспышки — помеха, а не ответ');
        return;
      }
      await tester.tap(answerFor(correctSide(s.color)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 360));
    }
    fail('за 16 проб не встретилось ни одной конфликтной — проверять было нечего');
  });

  testWidgets('🔴 просрочка окна — ошибка, и уровень не засчитан', (tester) async {
    await tester.pumpWidget(MaterialApp(home: SimonScreen(state: state, rnd: Random(11))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Начать'));
    await tester.pump();

    // Молчим всю партию: пауза ≤1100 мс, окно на L1 — 2600 мс, отклик 350 мс.
    for (var i = 0; i < 16; i++) {
      await tester.pump(preWait);
      await tester.pump(const Duration(milliseconds: 2700));
      await tester.pump(const Duration(milliseconds: 360));
    }
    await tester.pumpAndSettle();
    expect(find.text('Уровень не пройден'), findsOneWidget);
    expect(find.textContaining('Верно 0 из 16 · ошибок 16'), findsOneWidget);
    expect(find.textContaining('Среднее время: нет верных проб'), findsOneWidget);
  });
}
