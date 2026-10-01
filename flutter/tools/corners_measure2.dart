// Замер 2: случайные позиции (k фишек, камни), минимум ходов перебором, время
// решателя экрана на ВСЁМ пути (проверка после каждого хода оптимальной линии).
import 'dart:io';
import 'dart:math';

import 'package:psygames_flutter/games/corners/rules.dart';

void main() {
  final rng = Random(7);
  for (final (n, k, stones) in [
    (5, 4, 2),
    (5, 6, 2),
    (6, 4, 3),
    (6, 6, 3),
    (7, 4, 4),
    (7, 6, 4),
  ]) {
    final found = <int, int>{};
    var worstMs = 0, tries = 0, unknown = 0;
    final sw = Stopwatch()..start();
    while (sw.elapsedMilliseconds < 20000 && tries < 400) {
      tries++;
      final cells = [for (var i = 0; i < n * n; i++) i]..shuffle(rng);
      // Цель — угол справа сверху из k клеток (треугольник/квадрат).
      final shape = k == 4
          ? [(0, 0), (0, 1), (1, 0), (1, 1)]
          : [(0, 0), (0, 1), (0, 2), (1, 0), (1, 1), (2, 0)];
      final target = {for (final (r, c) in shape) r * n + (n - 1 - c)};
      final free = cells.where((c) => !target.contains(c)).toList();
      final stoneSet = free.take(stones).toSet();
      final pieces = free.skip(stones).take(k).toList();
      final board = CornersBoard(size: n, stones: stoneSet, target: target);
      var mask = 0;
      for (final p in pieces) {
        mask |= 1 << p;
      }
      final m = cornersMinMoves(board, mask, limit: 12, maxStates: 600000);
      if (m == null || m < 3) continue;
      found[m] = (found[m] ?? 0) + 1;
      final s = CornersSearch(board, nodeLimit: 300000);
      final t = Stopwatch()..start();
      final v = s.reachable(mask, m);
      worstMs = max(worstMs, t.elapsedMilliseconds);
      if (v != CornersVerdict.yes) unknown++;
    }
    final keys = found.keys.toList()..sort();
    stdout.writeln(
      'доска $n, фишек $k, камней $stones: попыток $tries, по минимуму ${[for (final m in keys) '$m:${found[m]}']}, решатель худший $worstMs мс, не уложился $unknown',
    );
  }
}
