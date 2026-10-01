import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/find_move/corpus.dart';
import 'package:psygames_flutter/games/find_move/game.dart';
import 'package:psygames_flutter/games/find_move/ladder.dart';
import 'package:psygames_flutter/games/scholars_mate/check.dart' show movesFrom;

/// ЛЕСТНИЦА И ПОДХОД «НАЙДИ ХОД» — без пикселей, на настоящем корпусе.
void main() {
  final corpus = FindMoveCorpus.parse(
    File('assets/find_move/puzzles.json').readAsStringSync(),
  );

  group('лестница', () {
    test(
      'группа: три ступени новые приёмы названы, три — все открытые скрыты',
      () {
        final l1 = findMoveStep(1);
        expect(l1.themes, [0, 1, 2]);
        expect(l1.themeShown, isTrue);
        final l4 = findMoveStep(4);
        expect(l4.themes, [0, 1, 2]);
        expect(l4.themeShown, isFalse);
        final l7 = findMoveStep(7);
        expect(l7.themes, [3, 4, 5], reason: 'знакомство — только с новыми');
        expect(l7.themeShown, isTrue);
        expect(findMoveStep(10).themes, [0, 1, 2, 3, 4, 5]);
        final top = findMoveStep(findMoveLevels);
        expect(top.themes.length, 12);
        expect(top.themeShown, isFalse);
        expect(top.band, 5);
        expect(top.maxMoves, 3);
      },
    );

    test('каждый приём открывается названным, и ступень это знает', () {
      for (var t = 0; t < findMoveThemes.length; t++) {
        final s = findMoveStep(findMoveOpensAt(t));
        expect(s.themes, contains(t), reason: findMoveThemes[t]);
        expect(s.themeShown, isTrue, reason: findMoveThemes[t]);
      }
    });

    test('полоса не падает с ростом ступени внутри скрытых ступеней', () {
      var last = -1;
      for (var l = 1; l <= findMoveLevels; l++) {
        final s = findMoveStep(l);
        if (s.themeShown) continue;
        expect(s.band, greaterThanOrEqualTo(last), reason: 'ступень $l');
        last = s.band;
      }
    });

    test('подход каждой ступени: пять разных задач своих приёмов и длины', () {
      for (var l = 1; l <= findMoveLevels; l++) {
        final s = findMoveStep(l);
        final deck = findMoveDeckFor(corpus, l, seed: l * 7);
        expect(deck.length, findMoveDeck, reason: 'ступень $l');
        expect(deck.map((p) => p.id).toSet().length, deck.length);
        for (final p in deck) {
          expect(s.themes, contains(p.theme), reason: 'ступень $l, ${p.id}');
          expect(p.playerMoves, lessThanOrEqualTo(s.maxMoves));
        }
        final near = deck.where((p) => (p.band - s.band).abs() <= 1).length;
        expect(
          near,
          greaterThanOrEqualTo(3),
          reason: 'ступень $l: полоса ${s.band}',
        );
      }
    });
  });

  group('подход', () {
    var clock = 0;
    int now() => clock;
    setUp(() => clock = 0);

    /// Сыграть ход касаниями: откуда → куда (→ фигура превращения).
    void tapMove(FindMoveRun run, String uci) {
      run.tap(uci.substring(0, 2));
      run.tap(uci.substring(2, 4));
      if (uci.length > 4) {
        expect(run.promotion, contains(uci), reason: 'выбор превращения');
        run.play(uci);
      }
    }

    FindMovePuzzle byId(String id) =>
        corpus.puzzles.firstWhere((p) => p.id == id);

    test('задача в два хода решается касаниями по записи', () {
      final p = corpus.puzzles.firstWhere((p) => p.playerMoves == 2);
      final run = FindMoveRun(level: 7, deck: [p], now: now);
      expect(run.lastMove, p.opponent, reason: 'ход соперника подсвечен');
      tapMove(run, p.line[0]);
      expect(run.verdict, isNull, reason: 'задача не кончилась на первом ходе');
      expect(run.moveIndex, 1);
      expect(
        run.lastMove,
        p.line[1],
        reason: 'ответ соперника сыгран и подсвечен',
      );
      clock = 5000;
      tapMove(run, p.line[2]);
      expect(run.verdict?.ok, isTrue);
      clock = 6000;
      run.tick();
      expect(run.finished, isTrue);
      expect(run.result!.solved, 1);
      expect(run.result!.clean, 1);
      expect(run.result!.medianMs, 5000);
    });

    test('чужой ход — ошибка, и показан верный ход записи', () {
      final p = corpus.puzzles.firstWhere(
        (p) => p.themeName == 'fork' && p.playerMoves == 2,
      );
      final run = FindMoveRun(level: 7, deck: [p], now: now);
      final expected = p.line.first;
      // Любой законный ход той же фигуры, кроме верного; если его нет — другой фигуры.
      String? wrong;
      for (final file in 'abcdefgh'.split('')) {
        for (var rank = 1; rank <= 8; rank++) {
          final sq = '$file$rank';
          for (final t in movesFrom(run.fen, sq)) {
            if ('$sq$t' != expected.substring(0, 4)) wrong ??= '$sq$t';
          }
        }
      }
      run.tap(wrong!.substring(0, 2));
      run.tap(wrong.substring(2, 4));
      expect(run.verdict?.ok, isFalse);
      expect(run.verdict?.best, isNotEmpty);
    });

    test('время вышло — промах по времени', () {
      final run = FindMoveRun(level: 1, deck: [corpus.puzzles.first], now: now);
      clock = findMoveSeconds * 1000 + 1;
      run.tick();
      expect(run.verdict?.ok, isFalse);
      expect(run.attempts.single.timeout, isTrue);
    });

    test(
      'подсказка — не раньше половины времени, и решение с ней не чистое',
      () {
        final p = corpus.puzzles.firstWhere((p) => p.playerMoves == 1);
        final run = FindMoveRun(level: 1, deck: [p], now: now);
        run.takeHint();
        expect(
          run.hintSquare,
          isNull,
          reason: 'до половины времени подсказки нет',
        );
        clock = findMoveSeconds * 500;
        run.takeHint();
        expect(run.hintSquare, p.line.first.substring(0, 2));
        tapMove(run, p.line.first);
        expect(run.verdict?.ok, isTrue);
        clock += 1000;
        run.tick();
        expect(run.result!.solved, 1);
        expect(run.result!.clean, 0, reason: 'с подсказкой ступень не растёт');
      },
    );

    test(
      'превращение в коня: выбор из четырёх, засчитан только конь записи',
      () {
        final p = byId('EJMqP');
        expect(p.line.first, 'e2f1n');
        final ok = FindMoveRun(level: 1, deck: [p], now: now);
        tapMove(ok, 'e2f1n');
        // Задача длиннее одного хода: принятый ход ведёт к ответу соперника.
        expect(ok.verdict?.ok ?? (ok.moveIndex == 1), isTrue);
        final queen = FindMoveRun(level: 1, deck: [p], now: now);
        tapMove(queen, 'e2f1q');
        expect(
          queen.verdict?.ok,
          isFalse,
          reason: 'ферзь вместо коня — не решение',
        );
      },
    );

    test('подход из пяти: итог считает верные, чистые и подсказки', () {
      final deck = findMoveDeckFor(corpus, 1, seed: 3);
      final run = FindMoveRun(level: 1, deck: deck, now: now);
      for (var i = 0; i < deck.length; i++) {
        final p = run.puzzle;
        if (i == 0) {
          clock += findMoveSeconds * 1000 + 1; // первую — просрочить
          run.tick();
        } else {
          for (var m = 0; m < p.playerMoves; m++) {
            tapMove(run, p.line[m * 2]);
          }
        }
        clock += 2000;
        run.tick();
      }
      expect(run.finished, isTrue);
      expect(run.result!.total, 5);
      expect(run.result!.solved, 4);
      expect(run.result!.clean, 4);
    });
  });
}
