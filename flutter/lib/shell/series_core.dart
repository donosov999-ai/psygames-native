/// Движок серии блоков — перенос `frontend/src/services/series.ts` (VER 1).
///
/// Серия — несколько заданий подряд по ОДНОМУ материалу; из времён блоков считаются
/// разности (аддитивный метод Стернберга: каждый следующий блок добавляет ровно одно
/// требование, разность — его цена). Блоки и уровни игры живут в самой игре; здесь только
/// общее: запись прогона, полнота, разности, запись партии, правило подъёма уровня.
///
/// ⚠️ У «Шахмат вслепую» свой перенос того же (`chess_blind/series_run.dart`, вместе с
/// шахматной частью). Этот — общий, без шахмат; первым его берёт «Корректура» (f4bb47dc).
library;

import 'dart:math';

/// Сыгранный блок серии.
class SeriesBlock {
  const SeriesBlock({required this.key, required this.timeMs, required this.errors, required this.done});
  final String key;
  final int timeMs;
  final int errors;

  /// Доигран до конца (а не оборван уходом).
  final bool done;

  Map<String, Object?> toJson() => {'key': key, 'time_ms': timeMs, 'errors': errors, 'done': done};
}

/// Прогон серии: план блоков и сыгранные блоки по порядку.
class SeriesRun {
  const SeriesRun({
    required this.gameType,
    required this.level,
    required this.planned,
    required this.blocks,
    required this.startedAt,
  });
  final String gameType;
  final int level;
  final List<String> planned;
  final List<SeriesBlock> blocks;
  final int startedAt;
}

/// Сколько прогонов подряд блок должен быть взят, чтобы уровень серии поднялся.
const int stableRuns = 2;

SeriesRun startSeries(String gameType, int level, List<String> planned, int nowMs) {
  if (planned.length < 2) throw ArgumentError('A series needs at least two blocks: one block gives no difference');
  return SeriesRun(gameType: gameType, level: level, planned: planned, blocks: const [], startedAt: nowMs);
}

SeriesRun recordBlock(SeriesRun run, SeriesBlock block) => SeriesRun(
      gameType: run.gameType,
      level: run.level,
      planned: run.planned,
      blocks: [...run.blocks, block],
      startedAt: run.startedAt,
    );

/// Полная серия: все блоки плана, по порядку, каждый доигран.
bool seriesComplete(SeriesRun run) {
  if (run.blocks.length != run.planned.length) return false;
  for (var i = 0; i < run.blocks.length; i++) {
    if (run.blocks[i].key != run.planned[i] || !run.blocks[i].done) return false;
  }
  return true;
}

/// Разности времён блоков против первого — только у полной серии.
Map<String, int>? seriesDiffs(SeriesRun run) {
  if (!seriesComplete(run)) return null;
  final base = run.blocks.first;
  return {for (final b in run.blocks.skip(1)) '${b.key}_minus_${base.key}': b.timeMs - base.timeMs};
}

/// Запись партии серии — поля веба (`seriesSession`).
({String gameType, int score, double timeSeconds, int errors, String mode, Map<String, Object?> details})
    seriesSession(SeriesRun run) {
  final complete = seriesComplete(run);
  final diffs = seriesDiffs(run);
  final totalMs = run.blocks.fold<int>(0, (s, b) => s + b.timeMs);
  final errors = run.blocks.fold<int>(0, (s, b) => s + b.errors);
  final details = <String, Object?>{
    'level': run.level,
    'series_complete': complete,
    'blocks': [for (final b in run.blocks) b.toJson()],
    'diffs': ?diffs,
  };
  final perBlock = run.blocks.isEmpty ? 0.0 : totalMs / run.blocks.length;
  return (
    gameType: run.gameType,
    score: complete ? max(0, _jsRound(60000 / (perBlock < 1 ? 1 : perBlock))) : 0,
    timeSeconds: totalMs / 1000,
    errors: errors,
    mode: 'series-l${run.level}',
    details: details,
  );
}

/// `Math.round` веба: половина — вверх (к +∞), а не от нуля.
int _jsRound(double v) => (v + 0.5).floor();

int bumpStreak(int previous, bool taken) => taken ? previous + 1 : 0;

/// Самый слабый блок держит уровень: подъём — когда у КАЖДОГО блока [stableRuns] подряд.
({bool raise, String weakest}) seriesLevelMove(Map<String, int> streaks, List<String> planned) {
  var weakest = planned.first;
  var lowest = double.infinity;
  for (final key in planned) {
    final s = (streaks[key] ?? 0).toDouble();
    if (s < lowest) {
      lowest = s;
      weakest = key;
    }
  }
  return (raise: lowest >= stableRuns, weakest: weakest);
}

/// Стартовый уровень серии — самый низкий из уровней блоков.
({int level, Map<String, int> perBlock}) seriesStartLevel(Map<String, int> levels, List<String> planned) {
  final perBlock = <String, int>{};
  int? lowest;
  for (final key in planned) {
    final l = levels[key] ?? 1;
    perBlock[key] = l;
    if (lowest == null || l < lowest) lowest = l;
  }
  return (level: lowest ?? 1, perBlock: perBlock);
}
