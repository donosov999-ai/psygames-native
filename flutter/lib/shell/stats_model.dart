import 'dart:convert';

import 'package:flutter/painting.dart' show Color;

import 'asset_json.dart';
import 'collection_model.dart' show hexOf;
import 'l10n.dart';
import 'playlist_fields.dart';
import 'profiles.dart';
import 'sessions.dart';
import 'shared_state.dart';
import 'streak_calendar_model.dart' show CalendarLocales;
import 'training_history.dart';
import 'web_theme.dart';

/// «ПРОГРЕСС» — РАСЧЁТ НА DART (задача d6a60b02, вариант Б, шестой экран).
///
/// Перенос модели `frontend/app/statistics.tsx` (`statsModel` и его форматтеры) один в один; расчёты —
/// `sessions.dart` и `training_history.dart`. Данные веба — выгрузками: игры (`assets/catalog.json`,
/// с `sessionType`), профили с правилом доступа (`assets/profiles.json`: «открыто всем» и заводской слой
/// файла состава), числа правил (`assets/stats_rules.json`), даты (`assets/calendar_locales.json`).
///
/// Что остаётся у веба на время переезда: запись партий и ИИ-дайджест недели. Дайджест экран веба
/// под оболочкой по-прежнему запрашивает и кладёт в хранилище (`psygames_ai_insight_weekly_digest_…`);
/// здесь он только читается — второго запроса к платной функции нет. Перенести запрос — шаг снятия
/// WebView.
///
/// Эталон — модель веб-экрана с её входами (`fixtures/stats_*`), проба `stats_model_test.dart`.

/// Игра каталога — поля, которые читает «Прогресс».
typedef StatsGame = ({String id, String nameKey, String icon, List<String> gradient, String category, String sessionType});

List<StatsGame> statsGamesFrom(Map<String, Object?> catalog) => [
  for (final g in (catalog['games']! as List).cast<Map>())
    (
      id: g['id'] as String,
      nameKey: g['nameKey'] as String,
      icon: g['icon'] as String,
      gradient: (g['gradient'] as List).cast<String>(),
      category: g['category'] as String,
      sessionType: (g['sessionType'] as String?) ?? g['id'] as String,
    ),
];

/// Доступ игры профилю — `isGameAllowed` веба поверх `наложить` (файл состава).
class ProfileAccess {
  ProfileAccess({required this.allowed, required this.closed, required this.alwaysAllowed});

  /// `allowed_games` после файла состава: `'all'`, список или что лежит в файле.
  final Object? allowed;

  /// `closed_games` после файла состава.
  final Object? closed;
  final Set<String> alwaysAllowed;

  static bool _includes(Object? list, Object? id) => list is List ? list.contains(id) : list is String && id is String && list.contains(id);

  bool allows(Object? gameId) {
    if (_includes(closed, gameId)) return false;
    if (allowed == 'all') return true;
    if (gameId is String && alwaysAllowed.contains(gameId)) return true;
    return _includes(allowed, gameId);
  }

  /// `загрузить` + `наложить`: пусто в хранилище или битый JSON — заводской слой из сборки; файл без
  /// раздела «профили» — без слоя вовсе (как `загрузить` веба: `null`).
  factory ProfileAccess.of(Profile p, SharedState s, Map<String, Object?> profilesJson) {
    final raw = s.get('psygames_playlists_override');
    Object? layer;
    if (raw == null || raw.isEmpty) {
      layer = profilesJson['factoryOverlay'];
    } else {
      try {
        final v = jsonDecode(raw);
        final own = v is Map ? v[PlaylistFields.profiles] : null;
        layer = own is Map || own is List ? own : null;
      } catch (_) {
        layer = profilesJson['factoryOverlay'];
      }
    }
    final mine = layer is Map ? layer[p.id] : null;
    final m = mine is Map ? mine : const {};
    return ProfileAccess(
      allowed: m.containsKey(PlaylistFields.games) ? m[PlaylistFields.games] : p.raw['allowed_games'],
      closed: m.containsKey(PlaylistFields.remove) ? m[PlaylistFields.remove] : p.raw['closed_games'],
      alwaysAllowed: {...((profilesJson['alwaysAllowed'] as List?) ?? const []).cast<String>()},
    );
  }
}

/// Профиль экрана — как `ProfileContext`: сохранённый, если он есть и доступен; иначе `free`.
Profile activeProfileOf(Profiles ps, SharedState s) {
  final id = s.get(Profiles.activeKey);
  final p = id == null ? null : ps.byId(id);
  return p != null && ps.accessible(s, p.id) ? p : ps.byId('free')!;
}

/// Всё, из чего «Прогресс» строит модель.
class StatsInputs {
  StatsInputs({
    required this.sessions,
    required this.games,
    required this.profile,
    required this.access,
    required this.tokens,
    required this.streak,
    required this.aiDigest,
    required this.primary,
    required this.now,
    required this.wall,
    required this.rules,
    required this.loc,
  });
  final List<Session> sessions;
  final List<StatsGame> games;
  final Profile profile;
  final ProfileAccess access;
  final Object tokens;
  final Object streak;
  final String? aiDigest;
  final String primary;
  final int now;
  final Wall wall;
  final StatsRules rules;
  final CalendarLocales loc;
}

/// `Math.round` веба: половина — вверх (к +∞), и у отрицательных тоже.
int jsRound(double x) {
  final f = x.floorToDouble();
  return (x - f >= 0.5 ? f + 1 : f).toInt();
}

/// `String(n)` веба для чисел: целое — без «.0».
String jsNumStr(num n) => n is double && n.isFinite && n == n.truncateToDouble() ? '${n.toInt()}' : '$n';

/// Цвет веб-темы, как он записан в `ThemeContext.tsx` (заглавными).
String cssUpper(Color c) => '#${(c.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0').toUpperCase()}';

/// `formatTime` веба: мусор и ноль — «—», доли секунды — «0.4s», иначе «м:сс» или «Nс».
String formatTime(double seconds) {
  if (!seconds.isFinite || seconds < 0 || seconds > 86400) return '—';
  if (seconds == 0) return '—';
  if (seconds < 1) return '${seconds.toStringAsFixed(1)}s';
  final mins = (seconds / 60).floor();
  final secs = (seconds % 60).floor();
  return mins > 0 ? '$mins:${secs.toString().padLeft(2, '0')}' : '${secs}s';
}

/// Модель — та же, что `statsModel` веба. [textSecondary] — серый цвет веб-темы (светлой или тёмной).
Map<String, Object?> statsModel(StatsInputs inp, {required bool scopeAll, required String textSecondary}) {
  final lang = L.locale;
  final r = inp.rules;
  final profile = inp.profile;
  final byId = {for (final g in inp.games) g.id: g};
  final scoped = scopeAll
      ? inp.sessions
      : [
          for (final s in inp.sessions)
            if (s['profile_id'] == profile.id) s,
        ];

  final catalogIds = [for (final g in inp.games) g.id];
  final extras = <Object>[];
  for (final s in scoped) {
    final t = s['game_type'];
    if (jsTruthy(t) && !(t is String && catalogIds.contains(t)) && !extras.contains(t)) extras.add(t!);
  }
  final stats = [
    for (final id in <Object>[...catalogIds, ...extras]) statsOfSessions(id, scoped),
  ];

  final sessionsByGame = <String, List<double>>{};
  for (final s in scoped) {
    final t = s['game_type'];
    if (!jsTruthy(t)) continue;
    final score = s['score'];
    (sessionsByGame[jsKey(t)] ??= []).add(score is num && score.isFinite ? score.toDouble() : 0);
  }
  final sessionType = {for (final g in inp.games) g.sessionType: g.category};
  final areas = areaBreakdown(scoped, (t) => t is String ? sessionType[t] : null, r, inp.now);

  final history = buildTrainingHistory(
    [
      for (final s in inp.sessions)
        if (s['game_type'] is String &&
            byId.containsKey(s['game_type']) &&
            (scopeAll || (inp.access.allows(s['game_type']) && s['profile_id'] == profile.id)))
          s,
    ],
    r,
    inp.wall,
  );
  final view = historyView(history, anySessions: inp.sessions.isNotEmpty, scoped: !scopeAll);

  final lvl = levelInfo(jsNum(inp.tokens), r);
  final totalGames = stats.fold<int>(0, (a, x) => a + x.totalSessions);
  final totalTime = stats.fold<double>(
    0,
    (a, x) => a + (x.totalTime.isFinite && x.totalTime > 0 && x.totalTime <= 86400 * 365 ? x.totalTime : 0),
  );
  String formatTotal(double s) =>
      s >= 3600 ? '${(s / 3600).toStringAsFixed(1)}${L.t('unitHourShort')}' : '${jsRound(s / 60)}${L.t('unitMinShort')}';
  String areaLabel(String a) => L.t('cat${a.isEmpty ? '' : a[0].toUpperCase()}${a.length > 1 ? a.substring(1) : ''}');
  final weak = weakestArea(areas);

  String formatResult(double? value, String unit) => value == null ? '—' : (unit == 'seconds' ? formatTime(value) : '${jsRound(value)}');
  String verdictText(HistoryEntry e) {
    if (e.verdict == 'newTask') return L.t('historyNewTask');
    if (e.verdict == null || e.diff == null) return L.t('historyFirstRun');
    if (e.verdict == 'same') return L.t('historySame');
    return (e.verdict == 'better' ? L.t('historyBetter') : L.t('historyWorse')).replaceFirst('{n}', formatResult(e.diff, e.unit));
  }

  String verdictColor(HistoryEntry e) => e.verdict == 'better'
      ? '#1f6b4a'
      : e.verdict == 'worse'
      ? '#9e2b2b'
      : textSecondary;

  final today = inp.wall(inp.now);
  final todayKey = localDateKey(today);
  final yesterdayKey = localDateKey(DateTime.utc(today.year, today.month, today.day - 1));
  String dayLabel(String key) {
    if (key == todayKey) return L.t('today');
    if (key == yesterdayKey) return L.t('historyYesterday');
    final p = key.split('-').map(int.parse).toList();
    final d = DateTime.utc(p[0], p[1], p[2]);
    return inp.loc.dayMonth(lang, d.month, d.day);
  }

  String timeLabel(String iso) {
    final d = inp.wall(DateTime.parse(iso).millisecondsSinceEpoch);
    return '${d.hour}:${d.minute.toString().padLeft(2, '0')}';
  }

  final shownStats = [
    for (final st in stats)
      if (st.totalSessions > 0 && (scopeAll || inp.access.allows(st.gameType))) st,
  ];
  return {
    'v': 1,
    'title': L.t('statistics'),
    'primary': inp.primary,
    'labels': {
      'back': L.t('a11yBack'),
      'refresh': L.t('a11yRefresh'),
      'summary': L.t('statsTabSummary'),
      'history': L.t('statsTabHistory'),
    },
    'loading': false,
    'scope': {'profile': '${profile.emoji} ${L.t('profileName_${profile.id}')}', 'all': L.t('allGames'), 'isAll': scopeAll},
    'totalPlayed': L.t('totalPlayedCompleted').replaceFirst('{n}', '$totalGames'),
    'hero': {
      'tokens': inp.tokens,
      'tokensLabel': L.t('tokensLabel'),
      'level': 'Lv ${lvl.level}',
      'levelTitle': L.t(lvl.titleKey),
      'streak': inp.streak,
      'streakLabel': L.t('streakLabel'),
      'progress': lvl.span != null ? lvl.progress : null,
      'games': '$totalGames ${L.t('gamesPlayed')}',
      'time': '${formatTotal(totalTime)} ${L.t('inGameTime')}',
    },
    'areas': areas.isEmpty
        ? null
        : {
            'title': L.t('areaBalanceTitle'),
            'hint': L.t('areaBalanceHint'),
            'rows': [
              for (final a in areas)
                () {
                  final pct = jsRound(a.share * 100);
                  final trendPct = a.trend == null ? null : jsRound(a.trend! * 100);
                  return {
                    'area': a.area,
                    'label': areaLabel(a.area),
                    'pct': pct,
                    'text': '$pct% · ${a.sessions}',
                    'a11y': '${areaLabel(a.area)}: $pct%, ${a.sessions}',
                    'trend': trendPct != null && trendPct != 0
                        ? {
                            'up': trendPct > 0,
                            'text': (trendPct > 0 ? L.t('areaTrendUp') : L.t('areaTrendDown')).replaceFirst('{n}', '${trendPct.abs()}'),
                          }
                        : null,
                  };
                }(),
            ],
            'weak': weak != null ? L.t('areaBalanceWeak').replaceFirst('{area}', areaLabel(weak)) : null,
          },
    'ai': jsTruthy(inp.aiDigest) ? {'title': '📅 ${L.t('weekInReview')}', 'text': inp.aiDigest} : null,
    'games': [
      for (final stat in shownStats)
        if (stat.gameType is String && byId[stat.gameType] != null)
          () {
            final cfg = byId[stat.gameType]!;
            final arr = sessionsByGame[cfg.id] ?? const <double>[];
            final shown = arr.length > 12 ? arr.sublist(arr.length - 12) : arr;
            final best = arr.isEmpty ? 0.0 : arr.reduce((a, b) => a > b ? a : b);
            final avg = arr.isEmpty ? 0 : jsRound(arr.reduce((a, b) => a + b) / arr.length);
            return {
              'id': cfg.id,
              'name': L.t(cfg.nameKey),
              'icon': cfg.icon,
              'gradient': [...cfg.gradient],
              'stats': [
                {
                  'label': stat.outcomeKnown > 0 ? L.t('statPassedOfPlayed') : L.t('totalGames'),
                  'value': stat.outcomeKnown > 0 ? '${stat.passedSessions}/${stat.totalSessions}' : '${stat.totalSessions}',
                },
                {'label': L.t('statFastest'), 'value': stat.bestTime != null ? formatTime(stat.bestTime!) : '-'},
                {'label': L.t('statSlowest'), 'value': stat.worstTime > 0 ? formatTime(stat.worstTime) : '-'},
                {'label': L.t('averageTime'), 'value': formatTime(stat.averageTime)},
              ],
              'spark': arr.length >= 2
                  ? {
                      'caption': L.t('statScoreBars').replaceFirst('{n}', '${shown.length}'),
                      'bars': sparkBars(shown),
                      'color': cfg.gradient[1],
                      'older': L.t('statOlder'),
                      'newer': L.t('statNewer'),
                      'numbers': best > 0
                          ? L.t('scoreBestAvg').replaceFirst('{best}', jsNumStr(best)).replaceFirst('{avg}', '$avg')
                          : L.t('trendRecentGames'),
                    }
                  : null,
            };
          }(),
    ],
    'empty': stats.every((st) => st.totalSessions == 0) ? L.t('statsEmptyHint') : null,
    'history': view.kind == 'days'
        ? {
            'kind': 'days',
            'days': [
              for (final day in view.days)
                {
                  'label': dayLabel(day.dateKey),
                  'entries': [
                    for (final e in day.entries)
                      () {
                        final cfg = byId[e.gameType];
                        final name = cfg == null ? jsKey(e.gameType) : L.t(cfg.nameKey);
                        final value = formatResult(e.value, e.unit);
                        final verdict = verdictText(e);
                        final level = e.level == null ? '' : L.t('historyLevelShort').replaceFirst('{n}', jsNumStr(e.level!));
                        final time = timeLabel(e.timestamp);
                        return {
                          'name': name,
                          'icon': cfg?.icon,
                          'color': cfg?.gradient[0],
                          'verdict': verdict,
                          'verdictColor': verdictColor(e),
                          'level': level.isEmpty ? null : level,
                          'value': value,
                          'time': time,
                          'label': '$name${level.isNotEmpty ? ', $level' : ''}, $time, $value, $verdict',
                        };
                      }(),
                  ],
                },
            ],
            'tail': view.days.length >= r.maxHistoryDays ? L.t('historyTailHint').replaceFirst('{n}', '${r.maxHistoryDays}') : null,
          }
        : {
            'kind': view.kind,
            'icon': view.kind == 'empty' ? 'time-outline' : 'funnel-outline',
            'title': L.t(view.titleKey!),
            'hint': L.t(view.hintKey!),
            'cta': L.t(view.ctaKey!),
            'action': view.kind == 'empty' ? 'home' : 'scopeAll',
          },
  };
}

/// Ключ объекта JS (`byGame[s.game_type]`): строка как есть, число — `String(n)`.
String jsKey(Object? v) => v is num ? jsNumStr(v) : '$v';

final _assets = <String, Map<String, Object?>>{};

/// Ассет сборки, разобранный один раз (байтами — `asset_json.dart`): каталог не разбирается заново на
/// каждую запись в хранилище.
Future<Map<String, Object?>> _asset(String path) async => _assets[path] ??= await loadJsonAsset(path);

/// Данные «Прогресса» этого человека из общей памяти.
Future<StatsInputs> statsInputsFor(SharedState state, {int? now, Wall wall = deviceWall}) async {
  final rules = await StatsRules.load();
  final catalog = await _asset('assets/catalog.json');
  final profilesJson = await _asset('assets/profiles.json');
  final ps = Profiles.current.list.isEmpty ? await Profiles.load() : Profiles.current;
  return statsInputsFrom(
    state,
    rules: rules,
    catalog: catalog,
    profilesJson: profilesJson,
    profiles: ps,
    loc: await CalendarLocales.load(),
    now: now ?? DateTime.now().millisecondsSinceEpoch,
    wall: wall,
  );
}

/// То же синхронно, когда данные сборки уже загружены (пробы и пересчёт по записи в хранилище).
StatsInputs statsInputsFrom(
  SharedState state, {
  required StatsRules rules,
  required Map<String, Object?> catalog,
  required Map<String, Object?> profilesJson,
  required Profiles profiles,
  required CalendarLocales loc,
  required int now,
  required Wall wall,
}) {
  final profile = activeProfileOf(profiles, state);
  Map<String, Object?>? json(String key) {
    final raw = state.get(key);
    if (raw == null || raw.isEmpty) return null;
    try {
      final v = jsonDecode(raw);
      return v is Map ? v.cast<String, Object?>() : null;
    } catch (_) {
      return null;
    }
  }

  final tokens = json('psygames_tokens_v1')?[profile.id] ?? 0;
  final streakRec = json('psygames_streak_v1')?[profile.id];
  final streak = streakRec is Map && jsTruthy(streakRec['streak']) ? streakRec['streak']! : 0;
  final ai = state.get('psygames_ai_insight_weekly_digest_${profile.id}_${isoWeekKey(wall(now))}');
  return StatsInputs(
    sessions: readSessions(state, rules.legacyGameTypes),
    games: statsGamesFrom(catalog),
    profile: profile,
    access: ProfileAccess.of(profile, state, profilesJson),
    tokens: tokens,
    streak: streak,
    aiDigest: ai,
    primary: hexOf(WebTheme.accent(state, profile: profile.id).toARGB32()),
    now: now,
    wall: wall,
    rules: rules,
    loc: loc,
  );
}
