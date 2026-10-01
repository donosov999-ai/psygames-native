import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/draughts_combo/game.dart';
import 'package:psygames_flutter/games/draughts_combo/ladder.dart';
import 'package:psygames_flutter/games/draughts_combo/screen.dart';
import 'package:psygames_flutter/games/draughts_combo/solver.dart';
import 'package:psygames_flutter/games/draughts_common/rules.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/game_clock_fake.dart';

/// ЭКРАН «ШАШЕК: КОМБИНАЦИЙ» — ПАРТИЯ КАСАНИЯМИ.
///
/// Корпус с диска, часы поддельные, подход повторимый: проба знает задачи и
/// решает их касаниями клеток — выбирая ход, после которого выигрыш ещё вынужден
/// (тем же решателем, что засчитывает игра).
void main() {
  final corpus = ComboCorpus.parse(
    File('assets/draughts_combo/puzzles.json').readAsStringSync(),
  );
  var clock = 0;

  setUp(() async {
    await L.load('ru');
    SharedPreferences.setMockInitialValues({});
    clock = 0;
    LessonUsed.reset();
  });

  Future<void> open(
    WidgetTester tester, {
    Size size = const Size(390, 844),
    bool gameClock = false,
  }) async {
    useFakeGameClock(tester);
    tester.view.physicalSize = size * 2;
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    final state = await SharedState.open();
    await tester.pumpWidget(
      MaterialApp(
        home: DraughtsComboScreen(
          state: state,
          corpus: corpus,
          clock: gameClock ? null : () => clock,
          seed: 5,
        ),
      ),
    );
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  String text(WidgetTester tester, String key) =>
      tester.widget<Text>(find.byKey(Key(key))).data ?? '';

  Future<void> tapCell(WidgetTester tester, int cell) async {
    await tester.tap(find.byKey(Key('dr-$cell')));
    await tester.pump();
  }

  /// Решить текущую задачу касаниями: ход, после которого выигрыш ещё вынужден.
  Future<void> solve(WidgetTester tester, ComboPuzzle p, DraughtsPosition Function() pos, int Function() made) async {
    final base = comboScore(p.position);
    for (var guard = 0; guard < 30; guard++) {
      if (text(tester, 'dr-verdict') == '✓') return;
      if (pos().turn != 1) {
        clock += ComboRun.replyMs + 20;
        await tester.pump(const Duration(milliseconds: 150));
        continue;
      }
      final solver = ComboSolver();
      final tail = made() >= p.whiteMoves;
      final left = (p.whiteMoves - made() - 1).clamp(0, 9);
      final m = draughtsLegalMoves(pos()).firstWhere((m) {
        final after = draughtsApply(pos(), m);
        return (tail ? solver.tail(after) : solver.value(after, left)) - base >= p.gain;
      });
      await tapCell(tester, m.from);
      await tapCell(tester, m.to);
    }
  }

  testWidgets('ступень 1: пять задач решены касаниями — ступень выше', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('dr-start')));
    await tester.pump();
    final state = tester.state(find.byType(DraughtsComboScreen)) as dynamic;
    final deck = comboDeckFor(corpus, 1, seed: 5);
    for (final p in deck) {
      ComboRun run() => state.debugRun as ComboRun;
      await solve(tester, p, () => run().position, () => run().made);
      expect(text(tester, 'dr-verdict'), '✓', reason: p.code);
      clock += 1500;
      await tester.pump(const Duration(milliseconds: 250));
    }
    await tester.pump(const Duration(milliseconds: 250));
    expect(text(tester, 'dr-solved'), '${L.t('hud_correct')}: ${deck.length}/${deck.length}');
    expect(find.textContaining('${L.t('label_level_short')} 2'), findsOneWidget);
  });

  testWidgets('неверный ключ: «не выигрывает», «Заново» — та же позиция', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('dr-start')));
    await tester.pump();
    final p = comboDeckFor(corpus, 1, seed: 5).first;
    final wrong = draughtsLegalMoves(p.position).firstWhere((m) => m.notation != p.key);
    await tapCell(tester, wrong.from);
    await tapCell(tester, wrong.to);
    expect(text(tester, 'dr-verdict'), L.t('drWrong'));
    await tester.tap(find.byKey(const Key('dr-restart')));
    await tester.pump();
    expect(text(tester, 'dr-verdict'), ' ');
  });

  testWidgets('часы стоят, пока открыт разбор поверх партии', (tester) async {
    await open(tester, gameClock: true);
    await tester.tap(find.byKey(const Key('dr-start')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(LessonPlayerScreen), findsOneWidget);
    for (var i = 0; i < comboSeconds * 2; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    Navigator.of(
      tester.element(find.byType(DraughtsComboScreen, skipOffstage: false)),
    ).pop();
    for (var i = 0; i < 20 && isGameHeld(); i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(isGameHeld(), isFalse);
    await tester.pump(const Duration(milliseconds: 300));
    expect(text(tester, 'dr-verdict'), ' ');
  });

  for (final size in const [Size(320, 568), Size(390, 844)]) {
    testWidgets('${size.width.toInt()}×${size.height.toInt()}: без переполнения, клетка ≥ 32', (tester) async {
      await open(tester, size: size);
      await tester.tap(find.byKey(const Key('dr-start')));
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(tester.getSize(find.byKey(const Key('dr-0'))).width, greaterThanOrEqualTo(32));
    });
  }
}
