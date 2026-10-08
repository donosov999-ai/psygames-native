import 'dart:convert';

import 'shared_state.dart';

/// ПАРТИИ ЧЕЛОВЕКА — ЧТЕНИЕ И ИТОГИ НА DART (задача d6a60b02, вариант Б, «Прогресс»).
///
/// Перенос `readAll`/`migrateSession`/`statsOfSessions` из `frontend/src/services/api.ts` и
/// `sessionGameType` из `frontend/src/constants/games.ts` один в один. Пишет партии по-прежнему веб
/// (`saveSession`, очередь записи, облако) — здесь только чтение того же ключа. Числа правил —
/// `assets/stats_rules.json` (`tools/embed-stats.mjs`).
///
/// Партия — словарь как лежит в хранилище. Значения из JSON приводятся правилами JS (`Number(x)`,
/// «ложь», `isFinite`), потому что веб сравнивает и складывает именно так.
typedef Session = Map<String, Object?>;

/// `Number(v)` веба для значения из JSON. Отсутствующее поле — `undefined` → NaN, его зовут через
/// [jsNumField]; здесь `null` → 0, как у `Number(null)`.
double jsNum(Object? v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  if (v is bool) return v ? 1 : 0;
  if (v is String) {
    final t = v.trim();
    return t.isEmpty ? 0 : (double.tryParse(t) ?? double.nan);
  }
  return double.nan;
}

/// `Number(m.k)`: нет поля — NaN (`undefined`), есть — [jsNum].
double jsNumField(Map<String, Object?>? m, String k) => m != null && m.containsKey(k) ? jsNum(m[k]) : double.nan;

/// Истина по правилам JS.
bool jsTruthy(Object? v) => !(v == null || v == false || v == '' || (v is num && (v == 0 || v.isNaN)));

/// `Date.parse` для меток партий: ISO с поясом — миг; дата без времени — полночь UTC (как у JS);
/// не строка или не разобралось — NaN.
double jsDateParse(Object? v) {
  if (v is! String) return double.nan;
  if (RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(v)) {
    final d = DateTime.tryParse('${v}T00:00:00Z');
    return d == null ? double.nan : d.millisecondsSinceEpoch.toDouble();
  }
  final d = DateTime.tryParse(v);
  return d == null ? double.nan : d.millisecondsSinceEpoch.toDouble();
}

/// `sessionGameType`: самурай до 20.08.2026 писал в корзину `sudoku` с `details.samurai: true`.
Object sessionGameType(Session s) {
  final t = s['game_type'] ?? '';
  final details = s['details'];
  if (t == 'sudoku' && details is Map && details['samurai'] == true) return 'sudoku_samurai';
  return t;
}

/// `migrateSession`: старые имена мнемоники и разведение самурая — при каждом чтении.
Session migrateSession(Session s, Map<String, String> legacy) {
  final t = s['game_type'];
  if (jsTruthy(t) && t is String && legacy.containsKey(t)) {
    return {...s, 'game_type': legacy[t], 'mode': jsTruthy(s['mode']) ? s['mode'] : (t == 'word_mnemonics' ? 'words' : 'numbers')};
  }
  final bucket = sessionGameType(s);
  return bucket != t || !s.containsKey('game_type') ? {...s, 'game_type': bucket} : s;
}

/// `readAll` веба: журнал партий; нет записи, не список, битый JSON — пусто.
/// 🔴 `null` в списке у веба роняет разбор целиком (`s.game_type` у `null`), и `readAll` отдаёт пусто —
/// повторено; запись не-объектом становится партией без игры (`{...5, game_type: ''}`).
List<Session> readSessions(SharedState state, Map<String, String> legacy) {
  final raw = state.get('psygames_sessions');
  if (raw == null || raw.isEmpty) return const [];
  Object? v;
  try {
    v = jsonDecode(raw);
  } catch (_) {
    return const [];
  }
  if (v is! List) return const [];
  if (v.contains(null)) return const [];
  return [for (final s in v) migrateSession(s is Map ? s.cast<String, Object?>() : <String, Object?>{}, legacy)];
}

/// Итоги одной игры — `GameStats` веба (поля, которые читает «Прогресс»).
typedef GameStats = ({
  Object gameType,
  int totalSessions,
  double totalTime,
  double averageTime,
  double? bestTime,
  double totalScore,
  int passedSessions,
  int outcomeKnown,
  double worstTime,
});

/// `statsOfSessions`: время — только по валидным партиям (мусор таймстампа, NaN, ≤0, >24 ч), счёт и
/// очки — по всем.
GameStats statsOfSessions(Object gameType, List<Session> all) {
  final sessions = [
    for (final s in all)
      if (s['game_type'] == gameType) s,
  ];
  if (sessions.isEmpty) {
    return (
      gameType: gameType,
      totalSessions: 0,
      totalTime: 0,
      averageTime: 0,
      bestTime: null,
      totalScore: 0,
      passedSessions: 0,
      outcomeKnown: 0,
      worstTime: 0,
    );
  }
  final valid = [
    for (final s in sessions)
      if (jsNumField(s, 'time_seconds') case final t when t.isFinite && t > 0 && t <= 86400) t,
  ];
  final totalTime = valid.fold<double>(0, (a, t) => a + t);
  final sorted = [...valid]..sort();
  return (
    gameType: gameType,
    totalSessions: sessions.length,
    totalTime: totalTime,
    averageTime: valid.isNotEmpty ? totalTime / valid.length : 0,
    bestTime: sorted.isEmpty ? null : sorted.first,
    totalScore: sessions.fold<double>(0, (a, s) => a + (jsTruthy(s['score']) ? jsNum(s['score']) : 0)),
    passedSessions: sessions.where((s) => s['passed'] == true).length,
    outcomeKnown: sessions.where((s) => s['passed'] is bool).length,
    worstTime: sorted.isEmpty ? 0 : sorted.last,
  );
}
