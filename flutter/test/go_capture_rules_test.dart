import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/go_capture/rules.dart';

/// «ГО: ЗАХВАТ» — ПРОБЫ ПРАВИЛ И РЕШАТЕЛЯ (задача 66dee70c).
///
/// Ходы сверяются с НЕЗАВИСИМОЙ наивной реализацией (рекурсия по соседям на
/// координатах, сравнение досок строкой) на случайных партиях с взятиями и ко.
void main() {
  /// Наивный ход: null — незаконен.
  List<int>? naivePlay(int n, List<int> board, List<int>? prev, int colour, int p) {
    if (board[p] != goEmpty) return null;
    List<int> around(int q) => [
      if (q ~/ n > 0) q - n,
      if (q ~/ n < n - 1) q + n,
      if (q % n > 0) q - 1,
      if (q % n < n - 1) q + 1,
    ];
    bool hasLiberty(List<int> b, int start) {
      final seen = <int>{};
      bool walk(int q) {
        if (!seen.add(q)) return false;
        for (final x in around(q)) {
          if (b[x] == goEmpty) return true;
          if (b[x] == b[start] && walk(x)) return true;
        }
        return false;
      }

      return walk(start);
    }

    void remove(List<int> b, int start) {
      final c = b[start];
      final stack = [start];
      while (stack.isNotEmpty) {
        final q = stack.removeLast();
        if (b[q] != c) continue;
        b[q] = goEmpty;
        stack.addAll(around(q));
      }
    }

    final b = List<int>.of(board)..[p] = colour;
    final them = colour == goBlack ? goWhite : goBlack;
    var took = false;
    for (final x in around(p)) {
      if (b[x] == them && !hasLiberty(b, x)) {
        remove(b, x);
        took = true;
      }
    }
    if (!took && !hasLiberty(b, p)) return null;
    if (prev != null && prev.join() == b.join()) return null;
    return b;
  }

  test('взятие, самоубийство и ко — на примерах', () {
    // 3×3: белый камень в центре окружён тремя чёрными; четвёртый — взятие.
    const n = 3;
    final pts = List<int>.filled(9, goEmpty)
      ..[4] = goWhite
      ..[1] = goBlack
      ..[3] = goBlack
      ..[5] = goBlack;
    final pos = GoPosition(n, pts);
    final after = pos.play(7)!;
    expect(after.at(4), goEmpty, reason: 'белый снят');
    // Самоубийство: белый в угол между чёрными без взятия — запрещено.
    final s = GoPosition(n, List<int>.filled(9, goEmpty)..[1] = goBlack..[3] = goBlack, toMove: goWhite);
    expect(s.play(0), isNull);
    // Ко: на 4×4 классическая форма, взятие и сразу обратное взятие запрещено.
    final ko = GoPosition(4, [
      0, 1, 2, 0,
      1, 2, 0, 2,
      0, 1, 2, 0,
      0, 0, 0, 0,
    ]);
    final took = ko.play(6)!; // чёрные берут белый на 5
    expect(took.at(5), goEmpty);
    expect(took.play(5), isNull, reason: 'ко: сразу отбить нельзя');
  });

  test('🔴 ходы совпадают с независимой реализацией на 200 случайных партиях', () {
    final rng = Random(20261002);
    var compared = 0;
    for (var g = 0; g < 200; g++) {
      final n = 4 + rng.nextInt(4);
      var pos = GoPosition(n, List<int>.filled(n * n, goEmpty));
      for (var ply = 0; ply < n * n * 2; ply++) {
        for (var p = 0; p < n * n; p++) {
          final mine = pos.play(p);
          final theirs = naivePlay(n, pos.points, pos.previous, pos.toMove, p);
          expect(mine?.points.join(), theirs?.join(), reason: 'партия $g, ход $ply, пункт $p');
          compared++;
        }
        final legal = pos.legalMoves();
        if (legal.isEmpty) break;
        pos = pos.play(legal[rng.nextInt(legal.length)])!;
      }
    }
    expect(compared, greaterThan(20000));
  });

  test('решатель: группа в атари снимается за 1, с двумя дамэ на открытом месте — нет', () {
    const n = 5;
    final atari = List<int>.filled(25, goEmpty)
      ..[12] = goWhite
      ..[7] = goBlack
      ..[11] = goBlack
      ..[13] = goBlack;
    expect(CaptureSolver().captures(GoPosition(n, atari), 12, 1), GoVerdict.yes);
    final open = List<int>.filled(25, goEmpty)..[12] = goWhite..[7] = goBlack..[11] = goBlack;
    expect(CaptureSolver().captures(GoPosition(n, open), 12, 1), GoVerdict.no);
  });
}
