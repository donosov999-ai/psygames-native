/// Блоки серии «Корректуры» и прогресс — перенос `core/blocks.ts` и `core/progress.ts` (VER 1).
///
/// Три блока по одному полю: «Знак» (найти заданные буквы — зрительный поиск), «Слово»
/// (собрать все слова — плюс сегментация), «Смысл» (только слова одной категории — плюс
/// семантика). Блок взят, когда доигран и ошибок не больше [proofBlockMaxErrors]; уровень
/// серии (сторона поля) растёт, когда КАЖДЫЙ блок взят [stableRuns] прогонов подряд.
library;

import 'dart:convert';
import 'dart:math';

import '../../../shell/series_core.dart';
import '../../fillwords/core/fillwords.dart';
import 'series_field.dart';

const List<String> proofSeriesPlan = ['sign', 'word', 'sense'];
const String proofSeriesGameType = 'proofreading_series';

/// Ошибок в блоке не больше — иначе блок сыгран, но не взят.
const int proofBlockMaxErrors = 2;

class ProofSeriesState {
  const ProofSeriesState({
    required this.field,
    required this.blockIndex,
    required this.taken,
    required this.session,
    required this.errors,
  });
  final ProofField field;
  final int blockIndex;

  /// Взятые клетки блока «Знак».
  final List<bool> taken;

  /// Партия филвордов блоков «Слово» и «Смысл».
  final FillwordsSession session;
  final int errors;

  ProofSeriesState copyWith({List<bool>? taken, FillwordsSession? session, int? errors}) => ProofSeriesState(
        field: field,
        blockIndex: blockIndex,
        taken: taken ?? this.taken,
        session: session ?? this.session,
        errors: errors ?? this.errors,
      );
}

String blockKeyAt(int blockIndex) =>
    blockIndex >= 0 && blockIndex < proofSeriesPlan.length ? proofSeriesPlan[blockIndex] : proofSeriesPlan.last;

ProofSeriesState openBlock(ProofField field, int blockIndex) => ProofSeriesState(
      field: field,
      blockIndex: blockIndex,
      taken: List<bool>.filled(field.puzzle.letters.length, false),
      session: createFillwordsSession(field.puzzle),
      errors: 0,
    );

/// Следующий блок — по ТОМУ ЖЕ полю (`nextBlock`): поле переносится как есть.
ProofSeriesState nextBlock(ProofSeriesState state) => openBlock(state.field, state.blockIndex + 1);

int blockStepsTotal(ProofField field, String key) => switch (key) {
      'sign' => field.signCells.length,
      'word' => field.puzzle.words.length,
      _ => field.senseWords.length,
    };

int blockStep(ProofSeriesState state) => switch (blockKeyAt(state.blockIndex)) {
      'sign' => state.taken.where((t) => t).length,
      'word' => state.session.found.length,
      _ => state.session.found.where(state.field.senseWords.contains).length,
    };

bool blockDone(ProofSeriesState state) => blockStep(state) >= blockStepsTotal(state.field, blockKeyAt(state.blockIndex));

enum ProofPress { hit, miss, ignored }

/// Нажатие по клетке в блоке «Знак» (`pressSignCell`).
({ProofSeriesState state, ProofPress result}) pressSignCell(ProofSeriesState state, int index) {
  if (blockKeyAt(state.blockIndex) != 'sign') return (state: state, result: ProofPress.ignored);
  final letters = state.field.puzzle.letters;
  if (index < 0 || index >= letters.length || state.taken[index]) return (state: state, result: ProofPress.ignored);
  if (!state.field.signs.contains(letters[index])) {
    return (state: state.copyWith(errors: state.errors + 1), result: ProofPress.miss);
  }
  final taken = [...state.taken];
  taken[index] = true;
  return (state: state.copyWith(taken: taken), result: ProofPress.hit);
}

/// Линия в блоках «Слово» и «Смысл» (`pressWordTrace`). Дрожь руки (прыжок, повтор, тап) —
/// не ответ; линия мимо слова и чужое слово в «Смысле» — промах.
({ProofSeriesState state, ProofPress result}) pressWordTrace(ProofSeriesState state, List<int> path) {
  final key = blockKeyAt(state.blockIndex);
  if (key == 'sign') return (state: state, result: ProofPress.ignored);
  final trace = resolveTrace(state.session, path);
  if (!trace.ok) {
    if (trace.reason != FillwordsRejectReason.noMatch) return (state: state, result: ProofPress.ignored);
    return (state: state.copyWith(errors: state.errors + 1), result: ProofPress.miss);
  }
  if (key == 'sense' && !state.field.senseWords.contains(trace.wordIndex)) {
    return (state: state.copyWith(errors: state.errors + 1), result: ProofPress.miss);
  }
  final step = applyTrace(state.session, path);
  return (state: state.copyWith(session: step.session), result: ProofPress.hit);
}

// ── Прогресс серии ─────────────────────────────────────────────────────────────

class ProofSeriesProgress {
  const ProofSeriesProgress({required this.sizes, required this.streaks});

  /// Сторона поля, освоенная в каждом блоке.
  final Map<String, int> sizes;

  /// Сколько прогонов подряд блок взят.
  final Map<String, int> streaks;

  String encode() => jsonEncode({'sizes': sizes, 'streaks': streaks});
}

const ProofSeriesProgress emptyProofProgress = ProofSeriesProgress(
  sizes: {'sign': 5, 'word': 5, 'sense': 5},
  streaks: {'sign': 0, 'word': 0, 'sense': 0},
);

/// Прогресс из хранилища (`parseProofProgress`): битое — пустой, чужие числа зажимаются.
ProofSeriesProgress parseProofProgress(String? raw) {
  if (raw == null || raw.isEmpty) return emptyProofProgress;
  try {
    final parsed = jsonDecode(raw);
    if (parsed is! Map) return emptyProofProgress;
    final sizes = {...emptyProofProgress.sizes};
    final streaks = {...emptyProofProgress.streaks};
    final ps = parsed['sizes'];
    final pk = parsed['streaks'];
    for (final key in proofSeriesPlan) {
      final s = ps is Map ? ps[key] : null;
      if (s is num && s.isFinite) sizes[key] = clampProofSize(s);
      final k = pk is Map ? pk[key] : null;
      if (k is num && k.isFinite && k >= 0) streaks[key] = k.floor();
    }
    return ProofSeriesProgress(sizes: sizes, streaks: streaks);
  } on FormatException {
    return emptyProofProgress;
  }
}

/// Поля блоков на входе (`proofBlockLevels`): «Слово» не ниже поля одиночных филвордов.
Map<String, int> proofBlockLevels(ProofSeriesProgress progress, int ladderSize) {
  final ladder = clampProofSize(ladderSize);
  return {
    'sign': clampProofSize(progress.sizes['sign']!),
    'word': max(clampProofSize(progress.sizes['word']!), ladder),
    'sense': clampProofSize(progress.sizes['sense']!),
  };
}

/// Вход в серию (`proofSeriesEntry`): поле — по самому слабому блоку.
({int level, Map<String, int> perBlock}) proofSeriesEntry(ProofSeriesProgress progress, int ladderSize) {
  final levels = proofBlockLevels(progress, ladderSize);
  final start = seriesStartLevel(levels, proofSeriesPlan);
  return (level: clampProofSize(start.level), perBlock: levels);
}

bool proofBlockTaken(SeriesBlock block) => block.done && block.errors <= proofBlockMaxErrors;

class ProofSeriesOutcome {
  const ProofSeriesOutcome({
    required this.progress,
    required this.raised,
    required this.weakest,
    required this.nextLevel,
    required this.runsLeft,
  });
  final ProofSeriesProgress progress;
  final bool raised;
  final String weakest;
  final int nextLevel;
  final int runsLeft;
}

/// Итог прогона (`afterProofSeries`): неполная серия прогресса не двигает; полная — двигает
/// счёт по блокам, а поле растёт, когда каждый блок взят [stableRuns] раз подряд.
ProofSeriesOutcome afterProofSeries(ProofSeriesProgress progress, SeriesRun run, int ladderSize) {
  final level = clampProofSize(run.level);
  if (!seriesComplete(run)) {
    final move = seriesLevelMove(progress.streaks, proofSeriesPlan);
    return ProofSeriesOutcome(
      progress: progress,
      raised: false,
      weakest: move.weakest,
      nextLevel: proofSeriesEntry(progress, ladderSize).level,
      runsLeft: max(0, stableRuns - (progress.streaks[move.weakest] ?? 0)),
    );
  }
  final streaks = {...progress.streaks};
  for (final block in run.blocks) {
    streaks[block.key] = bumpStreak(progress.streaks[block.key] ?? 0, proofBlockTaken(block));
  }
  final move = seriesLevelMove(streaks, proofSeriesPlan);
  if (!move.raise) {
    return ProofSeriesOutcome(
      progress: ProofSeriesProgress(sizes: progress.sizes, streaks: streaks),
      raised: false,
      weakest: move.weakest,
      nextLevel: level,
      runsLeft: max(0, stableRuns - (streaks[move.weakest] ?? 0)),
    );
  }
  final grown = clampProofSize(level + 1);
  final raised = grown > level;
  final sizes = raised
      ? {
          'sign': max(progress.sizes['sign']!, grown),
          'word': max(progress.sizes['word']!, grown),
          'sense': max(progress.sizes['sense']!, grown),
        }
      : progress.sizes;
  // Новый размер — новый отсчёт устойчивости: прошлые прогоны были на другом поле.
  return ProofSeriesOutcome(
    progress: ProofSeriesProgress(sizes: sizes, streaks: raised ? {'sign': 0, 'word': 0, 'sense': 0} : streaks),
    raised: raised,
    weakest: move.weakest,
    nextLevel: grown,
    runsLeft: raised ? stableRuns : 0,
  );
}
