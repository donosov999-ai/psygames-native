/// ЗАМЕР СЕРИИ И ПРОГРЕСС ПО БЛОКАМ — перенос с живого TS:
/// `frontend/src/services/series.ts` (прогон, разности, сессия, уровень модели C)
/// и `frontend/src/games/chess-blind/core/progress.ts` (уровни и серии блоков).
///
/// 🔴 ЗАЧЕМ СЕРИЯ ВООБЩЕ. Три блока идут по ОДНОЙ позиции, и меряется не время
/// блока, а РАЗНОСТЬ: T₂ − T₁ — цена правила хода коня, T₃ − T₁ — цена удержания
/// позиции в памяти. Перенос 24.09 показывал вопросы без часов, то есть серия
/// не мерила ничего, ради чего она сделана.
///
/// ⚠️ Неполная серия разностей не даёт ВООБЩЕ — не нули, а отсутствие ключа:
/// ноль читался бы как «цена нулевая».
library;

import 'dart:convert';
import 'dart:math';

import 'bands.dart';
import 'series.dart';

/// Один блок: правило, время, ошибки, доведён ли до конца.
class SeriesBlock {
  const SeriesBlock({
    required this.key,
    required this.timeMs,
    required this.errors,
    required this.done,
  });
  final String key;
  final int timeMs;
  final int errors;
  final bool done;
}

/// Прогон серии: уровень общий для всех блоков, порядок задан до старта.
class SeriesRun {
  const SeriesRun({
    required this.gameType,
    required this.level,
    required this.planned,
    this.blocks = const [],
  });
  final String gameType;
  final int level;
  final List<String> planned;
  final List<SeriesBlock> blocks;

  SeriesRun withBlock(SeriesBlock b) => SeriesRun(
    gameType: gameType,
    level: level,
    planned: planned,
    blocks: [...blocks, b],
  );
}

/// Сколько раз подряд блок должен быть взят, чтобы считаться устойчивым.
const int stableRuns = 2;

/// Тип партии серии — тот же, что пишет веб.
const String seriesGameType = 'chess_blind_series';

/// Серия полна: все блоки, в заданном порядке, каждый доведён до конца.
bool seriesComplete(SeriesRun run) {
  if (run.blocks.length != run.planned.length) return false;
  for (var i = 0; i < run.blocks.length; i++) {
    final b = run.blocks[i];
    if (b.key != run.planned[i] || !b.done) return false;
  }
  return true;
}

/// Разности относительно ПЕРВОГО блока; у неполной серии — `null`.
Map<String, int>? seriesDiffs(SeriesRun run) {
  if (!seriesComplete(run)) return null;
  final base = run.blocks.first;
  return {
    for (final b in run.blocks.skip(1))
      '${b.key}_minus_${base.key}': b.timeMs - base.timeMs,
  };
}

/// ОДНА сессия на всю серию — поля те же, что у веба (`seriesSession`).
({
  int score,
  int timeSeconds,
  int errors,
  String mode,
  Map<String, Object?> details,
})
seriesSession(SeriesRun run) {
  final complete = seriesComplete(run);
  final diffs = seriesDiffs(run);
  final totalMs = run.blocks.fold<int>(0, (s, b) => s + b.timeMs);
  final errors = run.blocks.fold<int>(0, (s, b) => s + b.errors);
  final details = <String, Object?>{
    'level': run.level,
    'series_complete': complete,
    'blocks': [
      for (final b in run.blocks)
        {'key': b.key, 'time_ms': b.timeMs, 'errors': b.errors, 'done': b.done},
    ],
    'diffs': ?diffs,
  };
  final perBlock = run.blocks.isEmpty ? 1 : max(1, totalMs / run.blocks.length);
  return (
    score: complete ? max(0, (60000 / perBlock).round()) : 0,
    timeSeconds: (totalMs / 1000).round(),
    errors: errors,
    mode: 'series-l${run.level}',
    details: details,
  );
}

int bumpStreak(int previous, bool taken) => taken ? previous + 1 : 0;

/// Модель C: уровень растёт, только когда устойчивы ВСЕ блоки; держит слабейший.
({bool raise, String weakest}) seriesLevelMove(
  Map<String, int> streaks,
  List<String> planned,
) {
  var weakest = planned.first;
  var least = 1 << 30;
  for (final key in planned) {
    final s = streaks[key] ?? 0;
    if (s < least) {
      least = s;
      weakest = key;
    }
  }
  return (raise: least >= stableRuns, weakest: weakest);
}

/// Блок взят: доигран и ошибок не больше допуска. Времени здесь нет.
bool blockTaken(SeriesBlock b) => b.done && b.errors <= chessBlockMaxErrors;

/// Уровни и серии блоков — то, что лежит в `psygames_chess_blind_series_<профиль>`.
class ChessSeriesProgress {
  const ChessSeriesProgress({required this.levels, required this.streaks});

  static const empty = ChessSeriesProgress(
    levels: {
      'square': chessMinLevel,
      'knight': chessMinLevel,
      'recall': chessMinLevel,
    },
    streaks: {'square': 0, 'knight': 0, 'recall': 0},
  );

  final Map<String, int> levels;
  final Map<String, int> streaks;

  static String keyFor(String profile) =>
      'psygames_chess_blind_series_$profile';

  /// Мусор и пропуски — это минимум, а не падение.
  static ChessSeriesProgress parse(String? raw) {
    if (raw == null || raw.isEmpty) return empty;
    try {
      final j = jsonDecode(raw) as Map<String, dynamic>;
      final levels = {...empty.levels};
      final streaks = {...empty.streaks};
      final l = j['levels'];
      final s = j['streaks'];
      for (final key in chessSeriesPlan) {
        if (l is Map && l[key] is num) levels[key] = clampLevel(l[key] as num);
        if (s is Map && s[key] is num && (s[key] as num) >= 0) {
          streaks[key] = (s[key] as num).floor();
        }
      }
      return ChessSeriesProgress(levels: levels, streaks: streaks);
    } catch (_) {
      return empty;
    }
  }

  String encode() => jsonEncode({'levels': levels, 'streaks': streaks});
}

/// Вход в серию: общий уровень — МИНИМУМ по блокам («подтянуть слабое»).
({int level, PieceBand band, Map<String, int> perBlock}) seriesEntry(
  ChessSeriesProgress p,
) {
  var least = 1 << 30;
  for (final key in chessSeriesPlan) {
    least = min(least, p.levels[key] ?? 1);
  }
  final level = clampLevel(least);
  return (level: level, band: bandForLevel(level), perBlock: {...p.levels});
}

/// Что стало с уровнем после прогона. Прерванная серия не двигает ничего.
({
  ChessSeriesProgress progress,
  bool raised,
  String weakest,
  int nextLevel,
  PieceBand band,
  int runsLeft,
})
afterSeriesRun(ChessSeriesProgress progress, SeriesRun run) {
  final level = clampLevel(run.level);
  if (!seriesComplete(run)) {
    final move = seriesLevelMove(progress.streaks, chessSeriesPlan);
    final next = seriesEntry(progress).level;
    return (
      progress: progress,
      raised: false,
      weakest: move.weakest,
      nextLevel: next,
      band: bandForLevel(next),
      runsLeft: max(0, stableRuns - (progress.streaks[move.weakest] ?? 0)),
    );
  }
  final streaks = {...progress.streaks};
  for (final b in run.blocks) {
    streaks[b.key] = bumpStreak(progress.streaks[b.key] ?? 0, blockTaken(b));
  }
  final move = seriesLevelMove(streaks, chessSeriesPlan);
  if (!move.raise) {
    return (
      progress: ChessSeriesProgress(levels: progress.levels, streaks: streaks),
      raised: false,
      weakest: move.weakest,
      nextLevel: level,
      band: bandForLevel(level),
      runsLeft: max(0, stableRuns - (streaks[move.weakest] ?? 0)),
    );
  }
  final grown = min(chessMaxLevel(), level + 1);
  final raised = grown > level;
  final levels = raised
      ? {
          for (final k in chessSeriesPlan)
            k: max(progress.levels[k] ?? 1, grown),
        }
      : progress.levels;
  // Новый уровень — новый отсчёт устойчивости: прошлые прогоны были на другой доске.
  return (
    progress: ChessSeriesProgress(
      levels: levels,
      streaks: raised ? {for (final k in chessSeriesPlan) k: 0} : streaks,
    ),
    raised: raised,
    weakest: move.weakest,
    nextLevel: grown,
    band: bandForLevel(grown),
    runsLeft: raised ? stableRuns : 0,
  );
}
