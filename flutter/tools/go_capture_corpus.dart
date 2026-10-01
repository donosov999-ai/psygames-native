// Корпус «Го: захват»: снять отмеченную белую группу за N ходов при лучшей защите.
//
// Задача 66dee70c (цепочка «Шахматы: семь новых игр», игра 6). Запуск из flutter/:
//     dart run tools/go_capture_corpus.dart   →   assets/go_capture/puzzles.json
//
// Свои задачи: случайная расстановка, цель — белая группа от двух камней с 2–3 дамэ,
// мёртвых групп на доске нет. Задача годится, если решатель (тот же код, что у игры:
// `lib/games/go_capture/rules.dart`) доказывает захват ровно за N ходов (за N−1 —
// нет) и первый ход единственный. Трети — по числу ходов-кандидатов. Зерно постоянное.
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:psygames_flutter/games/go_capture/rules.dart';

/// Группы лестницы: доска, ходов чёрных, камней на доске.
const groups = [
  (5, 2, 8),
  (5, 3, 8),
  (6, 2, 12),
  (6, 3, 12),
  (7, 3, 16),
  (7, 4, 16),
  (9, 3, 24),
  (9, 4, 24),
];
const perBand = 10;
const poolCap = 90;

String code(GoPosition p) => [
  for (final v in p.points)
    v == goBlack
        ? 'X'
        : v == goWhite
        ? 'O'
        : '.',
].join();

void main() {
  final rng = Random(20261002);
  final out = <List<Object>>[];
  for (var g = 0; g < groups.length; g++) {
    final (n, moves, stones) = groups[g];
    final pool = <List<Object>>[];
    final seen = <String>{};
    final sw = Stopwatch()..start();
    while (pool.length < poolCap && sw.elapsed.inMinutes < 4) {
      final pts = List<int>.filled(n * n, goEmpty);
      final cells = [for (var i = 0; i < n * n; i++) i]..shuffle(rng);
      final count = stones - 2 + rng.nextInt(5);
      for (var i = 0; i < count; i++) {
        pts[cells[i]] = i.isEven ? goBlack : goWhite;
      }
      final pos = GoPosition(n, pts);
      if (!seen.add(code(pos))) continue;
      final whites = [for (var i = 0; i < n * n; i++) if (pts[i] == goWhite) i];
      if (whites.isEmpty) continue;
      final t = whites[rng.nextInt(whites.length)];
      final tg = pos.group(t);
      if (tg.stones.length < 2 || tg.liberties.length < 2 || tg.liberties.length > 3) continue;
      var dead = false;
      for (var i = 0; i < n * n && !dead; i++) {
        if (pts[i] != goEmpty && pos.group(i).liberties.isEmpty) dead = true;
      }
      if (dead) continue;
      final solver = CaptureSolver(nodeLimit: 400000);
      if (solver.captures(pos, t, moves) != GoVerdict.yes) continue;
      if (solver.captures(pos, t, moves - 1) != GoVerdict.no) continue;
      final keys = solver.winningMoves(pos, t, moves);
      if (keys.length != 1) continue;
      final cands = solver.candidates(pos, t).where((m) => pos.play(m) != null).length;
      pool.add([n, code(pos), tg.stones.reduce(min), moves, keys.single, g, cands]);
    }
    pool.sort((a, b) => (a[6] as int).compareTo(b[6] as int));
    final third = pool.length ~/ 3;
    if (third < 5) {
      stderr.writeln('СТОП: группа $g — задач ${pool.length}, на трети не хватает');
      exit(1);
    }
    for (var band = 0; band < 3; band++) {
      final part = pool.sublist(band * third, (band + 1) * third)..shuffle(rng);
      for (final row in part.take(perBand)) {
        out.add([row[0], row[1], row[2], row[3], row[4], g, band]);
      }
    }
    stderr.writeln('группа $g (доска $n, ходов $moves): найдено ${pool.length} за ${sw.elapsed.inSeconds} с');
  }
  final file = File('assets/go_capture/puzzles.json');
  file.parent.createSync(recursive: true);
  file.writeAsStringSync(
    jsonEncode({
      'format': 'доска, пункты сверху вниз (. X O), камень цели, ходов чёрных, ключ, группа, треть',
      'puzzles': out,
    }),
  );
  stdout.writeln('задач ${out.length}');
}
