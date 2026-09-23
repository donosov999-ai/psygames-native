import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
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
