import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/hanoi/board.dart';
import 'package:psygames_flutter/games/hanoi/model.dart';
import 'package:psygames_flutter/games/hanoi/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

// Delay the real SharedLevelStore -> SharedState storage boundary, without a
// production injection seam or replacing the screen's LevelLadder.
class _DelayedState extends SharedState {
  _DelayedState(super.prefs, this.gameId);
  final String gameId;
  Completer<void>? storageGate;
  int levelWrites = 0;

  @override
  Future<void> set(String key, String value) async {
    if (key == SharedState.levelKey(gameId, activeProfile)) {
      levelWrites++;
      final gate = storageGate;
      if (gate != null) await gate.future;
    }
    await super.set(key, value);
  }
}

Finder get _next => find.widgetWithIcon(FilledButton, Icons.arrow_forward);

Future<void> _boot(WidgetTester tester, Widget screen, Type boardType) async {
  tester.view.physicalSize = const Size(780, 1688);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: screen));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 10));
      if (find.byType(boardType).evaluate().isNotEmpty) break;
    }
  });
  await tester.pumpAndSettle();
  if (find.text(L.t('ctaGotIt')).evaluate().isNotEmpty) {
    await tester.tap(find.text(L.t('ctaGotIt')));
    await tester.pumpAndSettle();
  }
  expect(find.byType(boardType), findsOneWidget);
}

typedef _Move = ({int from, int to});

HanoiState _board(WidgetTester tester) =>
    tester.widget<HanoiBoard>(find.byType(HanoiBoard)).state;

// A legal model-driven route for the actual three-peg board; no screen
// callbacks, private State access or fake solved flags.
List<_Move> _solution(int discs, [int from = 0, int to = 2, int spare = 1]) =>
    discs == 0
    ? []
    : [
        ..._solution(discs - 1, from, spare, to),
        (from: from, to: to),
        ..._solution(discs - 1, spare, to, from),
      ];

Future<void> _move(WidgetTester tester, _Move move) async {
  final after = _board(tester).move(move.from, move.to);
  expect(after, isNotNull);
  await tester.tap(find.byKey(ValueKey('peg-${move.from}')));
  await tester.pump();
  await tester.tap(find.byKey(ValueKey('peg-${move.to}')));
  await tester.pump();
  expect(_board(tester).toJson(), after!.toJson());
}

Future<void> _solve(WidgetTester tester) async {
  for (final move in _solution(_board(tester).discs)) {
    await _move(tester, move);
  }
  expect(_board(tester).solved, isTrue);
  expect(_next, findsOneWidget);
}

void main() {
  setUpAll(() async => L.load('ru'));
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    GamePreset.clear();
  });
  tearDown(() {
    SessionReport.sink = null;
    LevelLadder.onOutcome = null;
    GamePreset.clear();
  });

  for (final delay in ['storage', 'sink']) {
    for (final action in ['manual', 'timer', 'restart', 'undo', 'dispose']) {
      testWidgets('hanoi $delay: $action owns exactly one outcome and board', (
        tester,
      ) async {
        final state = _DelayedState(
          await SharedPreferences.getInstance(),
          'hanoi',
        );
        final gate = Completer<void>();
        if (delay == 'storage') state.storageGate = gate;
        final reports = <Map<String, dynamic>>[];
        final outcomes = <bool>[];
        SessionReport.sink = (body) async {
          reports.add(jsonDecode(body) as Map<String, dynamic>);
          if (delay == 'sink') await gate.future;
        };
        LevelLadder.onOutcome = (passed, lesson) {
          expect(lesson, isFalse);
          outcomes.add(passed);
        };
        await _boot(tester, HanoiScreen(state: state), HanoiBoard);
        expect(_board(tester).toJson(), HanoiState.start(1).toJson());
        await _solve(tester);
        final completed = _board(tester);
        if (action == 'timer') {
          await tester.pump(const Duration(milliseconds: 1400));
        }
        await tester.tap(_next);
        await tester.pump();
        if (action == 'manual' || action == 'timer' || action == 'dispose') {
          await tester.tap(_next);
          await tester.pump(const Duration(milliseconds: 1400));
        }
        expect(
          state.levelWrites,
          1,
          reason: 'timer and repeated Next must claim before storage awaits',
        );
        expect(reports, hasLength(delay == 'storage' ? 0 : 1));
        expect(outcomes, isEmpty);
        expect(identical(_board(tester), completed), isTrue);

        HanoiState? retained;
        if (action == 'restart') {
          await tester.tap(find.bySemanticsLabel(L.t('restart')).first);
          await tester.pump();
          expect(
            _board(tester).toJson(),
            HanoiState.start(1).toJson(),
            reason: 'Restart replays the actual deal, not the ladder already mutated by pending win',
          );
          await _move(tester, _solution(3).first);
          retained = _board(tester);
        } else if (action == 'undo') {
          await tester.tap(find.bySemanticsLabel(L.t('btn_undo')).first);
          await tester.pump();
          retained = _board(tester);
          expect(retained.solved, isFalse);
        } else if (action == 'dispose') {
          await tester.pumpWidget(const SizedBox.shrink());
        }
        gate.complete();
        await tester.pumpAndSettle();
        expect(reports, hasLength(1));
        expect(reports.single['game_type'], 'hanoi');
        expect(outcomes, [true]);
        expect(
          state.get(SharedState.levelKey('hanoi', state.activeProfile)),
          '2',
        );

        if (action == 'dispose') {
          expect(find.byType(HanoiBoard), findsNothing);
        } else if (retained != null) {
          expect(
            identical(_board(tester), retained),
            isTrue,
            reason: 'old completion must not replace Restart or Undo',
          );
          if (action == 'undo') {
            await _move(tester, _solution(3).last);
          } else {
            for (final move in _solution(3).skip(1)) {
              await _move(tester, move);
            }
          }
          final count = action == 'restart' ? 2 : 1;
          expect(
            find.text(L.f('nextLevelBtn', {'n': '${count + 1}'})),
            findsOneWidget,
            reason: 'Next names the actual next board after Restart or recorded Undo',
          );
          await tester.tap(_next);
          await tester.pumpAndSettle();
          expect(
            reports,
            hasLength(count),
            reason: 'only explicit Restart begins a new attempt',
          );
          expect(outcomes, List.filled(count, true));
          expect(state.levelWrites, count);
          expect(_board(tester).toJson(), HanoiState.start(count + 1).toJson());
        } else {
          expect(_board(tester).toJson(), HanoiState.start(2).toJson());
          final advanced = _board(tester);
          await tester.pump(const Duration(milliseconds: 2800));
          expect(
            identical(_board(tester), advanced),
            isTrue,
            reason: 'one actual new board, no late timer',
          );
        }
        expect(_next, findsNothing);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }

  for (final review in ['restart', 'undo']) {
    testWidgets('hanoi sink: $review finishes again before old save returns', (
      tester,
    ) async {
      final state = _DelayedState(
        await SharedPreferences.getInstance(),
        'hanoi',
      );
      final oldGate = Completer<void>();
      final newGate = Completer<void>();
      final reports = <Map<String, dynamic>>[];
      final outcomes = <bool>[];
      SessionReport.sink = (body) async {
        reports.add(jsonDecode(body) as Map<String, dynamic>);
        await (reports.length == 1 ? oldGate.future : newGate.future);
      };
      LevelLadder.onOutcome = (passed, lesson) => outcomes.add(passed);
      await _boot(tester, HanoiScreen(state: state), HanoiBoard);
      await _solve(tester);
      await tester.tap(_next);
      await tester.pump();
      expect(reports, hasLength(1));

      await tester.tap(
        find
            .bySemanticsLabel(L.t(review == 'restart' ? 'restart' : 'btn_undo'))
            .first,
      );
      await tester.pump();
      if (review == 'restart') {
        await _solve(tester);
      } else {
        await _move(tester, _solution(3).last);
      }
      final completedAgain = _board(tester);
      await tester.tap(_next);
      await tester.pump();
      final count = review == 'restart' ? 2 : 1;
      expect(reports, hasLength(count));
      expect(state.levelWrites, count);
      expect(outcomes, isEmpty);
      oldGate.complete();
      await tester.pumpAndSettle();
      expect(outcomes, [true]);
      if (review == 'restart') {
        expect(
          identical(_board(tester), completedAgain),
          isTrue,
          reason: 'old won generation must not replace the newly won attempt',
        );
        expect(
          tester.widget<FilledButton>(_next).onPressed,
          isNull,
          reason: 'old finally must not clear the new attempt pending flag',
        );
        newGate.complete();
        await tester.pumpAndSettle();
        expect(outcomes, [true, true]);
      } else {
        newGate.complete();
      }
      expect(reports, hasLength(count));
      expect(_board(tester).toJson(), HanoiState.start(count + 1).toJson());
      final advanced = _board(tester);
      await tester.pump(const Duration(milliseconds: 2800));
      expect(identical(_board(tester), advanced), isTrue);
      expect(_next, findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  for (final launch in ['wu', 'transit']) {
    testWidgets(
      'hanoi $launch: delayed timer/manual outcome advances no personal level',
      (tester) async {
        if (launch == 'wu') {
          GamePreset.set({'wu': '1', 'discs': '2', 'mode': 'mix'});
        }
        if (launch == 'transit') {
          GamePreset.set({
            'ladderGame': 'sudoku',
            'ladderLevel': '77',
            'lvl': '1',
          });
        }
        final state = _DelayedState(
          await SharedPreferences.getInstance(),
          'hanoi',
        );
        final gate = Completer<void>();
        final reports = <Map<String, dynamic>>[];
        final outcomes = <bool>[];
        SessionReport.sink = (body) async {
          reports.add(jsonDecode(body) as Map<String, dynamic>);
          await gate.future;
        };
        LevelLadder.onOutcome = (passed, lesson) => outcomes.add(passed);
        await _boot(tester, HanoiScreen(state: state), HanoiBoard);
        final initial = _board(tester).toJson();
        await _solve(tester);
        final completed = _board(tester);
        await tester.pump(const Duration(milliseconds: 1400));
        await tester.tap(_next);
        await tester.pump();
        expect(reports, hasLength(1));
        gate.complete();
        await tester.pumpAndSettle();
        expect(outcomes, [true]);
        expect(reports, hasLength(1));
        expect(reports.single['game_type'], 'hanoi');
        if (launch == 'wu') expect(reports.single['mode'], 'mix');
        if (launch == 'transit') {
          expect(reports.single['details']['ladderGame'], 'sudoku');
        }
        expect(state.levelWrites, 0);
        expect(_board(tester).toJson(), initial);
        expect(
          identical(_board(tester), completed),
          isFalse,
          reason: 'frozen ladder still deals a fresh board',
        );
        final advanced = _board(tester);
        await tester.pump(const Duration(milliseconds: 2800));
        expect(identical(_board(tester), advanced), isTrue);
        expect(_next, findsNothing);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
}
