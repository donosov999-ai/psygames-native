/// ДОСКИ САМУРАЯ — ДАННЫМИ, КАК У СУДОКУ.
///
/// Веб-версия собирает доску самурая на лету (`samuraiBuilder` + `runSteps`): пять
/// связанных сеток решаются вместе, и на верхних ступенях один заход занимает секунды.
/// Переносить построитель в Dart незачем — доски выгружены ТЕМ ЖЕ боевым путём и лежат
/// в `assets/levels/samurai-boards.json` (72 доски, 6 на каждую из 12 ступеней, 66 КБ).
///
/// 🔴 ЗАМЕР ВЫГРУЗКИ, КОТОРЫЙ НАДО ЗНАТЬ ПРО ЭТУ ЛЕСТНИЦУ: пустых клеток 155 на первой
/// ступени и 270–277 на ступенях с третьей по двенадцатую, ступень техник — 1, 2, 3, 3,
/// 4, 4… То есть сверху лестница почти плоская: десять ступеней отличаются семью
/// клетками. Это НЕ повод обрезать лестницу (правило «потолков нет»), это названное
/// число для отдельной задачи про ось трудности самурая.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart' show AssetManifest, rootBundle;

import 'rules.dart';

/// Готовая доска самурая: задача, решение и измеренная при выгрузке ступень.
class SamuraiBoard {
  const SamuraiBoard({
    required this.level,
    required this.puzzle,
    required this.solution,
    required this.tier,
    required this.blanks,
  });

  final int level;
  final List<List<int>> puzzle;
  final List<List<int>> solution;

  /// Ступень техник, посчитанная градатором при выгрузке; `null` — мера промолчала.
  final int? tier;

  /// Сколько клеток предстоит заполнить.
  final int blanks;
}

/// Доски самурая по ступеням.
class SamuraiLevels {
  SamuraiLevels._(this._boards);

  final Map<int, List<SamuraiBoard>> _boards;

  static const _asset = 'assets/levels/samurai-boards.json';

  static Future<SamuraiLevels> load() async {
    // ⚠️ Сначала опись, потом чтение: отсутствующий ассет Flutter КИДАЕТ `FlutterError`
    // (это `Error`, а не `Exception`) — на этом уже падала проба экрана судоку.
    var has = false;
    try {
      final manifest = await AssetManifest.loadFromAssetBundle(rootBundle);
      has = manifest.listAssets().contains(_asset);
    } catch (_) {
      has = false;
    }
    final byLevel = <int, List<SamuraiBoard>>{};
    if (has) {
      final json = jsonDecode(await rootBundle.loadString(_asset)) as Map<String, Object?>;
      for (final row in (json['boards'] as List).cast<Map<String, Object?>>()) {
        final lv = (row['level'] as num).toInt();
        (byLevel[lv] ??= <SamuraiBoard>[]).add(SamuraiBoard(
          level: lv,
          puzzle: parseSamurai(row['puzzle'] as String),
          solution: parseSamurai(row['solution'] as String),
          tier: (row['tier'] as num?)?.toInt(),
          blanks: (row['blanks'] as num).toInt(),
        ));
      }
    }
    return SamuraiLevels._(byLevel);
  }

  /// Сколько досок лежит на ступени.
  int boardsFor(int level) => _boards[level]?.length ?? 0;

  /// Доска ступени ПО НОМЕРУ — для проб: они проверяют каждую доску, а не ту, что
  /// выпала по зерну (мутация 23.09 на судоку показала, чем кончается выборка одной).
  SamuraiBoard? boardAt(int level, int index) {
    final pool = _boards[level];
    if (pool == null || index < 0 || index >= pool.length) return null;
    return pool[index];
  }

  /// Доска ступени. Одно зерно — одна и та же доска.
  SamuraiBoard? boardFor(int level, {int seed = 0}) {
    final pool = _boards[level.clamp(1, samuraiMaxLevel)];
    if (pool == null || pool.isEmpty) return null;
    final rnd = Random(seed == 0 ? DateTime.now().microsecondsSinceEpoch : seed);
    return pool[rnd.nextInt(pool.length)];
  }
}
