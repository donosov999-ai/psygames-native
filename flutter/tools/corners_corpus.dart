// Корпус «Уголков»: перевести фишки из угла в угол — с камнями соперника.
//
// Задача 30b5a5aa (цепочка «Шахматы: семь новых игр», игра 5). Запуск из flutter/:
//     dart run tools/corners_corpus.dart   →   assets/corners/puzzles.json
//
// Группа лестницы — (доска, фишек, камни); внутри группы задачи отличаются
// расстановкой камней, у каждой свой минимум M (перебор в ширину, тот же код, что у
// игры: `lib/games/corners/rules.dart`). Линия решателя — для разбора и подсказки.
// Треть ступени — запас ходов над минимумом (M+2, M+1, M) — считается в игре, не
// здесь. Зерно постоянное.
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:psygames_flutter/games/corners/rules.dart';

/// Форма угла из k клеток: 3 — треугольник 2+1, 4 — квадрат 2×2, 6 — треугольник 3+2+1.
List<(int, int)> cornerShape(int k) => switch (k) {
  3 => const [(0, 0), (0, 1), (1, 0)],
  4 => const [(0, 0), (0, 1), (1, 0), (1, 1)],
  6 => const [(0, 0), (0, 1), (0, 2), (1, 0), (1, 1), (2, 0)],
  _ => throw ArgumentError(k),
};

/// Группы лестницы: доска, фишек, камней (от–до), сколько задач собрать.
const groups = [
  (4, 3, 0, 2, 16),
  (5, 3, 0, 3, 20),
  (5, 4, 0, 3, 20),
  (6, 4, 0, 3, 20),
  (5, 6, 0, 3, 20),
  (7, 4, 0, 4, 20),
  (6, 4, 3, 5, 20),
  (6, 6, 0, 2, 12),
];

void main() {
  final rng = Random(20261002);
  final out = <List<Object>>[];
  for (var g = 0; g < groups.length; g++) {
    final (n, k, sMin, sMax, want) = groups[g];
    final shape = cornerShape(k);
    final start = {for (final (r, c) in shape) (n - 1 - r) * n + c};
    final target = {for (final (r, c) in shape) r * n + (n - 1 - c)};
    final free = [for (var i = 0; i < n * n; i++) if (!start.contains(i) && !target.contains(i)) i];
    final seen = <String>{};
    final sw = Stopwatch()..start();
    var made = 0, tries = 0;
    while (made < want && tries < want * 30 && sw.elapsed.inMinutes < 6) {
      tries++;
      final count = sMin + rng.nextInt(sMax - sMin + 1);
      final stones = (List.of(free)..shuffle(rng)).take(count).toList()..sort();
      if (!seen.add(stones.join(','))) continue;
      final board = CornersBoard(size: n, stones: stones.toSet(), target: target);
      var mask = 0;
      for (final s in start) {
        mask |= 1 << s;
      }
      final m = cornersMinMoves(board, mask, limit: 30, maxStates: 4000000);
      if (m == null) continue;
      final search = CornersSearch(board, nodeLimit: 20000000);
      if (search.reachable(mask, m) != CornersVerdict.yes) continue;
      final line = [for (final (f, t) in search.line) '$f-$t'];
      out.add([n, k, stones, m, line.join(' '), g]);
      made++;
    }
    stderr.writeln('группа $g (доска $n, фишек $k, камней $sMin–$sMax): задач $made за ${sw.elapsed.inSeconds} с');
  }
  final file = File('assets/corners/puzzles.json');
  file.parent.createSync(recursive: true);
  file.writeAsStringSync(
    jsonEncode({
      'format': 'доска, фишек, камни (клетки, ряд 0 — верх), минимум ходов, линия решателя «откуда-куда», группа',
      'puzzles': out,
    }),
  );
  stdout.writeln('задач ${out.length}');
}
