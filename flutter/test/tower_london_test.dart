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
    // ⚠️ ПОТОЛОК ПОИСКА — НЕ ПРАВИЛО ИГРЫ, А ЗАЩИТА ОТ ВЕЧНОГО ЦИКЛА, и он
    // обязан быть ВЫШЕ самого длинного плана в лестнице: с 16 он молча отдал
    // бы «не нашёл» на семишаровых ступенях, где план доходит до 21.
    while (frontier.isNotEmpty && depth < 24) {
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

  test('🔴 КАЖДАЯ выгруженная задача решается ровно за свой минимум (200 задач)', () {
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
    // 📍 160 → 200 (25.09.2026): лестница выросла с 20 ступеней до 25 — добавлен
    // отрезок на СЕМИ шарах (решение Дениса «растить дальше новой осью»).
    // Число здесь — перепись, а не порог: оно обязано расти вместе с лестницей и
    // обязано покраснеть, если ступени молча пропадут.
    expect(checked, 200);
    expect(bad, isEmpty, reason: bad.take(3).join('\n'));
  });

  test('🔴 вместимости стержней и число шаров растут по лестнице', () {
    expect(set.rounds, 5);
    expect(set.byLevel(1).balls, 3);
    expect(set.byLevel(1).puzzles.first.caps, [3, 2, 1]);
    expect(set.byLevel(8).balls, 4, reason: 'четвёртый шар приходит с L8');
    expect(set.byLevel(8).puzzles.first.caps, [4, 3, 1]);
    expect(set.byLevel(14).balls, 6, reason: 'шесть шаров — третий отрезок лестницы');
    expect(set.byLevel(14).puzzles.first.caps, [4, 4, 3]);
    expect(set.byLevel(21).balls, 7, reason: 'седьмой шар приходит с L21');
    expect(set.byLevel(21).puzzles.first.caps, [4, 4, 3],
        reason: 'стержни ТЕ ЖЕ: растёт теснота, а не размер — лишнее место делает игру легче '
            '(замер: 4-4-4 на шести шарах даёт предел 15 против 16 у 4-4-3)');

    /*
     * 🔴 ЗДЕСЬ СТОЯЛО `expect(set.byLevel(10).targetMoves, 8)` С ПОЯСНЕНИЕМ
     * «длина плана упирается в восемь» — И ЭТО БЫЛО НЕ ЗАМЕРОМ, А ПЕРЕНЕСЁННЫМ
     * ИЗ ВЕБА ПРЕДЕЛОМ `Math.min(8, 1 + lvl.level)`. Проба закрепляла ПОТОЛОК
     * как правило игры, и из-за неё четырнадцать ступеней подряд с одинаковой
     * трудностью выглядели нормой.
     * Замер 24.09.2026 (перебор всего пространства положений, поиск в ширину из
     * каждого): у конфигурации «4 шара, ёмкости 4-3-1», которая стояла с L11,
     * ДИАМЕТР 14 ходов; у «6 шаров, 4-4-3» — 16. Потолок был не у игры.
     */
    expect(set.byLevel(10).targetMoves, greaterThan(8),
        reason: 'плана длиннее восьми у игры полно — предел 8 был веб-наследием');
    /*
     * 📍 16 → 21 (25.09.2026). Решение Дениса на вопрос «оставить ли верх на
     * шести шарах»: растить дальше новой осью. Замер перебором:
     *   6 шаров 4-4-3 — 11 520 положений, предел 16
     *   7 шаров 4-4-3 — 70 560 положений, предел 21  ← взято
     *   8 шаров 4-4-3 —  7 200 положений, предел 19  ⚠️ доска почти забита
     *   6 шаров 4-4-4 — 13 680 положений, предел 15  ⚠️ больше места — ЛЕГЧЕ
     *   4 стержня 4-3-2-1, 6 шаров — предел 14       ⚠️ лишний стержень — ЛЕГЧЕ
     * Верх лестницы по-прежнему стоит на ИЗМЕРЕННОМ пределе конфигурации, а не
     * на круглом числе.
     */
    expect(set.levels.last.targetMoves, 21,
        reason: 'верх лестницы стоит на измеренном пределе, а не на круглом числе');
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
