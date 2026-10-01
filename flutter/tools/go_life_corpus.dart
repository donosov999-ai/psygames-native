// Корпус «Го: жизнь»: сделать отмеченную чёрную группу безусловно живой за N ходов.
//
// Задача 66dee70c, часть 2. Запуск из flutter/:
//     dart run tools/go_life_corpus.dart [группа]   →   assets/go_capture/life.json
//
// Свои задачи: случайная плотная расстановка; цель — чёрная группа от трёх камней,
// её пространство (пункты, достижимые от неё по чёрным и пустым) — от 4 до 14 пунктов,
// из них пустых 3–9: группа зажата, бежать некуда. Сейчас она не жива по Бенсону.
// Задача годится, если решатель (`lib/games/go_capture/life.dart`, тот же, что судит
// игру) доказывает жизнь ровно за N ходов (за N−1 — нет) и первый ход единственный.
// Мёртвых групп на доске нет. Трети — по числу ходов-кандидатов. Зерно постоянное.
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:psygames_flutter/games/go_capture/life.dart';
import 'package:psygames_flutter/games/go_capture/rules.dart';

/// Группы лестницы: доска, ходов чёрных.
const groups = [(5, 1), (6, 1), (5, 2), (6, 2), (7, 2), (6, 3), (7, 3), (9, 3)];
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

/// Пространство группы: пункты, достижимые от её камней по чёрным и пустым.
Set<int> spaceOf(GoPosition pos, int t) {
  final space = <int>{t};
  final stack = [t];
  while (stack.isNotEmpty) {
    final q = stack.removeLast();
    for (final m in pos.neighbours(q)) {
      if (pos.at(m) != goWhite && space.add(m)) stack.add(m);
    }
  }
  return space;
}

void main(List<String> args) {
  final only = args.isEmpty ? null : int.parse(args.first);
  final rng = Random(20261003);
  final out = <List<Object>>[];
  for (var g = 0; g < groups.length; g++) {
    final (n, moves) = groups[g];
    if (only != null && g != only) continue;
    final pool = <List<Object>>[];
    final seen = <String>{};
    final sw = Stopwatch()..start();
    var tried = 0;
    while (pool.length < poolCap && sw.elapsed.inMinutes < 4) {
      tried++;
      final pts = List<int>.filled(n * n, goEmpty);
      for (var i = 0; i < n * n; i++) {
        final r = rng.nextDouble();
        pts[i] = r < 0.36 ? goBlack : r < 0.72 ? goWhite : goEmpty;
      }
      final pos = GoPosition(n, pts);
      if (!seen.add(code(pos))) continue;
      var dead = false;
      for (var i = 0; i < n * n && !dead; i++) {
        if (pts[i] != goEmpty && pos.group(i).liberties.isEmpty) dead = true;
      }
      if (dead) continue;
      final blacks = [for (var i = 0; i < n * n; i++) if (pts[i] == goBlack) i];
      final t = blacks[rng.nextInt(blacks.length)];
      final tg = pos.group(t);
      if (tg.stones.length < 3) continue;
      final space = spaceOf(pos, t);
      final empty = space.where((q) => pos.at(q) == goEmpty).length;
      if (space.length < 4 || space.length > 14 || empty < 3 || empty > 9) continue;
      if (LifeSolver.alive(pos, t)) continue;
      final solver = LifeSolver(nodeLimit: 300000);
      if (solver.lives(pos, t, moves) != GoVerdict.yes) continue;
      if (moves > 1 && solver.lives(pos, t, moves - 1) != GoVerdict.no) continue;
      final keys = solver.winningMoves(pos, t, moves);
      if (keys.length != 1) continue;
      final cands = solver.candidates(pos, t).where((m) => pos.play(m) != null).length;
      pool.add([n, code(pos), tg.stones.reduce(min), moves, keys.single, g, cands]);
    }
    pool.sort((a, b) => (a[6] as int).compareTo(b[6] as int));
    final third = pool.length ~/ 3;
    stdout.writeln('группа $g (доска $n, ходов $moves): найдено ${pool.length} из $tried за ${sw.elapsed.inSeconds} с');
    if (third < 5) {
      stderr.writeln('СТОП: группа $g — задач ${pool.length}, на трети не хватает');
      if (only == null) exit(1);
      continue;
    }
    for (var band = 0; band < 3; band++) {
      final part = pool.sublist(band * third, (band + 1) * third)..shuffle(rng);
      for (final row in part.take(perBand)) {
        out.add([row[0], row[1], row[2], row[3], row[4], g, band]);
      }
    }
  }
  if (only != null) return;
  final file = File('assets/go_capture/life.json');
  file.writeAsStringSync(
    jsonEncode({
      'format': 'доска, пункты сверху вниз (. X O), камень цели, ходов чёрных, ключ, группа, треть',
      'puzzles': out,
    }),
  );
  stdout.writeln('задач ${out.length}');
}
