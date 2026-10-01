import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/animal_queue/model.dart';
import 'package:psygames_flutter/games/animal_queue/screen.dart';
import 'package:psygames_flutter/games/kids_sort/model.dart';
import 'package:psygames_flutter/games/kids_sort/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ЭКРАНЫ MINDLAB ИГРАЮТСЯ ПАЛЬЦЕМ ДО КОНЦА ПАРТИИ, А НЕ ТОЛЬКО РИСУЮТСЯ.
///
/// Раздачу проба повторяет тем же зерном, что отдаёт экрану: так она знает ответ
/// и проходит партию нажатиями, как человек. Проверяется то, что модельные пробы
/// не видят: нажатие доходит до модели, отказ не ставит зверя, в конце есть кнопка
/// следующей ступени, а ступень после неё действительно крупнее.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));
  tearDown(LessonUsed.reset);

  Future<SharedState> freshState() async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'kids'});
    return SharedState.open();
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  /// Та же раздача, что у экрана: первая удачная попытка того же генератора.
  List<int> queueOrder(int seed, int level) {
    final rnd = Random(seed);
    ({AnimalQueue game, List<int> order})? g;
    for (var i = 0; i < 20 && g == null; i += 1) {
      g = generateQueue(queueSizeFor(level), rnd);
    }
    return g!.order;
  }

  testWidgets('«Очередь зверей»: отказ не ставит зверя, верный порядок ведёт на ступень выше',
      (tester) async {
    final state = await freshState();
    await tester.pumpWidget(MaterialApp(home: AnimalQueueScreen(state: state, seed: 7)));
    await settle(tester);

    final order = queueOrder(7, 1);
    expect(order.length, 3, reason: 'первая ступень — три зверя');
    for (var i = 0; i < 3; i += 1) {
      expect(find.byKey(ValueKey('aq-animal-$i')), findsOneWidget);
    }

    // Последний по ответу зверь первым встать не может.
    await tester.tap(find.byKey(ValueKey('aq-animal-${order.last}')));
    await tester.pump();
    expect(find.byKey(ValueKey('aq-animal-${order.last}')), findsOneWidget,
        reason: 'зверь, перед которым по подсказкам ещё кто-то, встал в очередь');
    await tester.pump(const Duration(milliseconds: 500));

    for (final a in order) {
      await tester.tap(find.byKey(ValueKey('aq-animal-$a')));
      await tester.pump();
    }
    expect(find.byKey(const ValueKey('aq-next')), findsOneWidget, reason: 'партия собрана, а кнопки дальше нет');
    expect(find.textContaining('★★'), findsOneWidget, reason: 'одна ошибка — две звезды');

    await tester.tap(find.byKey(const ValueKey('aq-next')));
    await settle(tester);
    expect(find.byKey(const ValueKey('aq-animal-3')), findsOneWidget, reason: 'вторая ступень — четыре зверя');
  });

  testWidgets('«Очередь зверей»: разбор открывается и называет приём', (tester) async {
    final state = await freshState();
    await tester.pumpWidget(MaterialApp(home: AnimalQueueScreen(state: state, seed: 3)));
    await settle(tester);
    await tester.tap(find.byKey(const Key('game-lesson')));
    await settle(tester);
    expect(find.byKey(const Key('lesson-counter')), findsOneWidget, reason: 'плеер не открылся');
    expect(find.textContaining('Шаг 1 из 3'), findsOneWidget);
    expect(find.textContaining(L.t('teachQueueFirst')), findsOneWidget, reason: 'шаг без имени приёма — показ ответа');
    expect(LessonUsed.inRound, isTrue);
  });

  List<KidsCard> kidsCards(int seed, int level, int phase) {
    final s = KidsSortSession(Random(seed), nCards: kidsCardsFor(level));
    return (phase == 1 ? s.phase1 : s.phase2).cards;
  }

  int byColor(KidsCard c) => kidsTargets.indexWhere((t) => t.color == c.color);
  int byShape(KidsCard c) => kidsTargets.indexWhere((t) => t.shape == c.shape);

  testWidgets('«Цвета и формы»: верная серия по обоим правилам — без ошибок и с кнопкой дальше',
      (tester) async {
    final state = await freshState();
    await tester.pumpWidget(MaterialApp(home: KidsSortScreen(state: state, seed: 11)));
    await settle(tester);

    for (final c in kidsCards(11, 1, 1)) {
      await tester.tap(find.byKey(ValueKey('ks-box-${byColor(c)}')));
      await tester.pump();
      expect(find.byKey(const ValueKey('ks-feedback-ok')), findsOneWidget);
    }
    for (final c in kidsCards(11, 1, 2)) {
      await tester.tap(find.byKey(ValueKey('ks-box-${byShape(c)}')));
      await tester.pump();
    }
    expect(find.byKey(const ValueKey('ks-next')), findsOneWidget);
    expect(find.text('${L.t('errors')}: 0 · ${L.t('kidsSortPersev')}: 0'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 700));
  });

  testWidgets('«Цвета и формы»: ответы по цвету после смены считаются персеверациями', (tester) async {
    final state = await freshState();
    await tester.pumpWidget(MaterialApp(home: KidsSortScreen(state: state, seed: 11)));
    await settle(tester);

    for (final c in kidsCards(11, 1, 1)) {
      await tester.tap(find.byKey(ValueKey('ks-box-${byColor(c)}')));
      await tester.pump();
    }
    final phase2 = kidsCards(11, 1, 2);
    // Карточка-конфликт: цвет ведёт в одну коробку, форма — в другую.
    final conflicts = phase2.where((c) => byColor(c) != byShape(c)).length;
    expect(conflicts, greaterThan(0), reason: 'на этом зерне нечему показать персеверацию — смени зерно');
    for (final c in phase2) {
      await tester.tap(find.byKey(ValueKey('ks-box-${byColor(c)}')));
      await tester.pump();
    }
    expect(find.text('${L.t('errors')}: $conflicts · ${L.t('kidsSortPersev')}: $conflicts'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 700));
  });

  testWidgets('«Цвета и формы»: разбор — три шага словами', (tester) async {
    final state = await freshState();
    await tester.pumpWidget(MaterialApp(home: KidsSortScreen(state: state, seed: 1)));
    await settle(tester);
    await tester.tap(find.byKey(const Key('game-lesson')));
    await settle(tester);
    expect(find.textContaining('Шаг 1 из 3'), findsOneWidget);
    expect(find.textContaining(L.t('teachKidsSortRule')), findsOneWidget);
    expect(LessonUsed.inRound, isTrue);
  });
}
