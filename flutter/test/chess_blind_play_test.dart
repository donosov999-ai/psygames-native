import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/chess_blind/game.dart';
import 'package:psygames_flutter/games/chess_blind/interference.dart';
import 'package:psygames_flutter/games/chess_blind/ladder.dart';
import 'package:psygames_flutter/games/chess_blind/options.dart';
import 'package:psygames_flutter/games/chess_blind/positions.dart';
import 'package:psygames_flutter/games/chess_blind/questions.dart';

/// ЯДРО «ПАРТИИ» — ТО, ЧЕГО В ПЕРЕНОСЕ 24.09 НЕ БЫЛО.
///
/// Случай у веба и телефона разный, поэтому порядок не сверяется — сверяются
/// СВОЙСТВА, которые обещает лестница веба (`options.ts`, `positions.ts`,
/// `interference.ts`): сколько вариантов, есть ли среди них верный, из какой
/// полосы позиция, сколько примеров помехи.
void main() {
  late PositionCorpus corpus;
  setUpAll(() {
    corpus = PositionCorpus.parse(
      File('assets/chess_blind/positions.json').readAsStringSync(),
    );
  });

  test('🔴 вариантов столько, сколько велит ступень, верный среди них и не всегда первый', () {
    final rnd = Random(3);
    var firstIsAnswer = 0;
    var total = 0;
    for (var level = 1; level <= 10; level++) {
      final want = puzzleLevelParams(level).optionCount;
      for (var round = 0; round < 20; round++) {
        final game = ChessBlindGame.start(
          level: level,
          corpus: corpus,
          random: rnd,
        );
        for (final q in game.questions) {
          final key = '${q.type}${q.white ? 'w' : 'b'}';
          expect(
            q.options,
            hasLength(want),
            reason: 'ступень $level: вариантов ${q.options.length}',
          );
          expect(q.options, contains(key), reason: 'верного варианта нет');
          expect(
            q.options.toSet(),
            hasLength(want),
            reason: 'варианты повторяются',
          );
          total++;
          if (q.options.first == key) firstIsAnswer++;
        }
      }
    }
    // Верный первой кнопкой — примерно в 1/6–1/8 случаев, а не всегда.
    expect(
      firstIsAnswer / total,
      lessThan(0.3),
      reason:
          'верный первым в $firstIsAnswer из $total — ответ виден без памяти',
    );
  });

  test('🔴 доля одноцветных отвлекающих — минимум, который велит ступень', () {
    final rnd = Random(11);
    for (final level in [6, 8, 10]) {
      final p = puzzleLevelParams(level);
      final wantOwn = (p.optionCount - 1) * p.sameColorShare;
      for (var i = 0; i < 40; i++) {
        final answer = (
          type: ['K', 'Q', 'R', 'B', 'N', 'P'][i % 6],
          white: i.isEven,
        );
        final opts = buildOptions(const [], answer, level, rnd);
        final own = opts
            .where((c) => c.white == answer.white && !(c.type == answer.type))
            .length;
        expect(
          own,
          greaterThanOrEqualTo(min(5, wantOwn.round())),
          reason: 'ступень $level: своих отвлекающих $own',
        );
      }
    }
    // На нулевой доле цвет не выдаёт ответ: свои отвлекающие всё равно бывают.
    var ownAtZero = 0;
    for (var i = 0; i < 60; i++) {
      final answer = (type: 'N', white: true);
      ownAtZero += buildOptions(
        const [],
        answer,
        1,
        rnd,
      ).where((c) => c.white && c.type != 'N').length;
    }
    expect(
      ownAtZero,
      greaterThan(0),
      reason: 'все варианты чужого цвета — ответ виден по цвету',
    );
  });

  test('🔴 позиция партии — из узкой полосы уровня, а не из широкой полосы серии', () {
    final rnd = Random(5);
    for (var level = 1; level <= puzzleMaxLevel; level++) {
      final p = puzzleLevelParams(level);
      final band = puzzlePiecesBand(p.pieces);
      var unique = 0;
      const rounds = 12;
      for (var i = 0; i < rounds; i++) {
        final game = ChessBlindGame.start(
          level: level,
          corpus: corpus,
          random: rnd,
        );
        expect(
          game.start.length,
          inInclusiveRange(band.min, band.max),
          reason:
              'ступень $level просит ${p.pieces}, выдано ${game.start.length}',
        );
        if (uniquePieceCount(game.start) >=
            puzzleMinUnique(p.quizType, p.questions))
          unique++;
      }
      // Однозначных фигур хватает почти всегда — иначе «розыск» молча короче.
      expect(
        unique,
        greaterThanOrEqualTo(rounds - 2),
        reason: 'ступень $level: однозначных хватило в $unique из $rounds',
      );
    }
  });

  test('🔴 помеха — с 11-й ступени: 1 → 2 (14) → 3 (20) примера; неверный ответ отличается на 1–3', () {
    expect(
      [for (var l = 1; l <= 25; l++) examplesPerRound(l)],
      [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, //
        1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3,
      ],
    );
    final rnd = Random(9);
    var correct = 0;
    for (var i = 0; i < 400; i++) {
      final e = makeExample(i.isEven, rnd);
      final parts = e.left.split(' ');
      final a = int.parse(parts[0]);
      final b = int.parse(parts[2]);
      final truth = switch (parts[1]) {
        '+' => a + b,
        '-' => a - b,
        _ => a * b,
      };
      expect(e.correct, e.shown == truth);
      if (!e.correct) expect((e.shown - truth).abs(), inInclusiveRange(1, 3));
      if (e.correct) correct++;
    }
    expect(
      correct,
      inInclusiveRange(150, 250),
      reason: 'верных примеров $correct из 400 — не половина',
    );
  });

  test('🔴 отвечать можно в любом порядке; помеха в счёт не идёт; ступень — не больше одного промаха', () {
    final game = ChessBlindGame.start(
      level: 11,
      corpus: corpus,
      random: Random(21),
    );
    game.beginBlind();
    game.beginQuiz();
    expect(game.phase, ChessBlindPhase.interference);
    expect(game.current, isNull, reason: 'во время помехи вопросов нет');
    game.answerExample(
      !game.example!.correct,
    ); // неверно — в счёт партии не идёт
    while (game.phase == ChessBlindPhase.interference) {
      game.answerExample(true);
    }
    expect(game.phase, ChessBlindPhase.quiz);
    expect(game.errors, 0, reason: 'промах на помехе в счёт партии не входит');

    // Отвечаем с ПОСЛЕДНЕГО вопроса, а не с первого.
    final order = [...game.questions.reversed];
    for (final q in order) {
      expect(
        game.select(q.sq),
        isTrue,
        reason: 'клетку ${q.sq} выбрать нельзя',
      );
      expect(game.current!.sq, q.sq);
      game.answer(square: q.sq);
    }
    expect(game.phase, ChessBlindPhase.done);
    expect(game.right, game.total);
    expect(game.passed, isTrue);

    final two = ChessBlindGame.start(
      level: 12,
      corpus: corpus,
      random: Random(4),
    );
    two.beginBlind();
    two.beginQuiz();
    while (two.phase == ChessBlindPhase.interference) {
      two.answerExample(true);
    }
    var wrong = 0;
    while (two.current != null) {
      final q = two.current!;
      two.answer(square: wrong < 2 ? (q.sq + 1) % 64 : q.sq);
      wrong++;
    }
    expect(two.errors, 2);
    expect(two.passed, isFalse, reason: 'два промаха — ступень не пройдена');
  });

  test(
    'ходы показываются по одному: позиция после k ходов — это k ходов цепочки',
    () {
      final game = ChessBlindGame.start(
        level: 16,
        corpus: corpus,
        random: Random(2),
      );
      expect(game.moves, isNotEmpty);
      expect(game.piecesAfter(0).map((p) => p.sq), game.start.map((p) => p.sq));
      expect(
        game.piecesAfter(game.moves.length).map((p) => p.sq).toSet(),
        game.finalPieces.map((p) => p.sq).toSet(),
      );
      for (var k = 1; k <= game.moves.length; k++) {
        final before = game.piecesAfter(k - 1).map((p) => p.sq).toSet();
        final after = game.piecesAfter(k).map((p) => p.sq).toSet();
        final m = game.moves[k - 1];
        expect(before.difference(after), {
          m.from,
        }, reason: 'ход $k: ушла не та фишка');
        expect(after.difference(before), {
          m.to,
        }, reason: 'ход $k: пришла не туда');
      }
    },
  );
}
