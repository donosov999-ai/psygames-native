// «Найди другую» (MindLab kids/find.py): лестница, раздача и партия нажатиями.
//
// Раздачу проба повторяет тем же зерном, что отдаёт экрану: так она знает, где другая,
// и жмёт её, как человек. Время двигает pump — без runAsync.
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/kids_find/model.dart';
import 'package:psygames_flutter/games/kids_find/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/game_clock_fake.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));
  tearDown(() {
    LessonUsed.reset();
    SessionReport.sink = null;
  });

  group('лестница и раздача', () {
    test('🔴 оси по ступеням, соседние не повторяются, граница времени 3 с', () {
      String? prev;
      for (var level = 1; level <= 60; level++) {
        final lv = findLevelFor(level);
        expect(lv.signature, isNot(prev), reason: 'L$level повторяет L${level - 1}');
        prev = lv.signature;
        expect(lv.side, inInclusiveRange(3, 8));
        // «Пила» на L1–9 намеренна: новый признак начинается с малого поля. Поле растёт
        // ВНУТРИ тройки и после L10 — не убывает.
        if (level > 1 && (level > 10 || (level - 1) % 3 != 0)) {
          expect(lv.side, greaterThanOrEqualTo(findLevelFor(level - 1).side), reason: 'L$level: поле уменьшилось');
        }
        expect(lv.mixed, level >= 10, reason: 'L$level: разнородность');
        expect(lv.axis == FindAxis.conjunction, level >= 13 && level.isOdd, reason: 'L$level: сочетание');
        expect(lv.seconds == null, level < 16, reason: 'L$level: время');
        if (lv.seconds != null) expect(lv.seconds, greaterThanOrEqualTo(3));
      }
      expect([for (var l = 1; l <= 9; l++) findLevelFor(l).axis],
          [for (final a in [FindAxis.color, FindAxis.shape, FindAxis.size]) ...[a, a, a]]);
      expect(findLevelFor(30).seconds, 3);
    });

    test('🔴 раздача 40 ступеней × 50 зёрен: другая одна, помехи — нужного вида', () {
      for (var level = 1; level <= 40; level++) {
        final lv = findLevelFor(level);
        final rnd = Random(level * 13);
        for (var k = 0; k < 50; k++) {
          final b = FindBoard.deal(level, rnd);
          final where = 'L$level/$k';
          expect(b.items, hasLength(lv.side * lv.side), reason: where);
          expect(b.unique, isTrue, reason: '$where: другая не единственная');
          final t = b.items[b.target];
          final rest = [for (var i = 0; i < b.items.length; i++) if (i != b.target) b.items[i]];
          switch (lv.axis) {
            case FindAxis.color:
              expect(rest.map((m) => m.color).toSet(), hasLength(1), reason: '$where: помехи разного цвета');
              expect(rest.first.color, isNot(t.color), reason: where);
            case FindAxis.shape:
              expect(rest.map((m) => m.shape).toSet(), hasLength(1), reason: where);
              expect(rest.first.shape, isNot(t.shape), reason: where);
            case FindAxis.size:
              expect(rest.map((m) => m.size).toSet(), hasLength(1), reason: where);
              expect(rest.first.size, isNot(t.size), reason: where);
            case FindAxis.conjunction:
              final kinds = rest.map((m) => (m.color, m.shape)).toSet();
              expect(kinds, hasLength(2), reason: '$where: помех не два вида');
              expect(kinds.any((k) => k.$1 == t.color), isTrue, reason: '$where: цвет цели не у помех');
              expect(kinds.any((k) => k.$2 == t.shape), isTrue, reason: '$where: форма цели не у помех');
          }
          if (lv.mixed && lv.axis != FindAxis.conjunction && lv.side >= 5) {
            // Разнородность: помехи различаются хотя бы одним НЕдиагностическим признаком.
            final spread = {
              if (lv.axis != FindAxis.color) rest.map((m) => m.color).toSet().length,
              if (lv.axis != FindAxis.shape) rest.map((m) => m.shape).toSet().length,
              if (lv.axis != FindAxis.size) rest.map((m) => m.size).toSet().length,
            };
            expect(spread.any((n) => n > 1), isTrue, reason: '$where: помехи однородны');
          }
        }
      }
    });
  });

  group('экран', () {
    late List<Map<String, dynamic>> reports;

    Future<void> open(WidgetTester tester, {int level = 1, int seed = 5, Size? screen}) async {
      if (screen != null) {
        tester.view.devicePixelRatio = 1.0;
        tester.view.physicalSize = screen;
        addTearDown(tester.view.reset);
      }
      SharedPreferences.setMockInitialValues({
        if (level != 1) '${SharedState.prefix}kids_find_level_nzt48': '$level',
      });
      reports = [];
      SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
      final state = await SharedState.open();
      useFakeGameClock(tester);
      await tester.pumpWidget(MaterialApp(home: KidsFindScreen(key: UniqueKey(), state: state, seed: seed)));
      await tester.pump();
      await tester.pump();
    }

    Future<void> tapItem(WidgetTester tester, int i) async {
      await tester.tap(find.byKey(ValueKey('kf-item-$i')));
      await tester.pump();
    }

    testWidgets('🔴 пять досок нажатием на другую — ступень взята, партия записана с осями', (tester) async {
      await open(tester, level: 4, seed: 9);
      final rnd = Random(9);
      for (var k = 0; k < findBoards; k++) {
        final b = FindBoard.deal(4, rnd);
        await tapItem(tester, b.target);
        await tester.pump(const Duration(milliseconds: 500));
      }
      expect(find.byKey(const ValueKey('kf-next')), findsOneWidget, reason: 'ступень не закончилась');
      expect(find.textContaining(L.t('nextLabel')), findsOneWidget);
      final d = reports.single['details'] as Map<String, dynamic>;
      expect(reports.single['game_type'], 'kids_find');
      expect(d['axis'], 'shape');
      expect(d['side'], 3);
      expect(reports.single['errors'], 0);
    });

    testWidgets('🔴 промах не кончает доску: ошибка считается, другая ищется дальше; две — провал', (tester) async {
      await open(tester, level: 2, seed: 3);
      final rnd = Random(3);
      for (var k = 0; k < findBoards; k++) {
        final b = FindBoard.deal(2, rnd);
        if (k < 2) {
          final wrong = b.target == 0 ? 1 : 0;
          await tapItem(tester, wrong);
          await tester.pump(const Duration(milliseconds: 400));
          expect(find.byKey(const ValueKey('kf-next')), findsNothing, reason: 'доска кончилась на промахе');
        }
        await tapItem(tester, b.target);
        await tester.pump(const Duration(milliseconds: 500));
      }
      expect(find.textContaining(L.t('retry')), findsWidgets, reason: 'две ошибки — ступень взята');
      expect(reports.single['errors'], 2);
    });

    testWidgets('🔴 время доски (L16: 10 с): не успел — ошибка и следующая доска', (tester) async {
      await open(tester, level: 16, seed: 4);
      expect(find.text('10.0'), findsOneWidget, reason: 'на табло нет 10 секунд');
      await tester.pump(const Duration(milliseconds: 9800));
      expect(find.text('1/$findBoards'), findsOneWidget, reason: 'доска сменилась раньше 10 с');
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('2/$findBoards'), findsOneWidget, reason: 'по концу времени доска не сменилась');
      final errs = tester.widgetList<Text>(find.text('1'));
      expect(errs, isNotEmpty, reason: 'ошибка за просроченную доску не засчитана');
    });

    testWidgets('🔴 под разбором время доски стоит — часы партии, а не настенные (гейт game_clock)', (tester) async {
      // Разбор — страница ПОВЕРХ партии (LessonPlayerScreen держит часы). На настенных часах
      // доска L16 (10 с) истекала бы, пока человек читает разбор, — ровно то, что лечит
      // lib/shell/game_clock.dart (задача 430d1299).
      await open(tester, level: 16, seed: 4);
      await tester.pump(const Duration(milliseconds: 3000));
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 30));
      tester.state<NavigatorState>(find.byType(Navigator)).pop();
      await tester.pumpAndSettle();
      expect(find.text('1/$findBoards'), findsOneWidget, reason: 'доска истекла, пока шёл разбор');
      await tester.pump(const Duration(milliseconds: 7300));
      expect(find.text('2/$findBoards'), findsOneWidget, reason: 'после разбора остаток времени не дотёк');
    });

    testWidgets('разбор называет приём по оси доски', (tester) async {
      for (final (level, key) in [(1, 'teachFindPopout'), (5, 'teachFindOneTrait'), (13, 'teachFindConjunction')]) {
        await open(tester, level: level, seed: 2);
        await tester.tap(find.byKey(const Key('game-lesson')));
        await tester.pumpAndSettle();
        expect(find.textContaining(L.t(key).substring(0, 25)), findsWidgets, reason: 'L$level: не тот приём');
        expect(LessonUsed.inRound, isTrue);
        tester.state<NavigatorState>(find.byType(Navigator)).pop();
        await tester.pumpAndSettle();
      }
    });

    testWidgets('🔴 раскладка: поле 8×8 на 320×568 — доска в поле, клетка не мельче 32 точек', (tester) async {
      await open(tester, level: 22, seed: 1, screen: const Size(320, 568));
      expect(findLevelFor(22).side, 8);
      final field = tester.getRect(find.byKey(const Key('game-field')));
      final board = tester.getRect(find.byKey(const ValueKey('kf-board')));
      expect(board.top >= field.top - 0.5 && board.bottom <= field.bottom + 0.5, isTrue, reason: 'доска вне поля: $board');
      expect(board.left >= field.left - 0.5 && board.right <= field.right + 0.5, isTrue);
      final cell = tester.getRect(find.byKey(const ValueKey('kf-item-0')));
      expect(cell.width >= 32 && cell.height >= 32, isTrue, reason: 'клетка мельче пальца: $cell');
    });
  });
}
