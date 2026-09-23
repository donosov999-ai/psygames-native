import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/dots_connect/model.dart';

void main() {
  late DotsLevelSet set;

  setUpAll(() {
    set = DotsLevelSet.fromJsonString(File('assets/levels/dots_connect.json').readAsStringSync());
  });

  test('уровни выгружены: 40 штук и тренировка', () {
    expect(set.levels.length, 40);
    expect(set.training.pairs.isNotEmpty, true);
    expect(set.byLevel(1).size, 5);
  });

  test('🔴 эталонное решение выигрывает КАЖДЫЙ уровень: правила Dart совпали с генератором', () {
    final broken = <int>[];
    for (final l in [set.training, ...set.levels]) {
      if (!DotsGame.solutionWins(l)) broken.add(l.level);
    }
    expect('уровни, где решение не выигрывает: ${broken.join(', ')}', 'уровни, где решение не выигрывает: ');
  });

  test('путь не проходит по чужой клетке', () {
    final l = set.byLevel(1);
    final g = DotsGame(l);
    final first = l.solution.entries.first;
    expect(g.drawPath(first.key, first.value), true);
    final second = l.solution.entries.elementAt(1);
    final crossing = [second.value.first, first.value[1], second.value.last];
    expect(g.drawPath(second.key, crossing), false);
  });

  test('путь идёт только по соседним клеткам и от точки до точки', () {
    final l = set.byLevel(1);
    final g = DotsGame(l);
    final p = l.pairs.first;
    expect(g.drawPath(p.id, [p.ends.first, p.ends.last]),
        p.ends.first.isNeighbour(p.ends.last));
    expect(g.drawPath(p.id, [p.ends.first, Cell(99, 99), p.ends.last]), false);
  });

  test('победа требует занять всё поле, а не только соединить пары', () {
    final l = set.byLevel(1);
    final g = DotsGame(l);
    for (final e in l.solution.entries) {
      g.drawPath(e.key, e.value);
    }
    expect(g.isWon, true);
    g.clearPath(l.pairs.first.id);
    expect(g.isWon, false);
  });
}
