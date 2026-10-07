import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fractal/levels.dart' show fractalMaxLevel;
import 'package:psygames_flutter/games/samurai/rules.dart' show samuraiMaxLevel;
import 'package:psygames_flutter/games/sudoku/levels.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';

/// 🔴 СТУПЕНИ ЛЕСТНИЦЫ «СУДОКУ» В ДРУГОЙ ИГРЕ И БОССЫ — ДАННЫЕ ЦЕЛЫ (задача 4e3d3443).
///
/// Файл `assets/levels/sudoku-ladder-transit.json` — выгрузка плана уровней v4
/// (раздел sudoku-levels, 02.10.2026): 32 ступени в «Кошках» и семи сетках Тэтхэма,
/// 7 боссов. Пробы меряют то, что сломает ступень у человека молча:
///   · адрес, которого нет среди нативных экранов, — ступень не откроется;
///   · уровень чужой игры выше её потолка — откроется не тот уровень;
///   · держащий босс — по модели Дениса 13.09 (e1cde091) босс не держит никогда;
///   · блок не 1→4 одной игры — «вход в новое правило» рвётся посередине.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final file = jsonDecode(File('assets/levels/sudoku-ladder-transit.json').readAsStringSync())
      as Map<String, Object?>;
  final steps = (file['steps'] as List).cast<Map<String, Object?>>();
  final games = steps.where((r) => r['kind'] == 'game').toList();
  final bosses = steps.where((r) => r['boss'] == true).toList();

  test('объём плана v4: 32 ступени в других играх', () {
    expect(games, hasLength(32));
  });

  /// 🔴 РЕШЕНИЕ ДЕНИСА 07.10.2026: «босса чаще или реже — лучше привязать к смене модели
  /// генерации, но минимум каждые 10 уровней».
  test('🔴 босс — на каждой смене модели лестницы и не реже чем через 10 ступеней', () {
    final ladder = (jsonDecode(File('assets/levels/sudoku-ladder.json').readAsStringSync())
        as Map<String, Object?>)['ladder'] as List;
    String model(Map r) => '${r['n']}:${r['variant'] == 'none' && r['n'] == 9 ? 'bank' : r['variant']}';
    final rows = ladder.cast<Map<String, Object?>>();
    final bossAt = {for (final r in bosses) r['level']! as int: r};
    for (var i = 0; i < rows.length; i++) {
      final lv = rows[i]['level']! as int;
      final end = i == rows.length - 1 || model(rows[i + 1]) != model(rows[i]);
      if (end) expect(bossAt.containsKey(lv), isTrue, reason: 'ступень $lv — последняя модели ${model(rows[i])}, босса нет');
      if (!end && bossAt.containsKey(lv)) {
        expect(bossAt[lv]!['bossWhy'], 'interim', reason: 'ступень $lv: босс посреди модели без пометки «промежуточный»');
      }
    }
    var prev = 0;
    for (final lv in bossAt.keys.toList()..sort()) {
      expect(lv - prev, lessThanOrEqualTo(10), reason: 'от $prev до $lv без босса больше 10 ступеней');
      prev = lv;
    }
    expect(prev, 204, reason: 'последняя ступень плана — переход в генератор, там тоже босс');
  });

  test('каждый адрес — нативный экран этой сборки', () {
    final addresses = {
      for (final r in steps) ...[
        if (r['game'] != null) r['game']! as String,
        if (r['bossGame'] != null) r['bossGame']! as String,
      ],
    };
    for (final a in addresses) {
      final route = HybridApp.routeOf(a);
      expect(route, a, reason: '$a: адрес не находит экран, ступень не откроется нативно');
      expect(HybridApp.native.containsKey(route), isTrue, reason: a);
    }
  });

  test('ступень в игре: уровень задан числом, блок 1→4 одной игры', () {
    for (final r in games) {
      final lv = r['level']! as int, step = r['blockStep']! as int, size = r['blockSize']! as int;
      expect(r['gameLevel'], step, reason: 'ступень $lv: вход в новое правило с его ступени $step');
      final first = steps.firstWhere((x) => x['level'] == lv - step + 1,
          orElse: () => fail('ступень $lv: нет начала блока ${lv - step + 1}'));
      expect(first['game'], r['game'], reason: 'ступень $lv: блок из разных игр');
      expect(step, inInclusiveRange(1, size));
    }
  });

  test('босс не держит, и его уровень — в пределах той игры', () {
    const top = {'/games/sudoku-samurai': samuraiMaxLevel, '/games/sudoku-fractal': fractalMaxLevel};
    for (final r in bosses) {
      expect(r['bossBlocks'], isFalse, reason: 'босс ${r['level']}: по модели e1cde091 не держит');
      final lv = r['bossLevel'];
      if (lv == null) continue;
      final cap = top[r['bossGame']];
      expect(cap, isNotNull, reason: 'босс ${r['level']}: у ${r['bossGame']} нет лестницы — уровень некуда передать');
      expect(lv as int, inInclusiveRange(1, cap!), reason: 'босс ${r['level']}');
    }
  });

  test('лестница отдаёт строку перехода по номеру, а своя ступень — без строки', () async {
    final levels = await SudokuLevels.load();
    for (final r in steps) {
      expect(levels.transitRow(r['level']! as int), r, reason: 'ступень ${r['level']}');
    }
    expect(levels.transitRow(1), isNull);
    expect(levels.transitRow(95), isNull);
    // Потолок лестницы ступенями-переходами не растёт: досок 121–144 ещё нет.
    expect(levels.lastLevel, lessThan(games.first['level']! as int));
  });
}
