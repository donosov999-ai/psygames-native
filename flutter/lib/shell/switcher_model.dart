import 'dart:convert';

import 'asset_json.dart';
import 'home_inputs.dart' show homeProfileOf;
import 'l10n.dart';
import 'playlist_fields.dart';
import 'profiles.dart';
import 'sessions.dart' show jsTruthy;
import 'shared_state.dart';
import 'stats_model.dart' show activeProfileOf, jsNumStr;

/// 🔴 МОДЕЛЬ ПЕРЕКЛЮЧАТЕЛЯ ПРОФИЛЕЙ НА DART (задача d6a60b02, вариант Б).
///
/// Повторяет модель `#switcher` из `ProfileSwitcherModal.tsx` на тех же данных: профили в порядке файла
/// состава (`поПорядку`) с наложенным составом (`наложить`: свои игры, своя зарядка), без владельца
/// (`isSwitchable`), с доступом, кошельком и подписями, и карточки профилей. Данные профилей — из
/// `assets/profiles.json`, игры — `assets/catalog.json`, остальное (ярус, значок, источник фразы, значки
/// разделов, цвета бейджей) — `assets/switcher.json` (проба `flutter-switcher-asset-fresh`). Ошибку кода
/// и счётчик разблокировок рождает действие страницы — они приходят поверх (`withSwitcherPageEvents`).
/// Сверка — эталоны веб-пробы `switcher-dart-model.test.tsx` (`test/switcher_model_test.dart`).
class SwitcherData {
  SwitcherData({required this.j, required this.profilesJson, required this.games});

  /// `assets/switcher.json`.
  final Map<String, Object?> j;

  /// `assets/profiles.json` — заводской слой состава и записи профилей.
  final Map<String, Object?> profilesJson;

  /// Записи `assets/catalog.json` в порядке `GAMES`.
  final List<Map<String, Object?>> games;

  late final Map<String, Map<String, Object?>> _extra = {
    for (final p in (j['profiles']! as List)) (p as Map)['id'] as String: p.cast<String, Object?>(),
  };
  Map<String, Object?> extra(String id) => _extra[id] ?? const {};

  static SwitcherData? _cache;
  static Future<SwitcherData> load() async {
    if (_cache case final c?) return c;
    final catalog = await loadJsonAsset('assets/catalog.json');
    return _cache = SwitcherData(
      j: await loadJsonAsset('assets/switcher.json'),
      profilesJson: await loadJsonAsset('assets/profiles.json'),
      games: [for (final g in (catalog['games']! as List)) (g as Map).cast<String, Object?>()],
    );
  }
}

Map<String, Object?> _map(Object? v) => v is Map ? v.cast<String, Object?>() : const {};

/// Порядок профилей из файла состава (`загрузить` → `порядок`): пусто или битое хранилище — заводской
/// файл, в нём порядка нет; файл без раздела «профили» — состава нет вовсе.
List<String>? switcherOrder(SharedState s) {
  final raw = s.get('psygames_playlists_override');
  if (raw == null || raw.isEmpty) return null;
  Object? v;
  try {
    v = jsonDecode(raw);
  } catch (_) {
    return null;
  }
  final own = v is Map ? v[PlaylistFields.profiles] : null;
  if (own is! Map && own is! List) return null;
  v as Map;
  final order = v[PlaylistFields.order];
  return order is List ? [for (final x in order) '$x'] : null;
}

/// `поПорядку`: сначала названные в порядке файла, потом остальные в заводском.
List<Profile> byOrder(List<Profile> list, List<String>? order) {
  if (order == null || order.isEmpty) return [...list];
  final left = {for (final p in list) p.id: p};
  return [
    for (final id in order)
      ?left.remove(id),
    for (final p in list)
      if (left.containsKey(p.id)) p,
  ];
}

/// Модель `#switcher` — та же, что у веба. [codeEntry] — ввод кода на этой платформе
/// (`CODE_ENTRY_ENABLED`: на iOS его нет — App Store 3.1.1).
Map<String, Object?> switcherModelFrom(
  SharedState state,
  SwitcherData d, {
  required Profiles profiles,
  required String language,
  required bool codeEntry,
}) {
  final active = activeProfileOf(profiles, state).id;
  final tokens = _map(_parseOrNull(state.get('psygames_tokens_v1')));
  final ru = language == 'ru';
  final switchable = [
    for (final p in byOrder(profiles.list, switcherOrder(state)))
      if (d.extra(p.id)['switchable'] == true) p,
  ];
  String? minutes(Profile p) {
    final m = p.raw['session_minutes'];
    // Выгрузка профилей срезает единицу («5-10 мин» → «5-10») — она подставляется словарём, как у веба.
    return jsTruthy(m) ? '⏱ $m ${L.t('unitMin')}' : null;
  }

  Map<String, Object?>? tierBadge(Object? tier) {
    if (tier == 'trial') {
      final b = _map(d.j['trialBadge']);
      return {'kind': 'trial', 'text': L.t('badgeNoCode'), 'bg': b['bg'], 'fg': b['fg']};
    }
    if (tier == 'owner') {
      final b = _map(d.j['ownerBadge']);
      return {'kind': 'owner', 'text': L.t('switcherOwnerBadge'), 'bg': b['bg'], 'fg': b['fg']};
    }
    return null;
  }

  /// Текст профиля: русскому — русский, остальным — английский, нет — русский (`ru ? x : x_en ?? x`).
  String? said(Object? x, Object? en) => ru ? x as String? : (en ?? x) as String?;
  final emoji = _map(d.j['categoryEmoji']);

  Map<String, Object?> detail(Profile p) {
    final composed = homeProfileOf(p, state, d.profilesJson);
    final r = p.raw;
    final ex = d.extra(p.id);
    final allowed = composed.allowed;
    final all = allowed == 'all';
    final n = all ? d.games.length : (allowed is List ? allowed.length : 0);
    final src = said(ex['hookSource'], ex['hookSourceEn']);
    return {
      'emoji': r['emoji'],
      'name': L.t('profileName_${p.id}'),
      'audience': jsTruthy(r['audience']) ? '👥 ${said(r['audience'], r['audience_en'])}' : null,
      'hook': jsTruthy(r['sales_hook']) ? said(r['sales_hook'], r['sales_hook_en']) : null,
      'hookSource': jsTruthy(ex['hookSource']) ? '📚 $src' : null,
      'color': r['color'],
      'long': jsTruthy(r['long_description']) ? said(r['long_description'], r['long_description_en']) : null,
      'chips': [
        ?minutes(p),
        if (jsTruthy(composed.warmupEnabled)) '☀️ ${L.t('badge_morning_warmup')}',
        if (jsTruthy(r['financial_brain_day_enabled'])) '💰 Financial Brain Day',
        if (jsTruthy(r['assessment_enabled'])) '📊 G1 Assessment',
      ],
      'gamesTitle': '🎮 ${(all ? L.t('label_all_48_games') : L.t('switcherProfileGames')).replaceAll('{n}', '$n')}',
      'games': [
        if (!all && allowed is List)
          for (final id in allowed)
            for (final g in d.games.where((g) => g['id'] == id).take(1)) {'emoji': emoji[g['category']] ?? '•', 'name': L.t(g['nameKey']! as String)},
      ],
      'locked': !profiles.accessible(state, p.id),
      'soon': '🔒 ${L.t('label_coming_soon')}',
      'switchText': '✓ ${L.t('btn_switch_to_profile')}',
      'currentText': '✓ ${L.t('label_current_profile')}',
    };
  }

  return {
    'v': 1,
    'activeId': active,
    'title': '👤 ${L.t('a11ySwitchProfile')}',
    'intro': L.t('switcherIntro'),
    'closeLabel': L.t('close'),
    'profiles': [
      for (final p in switchable)
        () {
          final locked = !profiles.accessible(state, p.id);
          final w = tokens[p.id] ?? 0;
          return {
            'id': p.id,
            'name': L.t('profileName_${p.id}'),
            'desc': L.t('profileDesc_${p.id}'),
            'minutes': minutes(p),
            'wallet': !locked && w is num && w > 0 ? '⭐ ${jsNumStr(w)}' : null,
            'badge': d.extra(p.id)['badge'],
            'emoji': p.raw['emoji'],
            'color': p.raw['color'],
            'active': p.id == active,
            'locked': locked,
            'tier': tierBadge(d.extra(p.id)['tier']),
          };
        }(),
    ],
    'codeEntry': codeEntry,
    'codeButton': '🔑 ${L.t('btn_already_have_code')}',
    'code': {
      'title': '🔑 ${L.t('title_access_code')}',
      'hint': L.t('switcherCodeHint'),
      'placeholder': '${L.t('ph_code_example')} / EXC-260822-A4F2-1B8C3D',
      'cancel': L.t('btn_cancel'),
      'unlock': L.t('welcomeUnlock'),
      'unlockFg': d.j['unlockFg'],
      'error': null,
      'redeemed': 0,
    },
    'details': {for (final p in switchable) p.id: detail(p)},
  };
}

Object? _parseOrNull(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  try {
    return jsonDecode(raw);
  } catch (_) {
    return null;
  }
}

/// Действия страницы поверх своей модели: ошибка кода и счётчик разблокировок (по нему окно кода
/// закрывается) рождает только `redeem` веба. Остальное своё.
Map<String, Object?> withSwitcherPageEvents(Map<String, Object?> own, Map<String, Object?>? page) {
  final code = page?['code'];
  if (code is! Map) return own;
  return {
    ...own,
    'code': {..._map(own['code']), 'error': code['error'], 'redeemed': code['redeemed']},
  };
}
