import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/posner/model.dart';
import 'package:psygames_flutter/games/posner/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В «ПОЗИЦИЮ» ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// 🔴 Проба читает с экрана, в какой рамке появилась МИШЕНЬ, и жмёт ту сторону.
/// Подсказка при этом может показывать в другую — если экран начнёт принимать
/// ответ «по подсказке», партия покраснеет на обманных пробах.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  PosnerSide? targetOnScreen() {
    for (final s in PosnerSide.values) {
      if (find.byKey(Key('posner-target-${s.name}')).evaluate().isNotEmpty) return s;
    }
    return null;
  }

  /// Ждём событие на экране: паузы (до подсказки и SOA) случайные.
  Future<void> waitTarget(WidgetTester tester) async {
    for (var i = 0; i < 80; i++) {
      if (targetOnScreen() != null) return;
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  Future<bool> waitFlash(WidgetTester tester, String key) async {
    for (var i = 0; i < 120; i++) {
      if (find.byKey(Key(key)).evaluate().isNotEmpty) return true;
      await tester.pump(const Duration(milliseconds: 50));
    }
    return false;
  }

  testWidgets('🔴 партия проходится нажатиями ПО МИШЕНИ, а не по подсказке', (tester) async {
    var clock = 0;
    await tester.pumpWidget(MaterialApp(
      home: PosnerScreen(state: state, clock: () => clock, rnd: Random(7)),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    expect(targetOnScreen(), isNull, reason: 'мишень обязана появиться ПОСЛЕ подсказки и паузы');

    for (var i = 0; i < 24; i++) {
      await waitTarget(tester);
      final side = targetOnScreen();
      expect(side, isNotNull, reason: 'проба ${i + 1}: мишени нет');
      clock += 420;
      await tester.tap(find.byKey(Key('posner-answer-${side!.name}')));
      await tester.pump();
      expect(find.byKey(const Key('posner-hit')), findsOneWidget, reason: 'проба ${i + 1}: не засчитано');
      await tester.pump(const Duration(milliseconds: 400));
    }
    for (var i = 0; i < 80; i++) {
      if (find.textContaining(L.t('meanReaction')).evaluate().isNotEmpty) break;
      await tester.pump(const Duration(milliseconds: 50));
    }

    expect(find.textContaining(L.t('levelDone').split('{').first.trim()), findsOneWidget,
        reason: '24 верных из 24 — это проход');
    expect(find.textContaining('${L.t('meanReaction')}: 420 ${L.t('msShort')}'), findsOneWidget,
        reason: 'отсчёт обязан идти от показа мишени');
    // Все пробы шли поровну, поэтому разность половин — ноль, а не прочерк:
    // при случайности с семенем в 24 пробах встречаются и валидные, и обманные.
    expect(find.textContaining('${L.t('hud_cueGain')}: 0 ${L.t('msShort')}'), findsOneWidget);
  });

  testWidgets('🔴 ответ в сторону ПОДСКАЗКИ на обманной пробе — ошибка', (tester) async {
    await tester.pumpWidget(MaterialApp(home: PosnerScreen(state: state, rnd: Random(4))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    for (var i = 0; i < 24; i++) {
      await waitTarget(tester);
      final side = targetOnScreen()!;
      final other = side == PosnerSide.left ? PosnerSide.right : PosnerSide.left;
      // Жмём НЕ туда, где мишень: ровно то, что делает человек, доверившийся обману.
      if (i == 0) {
        await tester.tap(find.byKey(Key('posner-answer-${other.name}')));
        await tester.pump();
        expect(await waitFlash(tester, 'posner-wrong'), isTrue);
        return;
      }
    }
    fail('мишень ни разу не появилась — проверять было нечего');
  });

  testWidgets('🔴 молчание всю партию: пропуски считаются, уровень не засчитан', (tester) async {
    await tester.pumpWidget(MaterialApp(home: PosnerScreen(state: state, rnd: Random(11))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    for (var i = 0; i < 24; i++) {
      await waitTarget(tester);
      await tester.pump(const Duration(milliseconds: 2300));
      await tester.pump(const Duration(milliseconds: 400));
    }
    for (var i = 0; i < 80; i++) {
      if (find.textContaining(L.t('meanReaction')).evaluate().isNotEmpty) break;
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(find.text(L.t('sameLevelRetry')), findsOneWidget);
    expect(find.textContaining('${L.t('hud_correct')}: 0/24'), findsOneWidget);
    expect(find.textContaining('${L.t('meanReaction')}: —'), findsOneWidget);
  });
}
