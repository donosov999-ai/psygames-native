import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/object_tracker/model.dart';
import 'package:psygames_flutter/games/object_tracker/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

String ballLabel(WidgetTester tester, int index) => tester
    .widget<Semantics>(
      find
          .descendant(
            of: find.byKey(Key('шарик$index')),
            matching: find.byType(Semantics),
          )
          .first,
    )
    .properties
    .label!;

// Read the preview targets from the real UI, then let the real ticker finish.
// No private handlers/state or fabricated completion metrics.
Future<int> selectRound(WidgetTester tester, {required bool passed}) async {
  final balls = find.byKey(const Key('поле'));
  expect(balls, findsOneWidget);
  final targets = <int>[];
  var count = 0;
  while (find.byKey(Key('шарик$count')).evaluate().isNotEmpty) {
    if (ballLabel(tester, count).contains(L.t('trkA11yTarget'))) {
      targets.add(count);
    }
    count += 1;
  }
  expect(targets, isNotEmpty);
  await tester.tap(find.byKey(const Key('поехали')));
  await tester.pump();
  for (var i = 0; i < 600; i++) {
    if (find.byKey(const Key('готово')).evaluate().isNotEmpty) break;
    await tester.pump(const Duration(milliseconds: 16));
  }
  expect(find.byKey(const Key('готово')), findsOneWidget);
  final selected = passed
      ? targets
      : [
          List.generate(
            count,
            (i) => i,
          ).firstWhere((i) => !targets.contains(i)),
        ];
  for (final index in selected) {
    await tester.tap(find.byKey(Key('шарик$index')));
    await tester.pump();
    expect(ballLabel(tester, index), contains(L.t('trkA11yChosen')));
  }
  return selected.first;
}

Future<void> boot(WidgetTester tester, SharedState state) async {
  tester.view.physicalSize = const Size(780, 1688);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(home: ObjectTrackerScreen(state: state)));
  await tester.pumpAndSettle();
  expect(find.byKey(const Key('поехали')), findsOneWidget);
}

void launch(String kind) {
  if (kind == 'wu') {
    GamePreset.set({
      'wu': '1',
      'level': '1',
      'diff': 'tracker-step',
      'mode': 'tracker-mode',
    });
  } else if (kind == 'transit') {
    GamePreset.set({'ladderGame': 'sudoku', 'ladderLevel': '77', 'lvl': '1'});
  }
}

void checkReport(Map<String, dynamic> report, String kind) {
  expect(report['game_type'], 'object_tracker');
  // Keep the existing reporting contract; this fix does not invent metrics.
  expect(report['score'], 0);
  expect(report['time_seconds'], 0);
  if (kind == 'wu') {
    expect(report['difficulty'], 'tracker-step');
    expect(report['mode'], 'tracker-mode');
  }
  if (kind == 'transit') {
    expect(report['details']['ladderGame'], 'sudoku');
    expect(report['details']['ladderLevel'], 77);
  }
}

void main() {
  setUpAll(() async => L.load('ru'));
  setUp(() {
    SharedPreferences.setMockInitialValues({
      'psygames_object_tracker_level_nzt48': '1',
      'psygames_object_tracker_best_nzt48': '1',
    });
    GamePreset.clear();
  });
  tearDown(() {
    SessionReport.sink = null;
    LevelLadder.onOutcome = null;
    GamePreset.clear();
  });

  for (final kind in ['ordinary', 'wu', 'transit']) {
    for (final passed in [true, false]) {
      testWidgets(
        '$kind passed=$passed: double submit, frozen selection, actual result and replay',
        (tester) async {
          launch(kind);
          final state = await SharedState.open();
          final gate = Completer<void>();
          final reports = <Map<String, dynamic>>[];
          final outcomes = <bool>[];
          SessionReport.sink = (body) async {
            reports.add(jsonDecode(body) as Map<String, dynamic>);
            await gate.future;
          };
          LevelLadder.onOutcome = (result, lesson) {
            expect(lesson, isFalse);
            outcomes.add(result);
          };
          await boot(tester, state);
          final selected = await selectRound(tester, passed: passed);
          final before = ballLabel(tester, selected);
          final submit = find.byKey(const Key('готово'));
          // Two real taps before rebuild also exercise the stale enabled button.
          await tester.tap(submit);
          await tester.tap(submit);
          await tester.pumpAndSettle();
          expect(
            outcomes,
            isEmpty,
            reason: 'outcome follows the existing save contract',
          );
          final disabled =
              tester.widget<FilledButton>(submit).onPressed == null;
          await tester.tap(submit);
          await tester.tap(find.byKey(Key('шарик$selected')));
          await tester.pumpAndSettle();
          final after = ballLabel(tester, selected);
          expect(find.byKey(const Key('дальше')), findsNothing);
          gate.complete();
          await tester.pumpAndSettle();
          expect(
            reports,
            hasLength(1),
            reason: 'one report for one submitted attempt',
          );
          expect(outcomes, [
            passed,
          ], reason: 'one actual outcome, including frozen presets');
          expect(disabled, isTrue, reason: 'submit is disabled while saving');
          expect(after, before, reason: 'selection is frozen while saving');
          checkReport(reports.single, kind);
          expect(
            state.get('psygames_object_tracker_level_nzt48'),
            kind == 'ordinary' && passed ? '2' : '1',
          );
          final round = generateObjectTrackerRound('object-tracker-1', 1);
          expect(
            tester.widget<Text>(find.byKey(const Key('строка'))).data,
            L.f(passed ? 'trkResultWin' : 'trkResultFail', {
              'hits': passed ? '${round.targetCount}' : '0',
              'total': '${round.targetCount}',
              'extra': passed ? '0' : '1',
            }),
          );
          expect(
            find.text(L.t(passed ? 'nextLabel' : 'retry')),
            findsOneWidget,
          );
          await tester.tap(find.byKey(const Key('дальше')));
          await tester.pumpAndSettle();
          await selectRound(tester, passed: passed);
          await tester.tap(submit);
          await tester.pumpAndSettle();
          expect(
            reports,
            hasLength(2),
            reason: 'explicit replay is a new attempt',
          );
          expect(outcomes, [passed, passed]);
          await tester.pumpWidget(const SizedBox.shrink());
        },
      );

      testWidgets(
        '$kind passed=$passed: restart survives late old save and new attempt still reports',
        (tester) async {
          launch(kind);
          final state = await SharedState.open();
          final gate = Completer<void>();
          final reports = <Map<String, dynamic>>[];
          final outcomes = <bool>[];
          SessionReport.sink = (body) async {
            reports.add(jsonDecode(body) as Map<String, dynamic>);
            await gate.future;
          };
          LevelLadder.onOutcome = (result, lesson) => outcomes.add(result);
          await boot(tester, state);
          await selectRound(tester, passed: passed);
          await tester.tap(find.byKey(const Key('готово')));
          await tester.pumpAndSettle();
          expect(reports, hasLength(1));
          expect(outcomes, isEmpty);
          await tester.tap(find.bySemanticsLabel(L.t('restart')).first);
          await tester.pumpAndSettle();
          expect(find.byKey(const Key('поехали')), findsOneWidget);
          gate.complete();
          await tester.pumpAndSettle();
          expect(outcomes, [
            passed,
          ], reason: 'submitted old attempt still finishes its report');
          expect(
            find.byKey(const Key('поехали')),
            findsOneWidget,
            reason:
                'late old completion must not replace the restarted preview',
          );
          expect(find.byKey(const Key('дальше')), findsNothing);
          await selectRound(tester, passed: !passed);
          await tester.tap(find.byKey(const Key('готово')));
          await tester.pumpAndSettle();
          expect(reports, hasLength(2));
          expect(outcomes, [passed, !passed]);
          expect(
            find.text(L.t(passed ? 'retry' : 'nextLabel')),
            findsOneWidget,
          );
          await tester.pumpWidget(const SizedBox.shrink());
        },
      );
    }
  }

  testWidgets('unmounted screen ignores delayed completion', (tester) async {
    final state = await SharedState.open();
    final gate = Completer<void>();
    var reports = 0;
    final outcomes = <bool>[];
    SessionReport.sink = (_) async {
      reports += 1;
      await gate.future;
    };
    LevelLadder.onOutcome = (result, lesson) => outcomes.add(result);
    await boot(tester, state);
    await selectRound(tester, passed: false);
    await tester.tap(find.byKey(const Key('готово')));
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox.shrink());
    gate.complete();
    await tester.pumpAndSettle();
    expect(reports, 1);
    expect(outcomes, [false]);
    expect(tester.takeException(), isNull);
  });
}
