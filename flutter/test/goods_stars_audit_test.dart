import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/goods_sort/model.dart';

void main() {
  test('current L3 has a legal three-star witness using arbitrary item picks', () {
    final set = GoodsLevelSet.fromJsonString(File('assets/levels/goods_sort.json').readAsStringSync(), width: 390);
    final level = set.byLevel(3);
    final limit = (level.reference * 1.15).ceil();
    final initial = GoodsPlay.start(level);
    expect(level.obstacles.every((o) => o == null), isTrue);
    expect(initial.board.queue, isEmpty);
    String key(GoodsPlay p) {
      final cells = p.board.cells.map((c) => jsonEncode([...c]..sort())).toList()..sort();
      return cells.join('|');
    }
    // Five types each occur exactly three times. At least 3 - largest cluster
    // items of each type must move; this is an admissible search bound.
    int lower(GoodsPlay p) {
      final largest = <int, int>{};
      for (final c in p.board.cells) {
        for (final type in c.toSet()) {
          final n = c.where((x) => x == type).length;
          if (n > (largest[type] ?? 0)) largest[type] = n;
        }
      }
      return largest.values.fold(0, (s, n) => s + 3 - n);
    }
    final seen = <String, int>{};
    var nodes = 0;
    List<({int from, int item, int to})>? visit(GoodsPlay p, int left) {
      if (++nodes > 200000) return null;
      if (levelWon(p.board.cells, level.goal)) return [];
      if (left == 0 || lower(p) > left) return null;
      final k = key(p);
      if ((seen[k] ?? -1) >= left) return null;
      seen[k] = left;
      final candidates = <({GoodsPlay p, int from, int item, int to})>[];
      for (var from = 0; from < p.board.cells.length; from++) {
        for (var item = 0; item < p.board.cells[from].length; item++) {
          for (var to = 0; to < p.board.cells.length; to++) {
            final child = from == to ? null : p.move(from, item, to);
            if (child != null) candidates.add((p: child, from: from, item: item, to: to));
          }
        }
      }
      candidates.sort((a, b) => lower(a.p).compareTo(lower(b.p)));
      for (final c in candidates) {
        final tail = visit(c.p, left - 1);
        if (tail != null) return [(from: c.from, item: c.item, to: c.to), ...tail];
      }
      return null;
    }
    final witness = visit(initial, limit);
    expect(witness, isNotNull, reason: 'budgeted search failure is NOT proof of impossible stars');
    var p = initial;
    for (final m in witness!) { p = p.move(m.from, m.item, m.to)!; }
    expect(levelWon(p.board.cells, level.goal), isTrue);
    expect(starsForMoves(witness.length, level.reference), 3);
    // ignore: avoid_print
    print('L3 reference=${level.reference}, three-star limit=$limit, witness=${witness.length}, nodes=$nodes, path=$witness');
  });
}
