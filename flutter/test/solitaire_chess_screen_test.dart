import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/solitaire_chess/ladder.dart';
import 'package:psygames_flutter/games/solitaire_chess/lesson.dart';
import 'package:psygames_flutter/games/solitaire_chess/puzzle.dart';
import 'package:psygames_flutter/games/solitaire_chess/screen.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/game_clock_fake.dart';

/// ЭКРАН «ШАХМАТНОГО ПАСЬЯНСА» — ПАРТИЯ КАСАНИЯМИ.
///
/// Корпус с диска, часы поддельные, подход повторимый: проба знает, какие доски
/// придут, и решает их касаниями клеток — как человек.
void main() {
  final corpus = SolitaireCorpus.parse(
    File('assets/solitaire_chess/puzzles.json').readAsStringSync(),
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
    int seed = 5,
    bool gameClock = false,
  }) async {
    useFakeGameClock(tester);
    tester.view.physicalSize = size * 2;
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    final state = await SharedState.open();
    await tester.pumpWidget(
      MaterialApp(
        home: SolitaireChessScreen(
          state: state,
          corpus: corpus,
          // gameClock: часы партии — игровые (как в приложении), их двигает pump.
          clock: gameClock ? null : () => clock,
          seed: seed,
        ),
      ),
    );
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  Future<void> wait(WidgetTester tester, int ms) async {
    clock += ms;
    await tester.pump(const Duration(milliseconds: 250));
  }

  String text(WidgetTester tester, String key) =>
      tester.widget<Text>(find.byKey(Key(key))).data ?? '';

  Future<void> tapSq(WidgetTester tester, int sq) async {
    await tester.tap(find.byKey(Key('sol-$sq')));
    await tester.pump();
  }

  Future<void> solve(WidgetTester tester, SolitaireBoard b) async {
    for (final (f, t) in solitaireSolution(b)) {
      await tapSq(tester, f);
      await tapSq(tester, t);
    }
  }

  testWidgets('первая ступень: пять досок решены касаниями — ступень выше', (
    tester,
  ) async {
    await open(tester);
    expect(text(tester, 'sol-pieces'), L.f('solPieces', {'n': '3'}));
    await tester.tap(find.byKey(const Key('sol-start')));
    await tester.pump();
    final deck = solitaireDeckFor(corpus, 1, seed: 5);
    for (final p in deck) {
      expect(text(tester, 'sol-rule'), L.t('solRule'));
      await solve(tester, p.board);
      expect(text(tester, 'sol-verdict'), '✓', reason: p.code);
      await wait(tester, 1000);
    }
    await wait(tester, 300);
    expect(text(tester, 'sol-solved'), '${L.t('hud_correct')}: 5/5');
    expect(text(tester, 'sol-clean'), L.f('solClean', {'n': '5'}));
    expect(
      find.textContaining('${L.t('label_level_short')} 2'),
      findsOneWidget,
    );
  });

  testWidgets('тупик: доска говорит «тупик», «Заново» возвращает расстановку', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      'psygames_solitaire_chess_level_nzt48': '13',
    });
    await open(tester);
    await tester.tap(find.byKey(const Key('sol-start')));
    await tester.pump();
    final p = solitaireDeckFor(corpus, 13, seed: 5).first;
    var b = p.board;
    // Брать «не то», пока не упрёмся.
    while (!b.stuck) {
      final safe = solitaireSafeCaptures(b).toSet();
      final bad = b.captures.where((m) => !safe.contains(m)).toList();
      final m = bad.isNotEmpty ? bad.first : b.captures.first;
      await tapSq(tester, m.$1);
      await tapSq(tester, m.$2);
      b = b.play(m.$1, m.$2);
    }
    expect(text(tester, 'sol-verdict'), L.t('solStuck'));
    expect(find.byKey(const Key('sol-restart')), findsOneWidget);
    await tester.tap(find.byKey(const Key('sol-restart')));
    await tester.pump();
    expect(text(tester, 'sol-verdict'), ' ');
    await solve(tester, p.board);
    expect(text(tester, 'sol-verdict'), '✓');
  });

  testWidgets(
    'подсказка — только с половины времени, подсвечивает начало решения',
    (tester) async {
      await open(tester);
      await tester.tap(find.byKey(const Key('sol-start')));
      await tester.pump();
      expect(find.byKey(const Key('sol-hint')), findsNothing);
      await wait(tester, solitaireSeconds * 500 + 100);
      expect(find.byKey(const Key('sol-hint')), findsOneWidget);
      await tester.tap(find.byKey(const Key('sol-hint')));
      await tester.pump();
      expect(find.byKey(const Key('sol-hint-used')), findsOneWidget);
    },
  );

  testWidgets('часы стоят, пока открыт разбор поверх партии', (tester) async {
    await open(tester, gameClock: true);
    await tester.tap(find.byKey(const Key('sol-start')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(
      find.byType(LessonPlayerScreen),
      findsOneWidget,
      reason: 'разбор открыт',
    );
    for (var i = 0; i < solitaireSeconds * 2; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    Navigator.of(
      tester.element(find.byType(SolitaireChessScreen, skipOffstage: false)),
    ).pop();
    for (var i = 0; i < 20 && isGameHeld(); i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(isGameHeld(), isFalse, reason: 'разбор закрыт — пауза снята');
    await tester.pump(const Duration(milliseconds: 300));
    expect(
      text(tester, 'sol-verdict'),
      ' ',
      reason: 'три минуты в разборе — не «время вышло»',
    );
  });

  testWidgets('разбор до партии: доски подхода, каждый шаг с приёмом', (
    tester,
  ) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(LessonPlayerScreen), findsOneWidget);
    expect(LessonUsed.inRound, isTrue);
    final steps = solitaireLessonForLevel(corpus, 1, seed: 131);
    expect(
      steps.every((s) => solitaireLessonKeys.contains(s.techniqueKey)),
      isTrue,
    );
  });

  for (final size in const [Size(320, 568), Size(390, 844)]) {
    testWidgets(
      '${size.width.toInt()}×${size.height.toInt()}: партия без переполнения, клетка не мельче 56',
      (tester) async {
        await open(tester, size: size);
        await tester.tap(find.byKey(const Key('sol-start')));
        await tester.pump();
        expect(tester.takeException(), isNull);
        final cell = tester.getSize(find.byKey(const Key('sol-0')));
        expect(
          cell.width,
          greaterThanOrEqualTo(56),
          reason: 'клетка ${cell.width}',
        );
      },
    );
  }
}
