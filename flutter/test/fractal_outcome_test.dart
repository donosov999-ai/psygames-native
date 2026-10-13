import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fractal/rules.dart';
import 'package:psygames_flutter/games/fractal/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/level_transition.dart';
import 'package:psygames_flutter/shell/restart_scope.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _route = '/games/sudoku-fractal';
const _levelKey = 'psygames_sudoku_fractal_level_nzt48';

class _Host extends StatelessWidget {
  const _Host({
    required this.state,
    required this.ladder,
    required this.step,
    required this.outcomes,
  });

  final SharedState state;
  final LevelLadder ladder;
  final LadderTransit step;
  final List<TransitOutcome> outcomes;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: TextButton(
      key: const Key('open-fractal'),
      onPressed: () async {
        outcomes.add(
          await LevelTransition.play(
            context,
            state: state,
            host: ladder,
            step: step,
          ),
        );
      },
      child: const Text('host'),
    ),
  );
}

void main() {
  setUpAll(() async => L.load('ru'));
  late SharedState state;
  late LevelLadder host;
  late List<Map<String, dynamic>> reports;
  late List<TransitOutcome> outcomes;
  late List<(bool, bool)> events;
  final originalResolve = LevelTransition.resolve;
  final originalDelay = LevelTransition.closeDelay;
  final originalListener = LevelLadder.onOutcome;
  final originalRoute = GameRules.currentRoute;
  final originalPreset = GamePreset.params;

  setUp(() async {
    SharedPreferences.setMockInitialValues({_levelKey: '7'});
    state = await SharedState.open();
    final store = MemoryLevelStore();
    await store.writeInt('host.level', 3);
    host = LevelLadder(gameId: 'host', store: store);
    GamePreset.clear();
    LessonUsed.reset();
    await host.load();
    reports = [];
    outcomes = [];
    events = [];
    SessionReport.sink = (json) async {
      reports.add(jsonDecode(json) as Map<String, dynamic>);
    };
    LevelLadder.onOutcome = null;
    LevelTransition.resolve = (route) =>
        route == _route ? (shared) => FractalScreen(state: shared) : null;
  });

  tearDown(() {
    SessionReport.sink = null;
    LevelLadder.onOutcome = originalListener;
    LevelTransition.resolve = originalResolve;
    LevelTransition.closeDelay = originalDelay;
    GamePreset.set(originalPreset);
    GameRules.currentRoute = originalRoute;
    LessonUsed.reset();
  });

  Future<void> ready(WidgetTester tester) async {
    await tester.runAsync(() async {
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 30));
        if (find.byKey(const Key('tile0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const Key('tile0')), findsOneWidget);
  }

  void observe() {
    final listener = LevelLadder.onOutcome;
    LevelLadder.onOutcome = (passed, lesson) {
      events.add((passed, lesson));
      listener?.call(passed, lesson);
    };
  }

  Future<void> open(WidgetTester tester, {bool blocks = true}) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(
        MaterialApp(
          home: _Host(
            state: state,
            ladder: host,
            outcomes: outcomes,
            step: LadderTransit(
              game: _route,
              gameLevel: 1,
              blocks: blocks,
              boss: !blocks,
            ),
          ),
        ),
      );
      await tester.tap(find.byKey(const Key('open-fractal')));
      await tester.pump();
    });
    await ready(tester);
    observe();
  }

  Future<void> review(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('show-solution')));
    await tester.pump();
    final button = tester.widget<FilledButton>(
      find.byKey(const Key('fractal-solution-confirm')),
    );
    await tester.tap(find.byKey(const Key('fractal-solution-confirm')));
    await tester.pump();
    expect(find.byKey(const Key('fractal-solution-shown')), findsOneWidget);
    button.onPressed!();
    await tester.pump();
    expect(find.byKey(const Key('fractal-solution-confirm')), findsNothing);
  }

  Future<void> returnToHost(WidgetTester tester) async {
    await tester.pump(LevelTransition.closeDelay);
    await tester.pumpAndSettle();
    await tester.runAsync(() async {});
    await tester.pump();
    expect(find.byKey(const Key('open-fractal')), findsOneWidget);
    expect(find.byType(FractalScreen), findsNothing);
  }

  void expectReport({bool transit = false}) {
    expect(reports, hasLength(1));
    final report = reports.single;
    expect(report['game_type'], 'sudoku_fractal');
    expect(report['score'], 0);
    final details = report['details'] as Map;
    expect(details['solver_used'], true);
    expect(details['passed'], false);
    expect(details['lesson'], true);
    if (transit) {
      expect(details['level'], 1);
      expect(details['ladderGame'], 'host');
      expect(details['ladderLevel'], 3);
    }
    expect(state.get(_levelKey), '7');
  }

  testWidgets(
    'review returns lesson to a blocking host, restores warmup preset',
    (tester) async {
      const preset = {'wu': '1', 'mode': 'warmup'};
      GamePreset.set(preset);
      GameRules.currentRoute = '/host';
      await open(tester);
      expect(GamePreset.isPreset, false);
      expect(GamePreset.isTransit, true);
      await review(tester);
      expect(events, [(false, true)]);
      await returnToHost(tester);
      expect(outcomes, [TransitOutcome.lesson]);
      expect(host.level, 3);
      expect(host.failStreak, 0);
      expect(GamePreset.params, preset);
      expect(GameRules.currentRoute, '/host');
      expectReport(transit: true);
    },
  );

  testWidgets(
    'review under warmup preset reports one lesson without own advancement',
    (tester) async {
      GamePreset.set({'wu': '1'});
      observe();
      await tester.runAsync(() async {
        await tester.pumpWidget(MaterialApp(home: FractalScreen(state: state)));
      });
      await ready(tester);
      await review(tester);
      expect(events, [(false, true)]);
      await tester.pump(const Duration(seconds: 2));
      expect(events, hasLength(1));
      expectReport();
      await tester.tap(find.byKey(const Key('fractal-retry')));
      await tester.pump();
      expect(find.byKey(const Key('fractal-solution-shown')), findsNothing);
      expect(events, hasLength(1));
      expect(reports, hasLength(1));
    },
  );

  testWidgets(
    'nonblocking boss keeps host progression rule without a second report',
    (tester) async {
      await open(tester, blocks: false);
      await review(tester);
      await returnToHost(tester);
      expect(outcomes, [TransitOutcome.lesson]);
      expect(host.level, 4);
      expect(host.failStreak, 0);
      expect(events, [(false, true)]);
      expectReport(transit: true);
    },
  );

  testWidgets(
    'retry invalidates a pending review outcome but the next review returns',
    (tester) async {
      final gate = Completer<void>();
      SessionReport.sink = (json) async {
        reports.add(jsonDecode(json) as Map<String, dynamic>);
        if (reports.length == 1) await gate.future;
      };
      await open(tester);
      await review(tester);
      expect(events, isEmpty);
      await tester.tap(find.byKey(const Key('fractal-retry')));
      await tester.pump();
      gate.complete();
      await tester.pump();
      await tester.pump(LevelTransition.closeDelay);
      expect(find.byType(FractalScreen), findsOneWidget);
      expect(find.byKey(const Key('fractal-solution-shown')), findsNothing);
      expect(events, isEmpty);
      expect(outcomes, isEmpty);
      await review(tester);
      await returnToHost(tester);
      expect(outcomes, [TransitOutcome.lesson]);
      expect(events, [(false, true)]);
      expect(reports, hasLength(2), reason: 'one report per reviewed attempt');
      expect(host.level, 3);
      expect(state.get(_levelKey), '7');
    },
  );

  testWidgets('RestartScope invalidates a pending review outcome', (
    tester,
  ) async {
    final gate = Completer<void>();
    SessionReport.sink = (json) async {
      reports.add(jsonDecode(json) as Map<String, dynamic>);
      if (reports.length == 1) await gate.future;
    };
    await open(tester);
    await review(tester);
    await tester.runAsync(() async {
      RestartScope.of(tester.element(find.byType(FractalScreen)))!();
      await tester.pump();
    });
    await ready(tester);
    gate.complete();
    await tester.pump();
    await tester.pump(LevelTransition.closeDelay);
    expect(find.byType(FractalScreen), findsOneWidget);
    expect(events, isEmpty);
    expect(outcomes, isEmpty);
    await review(tester);
    await returnToHost(tester);
    expect(events, [(false, true)]);
    expect(outcomes, [TransitOutcome.lesson]);
    expect(reports, hasLength(2));
  });

  testWidgets('late review completion cannot signal another transition', (
    tester,
  ) async {
    final gate = Completer<void>();
    SessionReport.sink = (json) async {
      reports.add(jsonDecode(json) as Map<String, dynamic>);
      if (reports.length == 1) await gate.future;
    };
    await open(tester);
    await review(tester);
    Navigator.of(tester.element(find.byType(FractalScreen))).pop();
    await tester.pumpAndSettle();
    await tester.runAsync(() async {});
    await tester.pump();
    expect(outcomes, [TransitOutcome.left]);
    await tester.runAsync(() async {
      await tester.tap(find.byKey(const Key('open-fractal')));
      await tester.pump();
    });
    await ready(tester);
    observe();
    gate.complete();
    await tester.pump();
    await tester.pump(LevelTransition.closeDelay);
    expect(events, isEmpty);
    expect(find.byType(FractalScreen), findsOneWidget);
    expect(outcomes, [TransitOutcome.left]);
    await review(tester);
    await returnToHost(tester);
    expect(events, [(false, true)]);
    expect(outcomes, [TransitOutcome.left, TransitOutcome.lesson]);
    expect(reports, hasLength(2));
  });

  testWidgets(
    'hand-completed root after child reveals also returns one lesson',
    (tester) async {
      await open(tester);
      for (var child = 0; child < 9; child++) {
        await tester.tap(find.byKey(Key('tile$child')));
        await tester.pump();
        await tester.tap(find.byKey(const Key('show-solution')));
        await tester.pump();
        await tester.tap(find.byKey(const Key('fractal-solution-confirm')));
        await tester.pump();
        await tester.tap(find.byTooltip(L.t('sdkToMap')));
        await tester.pump();
      }
      expect(events, isEmpty);
      expect(reports, isEmpty);
      final snapshot =
          jsonDecode(state.get('psygames_resume_sudoku_fractal_nzt48')!) as Map;
      final root = ((snapshot['state'] as Map)['puzzle'] as Map)['root'] as Map;
      List<List<int>> grid(Object? rows) => [
        for (final row in rows as List)
          [for (final digit in row as List) (digit as num).toInt()],
      ];
      final puzzle = grid(root['puzzle']);
      final solution = grid(root['solution']);
      for (var r = 0; r < 9; r++) {
        for (var c = 0; c < 9; c++) {
          if (!rootEditable(puzzle, r, c)) continue;
          final cell = find.byKey(Key('root_${r}_$c'));
          final text = find.descendant(of: cell, matching: find.byType(Text));
          if (text.evaluate().isNotEmpty &&
              (int.tryParse(tester.widget<Text>(text.first).data ?? '') ?? 0) !=
                  0) {
            continue;
          }
          await tester.tap(cell);
          await tester.pump();
          await tester.tap(find.byKey(Key('digit${solution[r][c]}')));
          await tester.pump();
        }
      }
      expect(find.byKey(const Key('fractal-solution-shown')), findsOneWidget);
      expect(events, [(false, true)]);
      await returnToHost(tester);
      expect(outcomes, [TransitOutcome.lesson]);
      expect(host.level, 3);
      expectReport(transit: true);
    },
  );

  testWidgets('pending review cannot notify a replacement outcome listener', (
    tester,
  ) async {
    final gate = Completer<void>();
    SessionReport.sink = (json) async {
      reports.add(jsonDecode(json) as Map<String, dynamic>);
      await gate.future;
    };
    GamePreset.set({'wu': '1'});
    observe();
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: FractalScreen(state: state)));
    });
    await ready(tester);
    await review(tester);
    final replacementEvents = <(bool, bool)>[];
    LevelLadder.onOutcome = (passed, lesson) =>
        replacementEvents.add((passed, lesson));
    gate.complete();
    await tester.pump();
    expect(events, isEmpty);
    expect(replacementEvents, isEmpty);
    expectReport();
  });
}
