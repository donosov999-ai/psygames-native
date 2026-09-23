import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/math_sprint/model.dart';
import 'package:psygames_flutter/games/math_sprint/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ ИГРАЕТСЯ НАЖАТИЯМИ ПО КЛАВИШАМ. Что за задача на экране, проба читает
/// с экрана — и набирает ответ цифрами, как человек.
void main() {
  late SharedState state;
  var opens = 0;

  Future<void> open(WidgetTester tester,
      {int level = 1, Size? screen, String seed = 'проба', int seconds = sprintSeconds}) async {
    if (screen != null) {
      tester.view.devicePixelRatio = 1.0;
      tester.view.physicalSize = screen;
      addTearDown(tester.view.reset);
    }
    SharedPreferences.setMockInitialValues({
      if (level != 1) '${SharedState.prefix}math_sprint_level_nzt48': '$level',
    });
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      home: MathSprintScreen(
        key: ValueKey('открытие${opens += 1}'),
        state: state,
        rnd: createRng(seed),
        seconds: seconds,
      ),
    ));
    await tester.pump();
    await tester.pump();
  }

  String taskOnScreen(WidgetTester tester) =>
      tester.widget<Text>(find.byKey(const Key('задача'))).data ?? '';

  /// Набирает число клавишами — ровно так, как человек.
  Future<void> type(WidgetTester tester, int value) async {
    if (value < 0) {
      await tester.tap(find.byKey(const Key('клавиша−')));
      await tester.pump();
    }
    for (final ch in value.abs().toString().split('')) {
      await tester.tap(find.byKey(Key('клавиша$ch')));
      await tester.pump();
    }
  }

  testWidgets('🔴 партия играется клавишами: двенадцать верных берут уровень', (tester) async {
    // Та же раздача, что у экрана: одно зерно, один генератор.
    final rnd = createRng('партия');
    await open(tester, seed: 'партия');
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();

    for (var i = 0; i < sprintCorrectToPass; i += 1) {
      final p = generateSprintProblem(1, rnd);
      expect(taskOnScreen(tester), p.display, reason: 'задача ${i + 1} — та, что раздал генератор');
      await type(tester, p.answer);   // верный ответ засчитывается САМ
      expect(find.text('${i + 1}/$sprintCorrectToPass'), findsOneWidget,
          reason: 'после ${i + 1}-го верного счётчик вырос без нажатия «Проверить»');
    }
    // Время вышло — партия закрывается сама.
    await tester.pump(const Duration(seconds: 61));
    expect(find.text('Следующий уровень'), findsOneWidget, reason: 'двенадцать верных — уровень взят');
  });

  testWidgets('🔴 неверный ответ сдаётся кнопкой: ошибка, серия обнуляется, очки падают', (tester) async {
    final rnd = createRng('ошибка');
    await open(tester, seed: 'ошибка');
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();

    // Три верных подряд — серия видна в счётчиках.
    for (var i = 0; i < 3; i += 1) {
      final p = generateSprintProblem(1, rnd);
      await type(tester, p.answer);
    }
    expect(find.text('3'), findsWidgets, reason: 'серия из трёх показана');
    final scoreAfterThree = 12 + 14 + 16;   // 10 + серия×2
    expect(find.text('$scoreAfterThree'), findsOneWidget, reason: 'очки считаются по серии');

    final p = generateSprintProblem(1, rnd);
    final wrong = p.answer + 1;
    await type(tester, wrong);
    await tester.tap(find.byKey(const Key('проверить')));
    await tester.pump();
    expect(find.text('${scoreAfterThree - sprintPenalty}'), findsOneWidget, reason: 'штраф пять очков');
    expect(find.text('1'), findsWidgets, reason: 'ошибка засчитана');
  });

  testWidgets('🔴 время кончается само и уровень не берётся без двенадцати верных', (tester) async {
    await open(tester, seed: 'время', seconds: 5);
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();
    expect(find.text('5 с'), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
    expect(find.text('2 с'), findsOneWidget, reason: 'часы идут');
    await tester.pump(const Duration(seconds: 3));
    expect(find.text('Ещё раз'), findsOneWidget, reason: 'верных мало — уровень не взят');
    expect(find.textContaining('нужно $sprintCorrectToPass'), findsOneWidget);
  });

  testWidgets('🔴 РАСКЛАДКА: клавиши не мельче пальца и три в ряд — 360×640 и 390×844', (tester) async {
    for (final screen in [const Size(360, 640), const Size(390, 844)]) {
      await open(tester, screen: screen, seed: 'раскладка');
      await tester.tap(find.byKey(const Key('начать')));
      await tester.pump();

      final want = keypadFor(screen.width, screen.height);
      final rects = <Rect>[];
      for (final k in ['1', '2', '3', '4', '5', '6', '7', '8', '9', '−', '0', '⌫']) {
        final r = tester.getRect(find.byKey(Key('клавиша$k')));
        rects.add(r);
        expect(r.width, closeTo(want.keyW, 0.01), reason: '$screen клавиша $k шириной как в правиле');
        expect(r.height, closeTo(want.keyH, 0.01), reason: '$screen клавиша $k высотой как в правиле');
        expect(r.width >= fingerSize && r.height >= fingerSize, isTrue,
            reason: '$screen клавиша $k мельче пальца: ${r.width}×${r.height}');
        expect(r.left >= 0 && r.right <= screen.width, isTrue, reason: '$screen клавиша $k за экраном: $r');
      }
      // Три клавиши в ряд: у первых трёх один верх, а четвёртая — уже ниже.
      expect(rects[1].top, closeTo(rects[0].top, 0.5), reason: '$screen: вторая клавиша в том же ряду');
      expect(rects[2].top, closeTo(rects[0].top, 0.5), reason: '$screen: третья клавиша в том же ряду');
      expect(rects[3].top > rects[0].top, isTrue, reason: '$screen: четвёртая клавиша ушла на второй ряд');
      expect(find.byKey(const Key('проверить')), findsOneWidget);
    }
  });
}
