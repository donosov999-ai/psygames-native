// Выгрузка случайных партий сянци из bishop для сверки с оракулом (локально).
// Из flutter/: dart run tools/xiangqi_dump.dart <партий> > dump.txt
// Строка: ходы партии через пробел | для каждого ply — отсортированный набор ходов.
import 'dart:io';
import 'dart:math';

import 'package:bishop/bishop.dart';

void main(List<String> args) {
  final games = args.isEmpty ? 100 : int.parse(args.first);
  final rng = Random(20261002);
  for (var g = 0; g < games; g++) {
    final game = Game(variant: Xiangqi.xiangqi());
    final path = <String>[];
    final sets = <String>[];
    for (var ply = 0; ply < 160; ply++) {
      final moves = game.generateLegalMoves();
      final names = [for (final m in moves) game.toAlgebraic(m)]..sort();
      sets.add(names.join(','));
      if (moves.isEmpty) break;
      final m = moves[rng.nextInt(moves.length)];
      path.add(game.toAlgebraic(m));
      game.makeMove(m);
    }
    stdout.writeln('${path.join(' ')}|${sets.join(';')}');
  }
}
