import '../languages/json_asset.dart';

/// СЛОВАРЬ МОДУЛЯ «РИТМ И ВЫСОТА» — из ассета, выгруженного геттерами живого
/// `frontend/src/games/rhythm-pitch/core/i18n.ts` (генератор
/// `frontend/scripts/flutter-rhythm-pitch-reference.test.ts`). Двенадцать языков, как
/// в вебе; копии строк в Dart нет — иначе рос бы долг гейта кириллицы.
class RpStrings {
  const RpStrings._(this._s, this._modes, this._levels, this._directions);

  static const RpStrings empty = RpStrings._({}, {}, {}, {});

  final Map<String, String> _s;
  final Map<String, String> _modes;
  final Map<String, String> _levels;
  final Map<String, String> _directions;

  /// Незнакомый язык — английский, как `getRhythmPitchStrings` веба.
  static Future<RpStrings> load(String locale) async {
    final j = await loadJsonAsset('assets/vocab/rhythm-pitch-i18n.json') as Map;
    final locs = j['locales'] as Map;
    final l = (locs[locale] ?? locs['en']) as Map;
    Map<String, String> m(String k) => {for (final e in (l[k] as Map).entries) '${e.key}': '${e.value}'};
    return RpStrings._(m('strings'), m('modes'), m('levels'), m('directions'));
  }

  /// Строка с подстановкой `{ключ}` — как `interpolateRhythmPitch`: незнакомый ключ остаётся как есть.
  String t(String key, [Map<String, Object> values = const {}]) => (_s[key] ?? key).replaceAllMapped(
    RegExp(r'\{(\w+)\}'),
    (m) => values.containsKey(m[1]) ? jsText(values[m[1]]!) : m[0]!,
  );

  String mode(String m) => _modes[m] ?? m;
  String level(String l) => _levels[l] ?? l;
  String direction(String d) => _directions[d] ?? d;
}

/// Число так, как его печатает `String(x)` в JS: 12.0 → «12», 12.2 → «12.2».
String jsText(Object v) {
  if (v is double && v.isFinite && v == v.roundToDouble()) return v.toInt().toString();
  return '$v';
}
