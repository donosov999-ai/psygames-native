import 'dart:math' as math;

import 'asset_json.dart';
import 'sessions.dart';

/// БАЛАНС, ИСТОРИЯ И УРОВЕНЬ «ПРОГРЕССА» НА DART (задача d6a60b02, вариант Б).
///
/// Перенос один в один:
///   · `areaBreakdown`, `weakestArea` — `frontend/src/services/analytics.ts`;
///   · `buildTrainingHistory`, `historyView` и ключ задачи — `frontend/src/services/trainingHistory.ts`;
///   · `levelInfo` — `frontend/src/services/tokens.ts`; `isoWeekKey` — `services/aiInsight.ts`;
///   · `sparkBars` — `frontend/app/statistics.tsx`.
/// Числа правил — `assets/stats_rules.json` (`tools/embed-stats.mjs`).
///
/// 🔴 Время партии — по часам устройства: день истории и «сегодня» у веба считаются в местном
/// времени (`localDateKey(new Date(t))`). Перевод мига в местные часы — [Wall]; пробы подставляют
/// пояс, в котором снят эталон.
class StatsRules {
  StatsRules({
    required this.levelThresholds,
    required this.lowerIsBetter,
    required this.maxHistoryDays,
    required this.defaultRoad,
    required this.minForTrend,
    required this.halfWindowMs,
    required this.legacyGameTypes,
  });
  final List<num> levelThresholds;
  final Set<String> lowerIsBetter;
  final int maxHistoryDays;
  final String defaultRoad;
  final int minForTrend;
  final int halfWindowMs;
  final Map<String, String> legacyGameTypes;

  factory StatsRules.fromJson(Map<String, Object?> j) => StatsRules(
    levelThresholds: (j['levelThresholds']! as List).cast<num>(),
    lowerIsBetter: (j['lowerIsBetter']! as List).cast<String>().toSet(),
    maxHistoryDays: (j['maxHistoryDays']! as num).toInt(),
    defaultRoad: j['defaultRoad']! as String,
    minForTrend: (j['minForTrend']! as num).toInt(),
    halfWindowMs: (j['halfWindowMs']! as num).toInt(),
    legacyGameTypes: (j['legacyGameTypes']! as Map).cast<String, String>(),
  );

  static StatsRules? _cache;
  static Future<StatsRules> load() async =>
      _cache ??= StatsRules.fromJson(await loadJsonAsset('assets/stats_rules.json'));
}

/// Миг (мс от эпохи) → местные часы устройства: поля года, месяца, дня, часа и минуты.
typedef Wall = DateTime Function(int ms);

/// Часы устройства — как `new Date(t)` веба.
DateTime deviceWall(int ms) => DateTime.fromMillisecondsSinceEpoch(ms);

String _two(int n) => n.toString().padLeft(2, '0');

/// `localDateKey` веба: `ГГГГ-ММ-ДД` по местным часам.
String localDateKey(DateTime w) => '${w.year}-${_two(w.month)}-${_two(w.day)}';

// ── Баланс по областям ───────────────────────────────────────────────────────────────────────────

typedef AreaStat = ({String area, int sessions, double share, double? trend});

double _avg(List<double> xs) => xs.isEmpty ? 0 : xs.reduce((a, b) => a + b) / xs.length;

/// `areaBreakdown`: доля партий области и сдвиг свежих двух недель против прошлых двух — у каждой
/// игры своей шкалой, затем среднее по играм области, взвешенное числом партий.
List<AreaStat> areaBreakdown(List<Session> sessions, String? Function(Object gameType) areaOf, StatsRules r, int now) {
  final byArea = <String, ({int all, Map<Object, ({List<double> recent, List<double> prev})> games})>{};
  for (final s in sessions) {
    final type = s['game_type'] ?? '';
    final area = areaOf(type);
    if (area == null) continue;
    final rec = byArea[area] ?? (all: 0, games: <Object, ({List<double> recent, List<double> prev})>{});
    final t = jsTruthy(s['timestamp']) ? jsDateParse(s['timestamp']) : double.nan;
    final score = jsNumField(s, 'score');
    if (t.isFinite && t <= now && score.isFinite) {
      final age = now - t;
      final g = rec.games[type] ?? (recent: <double>[], prev: <double>[]);
      if (age <= r.halfWindowMs) {
        g.recent.add(score);
      } else if (age <= r.halfWindowMs * 2) {
        g.prev.add(score);
      }
      rec.games[type] = g;
    }
    byArea[area] = (all: rec.all + 1, games: rec.games);
  }
  final total = byArea.values.fold<int>(0, (a, rec) => a + rec.all);
  final out = <AreaStat>[];
  for (final MapEntry(key: area, value: rec) in byArea.entries) {
    var sum = 0.0;
    var weight = 0;
    for (final g in rec.games.values) {
      if (g.recent.length < r.minForTrend || g.prev.length < r.minForTrend) continue;
      final before = _avg(g.prev);
      if (!(before > 0)) continue;
      final w = g.recent.length + g.prev.length;
      sum += w * ((_avg(g.recent) - before) / before);
      weight += w;
    }
    out.add((area: area, sessions: rec.all, share: total > 0 ? rec.all / total : 0, trend: weight > 0 ? sum / weight : null));
  }
  // Сортировка веба устойчива: при равном числе партий — порядок первой встречи.
  final order = {for (var i = 0; i < out.length; i++) out[i].area: i};
  out.sort((a, b) => b.sessions != a.sessions ? b.sessions - a.sessions : order[a.area]! - order[b.area]!);
  return out;
}

/// `weakestArea`: меньше всех — если её вдвое обходят; иначе (или данных мало) — ничего.
String? weakestArea(List<AreaStat> stats) {
  final played = stats.where((s) => s.sessions > 0).toList();
  if (played.length < 2) return null;
  final min = played.last;
  final max = played.first;
  return max.sessions >= min.sessions * 2 ? min.area : null;
}

// ── История тренировок ───────────────────────────────────────────────────────────────────────────

typedef HistoryEntry = ({
  Object gameType,
  String timestamp,
  double? value,
  String unit,
  double? level,
  double? prev,
  double? diff,
  String? verdict,
});
typedef HistoryDay = ({String dateKey, List<HistoryEntry> entries});

double? _validSeconds(Session s) {
  final n = jsNumField(s, 'time_seconds');
  return !n.isFinite || n <= 0 || n > 86400 ? null : n;
}

/// `entryValue`: у «меньше — лучше» результат — время, у остальных — очки.
({double? value, String unit}) entryValue(Session s, StatsRules r) {
  final t = s['game_type'];
  if (jsTruthy(t) && t is String && r.lowerIsBetter.contains(t)) return (value: _validSeconds(s), unit: 'seconds');
  final n = jsNumField(s, 'score');
  return (value: n.isFinite ? n : null, unit: 'score');
}

/// `compare`: лучше / хуже / так же — с учётом направления метрики.
String compareResult(String unit, double value, double prev) {
  if (value == prev) return 'same';
  final grew = value > prev;
  return (unit == 'seconds' ? !grew : grew) ? 'better' : 'worse';
}

double? _entryLevel(Session s) {
  final details = s['details'];
  final lv = details is Map ? jsNumField(details.cast<String, Object?>(), 'level') : double.nan;
  return lv.isFinite && lv > 0 ? lv : null;
}

String _entryRoad(Session s, StatsRules r) {
  final details = s['details'];
  final road = details is Map ? details['road'] : null;
  return road is String && road != '' && road != r.defaultRoad ? road : '';
}

/// `String(x)` веба для частей ключа: число 5 — «5», а не «5.0».
String _js(Object? v) => v is double && v.isFinite && v == v.truncateToDouble() ? '${v.toInt()}' : '$v';

/// `taskKey`: упражнение + уровень + дорога + настройки.
String taskKey(Session s, StatsRules r) => [
  _js(sessionGameType(s)),
  _entryLevel(s) == null ? '' : _js(_entryLevel(s)),
  _entryRoad(s, r),
  s['difficulty'] == null ? '' : _js(s['difficulty']),
  s['mode'] == null ? '' : _js(s['mode']),
].join('|');

/// `new Date(t).toISOString()`.
String _iso(int ms) => DateTime.fromMillisecondsSinceEpoch(ms, isUtc: true).toIso8601String();

/// `buildTrainingHistory`: дни от новых к старым, внутри дня — от новых к старым; сравнение — с прошлым
/// разом ТОЙ ЖЕ задачи по времени.
List<HistoryDay> buildTrainingHistory(List<Session> sessions, StatsRules r, Wall wall, {int? maxDays}) {
  final dated = <({Session s, int i, double t})>[
    for (var i = 0; i < sessions.length; i++)
      (s: sessions[i], i: i, t: jsTruthy(sessions[i]['timestamp']) ? jsDateParse(sessions[i]['timestamp']) : double.nan),
  ].where((x) => jsTruthy(x.s['game_type']) && x.t.isFinite).toList()..sort((a, b) => a.t != b.t ? a.t.compareTo(b.t) : a.i - b.i);
  final lastByTask = <String, double>{};
  final seenGames = <Object>{};
  final byDay = <String, List<HistoryEntry>>{};
  for (final x in dated) {
    final s = x.s;
    final gameType = sessionGameType(s);
    final (:value, :unit) = entryValue(s, r);
    final key = taskKey(s, r);
    final prev = lastByTask[key];
    final verdict = value == null
        ? null
        : prev != null
        ? compareResult(unit, value, prev)
        : seenGames.contains(gameType)
        ? 'newTask'
        : null;
    final ms = x.t.toInt();
    final entry = (
      gameType: gameType,
      timestamp: _iso(ms),
      value: value,
      unit: unit,
      level: _entryLevel(s),
      prev: value == null ? null : prev,
      diff: value == null || prev == null ? null : (value - prev).abs(),
      verdict: verdict,
    );
    if (value != null) {
      lastByTask[key] = value;
      seenGames.add(gameType);
    }
    (byDay[localDateKey(wall(ms))] ??= []).add(entry);
  }
  final days = [for (final e in byDay.entries) (dateKey: e.key, entries: e.value.reversed.toList())]
    ..sort((a, b) => b.dateKey.compareTo(a.dateKey));
  final cap = maxDays ?? r.maxHistoryDays;
  return cap > 0 ? days.take(cap).toList() : days;
}

/// `historyView`: дни; или «партии есть, но их прячет профиль»; или «пусто — сыграй».
typedef HistoryView = ({String kind, List<HistoryDay> days, String? titleKey, String? hintKey, String? ctaKey});

/// Ключи, которые отдаёт [historyView], — списком для сборщика словаря (`embed-l10n.mjs`).
const historyViewKeys = <String>[
  'historyScopedTitle',
  'historyScopedHint',
  'allGames',
  'historyEmptyTitle',
  'historyEmptyHint',
  'historyEmptyCta',
];

HistoryView historyView(List<HistoryDay> days, {required bool anySessions, required bool scoped}) {
  if (days.isNotEmpty) return (kind: 'days', days: days, titleKey: null, hintKey: null, ctaKey: null);
  if (anySessions && scoped) {
    return (kind: 'scoped', days: const [], titleKey: historyViewKeys[0], hintKey: historyViewKeys[1], ctaKey: historyViewKeys[2]);
  }
  return (kind: 'empty', days: const [], titleKey: historyViewKeys[3], hintKey: historyViewKeys[4], ctaKey: historyViewKeys[5]);
}

// ── Уровень, столбики, неделя ────────────────────────────────────────────────────────────────────

/// Титулы уровней — списком для сборщика словаря (`levelTitle${n}` у веба).
const levelTitleKeys = <String>[
  'levelTitle0', 'levelTitle1', 'levelTitle2', 'levelTitle3', 'levelTitle4', 'levelTitle5', //
  'levelTitle6', 'levelTitle7', 'levelTitle8', 'levelTitle9', 'levelTitle10',
];

typedef LevelInfo = ({int level, String titleKey, double intoLevel, double? span, double progress});

/// `levelInfo`: уровень по порогам, доля пути до следующего.
LevelInfo levelInfo(num tokens, StatsRules r) {
  final th = r.levelThresholds;
  var lvl = 0;
  for (var i = 0; i < th.length; i++) {
    if (tokens >= th[i]) lvl = i;
  }
  final base = th[lvl];
  final span = lvl + 1 < th.length ? (th[lvl + 1] - base).toDouble() : null;
  final into = (tokens - base).toDouble();
  return (
    level: lvl,
    titleKey: 'levelTitle$lvl',
    intoLevel: into,
    span: span,
    progress: span != null && span != 0 ? math.min(1, into / span) : 1,
  );
}

/// `sparkBars`: высота 5..24 по размаху, прозрачность от старых к свежим.
List<Map<String, num>> sparkBars(List<double> data) {
  if (data.length < 2) return const [];
  final max = data.reduce(math.max);
  final min = data.reduce(math.min);
  final span = max - min == 0 ? 1 : max - min;
  return [
    for (var i = 0; i < data.length; i++) {'h': 5 + (((data[i] - min) / span) * 19).round(), 'op': 0.35 + 0.65 * (i / (data.length - 1))},
  ];
}

/// `isoWeekKey` веба — по местной дате.
String isoWeekKey(DateTime w) {
  var t = DateTime.utc(w.year, w.month, w.day);
  final day = t.weekday; // 1 = понедельник … 7 = воскресенье, как `getUTCDay() || 7`
  t = t.add(Duration(days: 4 - day));
  final yearStart = DateTime.utc(t.year, 1, 1);
  final week = (((t.millisecondsSinceEpoch - yearStart.millisecondsSinceEpoch) / 86400000 + 1) / 7).ceil();
  return '${t.year}-W$week';
}
