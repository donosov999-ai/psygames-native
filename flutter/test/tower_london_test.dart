import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/tower_london/model.dart';

/// СВЕРКА «ЛОНДОНСКОЙ БАШНИ» С ЖИВЫМ TS.
///
/// Задачи выгружены живым генератором вместе с минимумом ходов; здесь
/// проверяется, что перенесённые правила дают те же законные ходы и что каждая
/// выгруженная задача ДЕЙСТВИТЕЛЬНО решается за свой минимум — иначе лестница
/// обещает то, чего нет.
void main() {
  late Map<String, dynamic> ref;
  late TolLevelSet set;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/tower-london-reference.json').readAsStringSync())
        as Map<String, dynamic>;
    set = TolLevelSet.fromJsonString(File('assets/levels/tower_london.json').readAsStringSync());
  });

  /// Поиск в ширину — ТОЛЬКО В ПРОБЕ. В игре его нет: минимум приходит данными.
  int bfs(TolState start, TolState goal) {
    final want = goal.key;
    if (start.key == want) return 0;
    final seen = <String>{start.key};
    var frontier = <TolState>[start];
    var depth = 0;
    while (frontier.isNotEmpty && depth < 16) {
      final next = <TolState>[];
      for (final st in frontier) {
        for (final m in st.legalMoves()) {
          final ns = st.move(m.from, m.to)!;
          if (!seen.add(ns.key)) continue;
          if (ns.key == want) return depth + 1;
          next.add(ns);
        }
      }
      frontier = next;
      depth += 1;
    }
    return depth;
  }

  test('🔴 законные ходы и минимум совпадают с живым TS', () {
    for (final raw in ref['checks'] as List) {
      final c = raw as Map<String, dynamic>;
      final caps = (c['caps'] as List).cast<int>();
      final start = TolState.fromJson(c['start'] as List, caps);
      final goal = TolState.fromJson(c['goal'] as List, caps);
      final legal = start.legalMoves().map((m) => '${m.from}→${m.to}').toList();
      final want = (c['legal'] as List).map((m) => '${(m as Map)['from']}→${m['to']}').toList();
      expect(legal, want, reason: 'законные ходы на ${c['start']} при вместимостях $caps');
      expect(bfs(start, goal), c['minMoves'], reason: 'минимум ${c['start']} → ${c['goal']}');
      expect(start.key == goal.key, c['same']);
    }
  });

  test('🔴 КАЖДАЯ выгруженная задача решается ровно за свой минимум (160 задач)', () {
    // Данные без этой проверки — обещание на слово. Здесь оно проверяется
    // ПОИСКОМ: если выгрузка разъедется с правилами, увидит проба, а не игрок.
    var checked = 0;
    final bad = <String>[];
    for (final level in set.levels) {
      for (final p in level.puzzles) {
        final got = bfs(p.start, p.goal);
        checked += 1;
        if (got != p.minMoves) {
          bad.add('L${level.level}: в файле ${p.minMoves}, поиском $got');
        }
      }
    }
    expect(checked, 160);
    expect(bad, isEmpty, reason: bad.take(3).join('\n'));
  });

  test('🔴 вместимости стержней и число шаров растут по лестнице', () {
    expect(set.rounds, 5);
    expect(set.byLevel(1).balls, 3);
    expect(set.byLevel(1).puzzles.first.caps, [3, 2, 1]);
    expect(set.byLevel(11).balls, 4, reason: 'четвёртый шар приходит с L11');
    expect(set.byLevel(11).puzzles.first.caps, [4, 3, 1]);
    expect(set.byLevel(10).targetMoves, 8, reason: 'длина плана упирается в восемь');
  });

  test('🔴 ход ограничен ВМЕСТИМОСТЬЮ, а не размером — тем и отличается от Ханоя', () {
    final s = TolState([
      ['R', 'G', 'B'],
      [],
      [],
    ], [3, 2, 1]);
    expect(s.canMove(0, 2), isTrue, reason: 'на пустой одноместный — можно');
    final after = s.move(0, 2)!;
    expect(after.canMove(0, 2), isFalse, reason: 'он занят: вместимость один');
    expect(after.canMove(0, 1), isTrue);
    expect(after.move(0, 2), isNull);
    expect(s.canMove(1, 0), isFalse, reason: 'с пустого брать нечего');
  });

  test('🔴 партия засчитывается по ЛИШНИМ ходам за все пять задач', () {
    expect(tolPassed(0, 5), isTrue);
    expect(tolPassed(5, 5), isTrue, reason: 'ровно порог — ещё взято');
    expect(tolPassed(6, 5), isFalse);
    expect(tolScore(5, 0, 0, 30), 970);
    expect(tolScore(5, 3, 2, 60), 810);
    expect(tolScore(0, 0, 0, 9999), 0, reason: 'счёт не уходит в минус');
  });
}
