import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/draughts_common/rules.dart';

/// ПРАВИЛА РУССКИХ ШАШЕК ПРОТИВ ОРАКУЛА pydraughts.
///
/// Фикстура — та же, что у Chess & Go (`tool/russian_draughts_oracle_dump.py` там):
/// 1 797 позиций случайных партий с 10-го хода, 582 с дамками; у каждой число
/// законных ходов и perft(2) оракула. «Партия проходит» ≠ «правила верны»: этой
/// сверкой 01.10.2026 найден дефект дальнобойной дамки, которого не видели пробы.
void main() {
  int perft(DraughtsPosition p, int d) {
    if (d == 0) return 1;
    var n = 0;
    for (final m in draughtsLegalMoves(p)) {
      n += perft(draughtsApply(p, m), d - 1);
    }
    return n;
  }

  DraughtsPosition fromOracle(String fen) {
    final parts = fen.split(':');
    final cells = List<int>.filled(64, 0);
    for (final part in parts.skip(1)) {
      if (part.length < 2) continue;
      final side = part[0] == 'W' ? 1 : -1;
      for (var sq in part.substring(1).split(',')) {
        final king = sq.startsWith('K');
        if (king) sq = sq.substring(1);
        cells[draughtsCellOf(sq)] = side * (king ? 2 : 1);
      }
    }
    return DraughtsPosition(cells, turn: parts[0] == 'W' ? 1 : -1);
  }

  test('perft от начала = pydraughts до глубины 5', () {
    final start = DraughtsPosition.initial();
    expect([for (var d = 1; d <= 5; d++) perft(start, d)], [7, 49, 302, 1469, 7482]);
  });

  test('1 797 позиций оракула: ходы и perft(2) совпали', () {
    final data = jsonDecode(
      File('test/fixtures/russian-draughts-pydraughts.json').readAsStringSync(),
    ) as List;
    final bad = <String>[];
    for (final row in data) {
      final p = fromOracle(row['fen'] as String);
      if (draughtsLegalMoves(p).length != row['n1'] || perft(p, 2) != row['n2']) {
        bad.add(row['fen'] as String);
      }
    }
    expect(data.length, 1797);
    expect(bad, isEmpty, reason: 'первые: ${bad.take(3)}');
  });

  test('правила: бить обязательно, простая бьёт назад, дамка встаёт для продолжения', () {
    // Белая c3, чёрная d4 → бить обязательно; a3 тихо не ходит.
    final p = fromOracle('W:Wc3,a3:Bd4');
    expect({for (final m in draughtsLegalMoves(p)) m.notation}, {'c3:e5'});
    // Простая бьёт назад: чёрная d4 бьёт белую e5 вверх, на f6 — для чёрных это назад.
    final back = fromOracle('B:We5,h2:Bd4,a7');
    expect({for (final m in draughtsLegalMoves(back)) m.notation}, {'d4:f6'});
    final king = fromOracle('W:Wb2,a3,Kb8:Bg5,b6,c7,g7,h2');
    expect({for (final m in draughtsLegalMoves(king)) m.notation},
        {'b8:e5:h8', 'b8:f4:h6:f8'});
  });

  test('запись позиции туда-обратно', () {
    final start = DraughtsPosition.initial();
    expect(DraughtsPosition.parse(start.code).cells, start.cells);
    expect(start.code, 'bbbbbbbbbbbb........wwwwwwwwwwww w');
  });
}
