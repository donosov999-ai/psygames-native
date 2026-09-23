import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/pattern/model.dart';
import 'package:psygames_flutter/games/pattern/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ ИГРАЕТСЯ НАЖАТИЯМИ. Что за ряд на экране, проба узнаёт из КЛЕТОК,
/// а не из состояния: читает подписи и сама решает, какую кнопку жать.
void main() {
  late SharedState state;
  var opens = 0;

  Future<void> open(WidgetTester tester, {int level = 1, Size? screen, String seed = 'проба'}) async {
    if (screen != null) {
      tester.view.devicePixelRatio = 1.0;
      tester.view.physicalSize = screen;
      addTearDown(tester.view.reset);
    }
    SharedPreferences.setMockInitialValues({
      if (level != 1) '${SharedState.prefix}pattern_level_nzt48': '$level',
    });
    state = await SharedState.open();
    // Ключ на каждое открытие: без него повторный pumpWidget переиспользует
    // старое состояние экрана (поймано на «Быстром счёте»).
    await tester.pumpWidget(MaterialApp(
      home: PatternScreen(key: ValueKey('открытие${opens += 1}'), state: state, rnd: createRng(seed)),
    ));
    await tester.pump();
    await tester.pump();
  }

  /// Числа ряда, прочитанные с экрана.
  List<String> rowOnScreen(WidgetTester tester) {
    final out = <String>[];
    for (var i = 0; i < 12; i += 1) {
      final f = find.byKey(Key('клетка$i'));
      if (f.evaluate().isEmpty) break;
      out.add(tester.widget<Text>(find.descendant(of: f, matching: find.byType(Text))).data ?? '');
    }
    return out;
  }

  testWidgets('🔴 партия из десяти проб играется нажатиями и берёт уровень', (tester) async {
    // Та же раздача, что у экрана: одно зерно, один генератор.
    final rng = createRng('партия');
    await open(tester, seed: 'партия');

    for (var i = 1; i <= trialsPerRound; i += 1) {
      expect(find.text('$i/$trialsPerRound'), findsOneWidget, reason: 'проба $i');
      final seq = makeSequence(1, rng);
      makeOptions(seq.answer, rng);   // тот же бросок, что у экрана
      expect(rowOnScreen(tester), seq.items.map(showNumber).toList(),
          reason: 'на экране тот ряд, что раздал генератор');
      expect(find.byKey(const Key('клетка-вопрос')), findsOneWidget);
      await tester.tap(find.byKey(Key('ответ${seq.answer}')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 800));
    }
    expect(find.text('Следующий уровень'), findsOneWidget, reason: 'десять из десяти — уровень взят');
    expect(find.textContaining('звёзд 3'), findsOneWidget, reason: 'без ошибок и без подсказки — три звезды');
  });

  testWidgets('🔴 верный ответ всегда среди кнопок, и кнопок ровно четыре', (tester) async {
    for (final level in [1, 9, 17, 25]) {
      final rng = createRng('кнопки$level');
      await open(tester, level: level, seed: 'кнопки$level');
      for (var i = 0; i < 3; i += 1) {
        final seq = makeSequence(level, rng);
        final opts = makeOptions(seq.answer, rng);
        for (final o in opts) {
          expect(find.byKey(Key('ответ$o')), findsOneWidget, reason: 'L$level кнопка $o на экране');
        }
        expect(opts.contains(seq.answer), isTrue, reason: 'L$level верный ответ среди кнопок');
        await tester.tap(find.byKey(Key('ответ${seq.answer}')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 800));
      }
    }
  });

  testWidgets('🔴 подсказка идёт двумя ступенями и опускает потолок звёзд', (tester) async {
    final rng = createRng('подсказка');
    await open(tester, seed: 'подсказка');
    final seq = makeSequence(1, rng);
    makeOptions(seq.answer, rng);

    expect(find.byKey(const Key('подсказка')), findsNothing);
    await tester.tap(find.bySemanticsLabel('Подсказка'));
    await tester.pump();
    expect(find.text(patternClassRu[seq.classKey]!), findsOneWidget, reason: 'первая ступень — класс ряда');

    await tester.tap(find.bySemanticsLabel('Ещё подсказка'));
    await tester.pump();
    expect(find.text(fillParams(patternRuleRu[seq.ruleKey]!, seq.ruleParams)), findsOneWidget,
        reason: 'вторая ступень — само правило');

    // Партия без ошибок, но с подсказкой: потолок две звезды.
    var s = seq;
    for (var i = 1; i <= trialsPerRound; i += 1) {
      await tester.tap(find.byKey(Key('ответ${s.answer}')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 800));
      if (i < trialsPerRound) {
        s = makeSequence(1, rng);
        makeOptions(s.answer, rng);
      }
    }
    expect(find.textContaining('звёзд 2'), findsOneWidget, reason: 'подсказка опускает потолок до двух');
  });

  testWidgets('🔴 четыре ошибки из десяти уровень не берут — порог 70%', (tester) async {
    final rng = createRng('порог');
    await open(tester, seed: 'порог');
    for (var i = 1; i <= trialsPerRound; i += 1) {
      final seq = makeSequence(1, rng);
      final opts = makeOptions(seq.answer, rng);
      final wrong = opts.firstWhere((o) => o != seq.answer);
      await tester.tap(find.byKey(Key('ответ${i <= 4 ? wrong : seq.answer}')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 800));
    }
    expect(find.text('Ещё раз'), findsOneWidget, reason: '60% — уровень не взят');
    expect(find.textContaining('нужно 70%'), findsOneWidget);
  });

  testWidgets('🔴 РАСКЛАДКА: ряд с «?» встаёт В ОДНУ строку на 360 и 390 — даже длинный', (tester) async {
    for (final screen in [const Size(360, 640), const Size(390, 844)]) {
      // L19 — шесть чисел в ряду, самый широкий случай обещанной лестницы.
      await open(tester, level: 19, screen: screen, seed: 'раскладка');
      final cells = <Rect>[];
      for (var i = 0; i < 12; i += 1) {
        final f = find.byKey(Key('клетка$i'));
        if (f.evaluate().isEmpty) break;
        cells.add(tester.getRect(f));
      }
      cells.add(tester.getRect(find.byKey(const Key('клетка-вопрос'))));
      expect(cells.length >= 5, isTrue, reason: '$screen: в ряду ${cells.length} клеток');
      final top = cells.first.top;
      for (var i = 0; i < cells.length; i += 1) {
        expect(cells[i].top, closeTo(top, 0.5),
            reason: '$screen: клетка $i уехала на вторую строку (${cells[i]})');
        expect(cells[i].height >= 48, isTrue, reason: '$screen: клетка $i ниже 48 точек');
        expect(cells[i].left >= 0 && cells[i].right <= screen.width, isTrue,
            reason: '$screen: клетка $i вышла за экран (${cells[i]})');
      }
    }
  });
}
