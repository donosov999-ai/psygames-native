import '../languages/json_asset.dart';
import '../../shell/l10n.dart';

const anagramThemes = ['all', 'animals', 'food', 'nature', 'home', 'transport'];

String anagramThemeName(String theme) => switch (theme) {
      'animals' => L.t('anagramTheme_animals'),
      'food' => L.t('anagramTheme_food'),
      'nature' => L.t('anagramTheme_nature'),
      'home' => L.t('anagramTheme_home'),
      'transport' => L.t('anagramTheme_transport'),
      _ => L.t('anagramTheme_all'),
    };

class AnagramWordThemes {
  AnagramWordThemes._();

  static final _cache = <String, Map<String, String>>{};

  static Future<Map<String, String>> load(String locale) async {
    if (locale != 'ru' && locale != 'en') return const {};
    final cached = _cache[locale];
    if (cached != null) return cached;
    final raw = await loadJsonAsset('assets/words/themes.json') as Map;
    final out = <String, String>{};
    for (final entries in (raw[locale] as Map).values) {
      for (final item in entries as List) {
        final e = item as Map;
        final theme = e['t'];
        if (theme != null) out['${e['w']}'.toLowerCase()] = '$theme';
      }
    }
    return _cache[locale] = out;
  }
}
