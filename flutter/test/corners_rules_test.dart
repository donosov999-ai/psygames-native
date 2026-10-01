import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/corners/rules.dart';

/// «УГОЛКИ» — ПРОБЫ ПРАВИЛ И РЕШАТЕЛЯ (задача 30b5a5aa).
///
/// Внешнего эталона у игры нет, поэтому ходы сверяются с НЕЗАВИСИМОЙ наивной
/// реализацией (рекурсия по цепочкам прыжков на координатах, а не битах), на сотнях
/// случайных позиций с камнями.
void main() {
  int cell(int n, int r, int c) => r * n + c;
  int maskOf(Iterable<int> cells) => cells.fold(0, (m, c) => m | (1 << c));

  /// Наивные ходы: координаты, рекурсия, множество посещённых клеток цепочки.
  Set<(int, int)> naive(int n, Set<int> pieces, Set<int> stones) {
    bool inside(int r, int c) => r >= 0 && r < n && c >= 0 && c < n;
    final out = <(int, int)>{};
    for (final from in pieces) {
      final others = {...pieces}..remove(from);
      bool busy(int r, int c) => others.contains(r * n + c) || stones.contains(r * n + c);
      final fr = from ~/ n, fc = from % n;
      for (final (dr, dc) in const [(1, 0), (-1, 0), (0, 1), (0, -1)]) {
        final r = fr + dr, c = fc + dc;
        if (inside(r, c) && !busy(r, c)) out.add((from, r * n + c));
      }
      void chain(int r, int c, Set<int> visited) {
        for (final (dr, dc) in const [(1, 0), (-1, 0), (0, 1), (0, -1)]) {
          final or = r + dr, oc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
          if (!inside(or, oc) || !busy(or, oc)) continue;
          if (!inside(lr, lc) || busy(lr, lc)) continue;
          final land = lr * n + lc;
          if (visited.contains(land)) continue;
          if (land != from) out.add((from, land));
          chain(lr, lc, {...visited, land});
        }
      }

      chain(fr, fc, {from});
    }
    return out;
  }

  test('шаг — только по вертикали и горизонтали', () {
    final b = CornersBoard(size: 5, stones: const {}, target: const {});
    final t = b.targetsFrom(maskOf([cell(5, 2, 2)]), cell(5, 2, 2));
    expect(t, {cell(5, 1, 2), cell(5, 3, 2), cell(5, 2, 1), cell(5, 2, 3)});
  });

  test('цепочка прыжков: конец можно выбрать на любом звене; через камень — можно, на камень — нет', () {
    // Ряд 4: фишка a, своя b, пусто, камень d, пусто.
    final n = 5;
    final b = CornersBoard(size: n, stones: {cell(n, 4, 3)}, target: const {});
    final pieces = maskOf([cell(n, 4, 0), cell(n, 4, 1)]);
    final t = b.targetsFrom(pieces, cell(n, 4, 0));
    expect(t, contains(cell(n, 4, 2)), reason: 'прыжок через свою');
    expect(t, contains(cell(n, 4, 4)), reason: 'и дальше — через камень');
    expect(t, isNot(contains(cell(n, 4, 3))), reason: 'на камень не встать');
    expect(t, contains(cell(n, 3, 0)), reason: 'и обычный шаг');
  });

  test('🔴 ходы совпадают с независимой реализацией на 300 случайных позициях', () {
    final rng = Random(20261002);
    var compared = 0;
    for (var i = 0; i < 300; i++) {
      final n = 4 + rng.nextInt(4);
      final cells = [for (var x = 0; x < n * n; x++) x]..shuffle(rng);
      final stones = cells.take(rng.nextInt(5)).toSet();
      final pieces = cells.skip(stones.length).take(2 + rng.nextInt(8)).toSet();
      final b = CornersBoard(size: n, stones: stones, target: const {});
      final mine = b.moves(maskOf(pieces)).toSet();
      expect(mine, naive(n, pieces, stones), reason: 'доска $n, фишки $pieces, камни $stones');
      compared += mine.length;
    }
    expect(compared, greaterThan(3000), reason: 'сравнение не пустое');
  });

  test('минимум «из угла в угол» — замер 02.10.2026', () {
    int corner(int n, List<(int, int)> shape, {required bool start}) => maskOf([
      for (final (r, c) in shape) start ? (n - 1 - r) * n + c : r * n + (n - 1 - c),
    ]);
    const tri3 = [(0, 0), (0, 1), (1, 0)];
    const sq4 = [(0, 0), (0, 1), (1, 0), (1, 1)];
    for (final (n, shape, want) in [(4, tri3, 8), (5, tri3, 11), (5, sq4, 7), (6, sq4, 9), (7, sq4, 11)]) {
      final target = {for (final (r, c) in shape) r * n + (n - 1 - c)};
      final b = CornersBoard(size: n, stones: const {}, target: target);
      final start = corner(n, shape, start: true);
      expect(cornersMinMoves(b, start), want, reason: 'доска $n, фишек ${shape.length}');
      // Решатель экрана согласен: за минимум — можно, за минимум−1 — нельзя.
      expect(CornersSearch(b).reachable(start, want), CornersVerdict.yes);
      expect(CornersSearch(b).reachable(start, want - 1), CornersVerdict.no);
    }
  });

  test('решатель отдаёт линию, и она приводит в цель', () {
    const n = 5;
    final target = {0 * n + 4, 0 * n + 3, 1 * n + 4, 1 * n + 3};
    final b = CornersBoard(size: n, stones: const {}, target: target);
    var pos = maskOf([4 * n + 0, 4 * n + 1, 3 * n + 0, 3 * n + 1]);
    final s = CornersSearch(b);
    expect(s.reachable(pos, 7), CornersVerdict.yes);
    expect(s.line.length, lessThanOrEqualTo(7));
    for (final m in s.line) {
      expect(b.moves(pos), contains(m), reason: 'каждый ход линии законен');
      pos = CornersBoard.apply(pos, m);
    }
    expect(b.solved(pos), isTrue);
  });
}
