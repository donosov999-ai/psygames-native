import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/go_capture/game.dart';
import 'package:psygames_flutter/games/go_capture/ladder.dart';
import 'package:psygames_flutter/games/go_capture/lesson.dart';
import 'package:psygames_flutter/games/go_capture/rules.dart';
import 'package:psygames_flutter/games/go_capture/screen.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/game_clock_fake.dart';

/// ЭКРАН «ГО: ЗАХВАТ» — ЗАДАЧИ КАСАНИЯМИ (задача 66dee70c).
///
/// Корпус с диска, часы поддельные, подход повторимый: проба ставит камни касаниями
/// пунктов по линии решателя, белые отвечают сами.
void main() {
  final corpus = GoCaptureCorpus.parse(
    File('assets/go_capture/puzzles.json').readAsStringSync(),
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
    if (level > 1) await state.set('psygames_go-capture_level_nzt48', '$level');
    await tester.pumpWidget(
      MaterialApp(
        home: GoCaptureScreen(
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

  Future<void> tapPoint(WidgetTester tester, int p) async {
    await tester.tap(find.byKey(Key('gc-$p')));
    await tester.pump();
  }

  GoCaptureRun run(WidgetTester tester) =>
      (tester.state(find.byType(GoCaptureScreen)) as dynamic).debugRun
          as GoCaptureRun;

  testWidgets('ступень 1: пять задач решены касаниями — ступень выше', (
    tester,
  ) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('gc-start')));
    await tester.pump();
    final deck = goCaptureDeckFor(corpus, 1, seed: 5);
    expect(deck.length, goCaptureDeck);
    for (final p in deck) {
      expect(run(tester).puzzle.id, p.id);
      expect(text(tester, 'gc-rule'), L.f('gcRule', {'n': '${p.moves}'}));
      expect(find.byKey(Key('gc-white-${p.target}')), findsOneWidget);
      final line = goCaptureLine(p);
      for (var i = 0; i < line.length; i += 2) {
        await tapPoint(tester, line[i]);
        if (run(tester).verdict != null) break;
        expect(text(tester, 'gc-verdict'), L.t('gcWhiteThinks'));
        clock += GoCaptureRun.replyMs + 10;
        await tester.pump(const Duration(milliseconds: 150));
        if (i + 1 < line.length && line[i + 1] >= 0) {
          expect(find.byKey(Key('gc-white-${line[i + 1]}')), findsOneWidget, reason: 'ответ белых на доске');
        }
      }
      expect(text(tester, 'gc-verdict'), '✓', reason: 'задача ${p.id}');
      expect(find.byKey(Key('gc-white-${p.target}')), findsNothing, reason: 'цель снята с доски');
      clock += 1500;
      await tester.pump(const Duration(milliseconds: 250));
    }
    await tester.pump(const Duration(milliseconds: 250));
    expect(
      text(tester, 'gc-solved'),
      '${L.t('hud_correct')}: ${deck.length}/${deck.length}',
    );
    expect(
      find.textContaining('${L.t('label_level_short')} 2'),
      findsOneWidget,
    );
  });

  for (final size in const [Size(320, 568), Size(390, 844)]) {
    testWidgets(
      '🔴 ${size.width.toInt()}×${size.height.toInt()}: ход мимо — «так не взять», «Заново» и «Дальше» видны; самоубийство — отказ',
      (tester) async {
        await open(tester, size: size);
        await tester.tap(find.byKey(const Key('gc-start')));
        await tester.pump();
        final r = run(tester);
        final p = r.puzzle;
        final pos = p.position;
        final suicide = [
          for (var q = 0; q < pos.points.length; q++)
            if (pos.at(q) == goEmpty && pos.play(q) == null) q,
        ];
        if (suicide.isNotEmpty) {
          await tapPoint(tester, suicide.first);
          expect(text(tester, 'gc-verdict'), L.t('gcSuicide'));
          expect(r.made, 0);
        }
        final bad = CaptureSolver()
            .candidates(pos, p.target)
            .firstWhere((m) => m != p.key && pos.play(m) != null);
        await tapPoint(tester, bad);
        expect(text(tester, 'gc-verdict'), L.t('gcWrong'));
        expect(find.byKey(const Key('gc-next')), findsOneWidget);
        expect(
          tester.takeException(),
          isNull,
          reason: 'кнопки и надпись помещаются',
        );
        await tester.tap(find.byKey(const Key('gc-restart')));
        await tester.pump();
        expect(text(tester, 'gc-verdict'), ' ');
        expect(r.made, 0);
        await tapPoint(tester, bad);
        await tester.tap(find.byKey(const Key('gc-next')));
        await tester.pump();
        clock += 2000;
        await tester.pump(const Duration(milliseconds: 250));
        expect(r.step, 1, reason: '«Дальше» — следующая задача');
        expect(r.attempts.single.solved, isFalse);
      },
    );
  }

  testWidgets('часы стоят, пока открыт разбор поверх задачи', (tester) async {
    await open(tester, gameClock: true);
    await tester.tap(find.byKey(const Key('gc-start')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(LessonPlayerScreen), findsOneWidget);
    expect(find.byKey(const Key('gc-board')), findsWidgets);
    for (var i = 0; i < goCaptureSeconds * 2; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    Navigator.of(
      tester.element(find.byType(GoCaptureScreen, skipOffstage: false)),
    ).pop();
    for (var i = 0; i < 20 && isGameHeld(); i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(isGameHeld(), isFalse);
    await tester.pump(const Duration(milliseconds: 300));
    expect(text(tester, 'gc-verdict'), ' ');
  });

  for (final size in const [Size(320, 568), Size(390, 844)]) {
    // Ступень 22 — доска 9×9, самый мелкий пункт корпуса.
    testWidgets(
      '${size.width.toInt()}×${size.height.toInt()}: 9×9 без переполнения, пункт ≥ 30',
      (tester) async {
        await open(tester, size: size, level: 22);
        await tester.tap(find.byKey(const Key('gc-start')));
        await tester.pump();
        expect(run(tester).puzzle.size, 9);
        expect(tester.takeException(), isNull);
        final w = tester.getSize(find.byKey(const Key('gc-0'))).width;
        // ignore: avoid_print
        print('${size.width.toInt()}×${size.height.toInt()}: пункт 9×9 = ${w.toStringAsFixed(1)}');
        expect(w, greaterThanOrEqualTo(30));
        // Ход мимо: «Заново» и «Дальше» — в кадре, без прокрутки.
        final r = run(tester);
        final p = r.puzzle;
        final bad = CaptureSolver()
            .candidates(p.position, p.target)
            .firstWhere((m) => m != p.key && p.position.play(m) != null);
        await tapPoint(tester, bad);
        expect(text(tester, 'gc-verdict'), L.t('gcWrong'));
        for (final k in const ['gc-restart', 'gc-next', 'gc-verdict']) {
          expect(
            tester.getRect(find.byKey(Key(k))).bottom,
            lessThanOrEqualTo(size.height),
            reason: '$k в кадре',
          );
        }
        expect(tester.takeException(), isNull);
      },
    );
  }
}
