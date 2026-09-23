import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/chess_blind/bands.dart';
import 'package:psygames_flutter/games/chess_blind/board.dart';
import 'package:psygames_flutter/games/chess_blind/ladder.dart';

/// 🔴 ЛЕСТНИЦА ПЕРЕНЕСЕНА СО СВЕРКОЙ, А НЕ ПЕРЕПИСАНА НА ГЛАЗ.
///
/// Эталон снят прогоном ЖИВОГО TS (`src/games/chess-blind/core/puzzle.ts`):
/// все 25 ступеней со всеми ручками, поведение на краях и минимум уникальных
/// фигур. Уровень у веба и у нативной половины ОБЩИЙ, и разойдись числа — у
/// человека на одной и той же ступени были бы разные задания.
void main() {
  final reference = jsonDecode(
    File('test/fixtures/chess-blind-reference.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  boardAndBandsMatchLiveTs(reference);

  test('🔴 полоса лестницы совпадает с живым TS', () {
    expect(puzzleMinLevel, reference['minLevel']);
    expect(puzzleMaxLevel, reference['maxLevel']);
  });

  test('🔴 ВСЕ 25 ступеней совпадают по каждой ручке', () {
    final levels = reference['levels'] as Map<String, dynamic>;
    expect(levels, hasLength(25), reason: 'эталон на 25 ступеней');
    for (final entry in levels.entries) {
      final level = int.parse(entry.key);
      final want = entry.value as Map<String, dynamic>;
      final got = puzzleLevelParams(level);
      expect(got.pieces, want['pieces'], reason: 'фигуры, ступень $level');
      expect(got.exposeSec, want['exposeSec'], reason: 'показ, ступень $level');
      expect(got.moves, want['moves'], reason: 'ходы вслепую, ступень $level');
      expect(
        got.quizType.name,
        want['quizType'],
        reason: 'вид вопроса, ступень $level',
      );
      expect(
        got.questions,
        want['questions'],
        reason: 'вопросов, ступень $level',
      );
      expect(
        got.optionCount,
        want['optionCount'],
        reason: 'вариантов, ступень $level',
      );
      expect(
        got.sameColorShare,
        want['sameColorShare'],
        reason: 'один цвет, ступень $level',
      );
    }
  });

  test(
    '🔴 края лестницы: мусор становится ближайшей ступенью, а не падением',
    () {
      final clamp = reference['clamp'] as Map<String, dynamic>;
      for (final entry in clamp.entries) {
        expect(
          clampPuzzleLevel(num.parse(entry.key)),
          entry.value,
          reason: 'уровень «${entry.key}»',
        );
      }
      expect(
        clampPuzzleLevel(double.nan),
        puzzleMinLevel,
        reason: 'не число — первая ступень',
      );
    },
  );

  test('🔴 минимум однозначных фигур совпадает с живым TS', () {
    final want = reference['minUnique'] as Map<String, dynamic>;
    expect(puzzleMinUnique(PuzzleQuizType.pick, 3), want['pick-3']);
    expect(puzzleMinUnique(PuzzleQuizType.locate, 3), want['locate-3']);
    expect(puzzleMinUnique(PuzzleQuizType.pick, 1), want['pick-1']);
    expect(puzzleMinUnique(PuzzleQuizType.locate, 5), want['locate-5']);
  });

  test('🔴 ход вслепую стоит на ПЕРВОЙ ступени', () {
    // Замер 10.09.2026: дальше 4-го уровня не заходил никто, а ходы вслепую
    // начинались с 6-го — механику, ради которой игра названа, не видел ни один
    // игравший. Число здесь стоит числом нарочно.
    expect(puzzleLevelParams(1).moves, 1);
    final firstBlind = List.generate(
      25,
      (i) => i + 1,
    ).firstWhere((level) => puzzleLevelParams(level).moves > 0);
    expect(
      firstBlind,
      lessThanOrEqualTo(2),
      reason: 'впервые виден на ступени $firstBlind',
    );
  });
}

/// 🔴 ДОСКА И ПОЛОСЫ — ТОЖЕ СО СВЕРКОЙ, ПО ВСЕМ 64 КЛЕТКАМ.
///
/// Две записи клетки живут рядом: индекс ядра (0 = a1, снизу вверх) и индекс
/// экрана (0 = a8, сверху вниз). Спутать их значит нарисовать позицию вверх
/// ногами, и никакая проба правил этого не увидит.
void boardAndBandsMatchLiveTs(Map<String, dynamic> reference) {
  final board = reference['board'] as Map<String, dynamic>;
  final ladder = reference['ladder'] as Map<String, dynamic>;

  test('🔴 ВСЕ 64 клетки совпадают: имя, цвет, индекс экрана', () {
    expect(boardSide, board['side']);
    expect(boardSquares, board['squares']);
    final squares = board['squares_detail'] as Map<String, dynamic>;
    expect(squares, hasLength(64));
    for (final entry in squares.entries) {
      final i = int.parse(entry.key);
      final want = entry.value as Map<String, dynamic>;
      expect(squareName(i), want['name'], reason: 'имя клетки $i');
      expect(fileOf(i), want['file'], reason: 'вертикаль $i');
      expect(rankOf(i), want['rank'], reason: 'горизонталь $i');
      expect(isLightSquare(i), want['light'], reason: 'цвет клетки $i');
      expect(screenIndex(i), want['screen'], reason: 'индекс экрана для $i');
    }
  });

  test('🔴 имя разбирается обратно, а мусор БРОСАЕТ, а не даёт a1', () {
    final byName = board['byName'] as Map<String, dynamic>;
    for (final entry in byName.entries) {
      expect(squareIndex(entry.key), entry.value, reason: entry.key);
    }
    for (final bad
        in (board['badNames'] as List<dynamic>).cast<Map<String, dynamic>>()) {
      expect(
        bad['index'],
        'throws',
        reason: 'эталон: живой TS бросает на «${bad['name']}»',
      );
      expect(
        () => squareIndex(bad['name'] as String),
        throwsA(isA<FormatException>()),
        reason: 'на «${bad['name']}» обязана быть ошибка, а не тихий индекс',
      );
    }
    final same = board['sameColor'] as Map<String, dynamic>;
    expect(
      sameSquareColor(squareIndex('a1'), squareIndex('h8')),
      same['a1-h8'],
    );
    expect(
      sameSquareColor(squareIndex('a1'), squareIndex('a2')),
      same['a1-a2'],
    );
  });

  test('🔴 полосы фигур и маршрут коня совпадают на всех ступенях', () {
    expect(chessMinLevel, ladder['minLevel']);
    expect(chessMaxLevel(), ladder['maxLevel']);
    final bands = (ladder['bands'] as List<dynamic>)
        .cast<Map<String, dynamic>>();
    expect(pieceBands, hasLength(bands.length));
    for (var i = 0; i < bands.length; i++) {
      expect(pieceBands[i].min, bands[i]['min'], reason: 'полоса $i, минимум');
      expect(pieceBands[i].max, bands[i]['max'], reason: 'полоса $i, максимум');
    }
    final perLevel = ladder['bandForLevel'] as Map<String, dynamic>;
    for (final entry in perLevel.entries) {
      final want = entry.value as Map<String, dynamic>;
      final got = bandForLevel(int.parse(entry.key));
      expect(got.min, want['min'], reason: 'ступень ${entry.key}, минимум');
      expect(got.max, want['max'], reason: 'ступень ${entry.key}, максимум');
    }
    final knight = ladder['knightMoves'] as Map<String, dynamic>;
    for (final entry in knight.entries) {
      expect(
        knightMovesForLevel(int.parse(entry.key)),
        entry.value,
        reason: 'маршрут коня, ступень ${entry.key}',
      );
    }
    expect([knightMinMoves, knightMaxMoves], ladder['knightRange']);
    final clamp = ladder['clamp'] as Map<String, dynamic>;
    for (final entry in clamp.entries) {
      expect(
        clampLevel(num.parse(entry.key)),
        entry.value,
        reason: 'край «${entry.key}»',
      );
    }
  });
}
