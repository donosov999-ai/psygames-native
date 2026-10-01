import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/xiangqi_shogi/game.dart';
import 'package:psygames_flutter/games/xiangqi_shogi/ladder.dart';
import 'package:psygames_flutter/games/xiangqi_shogi/lesson.dart';
import 'package:psygames_flutter/games/xiangqi_shogi/screen.dart';
import 'package:psygames_flutter/games/xiangqi_shogi/view.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/game_clock_fake.dart';

/// ЭКРАН «СЯНЦИ И СЁГИ» — ЗАДАЧИ КАСАНИЯМИ (задача c33fb91b).
void main() {
  XsCorpus load(XsMode m) => XsCorpus.parse(
    File('assets/xiangqi_shogi/${m == XsMode.xiangqi ? 'xiangqi' : 'shogi'}.json')
        .readAsStringSync(),
    m,
  );
  final xq = load(XsMode.xiangqi);
  final sg = load(XsMode.shogi);
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
    bool gameClock = false,
    Map<String, String> levels = const {},
  }) async {
    useFakeGameClock(tester);
    tester.view.physicalSize = size * 2;
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    final state = await SharedState.open();
    for (final e in levels.entries) {
      await state.set('psygames_${e.key}_level_nzt48', e.value);
    }
    await tester.pumpWidget(
      MaterialApp(
        home: XiangqiShogiScreen(
          state: state,
          xiangqiCorpus: xq,
          shogiCorpus: sg,
          clock: gameClock ? null : () => clock,
          seed: 5,
        ),
      ),
    );
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    return state;
  }

  String text(WidgetTester tester, String key) =>
      tester.widget<Text>(find.byKey(Key(key))).data ?? '';

  XsRun run(WidgetTester tester) =>
      (tester.state(find.byType(XiangqiShogiScreen)) as dynamic).debugRun as XsRun;

  Future<void> tapMove(WidgetTester tester, XsMode mode, String m) async {
    final mv = XsMove.parse(mode, m);
    if (mv.drop != null) {
      await tester.tap(find.byKey(Key('xs-hand-${mv.drop}')));
    } else {
      await tester.tap(find.byKey(Key('xs-${mv.from}')));
    }
    await tester.pump();
    await tester.tap(find.byKey(Key('xs-${mv.to}')));
    await tester.pump();
    if (run(tester).pendingPromotion != null) {
      await tester.tap(find.byKey(Key(mv.promote ? 'xs-promote' : 'xs-keep')));
      await tester.pump();
    }
  }

  Future<void> solveDeck(WidgetTester tester, XsMode mode, List<XsPuzzle> deck) async {
    for (final p in deck) {
      expect(run(tester).puzzle.id, p.id);
      final line = xsLine(p);
      for (var i = 0; i < line.length; i += 2) {
        await tapMove(tester, mode, line[i]);
        if (run(tester).verdict != null) break;
        clock += XsRun.replyMs + 10;
        await tester.pump(const Duration(milliseconds: 150));
      }
      expect(text(tester, 'xs-verdict'), '✓', reason: '${mode.name} ${p.id}');
      clock += 1500;
      await tester.pump(const Duration(milliseconds: 250));
    }
    await tester.pump(const Duration(milliseconds: 250));
  }

  testWidgets('сянци, ступень 1: пять матов касаниями — ступень выше', (tester) async {
    final state = await open(tester);
    await tester.tap(find.byKey(const Key('xs-start')));
    await tester.pump();
    expect(text(tester, 'xs-rule'), L.f('xsRule', {'n': '1'}));
    await solveDeck(tester, XsMode.xiangqi, xsDeckFor(xq, 1, seed: 5));
    expect(find.textContaining('${L.t('label_level_short')} 2'), findsOneWidget);
    expect(state.get('psygames_xiangqi_level_nzt48'), '2');
    expect(state.get('psygames_shogi_level_nzt48'), isNull);
  });

  testWidgets('сёги, ступень 7 (мат сбросом): пять матов касаниями, сброс из руки', (tester) async {
    final state = await open(tester, levels: {'shogi': '7'});
    await tester.tap(find.byKey(const Key('xs-mode-shogi')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('xs-start')));
    await tester.pump();
    expect(find.byKey(const Key('xs-hand')), findsOneWidget);
    final deck = xsDeckFor(sg, 7, seed: 5);
    expect(deck.any((p) => p.key.contains('@')), isTrue, reason: 'на ступени есть сбросы');
    await solveDeck(tester, XsMode.shogi, deck);
    expect(state.get('psygames_shogi_level_nzt48'), '8');
  });

  testWidgets('сёги: ход без шаха — отказ «в цумэ каждый ход — шах», ход не сделан', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('xs-mode-shogi')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('xs-start')));
    await tester.pump();
    final r = run(tester);
    final quiet = r.board.moves().firstWhere((m) => !r.board.checks().contains(m));
    await tapMove(tester, XsMode.shogi, quiet);
    expect(text(tester, 'xs-verdict'), L.t('xsNeedCheck'));
    expect(r.made, 0);
  });

  for (final size in const [Size(320, 568), Size(390, 844)]) {
    for (final mode in XsMode.values) {
      testWidgets(
        '🔴 ${size.width.toInt()}×${size.height.toInt()} ${mode.name}: клетка ≥ 28, «так не мат» с кнопками в кадре',
        (tester) async {
          await open(tester, size: size);
          if (mode == XsMode.shogi) {
            await tester.tap(find.byKey(const Key('xs-mode-shogi')));
            await tester.pump();
          }
          await tester.tap(find.byKey(const Key('xs-start')));
          await tester.pump();
          final w = tester.getSize(find.byKey(const Key('xs-0'))).width;
          // ignore: avoid_print
          print('${size.width.toInt()}×${size.height.toInt()} ${mode.name}: клетка ${w.toStringAsFixed(1)}');
          expect(w, greaterThanOrEqualTo(28));
          final r = run(tester);
          final pool = mode == XsMode.shogi ? r.board.checks() : r.board.moves();
          final bad = pool.firstWhere((m) => m != r.puzzle.key);
          await tapMove(tester, mode, bad);
          expect(text(tester, 'xs-verdict'), L.t('xsWrong'));
          for (final k in const ['xs-restart', 'xs-next', 'xs-verdict']) {
            expect(tester.getRect(find.byKey(Key(k))).bottom, lessThanOrEqualTo(size.height), reason: '$k в кадре');
          }
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets('справка «Фигуры»: все фигуры сянци и сёги со схемой ходов', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('xs-guide')));
    await tester.pumpAndSettle();
    for (final k in XsPieceGuide.xiangqiKinds) {
      await tester.scrollUntilVisible(find.byKey(Key('xs-guide-$k')), 80, scrollable: find.byType(Scrollable).last);
      expect(find.byKey(Key('xs-guide-$k')), findsOneWidget);
    }
    // Схема снята с движка: конь из центра — 8 полей, колесница — линии, слон — 4.
    expect(XsPieceGuide.diagram(XsMode.xiangqi, 'N').$2.length, 8);
    expect(XsPieceGuide.diagram(XsMode.xiangqi, 'B').$2.length, 4);
    expect(XsPieceGuide.diagram(XsMode.shogi, 'G').$2.length, 6);
    expect(XsPieceGuide.diagram(XsMode.shogi, 'S').$2.length, 5);
    expect(XsPieceGuide.diagram(XsMode.shogi, 'N').$2.length, 2);
  });

  testWidgets('часы стоят, пока открыт разбор поверх задачи', (tester) async {
    await open(tester, gameClock: true);
    await tester.tap(find.byKey(const Key('xs-start')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(LessonPlayerScreen), findsOneWidget);
    for (var i = 0; i < xsSeconds * 2; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    Navigator.of(tester.element(find.byType(XiangqiShogiScreen, skipOffstage: false))).pop();
    for (var i = 0; i < 20 && isGameHeld(); i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(isGameHeld(), isFalse);
    await tester.pump(const Duration(milliseconds: 300));
    expect(text(tester, 'xs-verdict'), ' ');
  });
}
