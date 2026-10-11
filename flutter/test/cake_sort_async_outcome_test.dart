import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:psygames_flutter/games/cake_sort/board.dart';
import 'package:psygames_flutter/games/cake_sort/model.dart';
import 'package:psygames_flutter/games/cake_sort/screen.dart';
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

typedef _Move = ({int from, int type, int to});
late CakeLevelSet _levels;
late List<_Move> _solution;

CakeBoard _board(WidgetTester tester) =>
    tester.widget<CakeTable>(find.byType(CakeTable)).board;

Future<void> _move(WidgetTester tester, _Move move) async {
  final before = _board(tester);
  final after = moveType(before, move.from, move.type, move.to);
  expect(
    after,
    isNotNull,
    reason: 'recorded move must be legal in the actual screen',
  );
  final slice = before.plates[move.from].indexOf(move.type);
  await tester.tap(find.byKey(ValueKey('plate-${move.from}')));
  await tester.pump();
  await tester.tap(find.byKey(ValueKey('slice-$slice')));
  await tester.pump();
  await tester.tap(find.byKey(ValueKey('plate-${move.to}')));
  await tester.pump();
  expect(_board(tester).toJson(), after!.toJson());
}

Future<void> _solve(WidgetTester tester) async {
  for (final move in _solution) {
    await _move(tester, move);
  }
  expect(_board(tester).isCleared, isTrue);
  expect(_next, findsOneWidget);
}

void main() {
  setUpAll(() async {
    await L.load('ru');
    _levels = CakeLevelSet.fromJsonString(
      await rootBundle.loadString('assets/levels/cake_sort.json'),
    );
    final data = jsonDecode(
      await rootBundle.loadString('assets/levels/cake_solutions.json'),
    ) as Map<String, dynamic>;
    final flat = ((data['moves'] as Map<String, dynamic>)['1'] as List)
        .cast<int>();
    _solution = [
      for (var i = 0; i < flat.length; i += 3)
        (from: flat[i], type: flat[i + 1], to: flat[i + 2]),
    ];
  });
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    GamePreset.clear();
  });
  tearDown(() {
    SessionReport.sink = null;
    LevelLadder.onOutcome = null;
    GamePreset.clear();
  });

  for (final alias in [
    (CakeSkin.cake, 'cake_sort'),
    (CakeSkin.pizza, 'pizza_sort'),
  ]) {
    final (skin, gameId) = alias;
    for (final delay in ['storage', 'sink']) {
      for (final action in ['manual', 'timer', 'restart', 'undo', 'dispose']) {
        testWidgets(
          '$gameId $delay: $action owns exactly one outcome and board',
          (tester) async {
            final state = _DelayedState(
              await SharedPreferences.getInstance(),
              gameId,
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
            await _boot(
              tester,
              CakeSortScreen(
                state: state,
                gameId: gameId,
                title: gameId,
                skin: skin,
              ),
              CakeTable,
            );
            expect(
              _board(tester).toJson(),
              _levels.byLevel(1).freshBoard().toJson(),
            );
            await _solve(tester);
            final completed = _board(tester);
            if (action == 'timer') {
              await tester.pump(const Duration(milliseconds: 1400));
            }
            await tester.tap(_next);
            await tester.pump();
            if (action == 'manual' ||
                action == 'timer' ||
                action == 'dispose') {
              await tester.tap(_next);
              await tester.pump(const Duration(milliseconds: 1400));
            }
            expect(
              state.levelWrites,
              1,
              reason:
                  'timer and repeated Next must claim before storage awaits',
            );
            expect(reports, hasLength(delay == 'storage' ? 0 : 1));
            expect(outcomes, isEmpty);
            expect(
              identical(_board(tester), completed),
              isTrue,
              reason: 'no new board before save completes',
            );

            CakeBoard? retained;
            if (action == 'restart') {
              await tester.tap(find.bySemanticsLabel(L.t('restart')).first);
              await tester.pump();
              expect(
                _board(tester).toJson(),
                _levels.byLevel(1).freshBoard().toJson(),
              );
              await _move(tester, _solution.first);
              retained = _board(tester);
            } else if (action == 'undo') {
              await tester.tap(find.bySemanticsLabel(L.t('btn_undo')).first);
              await tester.pump();
              retained = _board(tester);
              expect(retained.isCleared, isFalse);
            } else if (action == 'dispose') {
              await tester.pumpWidget(const SizedBox.shrink());
            }
            gate.complete();
            await tester.pumpAndSettle();
            expect(reports, hasLength(1));
            expect(reports.single['game_type'], gameId);
            expect(outcomes, [true]);
            expect(
              state.get(SharedState.levelKey(gameId, state.activeProfile)),
              '2',
            );
            final other = gameId == 'cake_sort' ? 'pizza_sort' : 'cake_sort';
            expect(
              state.get(SharedState.levelKey(other, state.activeProfile)),
              isNull,
            );

            if (action == 'dispose') {
              expect(find.byType(CakeTable), findsNothing);
            } else if (retained != null) {
              expect(
                identical(_board(tester), retained),
                isTrue,
                reason: 'old completion must not replace Restart or Undo',
              );
              if (action == 'undo') {
                await _move(tester, _solution.last);
              } else {
                for (final move in _solution.skip(1)) {
                  await _move(tester, move);
                }
              }
              await tester.tap(_next);
              await tester.pumpAndSettle();
              final count = action == 'restart' ? 2 : 1;
              expect(
                reports,
                hasLength(count),
                reason: 'only explicit Restart begins a new attempt',
              );
              expect(outcomes, List.filled(count, true));
              expect(state.levelWrites, count);
              expect(
                _board(tester).toJson(),
                _levels.byLevel(count + 1).freshBoard().toJson(),
              );
            } else {
              expect(
                _board(tester).toJson(),
                _levels.byLevel(2).freshBoard().toJson(),
              );
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
          },
        );
      }
    }

    for (final review in ['restart', 'undo']) {
      testWidgets(
        '$gameId sink: $review finishes again before old save returns',
        (tester) async {
          final state = _DelayedState(
            await SharedPreferences.getInstance(),
            gameId,
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
          await _boot(
            tester,
            CakeSortScreen(
              state: state,
              gameId: gameId,
              title: gameId,
              skin: skin,
            ),
            CakeTable,
          );
          await _solve(tester);
          await tester.tap(_next);
          await tester.pump();
          expect(reports, hasLength(1));

          await tester.tap(
            find
                .bySemanticsLabel(
                  L.t(review == 'restart' ? 'restart' : 'btn_undo'),
                )
                .first,
          );
          await tester.pump();
          if (review == 'restart') {
            await _solve(tester);
          } else {
            await _move(tester, _solution.last);
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
              reason:
                  'old won generation must not replace the newly won attempt',
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
          expect(
            _board(tester).toJson(),
            _levels.byLevel(count + 1).freshBoard().toJson(),
          );
          final advanced = _board(tester);
          await tester.pump(const Duration(milliseconds: 2800));
          expect(identical(_board(tester), advanced), isTrue);
          expect(_next, findsNothing);
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox.shrink());
        },
      );
    }

    for (final launch in ['wu', 'transit']) {
      testWidgets(
        '$gameId $launch: delayed timer/manual outcome advances no personal level',
        (tester) async {
          if (launch == 'wu') GamePreset.set({'wu': '1', 'mode': 'mix'});
          if (launch == 'transit') {
            GamePreset.set({
              'ladderGame': 'sudoku',
              'ladderLevel': '77',
              'lvl': '1',
            });
          }
          final state = _DelayedState(
            await SharedPreferences.getInstance(),
            gameId,
          );
          final gate = Completer<void>();
          final reports = <Map<String, dynamic>>[];
          final outcomes = <bool>[];
          SessionReport.sink = (body) async {
            reports.add(jsonDecode(body) as Map<String, dynamic>);
            await gate.future;
          };
          LevelLadder.onOutcome = (passed, lesson) => outcomes.add(passed);
          await _boot(
            tester,
            CakeSortScreen(
              state: state,
              gameId: gameId,
              title: gameId,
              skin: skin,
            ),
            CakeTable,
          );
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
          expect(reports.single['game_type'], gameId);
          if (launch == 'wu') expect(reports.single['mode'], 'mix');
          if (launch == 'transit') {
            expect(reports.single['details']['ladderGame'], 'sudoku');
          }
          expect(state.levelWrites, 0);
          expect(
            _board(tester).toJson(),
            _levels.byLevel(1).freshBoard().toJson(),
          );
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
}
