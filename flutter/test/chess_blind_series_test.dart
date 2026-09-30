import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/chess_blind/series.dart';

/// 🔴 СЕРИЯ СВЕРЯЕТСЯ ЧИСЛО В ЧИСЛО, А НЕ «ПОХОЖЕ».
///
/// Строители блоков берут генератор случайных чисел снаружи, значит при
/// одинаковой последовательности выдача обязана совпасть с вебом целиком —
/// каждая клетка, каждое расстояние, каждый ответ. Генератор тот же: линейный
/// конгруэнтный 1664525 / 1013904223 по модулю 2^32.
void main() {
  final reference = jsonDecode(
    File('test/fixtures/chess-blind-reference.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  final series = reference['series'] as Map<String, dynamic>;

  test('🔴 план серии и её пороги совпадают с живым TS', () {
    expect(chessSeriesPlan, (series['plan'] as List<dynamic>).cast<String>());
    expect(questionsPerBlock, series['perBlock']);
    expect(chessBlockMaxErrors, series['maxErrors']);
    expect(knightWrongGap, series['knightWrongGap']);
    for (final k
        in (series['keyAt'] as List<dynamic>).cast<Map<String, dynamic>>()) {
      expect(
        blockKeyAt(k['index'] as int),
        k['key'],
        reason: 'блок ${k['index']}',
      );
    }
  });

  test('🔴 ВСЕ ТРИ блока выдают ровно те же вопросы, что веб', () {
    final fen = series['fen'] as String;
    final squares = coreSquaresFromFen(fen);
    for (final block
        in (series['blocks'] as List<dynamic>).cast<Map<String, dynamic>>()) {
      final want = (block['questions'] as List<dynamic>)
          .cast<Map<String, dynamic>>();
      final got = buildBlockQuestions(
        squares: squares,
        level: block['level'] as int,
        blockIndex: block['blockIndex'] as int,
        random: lcg(20260924),
      );
      expect(
        got,
        hasLength(want.length),
        reason: 'вопросов в блоке ${block['blockIndex']}',
      );
      for (var i = 0; i < want.length; i++) {
        final w = want[i];
        final g = got[i];
        expect(g.kind, w['kind'], reason: 'вид вопроса $i');
        expect(g.answer, w['answer'], reason: 'ответ $i');
        switch (g.kind) {
          case 'square':
            expect(g.a, w['a'], reason: 'поле A, вопрос $i');
            expect(g.b, w['b'], reason: 'поле B, вопрос $i');
          case 'knight':
            expect(g.from, w['from'], reason: 'откуда, вопрос $i');
            expect(g.to, w['to'], reason: 'куда, вопрос $i');
            expect(g.moves, w['moves'], reason: 'ходов, вопрос $i');
            expect(g.distance, w['distance'], reason: 'расстояние, вопрос $i');
          case 'recall':
            expect(g.square, w['square'], reason: 'клетка, вопрос $i');
            final claim = w['claim'] as Map<String, dynamic>?;
            expect(
              g.claim,
              claim == null ? isNull : '${claim['color']}${claim['type']}',
              reason: 'утверждение, вопрос $i',
            );
            final truth = w['truth'] as Map<String, dynamic>?;
            expect(
              g.truth,
              truth == null ? isNull : '${truth['color']}${truth['type']}',
              reason: 'что стояло, вопрос $i',
            );
        }
      }
    }
  });

  test('🔴 расстояние конём считается по ПУСТОЙ доске', () {
    // a1 → b3 это один ход; a1 → h8 шесть. Фигуры маршруту не мешают нарочно.
    expect(knightDistance(0, 17), 1);
    expect(knightDistance(0, 63), 6);
    expect(squaresAtDistance(0, 1), containsAll([10, 17]));
  });
}
