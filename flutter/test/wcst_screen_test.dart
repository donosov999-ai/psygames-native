import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/wcst/model.dart';
import 'package:psygames_flutter/games/wcst/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В WCST ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// 🔴 Проба НЕ знает текущего правила — как и человек. Она выводит его так же,
/// как человек: пробует, смотрит на отклик и держится за правило, пока оно
/// работает.
///
/// Где лежит уровень игры после переезда: тот же ключ, что у веб-версии.
const String _levelKey = 'psygames_wcst_level_nzt48';

void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  /// Карта на столе, прочитанная С ЭКРАНА: цвет, форма и число фигур.
  /// ⚠️ Правило при этом НЕ читается: оно нигде на экране не названо.
  WcstCard targetOnScreen(WidgetTester tester) {
    final glyphs = <String>[];
    final finder = find.byWidgetPredicate((w) =>
        w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('wcst-target-glyph-'));
    for (final e in finder.evaluate()) {
      glyphs.add((e.widget.key! as ValueKey<String>).value);
    }
    expect(glyphs, isNotEmpty, reason: 'карты на столе нет');
    final parts = glyphs.first.split('-');
    final shape = CardShape.values.firstWhere((s) => s.name == parts[3]);
    final color = CardColor.values.firstWhere((c) => c.name == parts[4]);
    return WcstCard(color: color, shape: shape, count: glyphs.length);
  }

  bool hitShown(WidgetTester tester, int idx) {
    final c = tester.widget<Container>(find.byKey(Key('wcst-ref-$idx')));
    final b = (c.decoration! as BoxDecoration).border! as Border;
    return b.top.color == const Color(0xFF22C55E);
  }

  testWidgets('🔴 карта на столе читается с экрана и сортируется по ПРАВИЛУ', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: WcstScreen(key: const ValueKey('play'), state: state, rnd: Random(4))));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('wcst-params')), findsOneWidget);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // Проба выводит правило так же, как человек: пробует и держится за то,
    // что работает. Правило с экрана НЕ читается.
    var guess = SortRule.color;
    var hits = 0, misses = 0;
    final trials = WcstLevel.of(1).trials;
    for (var i = 1; i <= trials; i++) {
      final card = targetOnScreen(tester);
      final idx = [0, 1, 2, 3].firstWhere((k) => matchByRule(card, wcstRefCards[k], guess),
          orElse: () => 0);
      await tester.tap(find.byKey(Key('wcst-ref-$idx')));
      await tester.pump();
      if (hitShown(tester, idx)) {
        hits++;
      } else {
        misses++;
        // Не сработало — пробуем следующее правило.
        guess = SortRule.values[(SortRule.values.indexOf(guess) + 1) % 3];
      }
      await tester.pump(const Duration(milliseconds: wcstFeedbackMs + 50));
    }
    await tester.pumpAndSettle(
        const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 5));
    expect(hits + misses, trials);
    expect(hits, greaterThan(0), reason: 'ни одного верного за партию');
    expect(find.byKey(const Key('wcst-verdict')), findsOneWidget);
  });

  testWidgets('🔴 правило меняется МОЛЧА: подсказка приходит только ПОСЛЕ ошибки', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: WcstScreen(key: const ValueKey('silent'), state: state, rnd: Random(7))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // Играем БЕЗУПРЕЧНО по правилу «цвет»: рано или поздно правило сменится, и
    // тот же ход станет ошибкой — вот тогда и появится подсказка.
    var sawNote = false;
    for (var i = 1; i <= WcstLevel.of(1).trials && !sawNote; i++) {
      final card = targetOnScreen(tester);
      // ⚠️ До ответа подсказки быть НЕ ДОЛЖНО ни на одной пробе: это и значит
      // «правило меняется молча».
      expect(find.byKey(const Key('wcst-shift-note')), findsNothing,
          reason: 'проба $i: подсказка показана ДО ответа');
      final idx = [0, 1, 2, 3].firstWhere((k) => matchByRule(card, wcstRefCards[k], SortRule.color));
      await tester.tap(find.byKey(Key('wcst-ref-$idx')));
      await tester.pump();
      if (!hitShown(tester, idx) && find.byKey(const Key('wcst-shift-note')).evaluate().isNotEmpty) {
        sawNote = true;
      }
      await tester.pump(const Duration(milliseconds: wcstFeedbackMs + 50));
    }
    expect(sawNote, isTrue, reason: 'правило не сменилось либо подсказка не пришла');
  });

  testWidgets('🔴 партия из случайных тапов уровень НЕ берёт', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: WcstScreen(key: const ValueKey('rnd'), state: state, rnd: Random(2))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // Всегда первый эталон: точность заведомо ниже порога 55 %.
    for (var i = 1; i <= WcstLevel.of(1).trials; i++) {
      await tester.tap(find.byKey(const Key('wcst-ref-0')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: wcstFeedbackMs + 50));
    }
    await tester.pumpAndSettle(
        const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 5));
    expect(find.text(L.t('sameLevelRetry')), findsOneWidget, reason: 'случайные тапы засчитаны');
    expect(state.get(_levelKey) ?? '1', '1', reason: 'лестница шагнула на случайных тапах');
  });

  testWidgets('🔴 в классике серия 10 и лестница не двигается', (tester) async {
    SharedPreferences.setMockInitialValues({_levelKey: '5'});
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
        home: WcstScreen(key: const ValueKey('cl'), state: state, classic: true, rnd: Random(3))));
    await tester.pumpAndSettle();
    // Параметры классики: серия 10, а не серия уровня.
    final params = (find.byKey(const Key('wcst-params')).evaluate().first.widget as Text).data!;
    expect(params.contains('10'), isTrue, reason: 'серия классики не названа: $params');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // ⚠️ Играем ХОРОШО: партия, которая в уровневом режиме подняла бы ступень.
    var guess = SortRule.color;
    for (var i = 1; i <= WcstLevel.of(5).trials; i++) {
      final card = targetOnScreen(tester);
      final idx = [0, 1, 2, 3].firstWhere((k) => matchByRule(card, wcstRefCards[k], guess), orElse: () => 0);
      await tester.tap(find.byKey(Key('wcst-ref-$idx')));
      await tester.pump();
      if (!hitShown(tester, idx)) {
        guess = SortRule.values[(SortRule.values.indexOf(guess) + 1) % 3];
      }
      await tester.pump(const Duration(milliseconds: wcstFeedbackMs + 50));
    }
    await tester.pumpAndSettle(
        const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 5));
    expect(find.byKey(const Key('wcst-verdict')), findsOneWidget);
    expect(state.get(_levelKey), '5', reason: 'классика подвинула лестницу');
  });
}
