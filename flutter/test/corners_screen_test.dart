import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/corners/game.dart';
import 'package:psygames_flutter/games/corners/ladder.dart';
import 'package:psygames_flutter/games/corners/rules.dart';
import 'package:psygames_flutter/games/corners/screen.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/game_clock_fake.dart';

/// ЭКРАН «УГОЛКОВ» — ПАРТИЯ КАСАНИЯМИ (задача 30b5a5aa).
///
/// Корпус с диска, часы поддельные, подход повторимый: проба решает задачи
/// касаниями клеток по линии решателя генератора.
void main() {
  final corpus = CornersCorpus.parse(
    File('assets/corners/puzzles.json').readAsStringSync(),
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
    int level = 1,
  }) async {
    useFakeGameClock(tester);
    tester.view.physicalSize = size * 2;
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    final state = await SharedState.open();
    if (level > 1) await state.set('psygames_corners_level_nzt48', '$level');
    await tester.pumpWidget(
      MaterialApp(
        home: CornersScreen(
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
    await tester.tap(find.byKey(Key('cn-$cell')));
    await tester.pump();
  }

  CornersRun run(WidgetTester tester) =>
      (tester.state(find.byType(CornersScreen)) as dynamic).debugRun
          as CornersRun;

  testWidgets('ступень 1: пять задач решены касаниями — ступень выше', (
    tester,
  ) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('cn-start')));
    await tester.pump();
    final deck = cornersDeckFor(corpus, 1, seed: 5);
    expect(deck.length, cornersDeck);
    for (final p in deck) {
      expect(run(tester).puzzle.id, p.id);
      expect(text(tester, 'cn-rule'), L.f('cnRule', {'n': '${p.minimum + 2}'}));
      for (final (from, to) in p.line) {
        await tapCell(tester, from);
        await tapCell(tester, to);
      }
      expect(text(tester, 'cn-verdict'), '✓', reason: 'задача ${p.id}');
      clock += 1500;
      await tester.pump(const Duration(milliseconds: 250));
    }
    await tester.pump(const Duration(milliseconds: 250));
    expect(
      text(tester, 'cn-solved'),
      '${L.t('hud_correct')}: ${deck.length}/${deck.length}',
    );
    expect(
      find.textContaining('${L.t('label_level_short')} 2'),
      findsOneWidget,
    );
  });

  for (final size in const [Size(320, 568), Size(390, 844)]) {
    testWidgets(
      '🔴 ${size.width.toInt()}×${size.height.toInt()} ступень «ровно минимум»: лишний ход — «ходы кончились», «Где ошибка?» — ход 1',
      (tester) async {
        await open(tester, level: 3, size: size);
        await tester.tap(find.byKey(const Key('cn-start')));
        await tester.pump();
        final r = run(tester);
        final p = r.puzzle;
        expect(r.limit, p.minimum);
        // Первый ход, после которого за минимум−1 не успеть.
        final bad = p.board
            .moves(p.startMask)
            .firstWhere(
              (m) =>
                  CornersSearch(p.board).reachable(
                    CornersBoard.apply(p.startMask, m),
                    p.minimum - 1,
                  ) ==
                  CornersVerdict.no,
            );
        await tapCell(tester, bad.$1);
        await tapCell(tester, bad.$2);
        while (r.verdict == null) {
          final m = p.board.moves(r.pieces).first;
          await tapCell(tester, m.$1);
          await tapCell(tester, m.$2);
        }
        expect(text(tester, 'cn-verdict'), L.t('cnOut'));
        await tester.tap(find.byKey(const Key('cn-where')));
        await tester.pump();
        expect(text(tester, 'cn-verdict'), L.f('cnMistake', {'n': '1'}));
        expect(
          tester.takeException(),
          isNull,
          reason: 'четыре кнопки и длинная надпись помещаются',
        );
        await tester.tap(find.byKey(const Key('cn-restart')));
        await tester.pump();
        expect(text(tester, 'cn-verdict'), ' ');
        expect(r.history, isEmpty);
      },
    );
  }

  testWidgets('часы стоят, пока открыт разбор поверх партии', (tester) async {
    await open(tester, gameClock: true);
    await tester.tap(find.byKey(const Key('cn-start')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(LessonPlayerScreen), findsOneWidget);
    for (var i = 0; i < cornersSeconds * 2; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    Navigator.of(
      tester.element(find.byType(CornersScreen, skipOffstage: false)),
    ).pop();
    for (var i = 0; i < 20 && isGameHeld(); i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(isGameHeld(), isFalse);
    await tester.pump(const Duration(milliseconds: 300));
    expect(text(tester, 'cn-verdict'), ' ');
  });

  for (final size in const [Size(320, 568), Size(390, 844)]) {
    // Ступень 16 — доска 7×7, самая мелкая клетка корпуса.
    testWidgets(
      '${size.width.toInt()}×${size.height.toInt()}: 7×7 без переполнения, клетка ≥ 32',
      (tester) async {
        await open(tester, size: size, level: 16);
        await tester.tap(find.byKey(const Key('cn-start')));
        await tester.pump();
        expect(run(tester).puzzle.size, 7);
        expect(tester.takeException(), isNull);
        expect(
          tester.getSize(find.byKey(const Key('cn-0'))).width,
          greaterThanOrEqualTo(32),
        );
      },
    );
  }
}
