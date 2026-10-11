import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sort_tubes/board.dart';
import 'package:psygames_flutter/games/sort_tubes/model.dart';
import 'package:psygames_flutter/games/sort_tubes/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

List<TubeMove> solution(TubeField initial) {
  String key(TubeField f) =>
      '${f.sealed}:${f.tubes.map((t) => t.join(",")).join("|")}';
  final queue = <({TubeField field, List<TubeMove> path})>[
    (field: initial, path: []),
  ];
  final seen = {key(initial)};
  for (var i = 0; i < queue.length && i < 50000; i++) {
    final current = queue[i];
    if (current.field.isSolved) return current.path;
    for (final move in legalMoves(current.field)) {
      final next = sealDone(pour(current.field, move.from, move.to)!).field;
      if (seen.add(key(next))) {
        queue.add((field: next, path: [...current.path, move]));
      }
    }
  }
  throw StateError('Exported L1 must be solvable within the test search bound');
}

Future<void> boot(
  WidgetTester tester,
  SharedState state,
  TubeSkin skin,
  String id,
) async {
  tester.view.physicalSize = const Size(780, 1688);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.runAsync(() async {
    await tester.pumpWidget(
      MaterialApp(
        home: SortTubesScreen(state: state, gameId: id, title: id, skin: skin),
      ),
    );
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 10));
      if (find.byType(TubesField).evaluate().isNotEmpty) break;
    }
  });
  await tester.pumpAndSettle();
  if (find.text(L.t('ctaGotIt')).evaluate().isNotEmpty) {
    await tester.tap(find.text(L.t('ctaGotIt')));
    await tester.pumpAndSettle();
  }
}

Future<void> solve(WidgetTester tester) async {
  final field = tester.widget<TubesField>(find.byType(TubesField)).field;
  for (final move in solution(field)) {
    await tester.tap(find.byKey(ValueKey('tube-${move.from}')));
    await tester.pump();
    expect(
      tester.takeException(),
      isNull,
      reason: 'selection must not expand the row beyond the field',
    );
    await tester.tap(find.byKey(ValueKey('tube-${move.to}')));
    await tester.pump();
  }
  expect(
    tester.widget<TubesField>(find.byType(TubesField)).field.isSolved,
    isTrue,
  );
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
    'Undo during pending Next reviews one board without crediting its replay twice',
    (tester) async {
      final state = await SharedState.open();
      final gate = Completer<void>();
      final reports = <String>[];
      final outcomes = <bool>[];
      SessionReport.sink = (body) async {
        reports.add(body);
        await gate.future;
      };
      LevelLadder.onOutcome = (passed, lesson) => outcomes.add(passed);
      await boot(tester, state, TubeSkin.water, 'water_sort');
      await solve(tester);
      await tester.tap(find.widgetWithIcon(FilledButton, Icons.arrow_forward));
      await tester.pump();
      await tester.tap(find.bySemanticsLabel(L.t('btn_undo')).first);
      await tester.pump();
      final review = tester.widget<TubesField>(find.byType(TubesField)).field;
      expect(review.isSolved, isFalse);
      gate.complete();
      await tester.pumpAndSettle();
      expect(
        identical(
          tester.widget<TubesField>(find.byType(TubesField)).field,
          review,
        ),
        isTrue,
      );
      await solve(tester);
      await tester.tap(find.widgetWithIcon(FilledButton, Icons.arrow_forward));
      await tester.pumpAndSettle();
      expect(reports, hasLength(1));
      expect(outcomes, [true]);
      expect(state.get('psygames_water_sort_level_nzt48'), '2');
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  for (final skin in [
    (TubeSkin.water, 'water_sort'),
    (TubeSkin.balls, 'ball_sort'),
    (TubeSkin.nuts, 'nut_sort'),
  ]) {
    for (final run in [
      (mode: 'ordinary', timer: false, restart: false),
      (mode: 'wu', timer: false, restart: false),
      (mode: 'transit', timer: false, restart: false),
      (mode: 'ordinary', timer: true, restart: false),
      (mode: 'ordinary', timer: false, restart: true),
    ]) {
      testWidgets(
        '${skin.$2} ${run.mode} timer=${run.timer} restart=${run.restart}: one Next owns its board',
        (tester) async {
          if (run.mode == 'wu') GamePreset.set({'wu': '1'});
          if (run.mode == 'transit') {
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
          await boot(tester, state, skin.$1, skin.$2);
          final initial = tester
              .widget<TubesField>(find.byType(TubesField))
              .field;
          await solve(tester);
          final next = find.widgetWithIcon(FilledButton, Icons.arrow_forward);
          expect(next, findsOneWidget);
          if (run.timer) await tester.pump(const Duration(milliseconds: 1400));
          await tester.tap(next, warnIfMissed: false);
          await tester.pump();
          await tester.tap(next, warnIfMissed: false);
          await tester.pump(const Duration(milliseconds: 1400));
          expect(reports, hasLength(1));
          expect(outcomes, isEmpty);
          TubeField? restarted;
          if (run.restart) {
            await tester.tap(find.bySemanticsLabel(L.t('restart')).first);
            await tester.pump();
            restarted = tester
                .widget<TubesField>(find.byType(TubesField))
                .field;
            expect(
              restarted.tubes,
              initial.tubes,
              reason: 'Restart repeats the original board, not a new deal',
            );
          }
          gate.complete();
          await tester.pumpAndSettle();
          expect(reports, hasLength(1));
          expect(outcomes, [true]);
          expect(
            state.get('psygames_${skin.$2}_level_nzt48'),
            run.mode == 'ordinary' ? '2' : isNull,
          );
          final current = tester
              .widget<TubesField>(find.byType(TubesField))
              .field;
          expect(current.isSolved, isFalse);
          if (run.restart) {
            expect(
              identical(current, restarted),
              isTrue,
              reason: 'late save cannot replace explicit Restart',
            );
          }
          expect(next, findsNothing);
          await tester.pumpWidget(const SizedBox.shrink());
        },
      );
    }
  }
}
