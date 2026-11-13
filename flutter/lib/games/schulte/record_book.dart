/// РЕКОРД И ИСТОРИЯ ВРЕМЁН «ШУЛЬТЕ» — ПЕРЕНОС С ВЕБА (задача 793b9faf, 13.11.2026).
///
/// Веб после свободной партии показывал экран результата: время, сравнение с личным рекордом, график
/// последних времён и «поделиться». Рекорд и график ведутся ТОЛЬКО для «зачётной» конфигурации —
/// классика 5×5: цифры, вперёд, без цвета, без групп, без убегающей цели
/// (`frontend/src/services/leaderboard.ts`, `countsForRecord`): время между режимами несравнимо.
///
/// 🔴 КЛЮЧИ — ТЕ ЖЕ, ЧТО У ВЕБА, чтобы рекорд и график были общие, а не два разных:
/// · личный рекорд — `psygames_leaderboard_personal_best_schulte_table_5x5` (секунды, меньше — лучше);
/// · история — `psygames_history_schulte_table_5x5_<профиль>`, JSON-список последних 8 времён
///   (`frontend/src/services/sessionHistory.ts`, `MAX_ENTRIES`).
///
/// ⚠️ ПОРЯДОК: сначала ПРОЧИТАТЬ историю и рекорд, потом записать текущее — иначе график сравнил бы
/// партию с самой собой (так сказано и в вебе: «записывать ПОСЛЕ чтения»).
library;

import 'dart:convert';

import '../../shell/shared_state.dart';

/// Имя «доски» зачётной таблицы: размер вшит в само имя, как в вебе.
const String schulteRecordBoard = 'schulte_table_5x5';

/// Сколько последних времён хранит история (веб: `MAX_ENTRIES`).
const int schulteHistoryMax = 8;

/// Что вышло после записи партии в рекорд.
class SchulteRecordResult {
  const SchulteRecordResult({required this.own, required this.best, required this.isNewBest, required this.history});

  /// Время этой партии, секунд.
  final double own;

  /// Лучшее время из личного рекорда, истории и этой партии.
  final double best;

  /// Эта партия лучше всех прежних. На самой первой партии это тоже «да»: сравнивать не с чем,
  /// и называть её рекордом нечестно, поэтому [hadPrevious] отдельно.
  final bool isNewBest;

  /// Прежние времена (БЕЗ этой партии), старые → новые.
  final List<double> history;

  /// Были ли партии до этой — по ним судят, показывать ли «новый рекорд».
  bool get hadPrevious => history.isNotEmpty;

  /// Точки графика: прежние + эта партия.
  List<double> get points => [...history, own];
}

class SchulteRecordBook {
  SchulteRecordBook(this.state);

  final SharedState state;

  String get _bestKey => '${SharedState.prefix}leaderboard_personal_best_$schulteRecordBoard';

  /// Профиль берётся КАЖДЫЙ раз: человек меняет его на ходу (как в `SharedLevelStore`).
  String get _historyKey => '${SharedState.prefix}history_${schulteRecordBoard}_${state.activeProfile}';

  /// Последние времена, старые → новые; нечитаемое значение — пусто, как у веба (`catch → []`).
  List<double> history() {
    final raw = state.get(_historyKey);
    if (raw == null) return const [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return [
        for (final v in decoded)
          if (v is num && v.isFinite) v.toDouble()
      ];
    } on FormatException {
      return const [];
    }
  }

  /// Личный рекорд, секунд; нет или не число — `null`.
  double? personalBest() {
    final raw = state.get(_bestKey);
    if (raw == null) return null;
    final v = double.tryParse(raw);
    return v != null && v.isFinite ? v : null;
  }

  /// Записать партию и вернуть то, что показать на экране результата.
  Future<SchulteRecordResult> record(double seconds) async {
    final prevHistory = history();
    final prevBest = personalBest();
    // Лучшее из ПРЕЖНЕГО (рекорд + история; нули веб отбрасывает, как `filter(n > 0)`).
    double? prevTop = prevBest;
    for (final h in prevHistory) {
      if (h > 0 && (prevTop == null || h < prevTop)) prevTop = h;
    }
    // Новый рекорд — строго лучше всех прежних; ничья им не считается.
    final isNewBest = prevTop == null || seconds < prevTop;
    final best = isNewBest ? seconds : prevTop;
    if (prevBest == null || seconds < prevBest) {
      await state.set(_bestKey, '$seconds');
    }
    final next = [...prevHistory, seconds];
    while (next.length > schulteHistoryMax) {
      next.removeAt(0);
    }
    await state.set(_historyKey, jsonEncode(next));
    return SchulteRecordResult(own: seconds, best: best, isNewBest: isNewBest, history: prevHistory);
  }

  /// Подпись тренда относительно среднего прежних партий. Нужны хотя бы две прежние, как у веба
  /// (график и тренд стоят от `history.length >= 2`). Возвращает `(процент, лучше ли)`;
  /// `null` — тренда нет.
  static ({int pct, bool better})? trend(SchulteRecordResult r) {
    if (r.history.length < 2) return null;
    final avg = r.history.reduce((a, b) => a + b) / r.history.length;
    final pct = avg != 0 ? ((r.own - avg) / avg * 100).round() : 0;
    return (pct: pct.abs(), better: r.own < avg);
  }
}
