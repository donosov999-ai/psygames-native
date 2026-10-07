import 'dart:convert';
import 'dart:math' as math;

import 'asset_json.dart';
import 'l10n.dart';
import 'playlist_fields.dart';
import 'shared_state.dart';
import 'web_theme.dart';

/// «КОЛЛЕКЦИЯ» — РАСЧЁТ НА DART (задача d6a60b02, вариант Б, четвёртый экран).
///
/// Перенос `frontend/src/services/collection.ts` (`фигурки`, `chestState`, `earnedTotal`) и модели
/// `frontend/app/collection.tsx` один в один. Фигурки — таблицей веба (`assets/collection.json`,
/// выгрузка `tools/embed-collection.mjs`); пороги поверх — из загруженного файла настроек
/// (`psygames_playlists_override` → `коллекция`, уже проверенный при загрузке; в заводском составе
/// раздела нет). Эталон — модель веб-экрана вместе с ключами хранилища, на которых она построена
/// (`fixtures/collection_*`), проба `collection_model_test.dart`.
typedef Figure = ({String key, int at, String face, String nameKey});

class CollectionData {
  CollectionData._();
  static List<Figure>? _cache;

  static List<Figure> fromJson(Map<String, Object?> j) => [
    for (final f in (j['figures']! as List).cast<Map>())
      (key: f['key'] as String, at: (f['at'] as num).toInt(), face: f['face'] as String, nameKey: f['nameKey'] as String),
  ];

  static Future<List<Figure>> load() async =>
      _cache ??= fromJson(await loadJsonAsset('assets/collection.json'));
}

Map<String, Object?>? _json(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  try {
    final v = jsonDecode(raw);
    return v is Map ? v.cast<String, Object?>() : null;
  } catch (_) {
    return null;
  }
}

/// `фигурки()` веба: заводские пороги, поверх — `коллекция` сохранённого файла настроек.
List<Figure> figuresWith(List<Figure> base, SharedState state) {
  final saved = _json(state.get('psygames_playlists_override'));
  // `загрузить` веба: без раздела «профили» состав не читается вовсе.
  final own = saved != null && saved[PlaylistFields.profiles] is Map ? saved[PlaylistFields.collection] : null;
  if (own is! Map) return base;
  return [for (final f in base) own[f.key] is num ? (key: f.key, at: (own[f.key] as num).toInt(), face: f.face, nameKey: f.nameKey) : f];
}

/// `earnedTotal` веба: заработано за всё время; нет записи — баланс токенов (стаж не обнуляется).
/// Запись при первом чтении делает веб; здесь только то же число.
int earnedTotalOf(SharedState state, String profileId) {
  if (profileId.isEmpty) return 0;
  final earned = _json(state.get('psygames_earned_total_v1'))?[profileId];
  if (earned is num && earned >= 0) return earned.toInt();
  final tokens = _json(state.get('psygames_tokens_v1'))?[profileId];
  return tokens is num ? math.max(0, tokens.floor()) : 0;
}

/// `chestState` веба: сколько собрано по заработанному.
int ownedCount(List<Figure> figures, num earned) {
  final e = earned.isFinite ? math.max(0, earned.floor()) : 0;
  return figures.where((f) => e >= f.at).length;
}

/// `подсказкаДля` веба: тап по закрытой фигурке — сколько звёзд до неё; по собранной — ничего.
String? howToOpen(List<Figure> figures, int earned, int i) {
  if (i < 0 || i >= figures.length || i < ownedCount(figures, earned)) return null;
  final f = figures[i];
  return L.t('collectionHowToOpen').replaceFirst('{name}', L.t(f.nameKey)).replaceFirst('{n}', '${math.max(0, f.at - earned)}');
}

/// Модель — та же, что `collectionModel` веба.
Map<String, Object?> collectionModel(List<Figure> figures, int earned, {required String primary, String? hint}) {
  final have = ownedCount(figures, earned);
  return {
    'v': 1,
    'title': L.t('collectionTitle'),
    'back': L.t('a11yBack'),
    'primary': primary,
    'sub': L
        .t('collectionSub')
        .replaceFirst('{have}', '$have')
        .replaceFirst('{all}', '${figures.length}')
        .replaceFirst('{earned}', '$earned'),
    'hint': hint,
    'figures': [
      for (var i = 0; i < figures.length; i++)
        () {
          final f = figures[i];
          final owned = i < have;
          final name = L.t(f.nameKey);
          final locked = L.t('collectionLocked').replaceFirst('{n}', '${f.at}');
          return {
            'key': f.key,
            'face': f.face,
            'name': name,
            'owned': owned,
            'price': owned ? '⭐${f.at}' : locked,
            'a11y': owned ? name : '$name — $locked',
          };
        }(),
    ],
  };
}

String hexOf(int argb) => '#${(argb & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';

/// Данные «Коллекции» этого человека: фигурки с порогами и заработанное.
Future<({List<Figure> figures, int earned, String primary})> collectionInputsFor(SharedState state) async {
  final figures = figuresWith(await CollectionData.load(), state);
  return (figures: figures, earned: earnedTotalOf(state, state.activeProfile), primary: hexOf(WebTheme.accent(state).toARGB32()));
}
