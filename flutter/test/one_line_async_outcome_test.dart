import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/one_line/board.dart';
import 'package:psygames_flutter/games/one_line/model.dart';
import 'package:psygames_flutter/games/one_line/screen.dart';
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
    await tester.pumpWidget(MaterialApp(home: OneLineScreen(state: state)));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 10));
      if (find.byType(OneLineBoard).evaluate().isNotEmpty) break;
    }
  });
  await tester.pumpAndSettle();
  if (find.text(L.t('ctaGotIt')).evaluate().isNotEmpty) {
    await tester.tap(find.text(L.t('ctaGotIt')));
    await tester.pumpAndSettle();
  }
}

Future<void> solve(WidgetTester tester) async {
  final board = tester.widget<OneLineBoard>(find.byType(OneLineBoard));
  final rect = tester.getRect(find.byType(OneLineBoard));
  final side = math.min(rect.height, rect.width) - 40;
  final origin =
      rect.topLeft + Offset((rect.width - side) / 2, (rect.height - side) / 2);
  for (final id in board.level.solutionVertexIds) {
    final v = board.level.vertexById(id);
    await tester.tapAt(origin + Offset(v.x * side, v.y * side));
    await tester.pump();
  }
  expect(find.text(L.t('nextLabel')), findsOneWidget);
}

void main() {
  setUpAll(() async => L.load('ru'));
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    GamePreset.clear();
  });
  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
    LevelLadder.onOutcome = null;
  });
  testWidgets(
    'Undo before Next removes the completed outcome until the board is solved again',
    (tester) async {
      final state = await SharedState.open();
      final reports = <String>[];
      SessionReport.sink = (body) async => reports.add(body);
      await boot(tester, state);
      await solve(tester);
      await tester.tap(find.bySemanticsLabel(L.t('btn_undo')).first);
      await tester.pump();
      expect(
        tester.widget<OneLineBoard>(find.byType(OneLineBoard)).game.isWon,
        isFalse,
      );
      expect(
        find.text(L.t('nextLabel')),
        findsNothing,
        reason: 'an undone solution is not a completed board',
      );
      expect(reports, isEmpty);
      final board = tester.widget<OneLineBoard>(find.byType(OneLineBoard));
      final rect = tester.getRect(find.byType(OneLineBoard));
      final side = math.min(rect.height, rect.width) - 40;
      final v = board.level.vertexById(board.level.solutionVertexIds.last);
      await tester.tapAt(
        rect.topLeft +
            Offset(
              (rect.width - side) / 2 + v.x * side,
              (rect.height - side) / 2 + v.y * side,
            ),
      );
      await tester.pump();
      await tester.tap(find.widgetWithIcon(FilledButton, Icons.arrow_forward));
      await tester.pumpAndSettle();
      expect(reports, hasLength(1));
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'pending Next may finish after unmount without touching a disposed screen',
    (tester) async {
      final state = await SharedState.open();
      final gate = Completer<void>();
      final reports = <String>[];
      SessionReport.sink = (body) async {
        reports.add(body);
        await gate.future;
      };
      await boot(tester, state);
      await solve(tester);
      await tester.tap(find.widgetWithIcon(FilledButton, Icons.arrow_forward));
      await tester.pump();
      await tester.pumpWidget(const SizedBox.shrink());
      gate.complete();
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(reports, hasLength(1));
    },
  );
  for (final mode in ['ordinary', 'wu', 'transit']) {
    for (final restart in [false, true]) {
      testWidgets(
        '$mode double Next, pending restart=$restart: exactly one result per board',
        (tester) async {
          if (mode == 'wu') GamePreset.set({'wu': '1', 'level': '1'});
          if (mode == 'transit') {
            GamePreset.set({
              'ladderGame': 'sudoku',
              'ladderLevel': '77',
              'lvl': '1',
            });
          }
          final state = await SharedState.open();
          final gate = Completer<void>();
          addTearDown(() {
            if (!gate.isCompleted) gate.complete();
          });
          final reports = <Map<String, dynamic>>[];
          final outcomes = <bool>[];
          SessionReport.sink = (body) async {
            reports.add(jsonDecode(body) as Map<String, dynamic>);
            await gate.future;
          };
          LevelLadder.onOutcome = (passed, lesson) => outcomes.add(passed);
          await boot(tester, state);
          await solve(tester);
          final next = find.widgetWithIcon(FilledButton, Icons.arrow_forward);
          await tester.tap(next);
          await tester.pump();
          await tester.tap(next, warnIfMissed: false);
          await tester.pump();
          expect(reports, hasLength(1));
          expect(outcomes, isEmpty);
          OneLineGame? restarted;
          if (restart) {
            await tester.tap(find.bySemanticsLabel(L.t('restart')).first);
            await tester.pump();
            restarted = tester
                .widget<OneLineBoard>(find.byType(OneLineBoard))
                .game;
            expect(
              tester
                  .widget<OneLineBoard>(find.byType(OneLineBoard))
                  .level
                  .level,
              mode == 'ordinary' ? 2 : 1,
            );
          }
          gate.complete();
          await tester.pumpAndSettle();
          expect(reports, hasLength(1));
          expect(outcomes, [true]);
          expect(
            state.get('psygames_one_line_level_nzt48'),
            mode == 'ordinary' ? '2' : isNull,
          );
          final board = tester.widget<OneLineBoard>(find.byType(OneLineBoard));
          if (restart) expect(identical(board.game, restarted), isTrue);
          expect(board.level.level, mode == 'ordinary' ? 2 : 1);
          expect(board.game.trail, isEmpty);
          await solve(tester);
          await tester.tap(
            find.widgetWithIcon(FilledButton, Icons.arrow_forward),
          );
          await tester.pumpAndSettle();
          expect(
            reports,
            hasLength(2),
            reason: 'a genuinely new board may finish again',
          );
          expect(outcomes, [true, true]);
          await tester.pumpWidget(const SizedBox.shrink());
        },
      );
    }
  }
}
