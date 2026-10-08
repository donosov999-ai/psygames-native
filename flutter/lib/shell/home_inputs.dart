import 'dart:convert';
import 'dart:math' as math;

import 'asset_json.dart';
import 'collection_model.dart' show CollectionData, Figure, earnedTotalOf, figuresWith;
import 'home_model.dart' show HomeBlockKeys, HomeJson;
import 'l10n.dart';
import 'playlist_fields.dart';
import 'profiles.dart';
import 'sessions.dart';
import 'shared_state.dart';
import 'stats_model.dart' show activeProfileOf;
import 'streak_calendar_model.dart' show computeStreak, dayOf;
import 'training_history.dart';

/// 🔴 ВХОДЫ ГЛАВНОЙ НА DART (задача d6a60b02, вариант Б, Главная — шаг 7б).
///
/// Перенос того, что `app/index.tsx` читает из хранилища и раскладывает перед `buildHomeModel`:
/// профиль с файлом состава (`наложить`), доступные игры (`filterAllowedGames`, `visibleInCatalog`),
/// очки и уровень, серия зарядок, надетые вещи, лестница замков по звёздам уровней, сундук, «Сегодня»
/// (`todayEarnings`), «продолжить» (`listResumable`), цель дня (`loadGoalCard`), рекомендации
/// (`recommendToday` со слабым местом), вызов дня, любимые разделы и окно цели-серии. Таблицы —
/// выгрузкой `assets/home_inputs.json`, правила — здесь, один в один.
///
/// ⚠️ ЧЕГО ЗДЕСЬ НЕТ. События, которые веб делает сам на фокусе — бонус входа (`dailyCheckIn`), исход
/// ставки, «Уровень N!», проверка обновления, — приходят параметром [events] от веб-модели: у этих
/// записей один хозяин, и пока он веб, Dart их только показывает. Цвета темы — от экрана ([colors]).
///
/// Эталон — вход сборщика с живой веб-Главной вместе со всем хранилищем (`fixtures/home_inputs_*`),
/// проба `home_inputs_test.dart`.
class HomeInputsData {
  HomeInputsData({
    required this.games,
    required this.categoryOrder,
    required this.inputs,
    required this.home,
    required this.profilesJson,
    required this.rules,
    required this.figures,
  });

  /// Записи `assets/catalog.json` в порядке `GAMES`.
  final List<Map<String, Object?>> games;
  final List<String> categoryOrder;

  /// `assets/home_inputs.json`.
  final Map<String, Object?> inputs;

  /// `assets/home.json` (палитры слотов и практики).
  final Map<String, Object?> home;
  final Map<String, Object?> profilesJson;
  final StatsRules rules;
  final List<Figure> figures;

  static HomeInputsData fromJson({
    required Map<String, Object?> catalog,
    required Map<String, Object?> inputs,
    required Map<String, Object?> home,
    required Map<String, Object?> profilesJson,
    required StatsRules rules,
    required List<Figure> figures,
  }) => HomeInputsData(
    games: [for (final g in (catalog['games']! as List)) (g as Map).cast<String, Object?>()],
    categoryOrder: [for (final c in (catalog['categories']! as List)) '${(c as Map)['id']}'],
    inputs: inputs,
    home: home,
    profilesJson: profilesJson,
    rules: rules,
    figures: figures,
  );

  static HomeInputsData? _cache;
  static Future<HomeInputsData> load() async => _cache ??= fromJson(
    catalog: await loadJsonAsset('assets/catalog.json'),
    inputs: await loadJsonAsset('assets/home_inputs.json'),
    home: await loadJsonAsset('assets/home.json'),
    profilesJson: await loadJsonAsset('assets/profiles.json'),
    rules: await StatsRules.load(),
    figures: await CollectionData.load(),
  );
}

HomeJson _map(Object? v) => v is Map ? v.cast<String, Object?>() : const {};

/// `JSON.parse(raw)`; нет записи или битая — `null`.
Object? _parse(String? raw) {
  if (raw == null) return null;
  try {
    return jsonDecode(raw);
  } catch (_) {
    return null;
  }
}

/// `${y}-${m+1}-${d}` веба — сутки журнала, цели, вызова и серии входа: без ведущих нулей.
String _dk(DateTime w) => '${w.year}-${w.month}-${w.day}';

/// Сдвиг местного времени от UTC в этот миг: часы [Wall] отдают местное время полями UTC.
int _offsetMs(Wall wall, int ms) {
  final w = wall(ms);
  return DateTime.utc(w.year, w.month, w.day, w.hour, w.minute, w.second, w.millisecond).millisecondsSinceEpoch - ms;
}

/// `new Date(y, m - 1, d).getTime()` — местная полночь даты (переполнение дня — как у JS).
int _localMidnight(int y, int m, int d, int offsetMs) => DateTime.utc(y, m, d).millisecondsSinceEpoch - offsetMs;

/// Устойчивая сортировка (у JS `sort` устойчив, у Dart `List.sort` — нет).
List<T> _stable<T>(Iterable<T> xs, int Function(T a, T b) cmp) {
  final list = [for (final (i, x) in xs.indexed) (i: i, x: x)];
  list.sort((a, b) {
    final c = cmp(a.x, b.x);
    return c != 0 ? c : a.i - b.i;
  });
  return [for (final e in list) e.x];
}

/// `recoSeed` веба: FNV-1a по кодам UTF-16 с `Math.imul`, без знака.
int recoSeed(String dateKey, String profileId) {
  var h = 2166136261;
  for (final c in '$dateKey|$profileId'.codeUnits) {
    h = (h ^ c) & 0xFFFFFFFF;
    h = (h * 16777619) & 0xFFFFFFFF;
  }
  return h;
}

/// `slotForHour` веба.
String slotForHour(int hour) => hour >= 5 && hour < 12
    ? 'morning'
    : hour >= 12 && hour < 18
    ? 'day'
    : hour >= 18
    ? 'evening'
    : 'night';

/// Профиль Главной: запись сборки с наложенным файлом состава (`наложить`) и список блоков Главной.
typedef HomeProfile = ({HomeJson raw, Object? allowed, Object? warmupEnabled, Object? homeBlocks});

/// `загрузить` + `наложить`: пусто в хранилище или битый JSON — заводской слой; файл без «профили» —
/// без слоя (как в `ProfileAccess.of`).
HomeProfile homeProfileOf(Profile p, SharedState s, HomeJson profilesJson) {
  final raw = s.get('psygames_playlists_override');
  Object? layer;
  if (raw == null || raw.isEmpty) {
    layer = profilesJson['factoryOverlay'];
  } else {
    final v = _parse(raw);
    if (v == null && raw.isNotEmpty) {
      layer = profilesJson['factoryOverlay'];
    } else {
      final own = v is Map ? v[PlaylistFields.profiles] : null;
      layer = own is Map ? own : null;
    }
  }
  final mine = _map(layer is Map ? layer[p.id] : null);
  final r = p.raw.cast<String, Object?>();
  return (
    raw: r,
    allowed: mine.containsKey(PlaylistFields.games) ? mine[PlaylistFields.games] : r['allowed_games'],
    warmupEnabled: mine.containsKey(PlaylistFields.warmupEnabled) ? mine[PlaylistFields.warmupEnabled] : r['warmup_enabled'],
    homeBlocks: mine[PlaylistFields.home],
  );
}

/// `показыватьБлок`: файл про Главную молчит — всё; иначе — только названные.
bool _showBlock(String id, Object? list) {
  if (!jsTruthy(list)) return true;
  if (list is List) return list.contains(id);
  if (list is String) return list.contains(id);
  return false;
}

/// `filterAllowedGames`: «all» — всё; иначе разрешённые, всегда разрешённые и развилки, за которыми
/// открыта хоть одна игра (подъём до неподвижной точки).
List<HomeJson> allowedGames(List<HomeJson> games, Object? allowedRaw, Set<String> always, {bool sandbox = false}) {
  if (allowedRaw == 'all') return games;
  final allowed = <Object?>{if (allowedRaw is List) ...allowedRaw};
  bool sb(HomeJson g) => jsTruthy(g['sandbox']);
  final real = {
    for (final g in games)
      if ((!sb(g) || sandbox) && (allowed.contains(g['id']) || always.contains(g['id']))) g['id'],
  };
  final openHubs = <Object?>{};
  for (var step = 0; step < 5; step++) {
    final was = openHubs.length;
    for (final g in games) {
      if (!jsTruthy(g['mergedInto'])) continue;
      if (real.contains(g['id']) || openHubs.contains(g['id'])) openHubs.add(g['mergedInto']);
    }
    if (openHubs.length == was) break;
  }
  return [
    for (final g in games)
      if (!(sb(g) && !sandbox) && (always.contains(g['id']) || allowed.contains(g['id']) || openHubs.contains(g['id']))) g,
  ];
}

/// `visibleInCatalog`: развилка предпросмотра — только своим; спрятанное из меню — нет; игра за живой
/// развилкой — нет.
List<HomeJson> visibleInCatalog(List<HomeJson> list, String profileId) {
  bool preview(HomeJson g) {
    final p = g['previewIn'];
    return jsTruthy(p) && !(p is List && p.contains(profileId) || p is String && p.contains(profileId));
  }

  final alive = {for (final g in list) if (jsTruthy(g['hub']) && !preview(g)) g['id']};
  return [
    for (final g in list)
      if (!(jsTruthy(g['hub']) && preview(g)) &&
          !jsTruthy(g['hideFromMenu']) &&
          !(jsTruthy(g['mergedInto']) && alive.contains(g['mergedInto'])))
        g,
  ];
}

/// `useAllLevelStars`: пройдено уровней (звёзд больше нуля) — по каждой игре, у которой они есть.
int _completedLevels(SharedState s, Object? gameId, String profileId) {
  final m = _parse(s.get('psygames_${gameId}_stars_$profileId'));
  if (m is! Map) return 0;
  var n = 0;
  for (final k in m.keys) {
    final num = jsNum(k);
    if (num.isNaN) continue;
    final v = m[num == num.truncateToDouble() && num.isFinite ? '${num.toInt()}' : '$num'];
    if (jsTruthy(v) && jsNum(v) > 0) n++;
  }
  return n;
}

/// `sectionCols`: столбцов сетки раздела по ширине окна.
int sectionCols(num winWidth, HomeJson layout) {
  final w = math.min(winWidth, layout['maxContainerWidth']! as num) - (layout['containerPadding']! as num) * 2;
  return w >= 880
      ? 5
      : w >= 700
      ? 4
      : w >= 520
      ? 3
      : 2;
}

/// Всё, что Главная берёт из памяти, в той форме, в какой веб отдаёт это сборщику модели.
HomeJson homeInputsFrom(
  SharedState state,
  HomeInputsData d, {
  required Profiles profiles,
  required int now,
  required Wall wall,
  required String language,
  required HomeJson colors,
  required num winW,
  HomeJson events = const {},
}) {
  final inp = d.inputs;
  final w = wall(now);
  final off = _offsetMs(wall, now);
  final today = _dk(w);
  final dayStart = _localMidnight(w.year, w.month, w.day, off);
  final slot = slotForHour(w.hour);

  final p = activeProfileOf(profiles, state);
  final pid = p.id;
  final hp = homeProfileOf(p, state, d.profilesJson);
  final always = {...((d.profilesJson['alwaysAllowed'] as List?) ?? const []).map((e) => '$e')};
  final allowed = allowedGames(d.games, hp.allowed, always, sandbox: hp.raw['allow_sandbox'] == true);
  final visible = visibleInCatalog(allowed, pid);
  final byIdAll = {for (final g in d.games) g['id']: g};
  bool isHub(HomeJson g) => jsTruthy(g['hub']);
  Object? typeOf(HomeJson g) => g['sessionType'] ?? g['id'];

  Object? json(String key) => _parse(state.get(key));

  // ── очки, уровень, серия зарядок, достижения ──────────────────────────────
  final tokens = _map(json('psygames_tokens_v1'))[pid] ?? 0;
  final lv = levelInfo(tokens is num ? tokens : jsNum(tokens), d.rules);
  final history = json('psygames_warmup_history');
  final streak = computeStreak(history is List ? history : const [], dayOf(w));
  final unlocked = json('psygames_achievements_unlocked');

  // ── надетые вещи ──────────────────────────────────────────────────────────
  final eq = _map(json('psygames_cosmetics_equipped_$pid'));
  final cosmetics = [for (final c in (inp['cosmetics']! as List)) _map(c)];
  HomeJson? equipped(String type) {
    final id = eq[type];
    if (!jsTruthy(id)) return null;
    for (final c in cosmetics) {
      if (c['id'] == id && c['type'] == type) return c;
    }
    return null;
  }

  final title = equipped('title');
  final images = _map(inp['profileImages']);
  HomeJson img(Object? id) => _map(images['$id']);
  final bgOverride = equipped('background')?['value'];
  final profileBg = (jsTruthy(bgOverride) ? img(bgOverride)['bg'] : null) ?? img(pid)['bg'];
  final avatarKey = equipped('avatar')?['value'];
  final avatar = jsTruthy(avatarKey) ? _map(inp['avatars'])['$avatarKey'] : null;
  final badgeOverride = equipped('badge')?['value'];

  // ── питомец ───────────────────────────────────────────────────────────────
  final skinChoice = state.get('psygames_pet_skin');
  final skin = skinChoice == 'robot' || skinChoice == 'constellation' ? skinChoice! : 'cat';
  Object? petSpec(String st) => _map(_map(inp['pet'])[skin])[st];

  // ── лестница и сундук ─────────────────────────────────────────────────────
  var level = 0;
  for (final g in visible) {
    level += math.max(0, _completedLevels(state, g['id'], pid));
  }
  final locks = _stable([for (final l in (inp['ladder']! as List)) _map(l)], (a, b) => ((a['level']! as num) - (b['level']! as num)).sign.toInt())
      .where((l) => level < (l['level']! as num));
  final lock = locks.isEmpty ? null : locks.first;
  final figures = figuresWith(d.figures, state);
  final earned = earnedTotalOf(state, pid);
  final have = figures.where((f) => earned >= f.at).length;
  final next = have < figures.length ? figures[have] : null;
  final low = have == 0 ? 0 : figures[have - 1].at;
  final width = next == null ? 0 : next.at - low;

  // ── «Сегодня» ─────────────────────────────────────────────────────────────
  final logRaw = _map(json('psygames_earn_v1'))[pid];
  final hasLog = jsTruthy(logRaw);
  final log = _map(logRaw);
  final dayMarks = log['days'] is List ? (log['days']! as List) : const [];
  final mineToday = [
    for (final e in (log['entries'] is List ? log['entries']! as List : const [])) if (_map(e)['day'] == today) _map(e),
  ];
  final rowsByGame = <Object?, HomeJson>{};
  for (final e in mineToday) {
    final row = rowsByGame[e['game']] ??= {'game': e['game'], 'rounds': 0, 'total': 0, 'doubled': false, 'lastTs': 0};
    row['rounds'] = (row['rounds']! as num) + 1;
    row['total'] = (row['total']! as num) + jsNum(e['total']);
    row['doubled'] = row['doubled'] == true || jsNum(e['multiplier']) > 1;
    row['lastTs'] = math.max(row['lastTs']! as num, jsNum(e['ts']));
  }
  final dayStreak = hasLog ? _streakFromDays(dayMarks, w) : 0;
  final todaySummary = hasLog
      ? {
          'rows': _stable(rowsByGame.values, (a, b) => ((b['lastTs']! as num) - (a['lastTs']! as num)).sign.toInt()),
          'total': mineToday.fold<num>(0, (s, e) => s + jsNum(e['total'])),
          'rounds': mineToday.length,
          'dayStreak': dayStreak,
        }
      : {'rows': const [], 'total': 0, 'rounds': 0, 'dayStreak': 0};

  // ── «продолжить» ──────────────────────────────────────────────────────────
  final maxAge = inp['resumeMaxAgeMs']! as num;
  final resumable = <({String gameId, num savedAt})>[];
  const resumePrefix = 'psygames_resume_';
  for (final e in state.snapshot().entries) {
    final k = e.key;
    if (!k.startsWith(resumePrefix) || !k.endsWith('_$pid')) continue;
    final env = _parse(e.value);
    final at = env is Map ? env['savedAt'] : null;
    if (at is! num || now - at > maxAge) continue;
    resumable.add((gameId: k.substring(resumePrefix.length, k.length - pid.length - 1), savedAt: at));
  }
  Object? resume;
  for (final r in _stable(resumable, (a, b) => (b.savedAt - a.savedAt).sign.toInt())) {
    if (byIdAll.containsKey(r.gameId)) {
      resume = r.gameId;
      break;
    }
  }

  // ── цель дня ──────────────────────────────────────────────────────────────
  final goalRec = json('psygames_day_goal_$pid');
  final dayGoal = goalRec is Map && goalRec['text'] is String && goalRec['date'] == today
      ? {...goalRec.cast<String, Object?>(), 'outcome': goalRec['outcome']}
      : null;
  final dismissedOn = state.get('psygames_day_goal_dismissed_$pid');
  final goalState = dismissedOn == today
      ? 'hidden'
      : dayGoal == null
      ? 'ask'
      : jsTruthy(dayGoal['outcome'])
      ? 'closed'
      : slot == 'evening'
      ? 'review'
      : 'active';

  // ── рекомендации ──────────────────────────────────────────────────────────
  final sessions = readSessions(state, d.rules.legacyGameTypes);
  final weakest = _weakestGame(state, inp, allowed, d.games, now: now, offsetMs: off);
  final reco = _recommend(
    d,
    allowed: allowed,
    sessions: sessions,
    profileId: pid,
    now: now,
    wall: wall,
    w: w,
    dayStart: dayStart,
    weakestGameId: weakest,
  );

  // ── вызов дня ─────────────────────────────────────────────────────────────
  final eligible = [
    for (final g in d.games)
      if (!jsTruthy(g['hideFromMenu']) && !jsTruthy(g['sandbox']) && g['category'] != 'recovery' && !isHub(g)) g,
  ];
  final seed = w.year * 372 + w.month * 31 + w.day;
  final diffs = inp['challengeDiffs']! as List;
  // `loadChallengeStreak`: нет записи, битая или `null` — с нуля; не объект — без полей.
  final challengeParsed = _parse(state.get('psygames_daily_challenge_streak_$pid'));
  final challengeRec = challengeParsed == null ? const {'streak': 0, 'total': 0, 'last': ''} : _map(challengeParsed);

  // ── любимые разделы ───────────────────────────────────────────────────────
  final catOfType = <Object?, Object?>{for (final g in d.games) typeOf(g): g['category']};
  final catPlays = <Object?, int>{};
  final playsByType = <Object?, int>{};
  for (final s in sessions) {
    final t = s['game_type'];
    if (jsTruthy(t)) playsByType[t] = (playsByType[t] ?? 0) + 1;
    if (!jsTruthy(t)) continue;
    final c = catOfType[t];
    if (c == null) continue;
    catPlays[c] = (catPlays[c] ?? 0) + 1;
  }
  int ord(Object? c) => d.categoryOrder.indexOf('$c');
  final favCats = _stable(catPlays.entries, (a, b) => b.value != a.value ? b.value - a.value : ord(a.key) - ord(b.key))
      .take((inp['favouriteSections']! as num).toInt())
      .map((e) => e.key);
  int plays(HomeJson g) => playsByType[typeOf(g)] ?? 0;
  List<HomeJson> bySection(Object? cat) {
    final inCat = visible.where((g) => g['category'] == cat);
    int cmp(HomeJson a, HomeJson b) => plays(b) - plays(a);
    return [..._stable(inCat.where(isHub), cmp), ..._stable(inCat.where((g) => !isHub(g)), cmp)];
  }

  final cols = sectionCols(winW, _map(inp['layout']));
  final favourites = [
    for (final cat in favCats)
      if (bySection(cat) case final all when all.isNotEmpty)
        {
          'category': cat,
          'total': all.length,
          'routes': [for (final g in all.take(cols)) g['route']],
          'hidden': all.length - math.min(cols, all.length),
        },
  ];

  // ── окно цели-серии ───────────────────────────────────────────────────────
  final goalCfg = _map(inp['goal']);
  final goalDays = [for (final x in (goalCfg['days']! as List)) (x as num).toInt()];
  final savedGoal = json('psygames_streak_goal_$pid');
  final streakGoal = savedGoal is Map && savedGoal['days'] is num && savedGoal['startedAt'] is String
      ? {...savedGoal.cast<String, Object?>(), 'reachedAt': savedGoal['reachedAt']}
      : null;
  final noticed = streakGoal == null
      ? null
      : jsTruthy(streakGoal['reachedAt']) || dayStreak < (streakGoal['days']! as num)
      ? streakGoal
      : {...streakGoal, 'reachedAt': today};
  final lastAskedAt = state.get('psygames_streak_goal_asked_$pid');
  final String? ask = lastAskedAt == today
      ? null
      : noticed == null
      ? 'first'
      : jsTruthy(noticed['reachedAt'])
      ? 'reached'
      : dayStreak >= (noticed['days']! as num)
      ? 'reached'
      : dayStreak == 0
      ? 'broken'
      : _daysBetween(noticed['askedAt'], today) >= (goalCfg['askEveryDays']! as num)
      ? 'weekly'
      : null;
  final suggestion = _suggestGoal(
    dayMarks,
    goalDays,
    hasSessions: dayMarks.isNotEmpty,
    brokenFrom: ask == 'broken' ? (noticed?['days'] as num?)?.toInt() : null,
    countsFrom: (goalCfg['streakCountsFrom']! as num).toInt(),
  );
  Object? goalSheet;
  if (ask != null) {
    final lines = _map(inp['goalLines']);
    final line = _map(_map(lines[language] ?? lines['en'])[ask] ?? _map(lines['en'])[ask]);
    goalSheet = {
      'line': line['text'],
      'petState': petSpec('${line['state']}'),
      'options': goalDays,
      'chosen': suggestion.days,
      'whyKey': suggestion.basis == null ? null : 'goalSuggest_${suggestion.reason}',
      'basis': suggestion.basis,
      'games': todaySummary['rounds'],
      'tokens': todaySummary['total'],
      'streak': todaySummary['dayStreak'],
    };
  }

  // 🔴 Знакомство не пройдено — окна цели нет. Веб в этом случае уводит Главную на `/onboarding`
  // (`shouldOpenOnboardingPicker`) и окна не показывает вовсе; своя Главная остаётся под экраном
  // знакомства — и без этой проверки легла бы окном поверх него (тот же дефект, что замер 07.10).
  final picked = state.get('psygames_onboarding_picked_$pid') == '1';
  final legacy = state.get('psygames_onboarded') == 'true' && !state.snapshot().keys.any((k) => k.startsWith('psygames_onboarding_picked_'));
  if (!picked && !legacy) goalSheet = null;

  final warmupOn = jsTruthy(hp.warmupEnabled);
  final slotTint = _map(d.home['slotTint']);
  return {
    'profile': {'id': pid, 'color': hp.raw['color'], 'emoji': hp.raw['emoji'], 'warmup_enabled': ?hp.warmupEnabled},
    'colors': colors,
    'showBlock': {
      for (final k in [HomeBlockKeys.goal, HomeBlockKeys.today, HomeBlockKeys.reco, HomeBlockKeys.practices, HomeBlockKeys.favourites])
        k: _showBlock(k, hp.homeBlocks),
    },
    'images': {
      'onPhoto': profileBg != null,
      'profileBg': profileBg,
      'logo': img(pid)['logo'],
      'chip': avatar ?? img(badgeOverride ?? pid)['badge'],
      'warmup': warmupOn ? inp['warmupIcon'] : null,
    },
    'logoPlate': img(pid)['plate'],
    'tokens': tokens,
    'level': {'level': lv.level, 'titleKey': lv.titleKey, 'intoLevel': lv.intoLevel, 'span': lv.span, 'progress': lv.progress},
    'streak': streak,
    'pet': petSpec('idle'),
    'frameColor': equipped('frame')?['value'],
    'titleLabel': title == null ? null : '${title['value']} ${L.t('${title['nameKey']}')}',
    'achievementsCount': unlocked is List ? unlocked.length : 0,
    'update': events['update'],
    'streakToast': events['streakToast'],
    'wagerToast': events['wagerToast'],
    'levelUp': events['levelUp'],
    'ladder': lock == null ? null : {'n': (lock['level']! as num) - level, 'titleKey': lock['titleKey']},
    'chest': {
      'face': next?.face,
      'left': next == null ? 0 : next.at - earned,
      'have': have,
      'all': figures.length,
      'ratio': next == null ? 1 : (width > 0 ? ((earned - low) / width).clamp(0, 1) : 1),
    },
    'resume': resume,
    'goalCard': {'state': goalState, 'goal': dayGoal},
    'goalMaxLen': goalCfg['maxLen'],
    'goalExampleKeys': goalCfg['exampleKeys'],
    'today': todaySummary,
    'todayRowsMax': inp['todayRowsMax'],
    'dayStreakForMult': inp['dayStreakForMult'],
    'reco': [for (final r in reco) if (byIdAll.containsKey(r['gameId'])) {'pick': r, 'gameId': r['gameId']}],
    'recoParams': slot == 'evening' || slot == 'night' ? {'calm': '1'} : const <String, Object?>{},
    'warmup': warmupOn ? {'gradient': slotTint[slot], 'slotKey': 'slot${slot[0].toUpperCase()}${slot.substring(1)}'} : null,
    'pause': {'gradient': d.home['heroEye']},
    'challenge': {
      'gameId': eligible[seed % eligible.length]['id'],
      'difficultyKey': diffs[(seed ~/ eligible.length) % diffs.length],
      'done': challengeRec['last'] == today,
      'streak': ?challengeRec['streak'],
    },
    'favourites': favourites,
    'goalSheet': goalSheet,
  };
}

/// `streakFromDays`: дней подряд по меткам; сегодня ещё не отмечено — счёт со вчера.
int _streakFromDays(List<Object?> days, DateTime w) {
  final have = days.toSet();
  var cur = DateTime.utc(w.year, w.month, w.day);
  if (!have.contains(_dk(cur))) cur = DateTime.utc(cur.year, cur.month, cur.day - 1);
  var n = 0;
  while (have.contains(_dk(cur))) {
    n++;
    cur = DateTime.utc(cur.year, cur.month, cur.day - 1);
  }
  return n;
}

/// `daysBetween`: суток между двумя ключами `y-m-d` (по местным полночам); не разобралось — NaN.
double _daysBetween(Object? from, String to) {
  DateTime? parse(Object? k) {
    if (k is! String) return null;
    final p = k.split('-').map(jsNum).toList();
    if (p.length < 3 || p.any((x) => x.isNaN)) return null;
    return DateTime.utc(p[0].toInt(), p[1].toInt(), p[2].toInt());
  }

  final a = parse(from);
  final b = parse(to);
  if (a == null || b == null) return double.nan;
  return ((b.millisecondsSinceEpoch - a.millisecondsSinceEpoch) / 86400000).roundToDouble();
}

/// `suggestGoal` (`services/goalSuggest.ts`).
({int days, String reason, int? basis}) _suggestGoal(
  List<Object?> marks,
  List<int> goalDays, {
  required bool hasSessions,
  required int? brokenFrom,
  required int countsFrom,
}) {
  if (brokenFrom != null) {
    final i = goalDays.indexOf(brokenFrom);
    return (days: goalDays[math.max(0, i - 1)], reason: 'smaller', basis: brokenFrom);
  }
  final have = marks.toSet();
  var best = 0;
  for (final m in have) {
    if (m is! String) continue;
    final p = m.split('-').map(jsNum).toList();
    if (p.length < 3 || p.any((x) => x.isNaN)) continue;
    final y = p[0].toInt(), mo = p[1].toInt(), dd = p[2].toInt();
    if (have.contains(_dk(DateTime.utc(y, mo, dd - 1)))) continue;
    var n = 0;
    var cur = DateTime.utc(y, mo, dd);
    while (have.contains(_dk(cur))) {
      n++;
      cur = DateTime.utc(cur.year, cur.month, cur.day + 1);
    }
    if (n > best) best = n;
  }
  if (best >= goalDays.last) return (days: goalDays.last, reason: 'at_top', basis: best);
  if (best >= countsFrom) {
    final up = goalDays.where((x) => x > best);
    return (days: up.isEmpty ? goalDays.last : up.first, reason: 'best_streak', basis: best);
  }
  if (hasSessions) return (days: goalDays.first, reason: 'start_week', basis: null);
  return (days: goalDays.first, reason: 'no_data', basis: null);
}

/// Слабое место: худший домен последней оценки (z < −0,5) — его игра; нет — свежий «слабый навык»
/// разбора зарядки (`loadWeakSkill`, не старше недели) — первое разрешённое упражнение с этим навыком.
Object? _weakestGame(SharedState s, HomeJson inp, List<HomeJson> allowed, List<HomeJson> games, {required int now, required int offsetMs}) {
  final hist = _parse(s.get('psygames_assessment_history'));
  final last = hist is List && hist.isNotEmpty ? hist.last : null;
  final scores = last is Map ? last['scores'] : null;
  if (scores is List && scores.isNotEmpty) {
    HomeJson? worst;
    for (final sc in scores) {
      final m = _map(sc);
      final z = m['z_score'];
      if (z is! num || !z.isFinite) continue;
      if (worst == null || z < (worst['z_score']! as num)) worst = m;
    }
    if (worst != null && (worst['z_score']! as num) < -0.5) {
      final game = _map(inp['domainGames'])['${worst['domain']}'];
      if (game != null) return game;
    }
  }
  final place = _parse(s.get('psygames_weak_skill_v1'));
  if (place is! Map || !jsTruthy(place['skillKey']) || !jsTruthy(place['date'])) return null;
  final dm = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch('${place['date']}');
  if (dm == null) return null;
  final midnight = _localMidnight(int.parse(dm[1]!), int.parse(dm[2]!), int.parse(dm[3]!), offsetMs);
  final days = ((now - midnight) / 86400000).floor();
  if (days < 0 || days > (inp['weakSkillFreshDays']! as num)) return null;
  final ok = {for (final g in allowed) g['id']};
  for (final g in games) {
    if (g['skillKey'] == place['skillKey'] && !jsTruthy(g['sandbox']) && !jsTruthy(g['hub']) && ok.contains(g['id'])) return g['id'];
  }
  return null;
}

/// `recommendToday` (`services/recommend.ts`): до трёх игр дня с причиной.
List<HomeJson> _recommend(
  HomeInputsData d, {
  required List<HomeJson> allowed,
  required List<Session> sessions,
  required String profileId,
  required int now,
  required Wall wall,
  required DateTime w,
  required int dayStart,
  required Object? weakestGameId,
}) {
  final cfg = _map(d.inputs['reco']);
  final count = (cfg['count']! as num).toInt();
  final staleDays = cfg['staleDays']! as num;
  final banned = (cfg['eveningBanned']! as List).toSet();
  final reasonKey = _map(cfg['reasonKey']);
  const msDay = 86400000;
  final slot = slotForHour(w.hour);
  final evening = slot == 'evening' || slot == 'night';
  final seed = recoSeed('${w.year}-${w.month}-${w.day}', profileId);

  final pool = [for (final g in allowed) if (!jsTruthy(g['hideFromMenu']) && !jsTruthy(g['hub'])) g];
  final byId = {for (final g in pool) g['id']: g};
  final byIdHidden = {for (final g in allowed) if (!jsTruthy(g['hub'])) g['id']: g};
  if (pool.isEmpty) return const [];

  final mine = <({Session s, double t})>[];
  for (final s in sessions) {
    if (!jsTruthy(s['game_type']) || s['profile_id'] != profileId) continue;
    final t = jsTruthy(s['timestamp']) ? jsDateParse(s['timestamp']) : double.nan;
    if (t.isFinite) mine.add((s: s, t: t));
  }
  final before = mine.where((x) => x.t < dayStart).toList();
  final playedToday = {for (final x in mine) if (x.t >= dayStart) x.s['game_type']};
  final plays = <Object?, int>{};
  final lastAt = <Object?, double>{};
  for (final x in before) {
    final id = x.s['game_type'];
    plays[id] = (plays[id] ?? 0) + 1;
    if (x.t > (lastAt[id] ?? double.negativeInfinity)) lastAt[id] = x.t;
  }
  int? daysSince(Object? id) {
    final t = lastAt[id];
    return t == null ? null : ((dayStart - t) / msDay).floor();
  }

  final shuffled = _stable(
    [for (final (i, g) in pool.indexed) (g: g, k: recoSeed('${g['id']}', '${seed + i}'))],
    (a, b) => a.k - b.k,
  ).map((x) => x.g).toList();
  final order = {for (final (i, g) in shuffled.indexed) g['id']: i};
  int tie(Object? a, Object? b) => (order[a] ?? 0) - (order[b] ?? 0);
  bool okEvening(Object? id) {
    final g = byIdHidden[id] ?? byId[id];
    return g != null && (!evening || !banned.contains(g['category']));
  }

  final comeback = _stable(
    [for (final g in pool) if ((plays[g['id']] ?? 0) >= 2 && (daysSince(g['id']) ?? 0) >= staleDays) g['id']],
    (a, b) {
      final c = (daysSince(b) ?? 0) - (daysSince(a) ?? 0);
      if (c != 0) return c;
      final p = (plays[b] ?? 0) - (plays[a] ?? 0);
      return p != 0 ? p : tie(a, b);
    },
  );

  final growth = <Object?>[];
  final seen = <Object?>{};
  for (final day in buildTrainingHistory([for (final x in before) x.s], d.rules, wall, maxDays: 0)) {
    for (final e in day.entries) {
      if (seen.contains(e.gameType)) continue;
      seen.add(e.gameType);
      if (e.verdict != 'better' || !byId.containsKey(e.gameType)) continue;
      if ((daysSince(e.gameType) ?? double.infinity) >= staleDays) continue;
      growth.add(e.gameType);
    }
  }

  final branch = <Object?>[];
  {
    final windowStart = dayStart - (cfg['branchWindowDays']! as num) * msDay;
    final inCat = <Object?, List<Object?>>{};
    for (final g in shuffled) {
      (inCat[g['category']] ??= []).add(g['id']);
    }
    final catOf = <Object?, Object?>{for (final g in d.games) g['sessionType'] ?? g['id']: g['category']};
    final load = <Object?, int>{};
    for (final x in before) {
      if (x.t < windowStart) continue;
      final c = catOf[x.s['game_type']];
      if (c == null || !inCat.containsKey(c)) continue;
      load[c] = (load[c] ?? 0) + 1;
    }
    final cats = _stable(inCat.keys, (a, b) {
      final la = (load[a] ?? 0) / inCat[a]!.length;
      final lb = (load[b] ?? 0) / inCat[b]!.length;
      final c = (la - lb).sign.toInt();
      return c != 0 ? c : tie(inCat[a]!.first, inCat[b]!.first);
    });
    for (final c in cats) {
      branch.addAll(_stable(inCat[c]!, (a, b) {
        final p = (plays[a] ?? 0) - (plays[b] ?? 0);
        return p != 0 ? p : tie(a, b);
      }));
    }
  }

  final fresh = seed % (cfg['freshEvery']! as num).toInt() == 0
      ? _freshIds(_map(d.inputs['fresh']), localDateKey(w)).where((id) => byId.containsKey(id) && (plays[id] ?? 0) == 0).toList()
      : const <Object?>[];
  final start = before.isEmpty ? [...(cfg['starters']! as List).where(byId.containsKey), ...branch] : const <Object?>[];
  final weakspot = jsTruthy(weakestGameId) && byIdHidden.containsKey(weakestGameId) ? [weakestGameId] : const <Object?>[];

  final sources = start.isNotEmpty
      ? [(reason: 'start', ids: start)]
      : [
          (reason: 'weakspot', ids: weakspot),
          (reason: 'comeback', ids: comeback),
          (reason: 'growth', ids: growth),
          (reason: 'fresh', ids: fresh),
          (reason: 'branch', ids: branch),
        ];

  final picks = <HomeJson>[];
  final taken = <Object?>{};
  final calmSlot = evening ? 1 : 0;
  final limit = math.max(0, count - calmSlot);
  bool add(Object? id, String reason) {
    final visible = reason == 'weakspot' ? byIdHidden.containsKey(id) : byId.containsKey(id);
    if (taken.contains(id) || !visible || !okEvening(id)) return false;
    taken.add(id);
    picks.add({
      'gameId': id,
      'reason': reason,
      'reasonKey': reasonKey[reason],
      'daysSince': daysSince(id),
      'doneToday': playedToday.contains(id),
    });
    return true;
  }

  for (final src in sources) {
    if (picks.length >= limit) break;
    for (final id in src.ids) {
      if (add(id, src.reason)) break;
    }
  }
  for (final src in sources) {
    for (final id in src.ids) {
      if (picks.length >= limit) break;
      add(id, src.reason);
    }
  }
  if (calmSlot > 0) {
    final calm = _stable(
      shuffled.where((g) => g['category'] == 'recovery' && !taken.contains(g['id'])),
      (a, b) {
        final p = (plays[a['id']] ?? 0) - (plays[b['id']] ?? 0);
        return p != 0 ? p : tie(a['id'], b['id']);
      },
    );
    if (calm.isEmpty || !add(calm.first['id'], 'calm')) {
      for (final src in sources) {
        for (final id in src.ids) {
          if (picks.length >= count) break;
          add(id, src.reason);
        }
      }
    }
  }
  return picks.take(count).toList();
}

/// `freshGameIds`: свежие за 90 дней, но не меньше четырёх (тогда — четыре самых новых).
List<Object?> _freshIds(HomeJson fresh, String today) {
  int utc(String s) {
    final p = s.split('-').map(jsNum).toList();
    return DateTime.utc(p[0].toInt(), p[1].toInt(), p[2].toInt()).millisecondsSinceEpoch;
  }

  final entries = [for (final e in (fresh['entries']! as List)) _map(e)];
  final sorted = _stable(entries, (a, b) => '${b['since']}'.compareTo('${a['since']}'));
  final young = sorted.where((e) => ((utc(today) - utc('${e['since']}')) / 86400000).round() <= (fresh['days']! as num)).toList();
  final min = (fresh['min']! as num).toInt();
  final picked = young.length >= min ? young : sorted.take(math.min(min, sorted.length));
  return [for (final e in picked) e['id']];
}

/// События веба поверх своей модели Главной: тосты (бонус входа, ставка, «Уровень N!») и «есть
/// обновление» — их хозяин пока веб; облик питомца — из канала (лента кадров `strip`), если он
/// приехал на страницу. Всё остальное — своё. Страницы нет — своя модель как есть.
HomeJson withPageEvents(HomeJson own, HomeJson? page) {
  if (page == null) return own;
  final header = {..._map(own['header'])};
  final pageHeader = _map(page['header']);
  header['update'] = pageHeader['update'];
  final pagePet = _map(pageHeader['pet']);
  if (pagePet['kind'] == 'strip') header['pet'] = pagePet;
  final sheet = own['goalSheet'] is Map ? {..._map(own['goalSheet'])} : null;
  final pageSheetPet = _map(_map(page['goalSheet'])['pet']);
  if (sheet != null && pageSheetPet['kind'] == 'strip') sheet['pet'] = pageSheetPet;
  return {...own, 'toasts': page['toasts'], 'header': header, 'goalSheet': sheet};
}
