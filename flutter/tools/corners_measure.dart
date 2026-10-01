// Замер «Уголков» до генератора: минимум ходов, число позиций перебора, время
// решателя экрана. Запуск из flutter/: dart run tools/corners_measure.dart
import 'dart:math';

import 'package:psygames_flutter/games/corners/rules.dart';

/// Угол-треугольник/квадрат из k клеток у угла (ряд 0 — верх): k=3 треугольник 2+1,
/// 4 — квадрат 2×2, 6 — треугольник 3+2+1, 9 — квадрат 3×3.
List<(int, int)> cornerShape(int k) => switch (k) {
  3 => [(0, 0), (0, 1), (1, 0)],
  4 => [(0, 0), (0, 1), (1, 0), (1, 1)],
  6 => [(0, 0), (0, 1), (0, 2), (1, 0), (1, 1), (2, 0)],
  9 => [for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) (r, c)],
  _ => throw ArgumentError(k),
};

void main() {
  final rng = Random(20261002);
  for (final (n, k, stones) in [
    (4, 3, 0), (5, 3, 0), (5, 4, 0), (5, 6, 0), (6, 4, 0), (6, 6, 0),
    (6, 6, 3), (7, 4, 0), (7, 6, 0), (7, 6, 4), (6, 9, 0),
  ]) {
    // Старт — нижний левый угол, цель — верхний правый.
    final start = {for (final (r, c) in cornerShape(k)) (n - 1 - r) * n + c};
    final target = {for (final (r, c) in cornerShape(k)) r * n + (n - 1 - c)};
    final free = [for (var i = 0; i < n * n; i++) if (!start.contains(i) && !target.contains(i)) i]..shuffle(rng);
    final board = CornersBoard(size: n, stones: free.take(stones).toSet(), target: target);
    var mask = 0;
    for (final s in start) {
      mask |= 1 << s;
    }
    final sw = Stopwatch()..start();
    final m = cornersMinMoves(board, mask);
    final bfsMs = sw.elapsedMilliseconds;
    sw.reset();
    final search = CornersSearch(board, nodeLimit: 2000000);
    final v = m == null ? null : search.reachable(mask, m);
    final idaMs = sw.elapsedMilliseconds;
    print('доска $n, фишек $k, камней $stones: минимум $m, перебор ${bfsMs} мс; решатель с бюджетом минимума: $v за ${idaMs} мс');
  }
}
