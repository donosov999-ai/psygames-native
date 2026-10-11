import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/goods_sort/board.dart';
import 'package:psygames_flutter/games/goods_sort/model.dart';
import 'package:psygames_flutter/games/goods_sort/screen.dart';
import 'package:psygames_flutter/games/goods_sort/solver.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> boot(WidgetTester tester, SharedState state) async {
  tester.view.physicalSize = const Size(780, 1688);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: GoodsSortScreen(state: state)));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 10));
      if (find.byType(GoodsField).evaluate().isNotEmpty) break;
    }
  });
  await tester.pumpAndSettle();
  if (find.text(L.t('ctaGotIt')).evaluate().isNotEmpty) {
    await tester.tap(find.text(L.t('ctaGotIt')));
    await tester.pumpAndSettle();
  }
  expect(find.byType(GoodsField), findsOneWidget);
}

Future<void> tapMove(WidgetTester tester, String item, int to) async {
  await tester.tap(find.byKey(ValueKey(item)));
  await tester.pump();
  await tester.tap(find.byKey(ValueKey('niche-$to')));
  await tester.pump();
}

// Real exported L16: shuttle type21 between niches0 and1. No clears, no
// invented failure flag: the model's actual 26-move limit ends the game.
Future<void> exhaust(WidgetTester tester) async {
  final field = tester.widget<GoodsField>(find.byType(GoodsField));
  expect(field.level.level, 16);
  expect(field.level.moveLimit, 26);
  for (var i = 0; i < 13; i++) {
    await tapMove(tester, 'item-0-2', 1);
    await tapMove(tester, 'item-1-0', 0);
  }
  await tester.pump();
  expect(find.text(L.t('outOfMovesRetry')), findsOneWidget);
}

void main() {
  setUpAll(() async => L.load('ru'));
  setUp(() {
    SharedPreferences.setMockInitialValues({
      'psygames_goods_sort_level_nzt48': '16',
      'psygames_goods_sort_best_nzt48': '16',
      'psygames_goods_sort_set_nzt48': 'mix',
    });
    GamePreset.clear();
  });
  tearDown(() {
    SessionReport.sink = null;
    LevelLadder.onOutcome = null;
    GamePreset.clear();
  });

  for (final launch in ['ordinary', 'wu', 'transit']) {
    testWidgets('$launch: actual loss reports once, Undo does not recredit, retry is a new attempt', (tester) async {
      if (launch == 'wu') GamePreset.set({'wu': '1', 'mode': 'mix'});
      if (launch == 'transit') {
        GamePreset.set({'ladderGame': 'sudoku', 'ladderLevel': '77', 'lvl': '16'});
      }
      final state = await SharedState.open();
      final reports = <Map<String, dynamic>>[];
      final outcomes = <bool>[];
      SessionReport.sink = (body) async => reports.add(jsonDecode(body) as Map<String, dynamic>);
      LevelLadder.onOutcome = (passed, lesson) {
        expect(lesson, isFalse);
        outcomes.add(passed);
      };
      await boot(tester, state);
      await exhaust(tester);
      expect(reports, hasLength(1), reason: 'loss must reach statistics and the warm-up listener');
      expect(outcomes, [false], reason: 'transit must receive a terminal outcome');
      expect(reports.single['game_type'], 'goods_sort');
      expect(state.get('psygames_goods_sort_level_nzt48'), '16');
      if (launch == 'transit') {
        expect(reports.single['details']['ladderGame'], 'sudoku');
      }
      if (launch == 'wu') expect(reports.single['mode'], 'mix');
      final failBefore = state.get('psygames_goods_sort_failStreak_nzt48');

      await tester.tap(find.bySemanticsLabel(L.t('btn_undo')).first);
      await tester.pump();
      expect(find.text(L.t('outOfMovesRetry')), findsNothing);
      expect(find.text(L.t('puzzleLossReview')), findsOneWidget,
          reason: 'Undo of a recorded loss is explicitly labelled as review');
      await tapMove(tester, 'item-1-0', 0);
      expect(find.text(L.t('outOfMovesRetry')), findsOneWidget);
      expect(reports, hasLength(1));
      expect(outcomes, [false]);
      expect(state.get('psygames_goods_sort_failStreak_nzt48'), failBefore);

      await tester.tap(find.text(L.t('outOfMovesRetry')));
      await tester.pump();
      await exhaust(tester);
      expect(reports, hasLength(2), reason: 'explicit retry begins a new attempt');
      expect(outcomes, [false, false]);
      expect(state.get('psygames_goods_sort_level_nzt48'), '16');
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  for (final run in [
    (timer: false, restart: false),
    (timer: true, restart: false),
    (timer: false, restart: true),
  ]) {
    testWidgets('win: ${run.timer ? 'timer' : 'manual'} first, restart=${run.restart}, delayed save stays in its deal', (tester) async {
      final state = await SharedState.open();
      await state.set('psygames_goods_sort_level_nzt48', '1');
      final gate = Completer<void>();
      final reports = <Map<String, dynamic>>[];
      final outcomes = <bool>[];
      SessionReport.sink = (body) async {
        reports.add(jsonDecode(body) as Map<String, dynamic>);
        await gate.future;
      };
      LevelLadder.onOutcome = (passed, lesson) => outcomes.add(passed);
      await boot(tester, state);
      final initial = tester.widget<GoodsField>(find.byType(GoodsField));
      final solution = solveStrict(GoodsPlay.start(initial.level));
      expect(solution.solvable, isTrue);
      for (final move in solution.path) {
        final field = tester.widget<GoodsField>(find.byType(GoodsField));
        await tapMove(tester, 'item-${move.from}-${field.board.cells[move.from].length - 1}', move.to);
      }
      final next = find.widgetWithIcon(FilledButton, Icons.arrow_forward);
      expect(next, findsOneWidget);
      if (run.timer) await tester.pump(const Duration(milliseconds: 1400));
      await tester.tap(next);
      await tester.pump();
      await tester.tap(next, warnIfMissed: false);
      await tester.pump(const Duration(milliseconds: 1400));
      expect(reports, hasLength(1));
      expect(outcomes, isEmpty, reason: 'outcome waits for the existing save contract');
      expect(state.get('psygames_goods_sort_level_nzt48'), '2');
      if (run.restart) {
        await tester.tap(find.bySemanticsLabel(L.t('restart')).first);
        await tester.pump();
        expect(tester.widget<GoodsField>(find.byType(GoodsField)).level.level, 1);
      }
      gate.complete();
      await tester.pumpAndSettle();
      expect(reports, hasLength(1));
      expect(outcomes, [true]);
      expect(tester.widget<GoodsField>(find.byType(GoodsField)).level.level, run.restart ? 1 : 2,
          reason: 'late Next must not replace the explicit restart');
      expect(next, findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
}
