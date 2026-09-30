import 'dart:io';

import 'package:bishop/bishop.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/find_move/corpus.dart';
import 'package:psygames_flutter/games/find_move/ladder.dart';
import 'package:psygames_flutter/games/find_move/lesson.dart';
import 'package:psygames_flutter/games/find_move/screen.dart';
import 'package:psygames_flutter/games/scholars_mate/screen.dart'
    show scholarsSquareIndex;
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ЭКРАН «НАЙДИ ХОД» — ПАРТИЯ КАСАНИЯМИ.
///
/// Корпус с диска, часы поддельные, подход повторимый: проба знает, какие
/// задачи придут, и решает их касаниями клеток — как человек.
void main() {
  final corpus = FindMoveCorpus.parse(
    File('assets/find_move/puzzles.json').readAsStringSync(),
  );
  var clock = 0;

  setUp(() async {
    await L.load('ru');
    SharedPreferences.setMockInitialValues({});
    clock = 0;
    LessonUsed.reset();
  });

  Future<SharedState> open(
    WidgetTester tester, {
    Size size = const Size(390, 844),
    int seed = 5,
  }) async {
    tester.view.physicalSize = size * 2;
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    final state = await SharedState.open();
    await tester.pumpWidget(
      MaterialApp(
        home: FindMoveScreen(
          state: state,
          corpus: corpus,
          clock: () => clock,
          seed: seed,
        ),
      ),
    );
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    return state;
  }

  Future<void> wait(WidgetTester tester, int ms) async {
    clock += ms;
    await tester.pump(const Duration(milliseconds: 250));
  }

  String text(WidgetTester tester, String key) =>
      tester.widget<Text>(find.byKey(Key(key))).data ?? '';

  /// Сыграть ход касаниями доски; превращение — кнопкой фигуры.
  Future<void> play(WidgetTester tester, String uci, bool whiteBottom) async {
    for (final sq in [uci.substring(0, 2), uci.substring(2, 4)]) {
      await tester.tap(
        find.byKey(
          Key('fm-${scholarsSquareIndex(sq, whiteBottom: whiteBottom)}'),
        ),
      );
      await tester.pump();
    }
    if (uci.length > 4) {
      await tester.tap(find.byKey(Key('fm-promote-${uci.substring(4)}')));
      await tester.pump();
    }
  }

  testWidgets(
    'первая ступень: приёмы названы, пять задач решены касаниями — ступень выше',
    (tester) async {
      await open(tester);
      expect(text(tester, 'fm-themes'), contains(L.t('fmHangingPiece')));
      await tester.tap(find.byKey(const Key('fm-start')));
      await tester.pump();
      final deck = findMoveDeckFor(corpus, 1, seed: 5);
      for (final p in deck) {
        // На первой ступени приём назван над доской.
        expect(text(tester, 'fm-question'), L.t(findMoveThemeKeys[p.theme]));
        final white = findMovePosition(p, 0).fen.split(' ')[1] == 'w';
        for (var m = 0; m < p.playerMoves; m++) {
          await play(tester, p.line[m * 2], white);
        }
        expect(text(tester, 'fm-verdict'), startsWith('✓'), reason: p.id);
        await wait(tester, 1000);
      }
      await wait(tester, 300);
      expect(text(tester, 'fm-solved'), '${L.t('hud_correct')}: 5/5');
      expect(
        find.textContaining('${L.t('label_level_short')} 2'),
        findsOneWidget,
      );
    },
  );

  testWidgets('ошибка показывает верный ход и приём; ход соперника обведён', (
    tester,
  ) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('fm-start')));
    await tester.pump();
    final p = findMoveDeckFor(corpus, 1, seed: 5).first;
    final g = findMovePosition(p, 0);
    final white = g.fen.split(' ')[1] == 'w';
    // Любой законный ход, кроме записанного.
    final wrong = g
        .generateLegalMoves()
        .map((m) => g.toAlgebraic(m))
        .firstWhere((u) => u.substring(0, 4) != p.line.first.substring(0, 4));
    await play(tester, wrong, white);
    expect(text(tester, 'fm-verdict'), startsWith('✕'));
    expect(
      text(tester, 'fm-verdict'),
      contains(L.t(findMoveThemeKeys[p.theme])),
    );
  });

  testWidgets(
    'ступень 4: приём не назван — «найдите выигрыш», и итог его называет',
    (tester) async {
      SharedPreferences.setMockInitialValues({
        'psygames_find_move_level_nzt48': '4',
      });
      await open(tester);
      await tester.tap(find.byKey(const Key('fm-start')));
      await tester.pump();
      expect(text(tester, 'fm-question'), L.t('findMoveSeek'));
      final p = findMoveDeckFor(corpus, 4, seed: 5).first;
      final white = findMovePosition(p, 0).fen.split(' ')[1] == 'w';
      for (var m = 0; m < p.playerMoves; m++) {
        await play(tester, p.line[m * 2], white);
      }
      expect(
        text(tester, 'fm-verdict'),
        '✓ ${L.t(findMoveThemeKeys[p.theme])}',
      );
    },
  );

  testWidgets('подсказка — только с половины времени', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('fm-start')));
    await tester.pump();
    expect(find.byKey(const Key('fm-hint')), findsNothing);
    await wait(tester, findMoveSeconds * 500 + 100);
    expect(find.byKey(const Key('fm-hint')), findsOneWidget);
    await tester.tap(find.byKey(const Key('fm-hint')));
    await tester.pump();
    expect(find.byKey(const Key('fm-hint-used')), findsOneWidget);
  });

  testWidgets('часы стоят, пока открыт разбор поверх партии', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('fm-start')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await wait(tester, findMoveSeconds * 2000);
    expect(
      find.byType(LessonPlayerScreen),
      findsOneWidget,
      reason: 'разбор открыт',
    );
    Navigator.of(
      tester.element(find.byType(FindMoveScreen, skipOffstage: false)),
    ).pop();
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await wait(tester, 100);
    expect(
      text(tester, 'fm-verdict'),
      ' ',
      reason: 'две минуты в разборе — не промах по времени',
    );
  });

  testWidgets(
    'разбор до партии: каждый шаг назван приёмом, ходы — из записи задачи',
    (tester) async {
      for (var level = 1; level <= findMoveLevels; level += 5) {
        final deck = findMoveDeckFor(corpus, level, seed: level * 131);
        final steps = findMoveLessonFromDeck(deck);
        expect(steps, isNotEmpty);
        for (final s in steps) {
          final key = s.techniqueKey!;
          expect(
            findMoveTeachKeys.contains(key) || findMoveLessonKeys.contains(key),
            isTrue,
            reason: 'ступень $level: шаг без имени приёма ($key)',
          );
          expect(
            s.text,
            isNot(contains('{')),
            reason: 'подстановка не сработала: ${s.text}',
          );
        }
        // Первый ход разбора — первый ход записи задачи.
        final first = deck.first;
        final move = steps.firstWhere((s) => s.techniqueKey == 'teachFmMove');
        final frame = move.payload as FindMoveLessonFrame;
        expect('${frame.from}${frame.to}', first.line.first.substring(0, 4));
      }
    },
  );

  for (final size in const [Size(320, 568), Size(390, 844)]) {
    testWidgets(
      '${size.width.toInt()}×${size.height.toInt()}: партия без переполнения, доска не мельче 260',
      (tester) async {
        await open(tester, size: size);
        await tester.tap(find.byKey(const Key('fm-start')));
        await tester.pump();
        expect(tester.takeException(), isNull);
        final board = tester.getSize(find.byKey(const Key('fm-0')));
        expect(
          board.width * 8,
          greaterThanOrEqualTo(260),
          reason: 'клетка ${board.width}',
        );
      },
    );
  }
}
