// Замер «Го: захват» до генератора: доля случайных позиций с захватом за N, время
// решателя. Запуск из flutter/: dart run tools/go_capture_measure.dart
import 'dart:io';
import 'dart:math';

import 'package:psygames_flutter/games/go_capture/rules.dart';

void main() {
  final rng = Random(20261002);
  for (final (n, stones) in [(5, 8), (6, 12), (7, 16), (9, 24)]) {
    final byN = <int, int>{};
    var tries = 0, worstMs = 0, unknown = 0, unique = 0;
    final sw = Stopwatch()..start();
    while (sw.elapsedMilliseconds < 20000) {
      tries++;
      final pts = List<int>.filled(n * n, goEmpty);
      final cells = [for (var i = 0; i < n * n; i++) i]..shuffle(rng);
      for (var i = 0; i < stones; i++) {
        pts[cells[i]] = i.isEven ? goBlack : goWhite;
      }
      final pos = GoPosition(n, pts);
      // Цель — белая группа с 2–3 дамэ, не меньше двух камней.
      final whites = [for (var i = 0; i < n * n; i++) if (pts[i] == goWhite) i];
      if (whites.isEmpty) continue;
      final t = whites[rng.nextInt(whites.length)];
      final g = pos.group(t);
      if (g.stones.length < 2 || g.liberties.length < 2 || g.liberties.length > 3) continue;
      // Иначе позиция с готовыми к снятию группами — мусор.
      var dead = false;
      for (var i = 0; i < n * n; i++) {
        if (pts[i] != goEmpty && pos.group(i).liberties.isEmpty) dead = true;
      }
      if (dead) continue;
      for (final moves in [2, 3, 4]) {
        final s = CaptureSolver(nodeLimit: 300000);
        final t0 = Stopwatch()..start();
        final v = s.captures(pos, t, moves);
        worstMs = max(worstMs, t0.elapsedMilliseconds);
        if (v == GoVerdict.unknown) {
          unknown++;
          break;
        }
        if (v == GoVerdict.yes) {
          byN[moves] = (byN[moves] ?? 0) + 1;
          if (CaptureSolver().winningMoves(pos, t, moves).length == 1) unique++;
          break;
        }
      }
    }
    stdout.writeln('доска $n, камней $stones: попыток $tries, захват за N $byN, ключ единственный $unique, решатель худший $worstMs мс, потолок $unknown');
  }
}
