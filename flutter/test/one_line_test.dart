import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/one_line/model.dart';

void main() {
  late OneLineLevelSet set;

  setUpAll(() {
    set = OneLineLevelSet.fromJsonString(File('assets/levels/one_line.json').readAsStringSync());
  });

  test('уровни выгружены: 30 штук', () {
    expect(set.levels.length, 30);
    expect(set.byLevel(1).edges.isNotEmpty, true);
  });

  test('🔴 эталонный маршрут проходит КАЖДЫЙ уровень: правила Dart совпали с генератором', () {
    final broken = <int>[];
    for (final l in set.levels) {
      if (!OneLineGame.solutionWins(l)) broken.add(l.level);
    }
    expect('уровни, где маршрут не проходит: ${broken.join(', ')}', 'уровни, где маршрут не проходит: ');
  });

  test('по одному ребру дважды не пройти, если оно обычное', () {
    final l = set.byLevel(1);
    final g = OneLineGame(l)..startAt(l.solutionVertexIds.first);
    final first = l.solutionEdgeIds.first;
    expect(g.walk(first), true);
    final e = l.edgeById(first);
    if (e.passes == 1) {
      g.current = e.b;
      expect(g.walk(first), false);
    }
  });

  test('отмена возвращает шаг', () {
    final l = set.byLevel(1);
    final g = OneLineGame(l)..startAt(l.solutionVertexIds.first);
    g.walk(l.solutionEdgeIds.first);
    g.walk(l.solutionEdgeIds[1]);
    expect(g.passesDone, 2);
    g.undo();
    expect(g.passesDone, 1);
    expect(g.trail.length, 1);
  });

  test('победа = пройдены все проходы', () {
    final l = set.byLevel(3);
    final g = OneLineGame(l)..startAt(l.solutionVertexIds.first);
    for (final id in l.solutionEdgeIds) {
      g.walk(id);
    }
    expect(g.isWon, true);
    g.undo();
    expect(g.isWon, false);
  });
}
