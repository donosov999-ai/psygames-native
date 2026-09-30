import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/scholars_mate/check.dart';
import 'package:psygames_flutter/games/scholars_mate/deck.dart';
import 'package:psygames_flutter/games/scholars_mate/game.dart';
import 'package:psygames_flutter/games/scholars_mate/ladder.dart';

/// ПОДХОД «ДЕТСКОГО МАТА» БЕЗ ПИКСЕЛЕЙ: касания и игровые часы (шаг 4, 30.09.2026).
///
/// Часы поддельные и двигаются руками — так проверяется то, что в вебе ловилось
/// замерами: один ответ на позицию, подсказка только с половины времени,
/// доигрывание жертвы до мата, конец потока по времени и ровно один итог.
void main() {
  final corpus = ScholarsCorpus.fromJson(
    jsonDecode(File('assets/scholars_mate/puzzles.json').readAsStringSync())
        as Map<String, dynamic>,
  );
  var clock = 0;
  int now() => clock;
  setUp(() => clock = 0);

  ScholarsRun runOf(List<ScholarsPuzzle> deck, {int level = 3, int? flowMs}) =>
      ScholarsRun(level: level, deck: deck, now: now, flowMs: flowMs);

  void play(ScholarsRun r, String uci) {
    r.tap(uci.substring(0, 2));
    r.tap(uci.substring(2, 4));
  }

  final mates = buildDeck(corpus, 3, seed: 1);

  test(
    'верный ход: вердикт, время до первого касания, дальше через 550 мс',
    () {
      final r = runOf(mates);
      clock = 700;
      play(r, mates.first.solutions.first);
      expect(r.verdict?.ok, isTrue);
      expect(r.attempts.single.msFirst, 700);
      clock = 700 + 549;
      r.tick();
      expect(r.step, 0, reason: 'вердикт ещё показан');
      clock = 700 + 550;
      r.tick();
      expect(r.step, 1);
      expect(r.verdict, isNull);
    },
  );

  test('неверный ход — промах с верным ответом; второй ответ не пишется', () {
    final r = runOf(mates);
    final p = mates.first;
    final fen = shownFen(p);
    String? wrong;
    for (final from in [
      'a2',
      'b2',
      'g2',
      'h2',
      'a7',
      'b7',
      'g7',
      'h7',
      'b1',
      'g1',
      'b8',
      'g8',
    ]) {
      for (final to in movesFrom(fen, from)) {
        final uci = completeMove(fen, '$from$to');
        if (!p.solutions.contains(uci)) wrong ??= uci;
      }
    }
    expect(wrong, isNotNull);
    play(r, wrong!);
    expect(r.verdict?.ok, isFalse);
    expect(r.verdict?.best, isNotNull);
    play(r, p.solutions.first);
    expect(r.attempts.length, 1, reason: 'после вердикта касания не пишутся');
    clock = 1399;
    r.tick();
    expect(r.step, 0);
    clock = 1400;
    r.tick();
    expect(r.step, 1);
  });

  test('время вышло — промах по таймауту, без касаний подход не засчитан', () {
    final deck = mates.take(2).toList();
    final r = runOf(deck);
    for (var i = 0; i < deck.length; i++) {
      clock += r.seconds * 1000;
      r.tick();
      expect(r.attempts.last.timeout, isTrue);
      clock += 1400;
      r.tick();
    }
    expect(r.finished, isTrue);
    expect(r.result!.touched, isFalse);
    expect(r.result!.solved, 0);
  });

  test('подсказка — только с половины времени, стоит звезды, время касания не трогает', () {
    final r = runOf(mates);
    expect(r.canHint, isFalse);
    r.takeHint();
    expect(r.hintSquare, isNull, reason: 'до половины времени подсказки нет');
    clock = r.seconds * 500;
    expect(r.canHint, isTrue);
    r.takeHint();
    expect(r.hintSquare, mates.first.solutions.first.substring(0, 2));
    expect(r.hintsUsed, 1);
    clock += 300;
    play(r, mates.first.solutions.first);
    expect(r.attempts.single.hinted, isTrue);
    expect(r.attempts.single.msFirst, r.seconds * 500 + 300);
    expect(
      runStars(900, 3, r.hintsUsed),
      2,
      reason: 'с подсказкой трёх звёзд нет',
    );
  });

  test('🔴 жертва доигрывается до мата: верный первый ход — ещё не ответ', () {
    final deck = buildDeck(corpus, 30, seed: 2, only: ScholarsKind.sacrifice);
    final p = deck.firstWhere((x) => x.line.length >= 3);
    final r = runOf([p], level: 30);
    play(r, p.line[0]);
    expect(r.verdict, isNull, reason: 'после жертвы ждём следующий ход');
    expect(r.lineStep, 1);
    play(r, p.line[2]);
    if (p.line.length > 3) {
      expect(r.verdict, isNull);
      play(r, p.line[4]);
    }
    expect(r.verdict?.ok, isTrue, reason: 'мат поставлен — ответ засчитан');
    expect(r.attempts.length, 1);
  });

  test('жертва: неверный второй ход — промах', () {
    final deck = buildDeck(corpus, 30, seed: 2, only: ScholarsKind.sacrifice);
    final p = deck.firstWhere((x) => x.line.length >= 3);
    final r = runOf([p], level: 30);
    play(r, p.line[0]);
    final fen = r.fen;
    String? wrong;
    for (var i = 0; i < 64 && wrong == null; i++) {
      final sq = '${String.fromCharCode(97 + i % 8)}${i ~/ 8 + 1}';
      for (final to in movesFrom(fen, sq)) {
        final uci = completeMove(fen, '$sq$to');
        if (uci != p.line[2]) {
          wrong = uci;
          break;
        }
      }
    }
    play(r, wrong!);
    expect(r.verdict?.ok, isFalse);
  });

  test('«грозит ли мат?» — ответ кнопкой, касания доски не принимаются', () {
    final deck = buildDeck(corpus, 20, seed: 1, only: ScholarsKind.threat);
    final r = runOf(deck, level: 20);
    r.tap('e2');
    expect(r.selected, isNull);
    r.answerThreat(threatAnswer(deck.first));
    expect(r.verdict?.ok, isTrue);
    expect(r.canHint, isFalse);
  });

  test('поток кончается по времени, итог — ровно один', () {
    final deck = buildFlowDeck(corpus, 5, 1, 10 * 60 * 1000);
    final r = runOf(deck, level: 5, flowMs: 3000);
    play(r, deck.first.solutions.first);
    clock = 3100;
    r.tick();
    expect(r.finished, isTrue, reason: 'время потока вышло — подход окончен');
    final first = r.result;
    r.tick();
    clock += 5000;
    r.tick();
    expect(
      identical(r.result, first),
      isTrue,
      reason: 'итог не пересчитывается',
    );
    expect(r.result!.solved, 1);
  });

  test('доска — со стороны того, кто ходит в задаче', () {
    final black = buildDeck(
      corpus,
      3,
      seed: 1,
    ).where((p) => sideToMove(p) == 'b');
    final white = buildDeck(
      corpus,
      3,
      seed: 1,
    ).where((p) => sideToMove(p) == 'w');
    if (black.isNotEmpty) expect(runOf(black.toList()).whiteBottom, isFalse);
    if (white.isNotEmpty) expect(runOf(white.toList()).whiteBottom, isTrue);
    expect(black.isNotEmpty || white.isNotEmpty, isTrue);
  });
}
