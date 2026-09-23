import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/stroop/model.dart';
import 'package:psygames_flutter/games/stroop/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В СТРУПА ИГРАЕТСЯ НАЖАТИЯМИ, а не вызовом правил.
///
/// Проба нажимает настоящие кнопки ответа и читает то, что видно на экране:
/// стимул, подпись правила пробы, счётчики каркаса. Правила через модель здесь
/// НЕ зовутся — иначе экран мог бы быть подключён к ним как угодно и проба
/// осталась бы зелёной.
///
/// 🔴 ВРЕМЯ РЕАКЦИИ — ГЛАВНОЕ ПРИ ПЕРЕЕЗДЕ. Часы подставные: между показом стимула
/// и нажатием проходит ровно заданное число миллисекунд, и проба требует, чтобы
/// именно оно попало в копилку времени. Отсчёт не от планирования таймера и не от
/// первого кадра — от показа стимула.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  /// Кнопка ответа того цвета, который сейчас верен по правилу ПРОБЫ.
  Finder rightAnswer(WidgetTester tester) {
    final rule = tester.widget<Text>(find.byKey(const Key('stroop-rule'))).data;
    final stimulus = tester.widget<Text>(find.byKey(const Key('stroop-stimulus')));
    final word = stroopColorsDefault.firstWhere((c) => c.ru == stimulus.data);
    final ink = stroopColorsDefault.firstWhere((c) => _hexOf(c) == (stimulus.style!.color!.toARGB32() & 0xFFFFFF));
    final need = rule == 'цвет чернил' ? ink : word;
    return find.byKey(Key('stroop-answer-${need.name}'));
  }

  Finder wrongAnswer(WidgetTester tester) {
    final right = rightAnswer(tester);
    final key = tester.widget(right).key.toString();
    return find.byKey(Key('stroop-answer-${stroopColorsDefault.firstWhere((c) => !key.contains(c.name)).name}'));
  }

  testWidgets('🔴 партия проходится нажатиями, и в копилку времени идёт ровно то, что прошло', (tester) async {
    var clock = 0;
    await tester.pumpWidget(MaterialApp(home: StroopScreen(state: state, clock: () => clock)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Начать'));
    await tester.pump();
    expect(find.byKey(const Key('stroop-stimulus')), findsOneWidget, reason: 'после «Начать» должен быть стимул');

    // Уровень 1: 20 проб, окно 3500 мс. Отвечаем верно через 500 мс после показа.
    for (var i = 0; i < 20; i++) {
      expect(find.byKey(const Key('stroop-stimulus')), findsOneWidget, reason: 'проба ${i + 1}: нет стимула');
      clock += 500;
      await tester.tap(rightAnswer(tester));
      await tester.pump();
      expect(find.byKey(const Key('stroop-hit')), findsOneWidget, reason: 'проба ${i + 1}: верный ответ не засчитан');
      await tester.pump(const Duration(milliseconds: 260));
    }
    await tester.pumpAndSettle();

    expect(find.text('Уровень пройден'), findsOneWidget, reason: '20 верных из 20 — это проход');
    expect(find.textContaining('Верно 20 из 20'), findsOneWidget);
    // Все верные пробы шли ровно 500 мс, поэтому разность средних — ноль,
    // а не «нет обеих половин»: на L1 смен правила нет, обе половины набираются.
    // 🔴 Именно это число ловит сдвиг отсчёта: разность половин сдвиг сокращает, среднее — нет.
    expect(find.textContaining('Среднее время: 500 мс'), findsOneWidget,
        reason: 'отсчёт обязан идти от показа стимула: между показом и нажатием прошло ровно 500 мс');
    expect(find.textContaining('Интерференция: 0 мс'), findsOneWidget,
        reason: 'все пробы шли поровну, значит разность половин — ноль');
  });

  testWidgets('🔴 просрочка окна — ошибка, и уровень не засчитан', (tester) async {
    await tester.pumpWidget(MaterialApp(home: StroopScreen(state: state)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Начать'));
    await tester.pump();

    // Молчим всю партию: окно ответа на L1 — 3500 мс, отклик 220 мс.
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 3600));
      await tester.pump(const Duration(milliseconds: 260));
    }
    await tester.pumpAndSettle();
    expect(find.text('Уровень не пройден'), findsOneWidget);
    expect(find.textContaining('Верно 0 из 20 · ошибок 20'), findsOneWidget,
        reason: 'каждая просрочка обязана считаться ошибкой, а не пропускаться молча');
    expect(find.textContaining('Среднее время: нет верных проб'), findsOneWidget);
    expect(find.textContaining('не набрано обеих половин'), findsOneWidget,
        reason: 'без верных проб интерференции нет — ноль означал бы «эффекта нет»');
  });

  testWidgets('🔴 неверный ответ считается ошибкой, а не пропускается молча', (tester) async {
    await tester.pumpWidget(MaterialApp(home: StroopScreen(state: state)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Начать'));
    await tester.pump();

    await tester.tap(wrongAnswer(tester));
    await tester.pump();
    expect(find.byKey(const Key('stroop-wrong')), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 260));
    // Счётчик ошибок каркаса показывает 1.
    expect(find.text('1'), findsWidgets);
  });
}

/// Цвет чернил стимула — числом, чтобы сравнить с палитрой.
int _hexOf(StroopColor c) => int.parse(c.hex.substring(1), radix: 16);
