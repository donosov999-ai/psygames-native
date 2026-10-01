// Выгрузка случайных партий сёги из своего движка для сверки с Fairy-Stockfish
// (локально, в приложение не идёт). Из flutter/:
//     dart run tools/shogi_dump.dart <партий> > dump.txt
// Строка: ходы партии через пробел | для каждого ply — отсортированный набор ходов.
import 'dart:io';
import 'dart:math';

import 'package:psygames_flutter/games/xiangqi_shogi/shogi_rules.dart';

void main(List<String> args) {
  final games = args.isEmpty ? 100 : int.parse(args.first);
  final rng = Random(20261002);
  for (var g = 0; g < games; g++) {
    var pos = ShogiPosition.parse(ShogiPosition.startFen);
    final path = <String>[];
    final sets = <String>[];
    for (var ply = 0; ply < 220; ply++) {
      final moves = pos.legalMoves()..sort();
      sets.add(moves.join(','));
      if (moves.isEmpty) break;
      // Взятия и сбросы чаще: так быстрее набираются руки и эндшпиль.
      final drops = moves.where((m) => m.contains('@')).toList();
      final m = drops.isNotEmpty && rng.nextInt(3) == 0
          ? drops[rng.nextInt(drops.length)]
          : moves[rng.nextInt(moves.length)];
      path.add(m);
      pos = pos.apply(m);
    }
    stdout.writeln('${path.join(' ')}|${sets.join(';')}');
  }
}
