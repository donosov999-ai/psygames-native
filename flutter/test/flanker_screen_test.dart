import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/flanker/model.dart';
import 'package:psygames_flutter/games/flanker/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В «СТРЕЛКИ» ИГРАЕТСЯ НАЖАТИЯМИ, а не вызовом правил.
///
/// Проба нажимает настоящие кнопки ответа и читает то, что видно на экране:
/// центральную стрелку, отклик, счётчики каркаса. Правила через модель здесь НЕ
/// зовутся — иначе экран мог бы быть подключён к ним как угодно и проба осталась
/// бы зелёной.
///
/// 🔴 ВРЕМЯ РЕАКЦИИ — ГЛАВНОЕ ПРИ ПЕРЕЕЗДЕ. Часы подставные: между показом стимула
/// и нажатием проходит ровно заданное число миллисекунд. Между рождением пробы и
/// показом стоит подготовительный интервал 500–1100 мс, и если отсчёт начать с
/// рождения, среднее время вырастет на него — эта проба такое ловит.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  /// Куда смотрит ЦЕНТРАЛЬНАЯ стрелка — читаем с экрана, а не у модели.
  FlankerDirection centerOnScreen(WidgetTester tester) {
    final icon = tester.widget<Icon>(
      find.descendant(of: find.byKey(const Key('flanker-stimulus')), matching: find.byType(Icon)),
    );
    return icon.icon == Icons.arrow_back ? FlankerDirection.left : FlankerDirection.right;
  }

  Finder answerFor(FlankerDirection d) => find.byKey(Key('flanker-answer-${d.name}'));

  /// Подготовительный интервал не длиннее 1100 мс — переждать его хватает 1200.
  const preWait = Duration(milliseconds: 1200);

  testWidgets('🔴 партия проходится нажатиями, и в копилку времени идёт ровно то, что прошло', (tester) async {
    var clock = 0;
    await tester.pumpWidget(MaterialApp(
      home: FlankerScreen(state: state, clock: () => clock, rnd: Random(7)),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Начать'));
    await tester.pump();
    // Сразу после старта стимула ещё нет: идёт подготовительный интервал.
    expect(find.byKey(const Key('flanker-stimulus')), findsNothing,
        reason: 'стимул обязан появиться ПОСЛЕ подготовительного интервала, а не сразу');

    // Уровень 1: 20 проб, окно 3000 мс. Отвечаем верно через 450 мс после показа.
    for (var i = 0; i < 20; i++) {
      await tester.pump(preWait);
      expect(find.byKey(const Key('flanker-stimulus')), findsOneWidget, reason: 'проба ${i + 1}: нет стимула');
      clock += 450;
      await tester.tap(answerFor(centerOnScreen(tester)));
      await tester.pump();
      expect(find.byKey(const Key('flanker-hit')), findsOneWidget, reason: 'проба ${i + 1}: верный ответ не засчитан');
      await tester.pump(const Duration(milliseconds: 360));
    }
    await tester.pumpAndSettle();

    expect(find.text('Уровень пройден'), findsOneWidget, reason: '20 верных из 20 — это проход');
    expect(find.textContaining('Верно 20 из 20'), findsOneWidget);
    // 🔴 Именно это число ловит сдвиг отсчёта: разность половин сдвиг сокращает, среднее — нет.
    expect(find.textContaining('Среднее время: 450 мс'), findsOneWidget,
        reason: 'отсчёт обязан идти от показа стимула: ожидание 500–1100 мс в него попадать не должно');
    // Все пробы шли поровну, значит разность половин — ноль. Случайность задана
    // семенем, поэтому обе половины набираются в каждом прогоне, а не «обычно».
    expect(find.textContaining('Эффект фланкера: 0 мс'), findsOneWidget);
  });

  testWidgets('🔴 нажатие ДО показа стимула не засчитывается — угадать вслепую нельзя', (tester) async {
    await tester.pumpWidget(MaterialApp(home: FlankerScreen(state: state, rnd: Random(3))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Начать'));
    await tester.pump();

    await tester.tap(answerFor(FlankerDirection.left));
    await tester.pump();
    expect(find.byKey(const Key('flanker-hit')), findsNothing, reason: 'до стимула попадания быть не может');
    expect(find.byKey(const Key('flanker-wrong')), findsNothing, reason: 'и ошибкой это тоже не считается');

    // Стимул приходит своим чередом, партия продолжается.
    await tester.pump(preWait);
    expect(find.byKey(const Key('flanker-stimulus')), findsOneWidget);
  });

  testWidgets('🔴 просрочка окна — ошибка, и уровень не засчитан', (tester) async {
    await tester.pumpWidget(MaterialApp(home: FlankerScreen(state: state, rnd: Random(11))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Начать'));
    await tester.pump();

    // Молчим всю партию: интервал ≤1100 мс, окно ответа на L1 — 3000 мс, отклик 350 мс.
    for (var i = 0; i < 20; i++) {
      await tester.pump(preWait);
      await tester.pump(const Duration(milliseconds: 3100));
      await tester.pump(const Duration(milliseconds: 360));
    }
    await tester.pumpAndSettle();
    expect(find.text('Уровень не пройден'), findsOneWidget);
    expect(find.textContaining('Верно 0 из 20 · ошибок 20'), findsOneWidget,
        reason: 'каждая просрочка обязана считаться ошибкой, а не пропускаться молча');
    expect(find.textContaining('Среднее время: нет верных проб'), findsOneWidget);
    expect(find.textContaining('не набрано обеих половин'), findsOneWidget,
        reason: 'без верных проб эффекта нет — ноль означал бы «конфликт не мешает»');
  });

  testWidgets('🔴 ответ не в ту сторону — ошибка, а не «мимо»', (tester) async {
    await tester.pumpWidget(MaterialApp(home: FlankerScreen(state: state, rnd: Random(5))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Начать'));
    await tester.pump();
    await tester.pump(preWait);

    final center = centerOnScreen(tester);
    final wrong = center == FlankerDirection.left ? FlankerDirection.right : FlankerDirection.left;
    await tester.tap(answerFor(wrong));
    await tester.pump();
    expect(find.byKey(const Key('flanker-wrong')), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 360));
    // Счётчик «Верно» каркаса остался нулём.
    expect(find.text('0'), findsWidgets);
  });
}
