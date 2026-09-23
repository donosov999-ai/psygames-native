/// РЕЖИМЫ КЛАССИЧЕСКОЙ ДОСКИ: «Небоскрёбы» и «Неравенства».
///
/// 🔴 ЭТО НЕ ОТДЕЛЬНЫЕ ИГРЫ, А РЕЖИМЫ ТОГО ЖЕ ЭКРАНА. В вебе они открываются адресом
/// `/games/sudoku?mode=towers` и `?mode=unequal`: та же доска, но правило другое, своя
/// мини-лестница на восемь ступеней и свой счётчик. Пока нативный экран их не умел,
/// две карточки развилки «Судоку» тянули человека обратно в веб-половину — ровно то,
/// от чего мы уходим (решение Дениса 23.09: «больше не хочу видеть веб-экраны»).
///
/// Доски возятся данными: выгружены тем же сборщиком, что у веб-экрана
/// (`sideBoardForStep`), в `assets/levels/sudoku-modes.json`.
///
/// ⚠️ СЧЁТЧИК СТУПЕНИ — ПОД ТЕМ ЖЕ КЛЮЧОМ, ЧТО В ВЕБЕ: `psygames_sudoku_<режим>_step_<профиль>`
/// (app/games/sudoku.tsx:818 и :1340). Разойдутся имена — человек, прошедший пять
/// ступеней небоскрёбов в вебе, начнёт нативно с первой, и это будет выглядеть как
/// потерянный прогресс.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart' show AssetManifest, rootBundle;

import '../../shell/shared_state.dart';
import 'rules.dart';

/// Режим доски. `none` — обычная лестница на 92 ступени.
enum SideMode { towers, unequal }

String sideModeName(SideMode m) => m == SideMode.towers ? 'towers' : 'unequal';

SideMode? sideModeFrom(String? s) => switch (s) {
      'towers' => SideMode.towers,
      'unequal' => SideMode.unequal,
      _ => null,
    };

/// Ступеней в мини-лестнице режима — восемь, как в вебе.
const sideSteps = 8;

/// Доска режима: задание, решение и его подсказки.
class SideBoard {
  const SideBoard({
    required this.step,
    required this.n,
    required this.br,
    required this.bc,
    required this.puzzle,
    required this.solution,
    required this.geometry,
    this.tier,
  });

  final int step;

  /// ⚠️ РАЗМЕР У РЕЖИМОВ РАЗНЫЙ, И ЭТО НЕ МЕЛОЧЬ. Небоскрёбы собираются 6×6 (блок 2×3),
  /// неравенства — 9×9 (блок 3×3): замер выгрузки, строки досок 36 и 81 символ. Экран,
  /// считающий девятку у обоих, нарисовал бы небоскрёбам пустые клетки.
  final int n;
  final int br;
  final int bc;
  final List<List<int>> puzzle;
  final List<List<int>> solution;

  /// Подсказки по краям (небоскрёбы) или знаки между клетками (неравенства).
  final BoardGeometry geometry;
  final int? tier;
}

/// Доски режимов — данными.
class SideModes {
  SideModes._(this._boards);

  /// режим → ступень → доски
  final Map<String, Map<int, List<SideBoard>>> _boards;

  static const asset = 'assets/levels/sudoku-modes.json';

  static Future<SideModes> load() async {
    var has = false;
    try {
      final manifest = await AssetManifest.loadFromAssetBundle(rootBundle);
      has = manifest.listAssets().contains(asset);
    } catch (_) {
      has = false;
    }
    final out = <String, Map<int, List<SideBoard>>>{};
    if (has) {
      final json = jsonDecode(await rootBundle.loadString(asset)) as Map<String, Object?>;
      for (final e in (json['modes'] as Map).cast<String, Object?>().entries) {
        final byStep = <int, List<SideBoard>>{};
        for (final row in (e.value as List).cast<Map<String, Object?>>()) {
          final step = (row['step'] as num).toInt();
          final side = _sideOf(row['puzzle'] as String);
          (byStep[step] ??= <SideBoard>[]).add(SideBoard(
            step: step,
            n: side,
            br: side == 6 ? 2 : 3,
            bc: side == 6 ? 3 : 3,
            puzzle: _parse(row['puzzle'] as String),
            solution: _parse(row['solution'] as String),
            tier: (row['tier'] as num?)?.toInt(),
            geometry: BoardGeometry(
              towers: row['towers'] == null
                  ? null
                  : TowersMap.fromJson((row['towers'] as Map).cast<String, Object?>()),
              unequal: row['unequal'] == null
                  ? null
                  : UnequalMap.fromJson((row['unequal'] as Map).cast<String, Object?>()),
            ),
          ));
        }
        out[e.key] = byStep;
      }
    }
    return SideModes._(out);
  }

  /// Сторона доски — из длины строки: 36 символов это 6×6, 81 — 9×9.
  static int _sideOf(String s) => sqrt(s.length).round();

  static List<List<int>> _parse(String s) {
    final n = _sideOf(s);
    return [
      for (var r = 0; r < n; r++) [for (var c = 0; c < n; c++) int.parse(s[r * n + c])],
    ];
  }

  int boardsFor(SideMode mode, int step) => _boards[sideModeName(mode)]?[step]?.length ?? 0;

  /// Доска ступени ПО НОМЕРУ — пробы обязаны проверить каждую, а не ту, что выпала.
  SideBoard? boardAt(SideMode mode, int step, int index) {
    final pool = _boards[sideModeName(mode)]?[step];
    if (pool == null || index < 0 || index >= pool.length) return null;
    return pool[index];
  }

  /// Доска ступени. Одно зерно — одна и та же доска.
  SideBoard? boardFor(SideMode mode, int step, {int seed = 0}) {
    final pool = _boards[sideModeName(mode)]?[step.clamp(1, sideSteps)];
    if (pool == null || pool.isEmpty) return null;
    final rnd = Random(seed == 0 ? DateTime.now().microsecondsSinceEpoch : seed);
    return pool[rnd.nextInt(pool.length)];
  }
}

/// Счётчик ступени режима — ТОТ ЖЕ ключ, что пишет веб-половина.
class SideProgress {
  SideProgress(this.state, this.mode, {String? profile})
      : _profile = profile;   // ignore: prefer_initializing_formals — поле приватное, параметр именованный

  final SharedState state;
  final SideMode mode;
  final String? _profile;

  String get profile => _profile ?? state.activeProfile;

  String get key =>
      '${SharedState.prefix}sudoku_${sideModeName(mode)}_step_$profile';

  int get step {
    final raw = state.get(key);
    final n = int.tryParse(raw ?? '') ?? 1;
    return n.clamp(1, sideSteps);
  }

  /// Прошёл ступень — следующая. Выше восьмой лестница не идёт: там её конец,
  /// и упираться в потолок молча нельзя, поэтому число держится на восьми.
  void win() {
    final next = (step + 1).clamp(1, sideSteps);
    state.set(key, '$next');
  }
}
