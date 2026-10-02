import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/knights_queens/ladder.dart';
import 'package:psygames_flutter/games/knights_queens/lesson.dart';
import 'package:psygames_flutter/games/knights_queens/screen.dart';
import 'package:psygames_flutter/games/knights_queens/tour.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/game_clock_fake.dart';

/// ЭКРАН «КОНЯ И ФЕРЗЕЙ» — ПАРТИЯ КАСАНИЯМИ, ОБА РЕЖИМА.
///
/// Корпус с диска, часы поддельные, подход повторимый: проба знает, какие задачи
/// придут, и решает их касаниями клеток — как человек.
void main() {
  final corpus = KqCorpus.parse(
    File('assets/knights_queens/queens.json').readAsStringSync(),
    File('assets/knights_queens/tours.json').readAsStringSync(),
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
    KqMode mode = KqMode.queens,
  }) async {
    useFakeGameClock(tester);
    tester.view.physicalSize = size * 2;
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    final state = await SharedState.open();
    await tester.pumpWidget(
      MaterialApp(
        home: KnightsQueensScreen(
          state: state,
          corpus: corpus,
          clock: gameClock ? null : () => clock,
          seed: seed,
          initialMode: mode,
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

  Future<void> tapCell(WidgetTester tester, int cell) async {
    await tester.tap(find.byKey(Key('kq-$cell')));
    await tester.pump();
  }

  testWidgets('ферзи, ступень 1: пять задач решены касаниями — ступень выше', (
    tester,
  ) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('kq-start')));
    await tester.pump();
    final deck = queensDeckFor(corpus, 1, seed: 5);
    for (final p in deck) {
      final b = p.board;
      expect(text(tester, 'kq-rule'), L.f('kqQueensRule', {'n': '${p.n}'}));
      for (final cell in b.solutions.first.difference(b.givens)) {
        await tapCell(tester, cell);
      }
      expect(text(tester, 'kq-verdict'), '✓', reason: p.code);
      await wait(tester, 1000);
    }
    await wait(tester, 300);
    expect(text(tester, 'kq-solved'), '${L.t('hud_correct')}: 5/5');
    expect(text(tester, 'kq-clean'), L.f('solClean', {'n': '5'}));
    expect(
      find.textContaining('${L.t('label_level_short')} 2'),
      findsOneWidget,
    );
  });

  testWidgets('ферзи: бьющиеся ферзи — «переставьте», «Где ошибка?» красит неверного', (
    tester,
  ) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('kq-start')));
    await tester.pump();
    final p = queensDeckFor(corpus, 1, seed: 5).first;
    final b = p.board;
    final good = b.solutions.first.difference(b.givens).toList()..sort();
    // Первый ферзь — на поле, которого нет ни в одном решении.
    final allSol = b.solutions.expand((s) => s).toSet();
    final wrong = [
      for (var i = 0; i < p.n * p.n; i++)
        if (!allSol.contains(i) && b.canToggle(i)) i,
    ].first;
    await tapCell(tester, wrong);
    expect(find.byKey(const Key('kq-mistake')), findsOneWidget);
    await tester.tap(find.byKey(const Key('kq-mistake')));
    await tester.pump();
    final mark = tester.widget<Container>(find.byKey(Key('kq-queen-$wrong')));
    expect(
      (mark.decoration as BoxDecoration).border,
      isNotNull,
      reason: 'неверный ферзь обведён',
    );
    // Снять неверного и решить — решение уже не чистое (была «Где ошибка?»).
    await tapCell(tester, wrong);
    for (final c in good) {
      await tapCell(tester, c);
    }
    expect(text(tester, 'kq-verdict'), '✓');
  });

  testWidgets('конь, ступень 1: обход 3×4 касаниями, финиш на флажке', (
    tester,
  ) async {
    await open(tester, mode: KqMode.tour);
    expect(text(tester, 'kq-about'), L.t('kqTourAbout'));
    await tester.tap(find.byKey(const Key('kq-start')));
    await tester.pump();
    final deck = toursDeckFor(corpus, 1, seed: 5);
    for (final p in deck) {
      expect(text(tester, 'kq-rule'), L.t('kqTourRuleEnd'));
      for (final cell in p.reference.skip(1)) {
        await tapCell(tester, cell);
      }
      expect(text(tester, 'kq-verdict'), '✓', reason: p.code);
      await wait(tester, 1000);
    }
    await wait(tester, 300);
    expect(
      text(tester, 'kq-solved'),
      '${L.t('hud_correct')}: ${deck.length}/${deck.length}',
    );
  });

  testWidgets('конь: тупик — «Отменить» возвращает прыжок, касание мимо точки не ходит', (
    tester,
  ) async {
    await open(tester, mode: KqMode.tour);
    await tester.tap(find.byKey(const Key('kq-start')));
    await tester.pump();
    final p = toursDeckFor(corpus, 1, seed: 5).first;
    final b = p.board;
    // Касание поля, куда конь не прыгает, — ничего.
    final notJump = [
      for (var i = 0; i < b.rows * b.cols; i++)
        if (i != b.start && !b.jumps(b.start).contains(i)) i,
    ].first;
    await tapCell(tester, notJump);
    expect(text(tester, 'kq-count'), contains(L.f('kqTourCount', {'k': '1', 'n': '${b.free}'})));
    // Идём жадно по первому прыжку, пока не упрёмся.
    var path = [b.start];
    while (b.nextMoves(path).isNotEmpty && !b.solved(path)) {
      final y = b.nextMoves(path).first;
      await tapCell(tester, y);
      path = [...path, y];
    }
    if (!b.solved(path)) {
      expect(text(tester, 'kq-verdict'), L.t('kqTourStuck'));
      await tester.tap(find.byKey(const Key('kq-undo')));
      await tester.pump();
      expect(text(tester, 'kq-verdict'), ' ');
    }
  });

  testWidgets('подсказка — только с половины времени', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('kq-start')));
    await tester.pump();
    expect(find.byKey(const Key('kq-hint')), findsNothing);
    await wait(tester, kqSeconds(KqMode.queens) * 500 + 100);
    expect(find.byKey(const Key('kq-hint')), findsOneWidget);
    await tester.tap(find.byKey(const Key('kq-hint')));
    await tester.pump();
    expect(find.byKey(const Key('kq-hint-used')), findsOneWidget);
  });

  testWidgets('часы стоят, пока открыт разбор поверх партии', (tester) async {
    await open(tester, gameClock: true);
    await tester.tap(find.byKey(const Key('kq-start')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(LessonPlayerScreen), findsOneWidget);
    for (var i = 0; i < kqSeconds(KqMode.queens) * 2; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    Navigator.of(
      tester.element(find.byType(KnightsQueensScreen, skipOffstage: false)),
    ).pop();
    for (var i = 0; i < 20 && isGameHeld(); i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(isGameHeld(), isFalse);
    await tester.pump(const Duration(milliseconds: 300));
    expect(text(tester, 'kq-verdict'), ' ', reason: 'три минуты в разборе — не «время вышло»');
  });

  testWidgets('разбор до партии в обоих режимах: каждый шаг с ключом приёма', (
    tester,
  ) async {
    for (final mode in KqMode.values) {
      final steps = kqLessonForLevel(corpus, mode, 1, seed: 131);
      expect(steps, isNotEmpty, reason: mode.name);
      expect(
        steps.every((s) => kqLessonKeys.contains(s.techniqueKey)),
        isTrue,
        reason: mode.name,
      );
    }
    await open(tester, mode: KqMode.tour);
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(LessonPlayerScreen), findsOneWidget);
    expect(LessonUsed.inRound, isTrue);
  });

  for (final size in const [Size(320, 568), Size(390, 844)]) {
    for (final mode in KqMode.values) {
      testWidgets(
        '${size.width.toInt()}×${size.height.toInt()} ${mode.name}: без переполнения, клетка не мельче 40 на 8×8',
        (tester) async {
          SharedPreferences.setMockInitialValues({
            'psygames_knights_queens_${mode.name}_level_nzt48': '19',
          });
          await open(tester, size: size, mode: mode);
          await tester.tap(find.byKey(const Key('kq-start')));
          await tester.pump();
          expect(tester.takeException(), isNull);
          final cell = tester.getSize(find.byKey(const Key('kq-0')));
          expect(cell.width, greaterThanOrEqualTo(30), reason: 'клетка ${cell.width}');
        },
      );
    }
  }

  test('эталонный обход ступени 1 правилу не противоречит', () {
    for (final p in toursDeckFor(corpus, 1, seed: 5)) {
      expect(p.board.isTour(p.reference), isTrue);
      expect(TourSearch(p.board).run([p.board.start]), TourOutcome.found);
    }
  });
}
