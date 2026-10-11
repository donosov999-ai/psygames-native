import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/spatial_lab/board.dart';
import 'package:psygames_flutter/games/spatial_lab/deal.dart';
import 'package:psygames_flutter/games/spatial_lab/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _seed = 42;
const _levelKey = 'psygames_spatial_lab_twiddle_level_nzt48';
const _bestKey = 'psygames_spatial_lab_twiddle_best_nzt48';

// The actual generator supplies a solution, but every move is made through the
// rendered cell and rotation button. No screen state or outcome is injected.
List<Command> _solution(int level) => level == 0
    ? scramble(_seed).solution
    : createDeal(LabMode.twiddle, _seed, level: level).task!.solution;

Future<void> _play(WidgetTester tester, Command command, int width) async {
  await tester.tap(
    find.byKey(Key('клетка${command.row * width + command.col}')),
  );
  await tester.pump();
  await tester.tap(find.byKey(Key(command.amount > 0 ? 'вправо' : 'влево')));
  await tester.pump();
}

Future<Command> _solve(WidgetTester tester, int level) async {
  final commands = _solution(level);
  expect(commands, isNotEmpty);
  for (final command in commands) {
    await _play(tester, command, level == 0 ? 4 : 3);
  }
  await tester.pump();
  expect(find.text(L.t('spatialLabSolved')), findsOneWidget);
  expect(find.byKey(const Key('дальше')), findsOneWidget);
  return commands.last;
}

Future<void> _reviewAndResolve(
  WidgetTester tester,
  Command last,
  int level,
) async {
  await tester.tap(find.byTooltip(L.t('btn_undo')));
  await tester.pump();
  expect(find.text(L.t('spatialLabSolved')), findsNothing);
  expect(find.byKey(const Key('дальше')), findsNothing);
  await tester.tap(find.byTooltip(L.t('spatialLabRedo')));
  await tester.pump();
  expect(find.text(L.t('spatialLabSolved')), findsOneWidget);
  await tester.tap(find.byTooltip(L.t('btn_undo')));
  await tester.pump();
  await _play(tester, last, level == 0 ? 4 : 3);
  expect(find.text(L.t('spatialLabSolved')), findsOneWidget);
}

Future<void> _boot(
  WidgetTester tester,
  SharedState state, {
  required bool free,
}) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  var picks = 0;
  await tester.pumpWidget(
    MaterialApp(
      home: SpatialLabScreen(
        state: state,
        seed: _seed,
        banks: LabBanks.empty, // Twiddle L1/L2 and free play need no bank.
        // Separate cell picks from the intentional double-tap gesture. This
        // clock controls taps only, not reported play time or score.
        now: () => DateTime.utc(2026).add(Duration(seconds: picks++)),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  if (free && GamePreset.isPreset) {
    await tester.tap(find.byTooltip(L.t('settings')));
    await tester.pump();
  }
  if (free || !GamePreset.isPreset) {
    await tester.tap(
      find.byKey(Key(free ? 'свободная-игра' : 'начать-ступень')),
    );
    await tester.pump();
  }
  expect(find.byKey(const Key('состояние')), findsOneWidget);
  expect(find.text(L.t('spatialLabSolved')), findsNothing);
}

void main() {
  late SharedState state;
  late List<Map<String, dynamic>> reports;
  late List<bool> outcomes;
  late Future<void> Function(String)? previousSink;
  late void Function(bool, bool)? previousOutcome;

  setUp(() async {
    previousSink = SessionReport.sink;
    previousOutcome = LevelLadder.onOutcome;
    GamePreset.clear();
    SharedPreferences.setMockInitialValues({_levelKey: '1', _bestKey: '1'});
    state = await SharedState.open();
    await L.load('ru');
    reports = [];
    outcomes = [];
    SessionReport.sink = (body) async =>
        reports.add(jsonDecode(body) as Map<String, dynamic>);
    LevelLadder.onOutcome = (passed, lesson) {
      expect(lesson, isFalse);
      outcomes.add(passed);
    };
  });

  tearDown(() {
    SessionReport.sink = previousSink;
    LevelLadder.onOutcome = previousOutcome;
    GamePreset.clear();
    state.dispose();
  });

  void expectResults(
    int count,
    int personalLevel, {
    required bool transit,
    bool free = false,
  }) {
    expect(
      reports,
      hasLength(count),
      reason: 'one SessionReport per completed deal',
    );
    expect(
      outcomes,
      List.filled(count, true),
      reason: 'one ladder outcome per completed deal',
    );
    expect(state.get(_levelKey), '$personalLevel');
    expect(state.get(_bestKey), '$personalLevel');
    for (var i = 0; i < reports.length; i++) {
      final report = reports[i];
      expect(report['game_type'], 'spatial_lab');
      expect(report['mode'], 'twiddle');
      final details =
          report['details'] as Map<String, dynamic>? ??
          const <String, dynamic>{};
      if (free) {
        expect(report['difficulty'], 'free');
        expect(details, containsPair('freePlay', true));
        expect(details, isNot(contains('level')));
      } else {
        expect(
          details,
          containsPair('level', i == 0 ? 1 : 2),
          reason: 'played task level, not the personal level after winning',
        );
        expect(details, isNot(contains('freePlay')));
        if (GamePreset.isPreset) {
          expect(
            report['difficulty'],
            GamePreset.params['diff'],
            reason: 'non-free warm-up keeps the step difficulty label',
          );
        }
      }
      expect(report['score'], 0, reason: 'do not invent a score');
      expect(
        report['time_seconds'],
        0,
        reason: 'no duration is measured by this screen',
      );
      if (transit) {
        expect(report['details']['ladderGame'], 'sudoku');
        expect(report['details']['ladderLevel'], 77);
      }
    }
  }

  for (final launch in ['ordinary', 'wu', 'transit']) {
    for (final free in [true, false]) {
      testWidgets(
        '$launch ${free ? 'free' : 'level'}: win, review, Next and new deal',
        (tester) async {
          if (launch == 'wu') {
            GamePreset.set({
              'wu': '1',
              'mode': 'twiddle',
              'diff': 'hard',
              'level': '1',
              'seed': '$_seed',
            });
          } else if (launch == 'transit') {
            GamePreset.set({
              'ladderGame': 'sudoku',
              'ladderLevel': '77',
              'lvl': '1',
            });
          }
          final advances = !free && launch == 'ordinary';
          final level = free ? 0 : 1;
          await _boot(tester, state, free: free);
          final last = await _solve(tester, level);
          expectResults(
            1,
            advances ? 2 : 1,
            transit: launch == 'transit',
            free: free,
          );

          await _reviewAndResolve(tester, last, level);
          await tester.pump();
          expectResults(
            1,
            advances ? 2 : 1,
            transit: launch == 'transit',
            free: free,
          );

          await tester.tap(find.byKey(const Key('дальше')));
          await tester.pump();
          expect(find.text(L.t('spatialLabSolved')), findsNothing);
          expect(find.byKey(const Key('дальше')), findsNothing);
          final nextLevel = free ? 0 : 2;
          await _solve(tester, nextLevel);
          expectResults(
            2,
            advances ? 3 : 1,
            transit: launch == 'transit',
            free: free,
          );

          // Spatial Lab has no loss state/retry button. The real shuffle action
          // starts a fresh attempt at the same level (even with the same seed).
          await tester.tap(find.byTooltip(L.t('spatialLabNew')));
          await tester.pump();
          expect(find.text(L.t('spatialLabSolved')), findsNothing);
          await _solve(tester, nextLevel);
          expectResults(
            3,
            advances ? 4 : 1,
            transit: launch == 'transit',
            free: free,
          );
          await tester.pumpWidget(const SizedBox.shrink());
        },
      );
    }
  }

  testWidgets('free result stays free with personal level 7', (tester) async {
    await state.set(_levelKey, '7');
    await state.set(_bestKey, '7');
    await _boot(tester, state, free: true);
    final last = await _solve(tester, 0);
    expectResults(1, 7, transit: false, free: true);
    await _reviewAndResolve(tester, last, 0);
    await tester.pump();
    expectResults(1, 7, transit: false, free: true);
    await tester.tap(find.byKey(const Key('дальше')));
    await tester.pump();
    await _solve(tester, 0);
    expectResults(2, 7, transit: false, free: true);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'pending SessionReport: review cannot recredit; Next owns a fresh attempt',
    (tester) async {
      final pending = Completer<void>();
      addTearDown(() {
        if (!pending.isCompleted) pending.complete();
      });
      SessionReport.sink = (body) async {
        reports.add(jsonDecode(body) as Map<String, dynamic>);
        if (reports.length == 1) await pending.future;
      };
      await _boot(tester, state, free: false);
      final last = await _solve(tester, 1);
      expect(reports, hasLength(1));
      expect(outcomes, isEmpty, reason: 'LevelLadder awaits the session sink');
      expect(state.get(_levelKey), '2');

      await _reviewAndResolve(tester, last, 1);
      await tester.pump();
      expect(
        reports,
        hasLength(1),
        reason: 'guard must be set before async reporting',
      );
      expect(outcomes, isEmpty);
      expect(state.get(_levelKey), '2');

      await tester.tap(find.byKey(const Key('дальше')));
      await tester.pump();
      await _solve(tester, 2);
      expect(reports, hasLength(2));
      expect(outcomes, [true]);
      expect(state.get(_levelKey), '3');
      pending.complete();
      await tester.pump();
      await tester.pump();
      expectResults(2, 3, transit: false);
      // Completion of the old report must not unlock the newly completed deal.
      await _reviewAndResolve(tester, _solution(2).last, 2);
      await tester.pump();
      expectResults(2, 3, transit: false);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
