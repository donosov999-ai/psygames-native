/// ПАРТИИ ФРАКТАЛА — ДАННЫМИ.
///
/// Генератор веб-версии (`fractal-sudoku.ts`, 1903 строки) детерминирован по зерну и
/// быстр — 18–140 мс на партию. Переносить его в Dart незачем: партии выгружены тем же
/// генератором и лежат в `assets/levels/fractal-boards.json` — 90 штук, по 3 на каждую
/// из 30 ступеней, 231 КБ.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart' show AssetManifest, rootBundle;

import 'rules.dart';

const fractalMaxLevel = 30;

class FractalLevels {
  FractalLevels._(this._games);

  final Map<int, List<FractalPuzzle>> _games;

  static const _asset = 'assets/levels/fractal-boards.json';

  static Future<FractalLevels> load() async {
    // ⚠️ Сначала опись, потом чтение: отсутствующий ассет КИДАЕТ `FlutterError`.
    var has = false;
    try {
      final manifest = await AssetManifest.loadFromAssetBundle(rootBundle);
      has = manifest.listAssets().contains(_asset);
    } catch (_) {
      has = false;
    }
    final byLevel = <int, List<FractalPuzzle>>{};
    if (has) {
      final json = jsonDecode(await rootBundle.loadString(_asset)) as Map<String, Object?>;
      for (final g in (json['games'] as List).cast<Map<String, Object?>>()) {
        final lv = (g['level'] as num).toInt();
        (byLevel[lv] ??= <FractalPuzzle>[]).add(puzzleFromJson(g));
      }
    }
    return FractalLevels._(byLevel);
  }

  int gamesFor(int level) => _games[level]?.length ?? 0;

  /// Партия ступени ПО НОМЕРУ — для проб: они обязаны проверить каждую партию.
  FractalPuzzle? gameAt(int level, int index) {
    final pool = _games[level];
    if (pool == null || index < 0 || index >= pool.length) return null;
    return pool[index];
  }

  /// Партия ступени. Одно зерно — одна и та же партия.
  FractalPuzzle? gameFor(int level, {int seed = 0}) {
    final pool = _games[level.clamp(1, fractalMaxLevel)];
    if (pool == null || pool.isEmpty) return null;
    final rnd = Random(seed == 0 ? DateTime.now().microsecondsSinceEpoch : seed);
    return pool[rnd.nextInt(pool.length)];
  }
}

/// Разбор партии из выгрузки — общий для ассета и для проб по эталону.
FractalPuzzle puzzleFromJson(Map<String, Object?> g) {
  final root = (g['root'] as Map).cast<String, Object?>();
  return FractalPuzzle(
    level: (g['level'] as num?)?.toInt() ?? 1,
    rootPuzzle: parse81(root['puzzle'] as String),
    rootSolution: parse81(root['solution'] as String),
    rootBlanks: (root['blanks'] as num).toInt(),
    rootTier: (root['tier'] as num).toInt(),
    needsChildren: root['needsChildren'] == true,
    children: [
      for (final ch in (g['children'] as List).cast<Map<String, Object?>>())
        FractalChild(
          puzzle: parse81(ch['puzzle'] as String),
          solution: parse81(ch['solution'] as String),
          feedsCell: (ch['feedsCell'] as List).map((x) => (x as num).toInt()).toList(),
          blanks: (ch['blanks'] as num).toInt(),
          unlockCells: (ch['unlockCells'] as num).toInt(),
          tier: (ch['tier'] as num).toInt(),
        ),
    ],
    portals: [
      for (final p in (g['portals'] as List).cast<Map<String, Object?>>())
        FractalPortal(
          from: (p['from'] as num).toInt(),
          to: (p['to'] as num).toInt(),
          fromCell: (p['fromCell'] as List).map((x) => (x as num).toInt()).toList(),
          toCell: (p['toCell'] as List).map((x) => (x as num).toInt()).toList(),
          digit: (p['digit'] as num).toInt(),
        ),
    ],
  );
}
