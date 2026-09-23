import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/object_tracker/model.dart';
import 'package:psygames_flutter/games/object_tracker/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// КРУГ ИГРАЕТСЯ НАЖАТИЯМИ, а не вызовом правил. Плюс отдельная проба РАСКЛАДКИ:
/// правила и рисунок проверяются РАЗНЫМИ пробами — между формулой и картинкой
/// стоит код поля, которого не видит ни сверка правил, ни сверка очков.
void main() {
  late SharedState state;

  Future<void> open(WidgetTester tester, {int level = 1, Size? screen}) async {
    if (screen != null) {
      tester.view.devicePixelRatio = 1.0;
      tester.view.physicalSize = screen;
      addTearDown(tester.view.reset);
    }
    SharedPreferences.setMockInitialValues({
      if (level != 1) '${SharedState.prefix}object_tracker_level_nzt48': '$level',
    });
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: ObjectTrackerScreen(state: state)));
    await tester.pump();
    await tester.pump();
  }

  String labelOf(WidgetTester tester, int i) {
    final s = tester.widget<Semantics>(
      find.descendant(of: find.byKey(Key('шарик$i')), matching: find.byType(Semantics)).first,
    );
    return s.properties.label ?? '';
  }

  testWidgets('🔴 круг проходится нажатиями: запомнил, посмотрел движение, отметил цели', (tester) async {
    // Та же раздача, что у экрана: одно зерно, один генератор.
    final round = generateObjectTrackerRound('object-tracker-1', 1);
    await open(tester);
    expect(find.text('Трекер объектов'), findsOneWidget);

    // Показ: цели отмечены рамкой и названы в подписи — проба читает то же, что человек.
    final marked = <int>[];
    for (var i = 0; i < round.objectCount; i += 1) {
      if (labelOf(tester, i).contains('цель')) marked.add(i);
    }
    expect(marked.length, round.targetCount, reason: 'отмечено ровно столько целей, сколько в круге');

    await tester.tap(find.byKey(const Key('поехали')));
    await tester.pump();
    // Движение идёт кадрами: прокручиваем круг целиком.
    for (var t = 0; t < round.durationMs + 200; t += 16) {
      await tester.pump(const Duration(milliseconds: 16));
      if (find.byKey(const Key('готово')).evaluate().isNotEmpty) break;
    }
    expect(find.byKey(const Key('готово')), findsOneWidget, reason: 'после движения просят отметить');

    // Во время выбора подсказок нет: ни одна подпись не выдаёт цель.
    for (var i = 0; i < round.objectCount; i += 1) {
      expect(labelOf(tester, i).contains('цель'), isFalse, reason: 'шарик $i не выдаёт себя подписью');
    }

    for (final id in round.targetIds) {
      final index = round.initialWorld.objects.indexWhere((o) => o.id == id);
      await tester.tap(find.byKey(Key('шарик$index')));
      await tester.pump();
      expect(labelOf(tester, index), contains('выбран'));
    }
    await tester.tap(find.byKey(const Key('готово')));
    await tester.pump();
    expect(find.text('Следующий уровень'), findsOneWidget, reason: 'все цели названы — уровень взят');
  });

  testWidgets('🔴 щадящий режим двигает мир нажатием, а не кадрами', (tester) async {
    final round = generateObjectTrackerRound('object-tracker-1', 1);
    await open(tester);
    await tester.tap(find.byKey(const Key('щадящий-значок')).evaluate().isEmpty
        ? find.bySemanticsLabel('Щадящий режим')
        : find.byKey(const Key('щадящий-значок')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('поехали')));
    await tester.pump();

    // Кадры не идут: сколько ни жди, фаза не меняется сама.
    await tester.pump(const Duration(seconds: 4));
    expect(find.byKey(const Key('шаг')), findsOneWidget, reason: 'мир ждёт нажатия');

    var steps = 0;
    while (find.byKey(const Key('шаг')).evaluate().isNotEmpty && steps < 40) {
      await tester.tap(find.byKey(const Key('шаг')));
      await tester.pump();
      steps += 1;
    }
    expect(find.byKey(const Key('готово')), findsOneWidget);
    expect(steps, (round.durationMs / 250).ceil(), reason: 'шаг щадящего режима — 250 мс');
  });

  testWidgets('🔴 лишний шарик уровень не берёт, а подпись показывает, где была цель', (tester) async {
    final round = generateObjectTrackerRound('object-tracker-1', 1);
    await open(tester);
    await tester.tap(find.byKey(const Key('поехали')));
    await tester.pump();
    for (var t = 0; t < round.durationMs + 200; t += 16) {
      await tester.pump(const Duration(milliseconds: 16));
      if (find.byKey(const Key('готово')).evaluate().isNotEmpty) break;
    }
    final wrong = round.initialWorld.objects.indexWhere((o) => !round.targetIds.contains(o.id));
    await tester.tap(find.byKey(Key('шарик$wrong')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('готово')));
    await tester.pump();
    expect(find.text('Ещё раз'), findsOneWidget, reason: 'ни одной цели — уровень не взят');
    final target = round.initialWorld.objects.indexWhere((o) => round.targetIds.contains(o.id));
    expect(labelOf(tester, target), contains('была целью'), reason: 'после круга показывают правду');
  });

  testWidgets('🔴 РАСКЛАДКА: поле квадратное, помещается и не режет шарики — 360×640 и 390×844', (tester) async {
    for (final screen in [const Size(360, 640), const Size(390, 844)]) {
      // Уровень 41 — самый плотный: 12 шариков, им же и проверяем зажим по краям.
      await open(tester, level: 41, screen: screen);
      final field = tester.getRect(find.byKey(const Key('поле')));
      final side = field.width;
      expect(side, field.height, reason: '$screen поле квадратное');
      expect(field.top >= 0 && field.bottom <= screen.height, isTrue,
          reason: '$screen поле целиком на экране: $field');
      expect(side > 0, isTrue, reason: '$screen сторона поля положительная');

      final round = generateObjectTrackerRound('object-tracker-41', 41);
      final diameter = side * round.objectRadius * 2 < 48 ? 48.0 : side * round.objectRadius * 2;
      for (var i = 0; i < round.objectCount; i += 1) {
        final ball = tester.getRect(find.byKey(Key('шарик$i')));
        expect(ball.width, closeTo(diameter, 0.01), reason: '$screen шарик $i того же размера, что считает раскладка');
        expect(ball.width >= 48, isTrue, reason: '$screen шарик $i не мельче 48 точек — иначе в него не попасть');
        expect(ball.left >= field.left - 0.01 && ball.right <= field.right + 0.01, isTrue,
            reason: '$screen шарик $i не вылезает вбок: $ball против $field');
        expect(ball.top >= field.top - 0.01 && ball.bottom <= field.bottom + 0.01, isTrue,
            reason: '$screen шарик $i не вылезает по высоте: $ball против $field');
      }
    }
  });
}
