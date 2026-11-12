import 'dart:convert';
import 'dart:math' as math;

import 'sessions.dart' show jsNum, jsTruthy;
import 'shared_state.dart';

/// ЗАРАБОТОК ЗА ПАРТИЮ НА DART — перенос `frontend/src/services/earn.ts` (+ `tokenDelta`/`addTokens` из
/// `tokens.ts`, `addEarned`/`earnedTotal` из `collection.ts`) для учёта партий [SessionStore] (задача 0f3d3910,
/// шаг а, срез 2). Сверяется с образцом веба `test/fixtures/session_store_reference.json`.
///
/// Правило (одно на приложение): база `tokenDelta` 0…50; ×2 — чистая партия или серия дней ≥ 3 (множитель
/// один, не ×4); суточная квота — 3 удвоенные партии в одной игре, дальше база; шаг зарядки и партия с разбором
/// — без множителя. Журнал `psygames_earn_v1`: записи за сегодня и вчера (≤ 300), метки дней за 60 суток.
///
/// ⚠️ Повторено как у веба, хотя это дефект веба: `earnedTotal` при первом обращении стартует с баланса, а
/// баланс к этому мигу уже вырос на эту партию — первая партия профиля входит в «заработано» дважды.
/// Чинить — в обеих половинах сразу (отдельная задача), иначе разойдутся.

const earnMultiplier = 2;
const multRoundsPerGamePerDay = 3;
const dayStreakForMult = 3;
const tokenDeltaCap = 50;

const _earnKey = 'psygames_earn_v1';
const _tokensKey = 'psygames_tokens_v1';
const _earnedKey = 'psygames_earned_total_v1';
const _entryDaysKept = 2;
const _maxEntries = 300;
const _daysKept = 60;

/// Местные часы: миг (мс) → дата-время с местными полями (как `Date` веба на устройстве).
typedef EarnWall = DateTime Function(int ms);

/// `tokenDelta`: `round(score / 20) − errors`, в пределах 0…50.
int tokenDelta(num score, num errors) {
  final raw = _jsRound(score / 20) - errors;
  return math.max(0, math.min(tokenDeltaCap, raw)).toInt();
}

/// `Math.round` JS: половина — вверх.
int _jsRound(num v) => (v + 0.5).floor();

/// `dayKey`: календарные сутки местного времени без ведущих нулей — `2026-11-5`.
String earnDayKey(DateTime d) => '${d.year}-${d.month}-${d.day}';

DateTime _midnight(DateTime d) => DateTime.utc(d.year, d.month, d.day);

/// `streakFromDays`: дней подряд, считая сегодня; сегодня ещё не играл — серия до вчера включительно.
int streakFromDays(Iterable<String> days, DateTime local) {
  final have = days.toSet();
  var cur = _midnight(local);
  if (!have.contains(earnDayKey(cur))) cur = cur.subtract(const Duration(days: 1));
  var n = 0;
  while (have.contains(earnDayKey(cur))) {
    n++;
    cur = cur.subtract(const Duration(days: 1));
  }
  return n;
}

Set<String> _recentDays(DateTime local, int count) {
  var d = _midnight(local);
  final out = <String>{};
  for (var i = 0; i < count; i++) {
    out.add(earnDayKey(d));
    d = d.subtract(const Duration(days: 1));
  }
  return out;
}

/// Начисление за партию — `Earned` веба.
typedef Earned = ({int base, int multiplier, int total, String reason, bool clean, int dayStreak});

/// `earnForRound`.
Earned earnForRound({
  required num score,
  required num errors,
  required bool warmupStep,
  required bool lesson,
  required int doubledToday,
  required int dayStreak,
}) {
  final base = tokenDelta(score, errors);
  final clean = errors == 0 && score > 0;
  Earned flat(String reason) =>
      (base: base, multiplier: 1, total: base, reason: reason, clean: clean, dayStreak: dayStreak);
  Earned doubled(String reason) => (
    base: base,
    multiplier: earnMultiplier,
    total: base * earnMultiplier,
    reason: reason,
    clean: clean,
    dayStreak: dayStreak,
  );
  if (base <= 0) return flat('none');
  if (warmupStep) return flat('warmup');
  if (lesson) return flat('lesson');
  if (doubledToday >= multRoundsPerGamePerDay) return flat('repeat');
  if (clean) return doubled('clean');
  if (dayStreak >= dayStreakForMult) return doubled('streak');
  return flat('plain');
}

Map<String, Object?> _obj(String? raw) {
  if (raw == null) return {};
  try {
    final v = jsonDecode(raw);
    return v is Map ? v.cast<String, Object?>() : {};
  } catch (_) {
    return {};
  }
}

/// `recordRound`: журнал начислений, баланс и «заработано за всё время». Возвращает начисление.
Future<Earned> recordRound(
  SharedState state, {
  required String profileId,
  required String game,
  required Object? score,
  required Object? errors,
  required bool warmupStep,
  required bool lesson,
  required int nowMs,
  required EarnWall wall,
}) async {
  const zero = (base: 0, multiplier: 1, total: 0, reason: 'none', clean: false, dayStreak: 0);
  if (profileId.isEmpty || game.isEmpty) return zero;
  final local = wall(nowMs);
  final today = earnDayKey(local);
  final store = _obj(state.get(_earnKey));
  final log = store[profileId] is Map ? (store[profileId]! as Map).cast<String, Object?>() : <String, Object?>{};
  final days = log['days'] is List ? [for (final d in log['days']! as List) '$d'] : <String>[];
  final entries = log['entries'] is List
      ? [for (final e in log['entries']! as List) (e as Map).cast<String, Object?>()]
      : <Map<String, Object?>>[];
  if (!days.contains(today)) days.add(today);
  final dayStreak = streakFromDays(days, local);
  final doubledToday = entries
      .where((e) => e['day'] == today && e['game'] == game && jsNum(e['multiplier']) > 1)
      .length;
  final earned = earnForRound(
    score: jsTruthy(score) ? jsNum(score) : 0,
    errors: jsTruthy(errors) ? jsNum(errors) : 0,
    warmupStep: warmupStep,
    lesson: lesson,
    doubledToday: doubledToday,
    dayStreak: dayStreak,
  );
  final entry = <String, Object?>{
    'ts': nowMs,
    'day': today,
    'game': game,
    'base': earned.base,
    'multiplier': earned.multiplier,
    'total': earned.total,
    'reason': earned.reason,
  };
  final keepDays = _recentDays(local, _entryDaysKept);
  final next = [...entries.where((e) => keepDays.contains(e['day'])), entry];
  final keepMarks = _recentDays(local, _daysKept);
  store[profileId] = {
    'entries': next.length > _maxEntries ? next.sublist(next.length - _maxEntries) : next,
    'days': [
      for (final d in days)
        if (keepMarks.contains(d)) d,
    ],
  };
  await state.set(_earnKey, jsonEncode(store));
  if (earned.total > 0) {
    await _addTokens(state, profileId, earned.total);
    await _addEarned(state, profileId, earned.total);
  }
  return earned;
}

Future<void> _addTokens(SharedState state, String pid, int delta) async {
  final c = _obj(state.get(_tokensKey));
  c[pid] = math.max(0, jsNum(c[pid]).toInt() + delta);
  await state.set(_tokensKey, jsonEncode(c));
}

/// `earnedTotal` + `addEarned`: нет записи — старт с текущего баланса (см. ⚠️ в шапке).
Future<void> _addEarned(SharedState state, String pid, int delta) async {
  final all = _obj(state.get(_earnedKey));
  final had = all[pid];
  final was = had is num && had >= 0 ? had.toInt() : math.max(0, jsNum(_obj(state.get(_tokensKey))[pid]).floor());
  all[pid] = was + delta;
  await state.set(_earnedKey, jsonEncode(all));
}
