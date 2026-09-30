import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/chess_blind/game.dart';
import 'package:psygames_flutter/games/chess_blind/lesson.dart';
import 'package:psygames_flutter/games/chess_blind/positions.dart';
import 'package:psygames_flutter/games/chess_blind/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// РАЗБОР «ДОСКИ В УМЕ» — УЧИТ ЛИ ОН ДЕЛУ (задача 7120f6d8, второй экран).
///
/// Три вопроса: каждый шаг назван приёмом (числом), каждый показанный ход — ход
/// самой партии, и ответ «стоит с показа / пришла ходом N» — правда о позиции,
/// а не догадка. Партии — на всех 25 ступенях, по три зерна.
void main() {
  late PositionCorpus corpus;
  setUpAll(() {
    corpus = PositionCorpus.parse(
      File('assets/chess_blind/positions.json').readAsStringSync(),
    );
  });
  setUp(() async {
    await L.load('ru');
    SharedPreferences.setMockInitialValues({});
    LessonUsed.reset();
  });

  test('🔴 каждый шаг назван приёмом, строка дошла из словаря', () {
    var named = 0;
    var total = 0;
    final raw = <String>[];
    for (var level = 1; level <= 25; level++) {
      for (final seed in [1, 2, 3]) {
        final g = ChessBlindGame.start(
          level: level,
          corpus: corpus,
          random: Random(level * 10 + seed),
        );
        for (final s in chessBlindLessonSteps(g)) {
          total++;
          if (chessBlindLessonKeys.contains(s.techniqueKey)) named++;
          final t = s.text ?? '';
          final bad =
              t.isEmpty ||
              t.contains('{') ||
              t.contains('teach') ||
              t.contains('chessPc');
          if (bad) raw.add(t);
        }
      }
    }
    expect(named, total, reason: 'названо $named из $total');
    expect(raw, isEmpty, reason: raw.take(3).join(' | '));
  });

  test('🔴 ходы разбора — ходы партии; ответы — правда о позиции', () {
    var moved = 0;
    var stayed = 0;
    for (var level = 1; level <= 25; level++) {
      for (final seed in [1, 2, 3]) {
        final g = ChessBlindGame.start(
          level: level,
          corpus: corpus,
          random: Random(level * 10 + seed),
        );
        final steps = chessBlindLessonSteps(g);
        final moves = steps
            .where((s) => s.techniqueKey == 'teachChessBlindMove')
            .toList();
        for (var i = 0; i < moves.length; i++) {
          final f = moves[i].payload as ChessBlindLessonFrame;
          expect(
            (f.from, f.to),
            (g.moves[i].from, g.moves[i].to),
            reason: 'ступень $level: ход ${i + 1}',
          );
        }
        // Последний ход, пришедший на клетку, — по самой цепочке.
        final arrived = <int, int>{};
        for (var i = 0; i < moves.length; i++) {
          arrived.remove(g.moves[i].from);
          arrived[g.moves[i].to] = i + 1;
        }
        for (final s in steps.where(
          (s) =>
              s.techniqueKey!.startsWith('teachChessBlindMoved') ||
              s.techniqueKey == 'teachChessBlindStayed',
        )) {
          final f = s.payload as ChessBlindLessonFrame;
          final answer = lessonAnswer(f)!;
          final truth = g
              .piecesAfter(moves.length)
              .firstWhere((p) => p.sq == f.reveal);
          expect(answer, (
            type: truth.type,
            white: truth.white,
          ), reason: 'ступень $level: на клетке другая фигура');
          if (s.techniqueKey == 'teachChessBlindMoved') {
            moved++;
            expect(
              s.text,
              contains('${arrived[f.reveal]}'),
              reason: 'номер хода не тот',
            );
          } else {
            stayed++;
            expect(
              arrived.containsKey(f.reveal),
              isFalse,
              reason: '«стоит с показа», а на неё приходил ход',
            );
            expect(
              g.start.any((p) => p.sq == f.reveal && p.type == truth.type),
              isTrue,
            );
          }
        }
      }
    }
    expect(moved, greaterThan(0));
    expect(stayed, greaterThan(0));
  });

  testWidgets(
    '🔴 кнопка разбора стоит ДО партии и открывает шаги на доске игры',
    (tester) async {
      tester.view.physicalSize = const Size(780, 1688);
      tester.view.devicePixelRatio = 2;
      addTearDown(tester.view.reset);
      final state = await SharedState.open();
      await tester.pumpWidget(
        MaterialApp(
          home: ChessBlindScreen(state: state, corpus: corpus, clock: () => 0),
        ),
      );
      for (var i = 0; i < 4; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      expect(
        find.byKey(const Key('cb-start')),
        findsOneWidget,
        reason: 'партия не начата',
      );
      await tester.tap(find.byKey(const Key('game-lesson')));
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(find.byType(LessonPlayerScreen), findsOneWidget);
      expect(LessonUsed.inRound, isTrue);
      expect(
        find.byKey(const Key('cbl-sq-0')),
        findsOneWidget,
        reason: 'доска игры в разборе',
      );
      await tester.tap(find.byKey(const Key('lesson-close')));
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(find.byKey(const Key('cb-start')), findsOneWidget);
    },
  );
}
