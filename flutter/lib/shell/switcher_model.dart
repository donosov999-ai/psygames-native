import 'dart:convert';

import 'asset_json.dart';
import 'l10n.dart';
import 'playlist_fields.dart';
import 'profiles.dart';
import 'sessions.dart' show jsTruthy;
import 'shared_state.dart';
import 'stats_model.dart' show activeProfileOf, jsNumStr;

/// 🔴 МОДЕЛЬ ПЕРЕКЛЮЧАТЕЛЯ ПРОФИЛЕЙ НА DART (задача d6a60b02, вариант Б).
///
/// Повторяет модель `#switcher` из `ProfileSwitcherModal.tsx` на тех же данных: все профили в порядке
/// файла состава (`поПорядку`), кошелёк и подписи. С 21.10.2026 (решение Дениса, d5e5814a) монетизации нет:
/// замков, ярусов, окна кода и карточек закрытых профилей нет — все профили открыты всем. Данные
/// профилей — `assets/profiles.json`, значок — `assets/switcher.json` (проба `flutter-switcher-asset-fresh`).
/// Сверка — эталоны веб-пробы `switcher-dart-model.test.tsx` (`test/switcher_model_test.dart`).
class SwitcherData {
  SwitcherData({required this.j});

  /// `assets/switcher.json`.
  final Map<String, Object?> j;

  late final Map<String, Map<String, Object?>> _extra = {
    for (final p in (j['profiles']! as List)) (p as Map)['id'] as String: p.cast<String, Object?>(),
  };
  Map<String, Object?> extra(String id) => _extra[id] ?? const {};

  static SwitcherData? _cache;
  static Future<SwitcherData> load() async => _cache ??= SwitcherData(j: await loadJsonAsset('assets/switcher.json'));
}

Map<String, Object?> _map(Object? v) => v is Map ? v.cast<String, Object?>() : const {};

Object? _parseOrNull(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  try {
    return jsonDecode(raw);
  } catch (_) {
    return null;
  }
}

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
    for (final id in order) ?left.remove(id),
    for (final p in list)
      if (left.containsKey(p.id)) p,
  ];
}

/// Модель `#switcher` — та же, что у веба.
Map<String, Object?> switcherModelFrom(SharedState state, SwitcherData d, {required Profiles profiles}) {
  final active = activeProfileOf(profiles, state).id;
  final tokens = _map(_parseOrNull(state.get('psygames_tokens_v1')));
  return {
    'v': 1,
    'activeId': active,
    'title': '👤 ${L.t('a11ySwitchProfile')}',
    'intro': L.t('switcherIntro'),
    'closeLabel': L.t('close'),
    'profiles': [
      for (final p in byOrder(profiles.list, switcherOrder(state)))
        () {
          final w = tokens[p.id] ?? 0;
          final m = p.raw['session_minutes'];
          return {
            'id': p.id,
            'name': L.t('profileName_${p.id}'),
            'desc': L.t('profileDesc_${p.id}'),
            // Выгрузка профилей срезает единицу («5-10 мин» → «5-10») — она подставляется словарём, как у веба.
            'minutes': jsTruthy(m) ? '⏱ $m ${L.t('unitMin')}' : null,
            'wallet': w is num && w > 0 ? '⭐ ${jsNumStr(w)}' : null,
            'badge': d.extra(p.id)['badge'],
            'emoji': p.raw['emoji'],
            'color': p.raw['color'],
            'active': p.id == active,
          };
        }(),
    ],
  };
}
