import 'dart:convert';
import 'dart:math' as math;

import 'asset_json.dart';
import 'l10n.dart';
import 'playlist_fields.dart';
import 'profiles.dart';
import 'sessions.dart';
import 'shared_state.dart';
import 'stats_model.dart' show ProfileAccess, activeProfileOf, jsNumStr;
import 'training_history.dart';

/// «ПИТОМЕЦ» НА DART (задача d6a60b02, вариант Б).
///
/// Перенос модели `app/pet.tsx` один в один: статы питомца по сыгранному (`computePetStats` — партии
/// ВСЕХ профилей, как у веба), стадия и полоса роста (`petGrowth`), кормление за очки раз в сутки,
/// мытьё раз в сутки, вид заботы (`currentPetLook` → `petLook`), облики с замком лестницы по уровню
/// игрока (`useLadderLock('petSkins')`: звёзды ВСЕХ игр профиля), совет по слабой шкале (`petAdvice`).
/// Таблицы — выгрузкой `assets/pet.json` (кадры, лакомство, шкалы, пул реплик).
///
/// ⚠️ ЧЕГО ЗДЕСЬ НЕТ: что делает НАЖАТИЕ — действие на портрете (умывается, ёрзает, ест), лакомство у
/// рта, реплика после действия, подпись «откроется с N» у запертого облика. Действия пока у страницы,
/// и эти поля ложатся поверх своей модели со страницы ([withPetPageEvents]).
///
/// Эталон — модель живого веб-экрана вместе со всем хранилищем (`fixtures/pet_dart_*`), проба
/// `pet_model_test.dart`.
class PetData {
  PetData({required this.j, required this.ladder, required this.games, required this.profilesJson, required this.legacy});

  /// `assets/pet.json`.
  final Map<String, Object?> j;

  /// `FEATURE_LADDER` из `assets/home_inputs.json` — заводские пороги замков.
  final List<Map<String, Object?>> ladder;

  /// Записи `assets/catalog.json` в порядке `GAMES`.
  final List<Map<String, Object?>> games;
  final Map<String, Object?> profilesJson;

  /// Старые имена игр в журнале партий (`LEGACY_GAME_TYPE_MAP`) — `readAll` веба их переводит.
  final Map<String, String> legacy;

  static PetData? _cache;
  static Future<PetData> load() async {
    if (_cache case final c?) return c;
    final home = await loadJsonAsset('assets/home_inputs.json');
    final catalog = await loadJsonAsset('assets/catalog.json');
    return _cache = PetData(
      j: await loadJsonAsset('assets/pet.json'),
      ladder: [for (final l in (home['ladder']! as List)) (l as Map).cast<String, Object?>()],
      games: [for (final g in (catalog['games']! as List)) (g as Map).cast<String, Object?>()],
      profilesJson: await loadJsonAsset('assets/profiles.json'),
      legacy: (await StatsRules.load()).legacyGameTypes,
    );
  }
}

typedef PetJson = Map<String, Object?>;
PetJson _map(Object? v) => v is Map ? v.cast<String, Object?>() : const {};

Object? _parse(String? raw) {
  if (raw == null) return null;
  try {
    return jsonDecode(raw);
  } catch (_) {
    return null;
  }
}

/// `${y}-${m+1}-${d}` веба (`dayStamp`) — без ведущих нулей.
String _stamp(DateTime w) => '${w.year}-${w.month}-${w.day}';

/// `деньЧислом`: сутки от эпохи по UTC-дате ключа; не разобралось — `null` (NaN у веба).
int? _dayNumber(String stamp) {
  final p = stamp.split('-').map(jsNum).toList();
  final y = p.isNotEmpty ? p[0] : double.nan;
  final m = p.length > 1 && jsTruthy(p[1]) ? p[1] : 1;
  final d = p.length > 2 && jsTruthy(p[2]) ? p[2] : 1;
  if (y.isNaN || m.isNaN || d.isNaN) return null;
  return (DateTime.utc(y.toInt(), m.toInt(), d.toInt()).millisecondsSinceEpoch / 86400000).floor();
}

/// Статы питомца — `computePetStats`.
({int total, Map<String, int> skills, int level, int stage}) petStats(List<Session> sessions, PetData d) {
  final toSkill = _map(d.j['categoryToSkill']);
  final byGame = <Object?, Object?>{for (final g in d.games) g['id']: toSkill[g['category']]};
  final counts = {'memory': 0, 'attention': 0, 'logic': 0, 'speed': 0};
  for (final s in sessions) {
    final skill = byGame[s['game_type']];
    if (skill is String && counts.containsKey(skill)) counts[skill] = counts[skill]! + 1;
  }
  final total = sessions.length;
  return (
    total: total,
    skills: {for (final e in counts.entries) e.key: math.min(100, e.value * 4)},
    level: total ~/ 5 + 1,
    stage: total >= 30 ? 3 : total >= 10 ? 2 : 1,
  );
}

/// Полоса роста — `petGrowth`.
({int? nextStageAt, int left, double frac}) petGrowth(int total) {
  final next = total < 10 ? 10 : total < 30 ? 30 : null;
  final prev = total < 10 ? 0 : total < 30 ? 10 : 30;
  final target = next ?? (total ~/ 5 + 1) * 5;
  final base = next != null ? prev : (total ~/ 5) * 5;
  return (
    nextStageAt: next,
    left: math.max(0, target - total),
    frac: ((total - base) / math.max(1, target - base)).clamp(0, 1).toDouble(),
  );
}

/// Вид заботы — `petLook`: самая заметная запущенность выше порога, иначе — возраст.
String petLookReason({required double fedDays, required double daysSinceWash, required double daysSincePlay}) {
  int step(double v) => math.max(0, math.min(6, v.round()));
  final weight = step((math.max(0, math.min(14, fedDays)) / 14) * 3);
  final axes = <({double force, String reason})>[
    (force: (weight - 3).abs() / 3, reason: weight < 3 ? 'hungry' : 'overfed'),
    (force: math.min(1, daysSinceWash / 7), reason: 'dirty'),
    (force: math.min(1, daysSincePlay / 7), reason: 'lonely'),
    (force: math.min(1, math.max(0, daysSincePlay - 7) / 7), reason: 'neglected'),
  ];
  ({double force, String reason})? worst;
  for (final a in axes) {
    if (a.force >= 0.34 && (worst == null || a.force >= worst.force)) worst = a;
  }
  return worst?.reason ?? 'growing';
}

/// `ruTrainings`: одна, несколько, много — формы из выгрузки (`RU_TRAININGS` веба).
String ruTrainings(int n, List<Object?> forms) {
  final m10 = n % 10, m100 = n % 100;
  if (m10 == 1 && m100 != 11) return '${forms[0]}';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return '${forms[1]}';
  return '${forms[2]}';
}

/// Модель «Питомца» из общей памяти — та же, что `petModel` веба (кроме полей нажатий, см. класс).
/// [bubble] — реплика пузыря, выбранная экраном один раз за показ ([pickPetBubble]).
PetJson petModelFrom(
  SharedState state,
  PetData d, {
  required Profiles profiles,
  required int now,
  required Wall wall,
  required String language,
  required String bubble,
}) {
  final j = d.j;
  final w = wall(now);
  final p = activeProfileOf(profiles, state);
  final pid = p.id;
  final sessions = readSessions(state, d.legacy);
  final stats = petStats(sessions, d);
  final growth = petGrowth(stats.total);

  // ── что лежит в памяти ──────────────────────────────────────────────────
  final skinRaw = state.get('psygames_pet_skin');
  final skinChoice = skinRaw == 'robot' || skinRaw == 'constellation' || skinRaw == 'auto' ? skinRaw! : 'cat';
  final skin = skinChoice == 'auto' ? 'cat' : skinChoice;
  final accRaw = state.get('psygames_pet_acc');
  final accessory = (j['accessories']! as List).contains(accRaw) ? accRaw! : 'none';
  final petName = (state.get('psygames_pet_name') ?? '').trim();
  final name = petName.length > 20 ? petName.substring(0, 20) : petName;
  final today = _stamp(w);
  final fed = state.get('psygames_pet_fed') == today;
  final washedRaw = state.get('psygames_pet_washed_at');
  final washedAt = washedRaw == null ? double.nan : jsNum(washedRaw);
  final daysSinceWash = washedAt.isFinite ? math.max(0, (now - washedAt) / 86400000).toDouble() : 999.0;
  final tokens = _map(_parse(state.get('psygames_tokens_v1')))[pid] ?? 0;
  final balance = tokens is num ? tokens : jsNum(tokens);
  final feedCost = j['feedCost']! as num;

  // ── вид заботы (`currentPetLook`) ───────────────────────────────────────
  final log = _parse(state.get('psygames_pet_fed_log'));
  final window = j['fedWindowDays']! as num;
  final todayNum = _dayNumber(today)!;
  final fresh = <int>{
    if (log is List)
      for (final s in log)
        if (s is String)
          if (_dayNumber(s) case final n? when todayNum - n < window && todayNum - n >= 0) n,
  };
  final fedDays = fresh.isEmpty && fed ? 1.0 : fresh.length.toDouble();
  final lastTs = sessions.isEmpty ? null : sessions.last['timestamp'];
  final lastT = jsTruthy(lastTs) ? jsDateParse(lastTs) : double.nan;
  final daysSincePlay = lastT.isFinite ? (now - lastT) / 86400000 : 999.0;
  final reason = petLookReason(fedDays: fedDays, daysSinceWash: daysSinceWash, daysSincePlay: daysSincePlay);

  // ── замок обликов (`useLadderLock('petSkins')`) ─────────────────────────
  final starTail = '_stars_$pid';
  var level = 0;
  for (final e in state.snapshot().entries) {
    if (!e.key.startsWith('psygames_') || !e.key.endsWith(starTail)) continue;
    final m = _parse(e.value);
    if (m is! Map) continue;
    level += m.values.where((v) => jsTruthy(v) && jsNum(v) > 0).length;
  }
  final lock = _lockLevel(state, d, 'petSkins');
  final skinsLocked = lock != null && level < lock;

  // ── совет по слабой шкале (`petAdvice`) ─────────────────────────────────
  final order = [for (final k in (j['skillOrder']! as List)) '$k'];
  final colors = _map(j['skillColors']);
  String skillLabel(String k) => switch (k) {
    'memory' => L.t('catMemory'),
    'attention' => L.t('catAttention'),
    'logic' => L.t('petSkillLogic'),
    _ => L.t('petSkillSpeed'),
  };
  var weakest = order.first;
  for (final k in order.skip(1)) {
    if (!(stats.skills[weakest]! <= stats.skills[k]!)) weakest = k;
  }
  PetJson? advice;
  if (stats.skills[weakest]! < 100) {
    final access = ProfileAccess.of(p, state, d.profilesJson);
    final toSkill = _map(j['categoryToSkill']);
    final pool = [for (final g in d.games) if (toSkill[g['category']] == weakest && access.allows(g['id'])) g];
    if (pool.isNotEmpty) {
      final pick = pool[stats.total % pool.length];
      advice = {
        'title': '💡 ${L.t('petAdviceTitle')}',
        'color': colors[weakest],
        'body': L.t('petAdviceBody').replaceFirst('{skill}', skillLabel(weakest)).replaceFirst('{game}', L.t('${pick['nameKey']}')),
        'a11y': '${L.t('petAdviceTitle')}: ${L.t('${pick['nameKey']}')}',
      };
    }
  }

  final specs = _map(j['specs']);
  Object? spec(String sk, String st, String acc) => _map(_map(specs[sk])[st])[acc];
  final washable = daysSinceWash >= 1;
  final shownName = name.isEmpty ? L.t('petName') : name;
  final rtl = (j['rtl']! as List).contains(language.split('-').first.toLowerCase());
  return {
    'v': 1,
    'care': [
      {'id': 'wash', 'emoji': '🫧', 'label': washable ? L.t('petWash') : L.t('petWashedToday'), 'a11y': L.t('petWash'), 'enabled': washable, 'accent': washable},
      {'id': 'stroke', 'emoji': '🤚', 'label': L.t('petStroke'), 'a11y': L.t('petStroke'), 'enabled': true, 'accent': false},
      {'id': 'play', 'emoji': '🎮', 'label': L.t('petPlay'), 'a11y': L.t('petPlay'), 'enabled': true, 'accent': false},
    ],
    'back': L.t('a11yBack'),
    'backIcon': rtl ? 'arrow-forward' : 'arrow-back',
    'name': shownName,
    'nameRaw': name,
    'nameMax': 20,
    'namePlaceholder': L.t('petName'),
    'rename': L.t('petRename'),
    'apply': L.t('apply'),
    'bubble': bubble,
    'portrait': {
      'state': 'idle',
      'specs': {for (final st in ['idle', 'groom', 'wiggle', 'eat']) st: spec(skin, st, accessory)},
      'treat': null,
    },
    'stageName': L.t('petStage${stats.stage}'),
    'stageHint': L.t('petGrowsHint'),
    'growth': {
      'frac': growth.frac,
      'text': '${L.t('petTrainingsDone').replaceFirst('{n}', '${stats.total}')} · ${growth.nextStageAt != null
          ? L.t('petUntilNextStage').replaceFirst('{n}', '${growth.left}').replaceFirst('{stage}', L.t('petStage${stats.total < 10 ? 2 : 3}'))
          : L.t('petUntilNextLevel').replaceFirst('{n}', '${growth.left}')}',
    },
    'feed': {
      'fed': fed,
      'label': fed ? '❤️ ${L.t('petFedToday')}' : '🍪 ${L.t('petFeed')} · ${jsNumStr(feedCost)} ⭐',
      'needMore': !fed && balance < feedCost ? L.t('needMoreTokens') : null,
    },
    'lookReason': reason == 'growing' ? null : L.t('petLook_$reason'),
    'skinTitle': L.t('petSkinSectionTitle').replaceFirst('{name}', shownName),
    'skins': [
      for (final sk in ['cat', 'robot', 'constellation'])
        () {
          final locked = skinsLocked && sk != 'cat';
          // Каждый ключ — своим L.t: ключ в тернарнике сборщик словаря не видит.
          final label = sk == 'cat'
              ? L.t('petSkinCat')
              : sk == 'robot'
              ? L.t('petSkinRobot')
              : L.t('petSkinConstellation');
          return {
            'id': sk,
            'on': skinChoice == sk || (sk == 'cat' && skinChoice == 'auto'),
            'locked': locked,
            'label': label,
            'a11y': locked ? '$label — ${L.t('ladderLockedAt').replaceFirst('{n}', '$lock')}' : label,
            'still': spec(sk, 'idle', 'none'),
          };
        }(),
    ],
    'level': '${stats.level}',
    'levelLabel': L.t('level'),
    'total': '${stats.total}',
    'totalLabel': language == 'ru'
        ? ruTrainings(stats.total, j['ruTrainings']! as List)
        : stats.total == 1
        ? L.t('unitTrainingOne')
        : L.t('unitTrainings'),
    'advice': advice,
    'skills': [
      for (final k in order) {'key': k, 'label': skillLabel(k), 'value': stats.skills[k], 'color': colors[k]},
    ],
  };
}

/// `порогЗамка`: свой порог из файла состава (раздел «замки»; файл без «профили» не читается), иначе —
/// заводской из лестницы. `null` — такого приёма в лестнице нет.
int? _lockLevel(SharedState state, PetData d, String key) {
  final saved = _parse(state.get('psygames_playlists_override'));
  if (saved is Map && saved[PlaylistFields.profiles] is Map) {
    final own = _map(saved[PlaylistFields.locks])[key];
    if (own is num) return own.toInt();
  }
  for (final l in d.ladder) {
    if (l['key'] == key) return (l['level']! as num).toInt();
  }
  return null;
}

/// Реплика пузыря на показ экрана — `pickReaction` веба: случайная из пула языка (нет языка —
/// английский), не та, что была только что.
String pickPetBubble(PetData d, String language, {math.Random? random, String? last}) {
  final lines = _map(d.j['simpleLines']);
  final pool = [for (final l in ((lines[language] ?? lines['en']) as List? ?? const [])) '$l'];
  if (pool.isEmpty) return '';
  final pick = pool.length > 1 ? pool.where((l) => l != last).toList() : pool;
  return pick[(random ?? math.Random()).nextInt(pick.length)];
}

/// Нажатия страницы поверх своей модели: действие на портрете, лакомство, реплика после действия,
/// подпись запертого облика. Страницы нет — своя модель как есть.
PetJson withPetPageEvents(PetJson own, PetJson? page) {
  if (page == null) return own;
  final pagePortrait = _map(page['portrait']);
  final pageSkins = {for (final s in (page['skins'] as List? ?? const [])) _map(s)['id']: _map(s)};
  return {
    ...own,
    if (page['bubble'] is String && (page['bubble'] as String).isNotEmpty) 'bubble': page['bubble'],
    'portrait': {
      ..._map(own['portrait']),
      if (pagePortrait.containsKey('state')) 'state': pagePortrait['state'],
      if (pagePortrait.containsKey('treat')) 'treat': pagePortrait['treat'],
    },
    'skins': [
      for (final s in (own['skins']! as List))
        {..._map(s), 'label': pageSkins[_map(s)['id']]?['label'] ?? _map(s)['label']},
    ],
  };
}

/// Модель для экрана из общей памяти.
Future<PetJson> petModelFor(SharedState state, {required String bubble, int? now, Wall wall = deviceWall}) async {
  final ps = Profiles.current.list.isEmpty ? await Profiles.load() : Profiles.current;
  return petModelFrom(
    state,
    await PetData.load(),
    profiles: ps,
    now: now ?? DateTime.now().millisecondsSinceEpoch,
    wall: wall,
    language: state.language,
    bubble: bubble,
  );
}
