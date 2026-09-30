import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../../shell/l10n.dart';
import 'types.dart';

/// СЛОВАРЬ «НАВИГАТОРА» — ТОТ ЖЕ, ЧТО У ВЕБ-ВЕРСИИ, А НЕ ВТОРОЙ.
///
/// Строки модуля живут в `frontend/src/games/navigator/core/i18n.ts` сразу на двенадцати языках,
/// вне общего словаря приложения. Сюда они приезжают файлом `assets/l10n/navigator.json`, который
/// пишет экспортёр из репо: `frontend/src/games/navigator/tools/record-flutter-reference.gen.ts`.
/// Перевод правят в TS и пересобирают JSON — руками JSON не трогают, иначе первая пересборка
/// правку сотрёт.
///
/// ⚠️ ПОДПИСИ КНОПОК ОТВЕТА — ДВЕ РАЗНЫЕ ШКАЛЫ. `direction.*` — движение по ЭКРАНУ («Вверх»),
/// `home.*` — сторона света («Север»). В японском и корейском это разные слова, и подменять одно
/// другим нельзя (разбор — в шапке `core/i18n.ts`).
class NavigatorStrings {
  NavigatorStrings._(this._map);

  final Map<String, String> _map;

  static NavigatorStrings? _loaded;
  static String? _loadedLocale;
  static final _placeholder = RegExp(r'\{(\w+)\}');

  /// Подпись по ключу. Ключа нет — возвращается сам ключ: пустота на экране выглядела бы
  /// как «так и задумано», а ключ виден сразу.
  String t(String key) => _map[key] ?? key;

  /// Шаблон вида «Шаг {current} из {total}» — за один проход, как `interpolateNavigator` в вебе:
  /// незнакомая метка остаётся как есть, вставленный текст повторно не разбирается.
  String fill(String key, Map<String, Object> values) =>
      t(key).replaceAllMapped(_placeholder, (m) => values.containsKey(m[1]) ? '${values[m[1]]}' : m[0]!);

  String mode(NavigatorMode value) => t('mode.${value.wire}');
  String direction(Cardinal value) => t('direction.${value.wire}');
  String turn(Turn value) => t('turn.${value.wire}');
  String home(HomeSector value) => t('home.${value.wire}');

  @visibleForTesting
  static NavigatorStrings fromMap(Map<String, String> map) => NavigatorStrings._(map);

  /// Словарь для текущего языка приложения. Незнакомый язык — английский, как у общего словаря.
  static Future<NavigatorStrings> load({AssetBundle? bundle, String? locale}) async {
    final loc = L.resolve(locale ?? L.locale);
    if (_loaded != null && _loadedLocale == loc) return _loaded!;
    final b = bundle ?? rootBundle;
    try {
      // Байты и разбор здесь, как в `L.load`: `loadString` от 50 КБ уходит в изолят, и в пробах висит.
      final data = await b.load('assets/l10n/navigator.json');
      final all = jsonDecode(utf8.decode(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes)))
          as Map<String, dynamic>;
      final one = (all[loc] ?? all['en']) as Map<String, dynamic>?;
      _loaded = NavigatorStrings._((one ?? const {}).map((k, v) => MapEntry(k, '$v')));
    } catch (_) {
      _loaded = NavigatorStrings._(const {});
    }
    _loadedLocale = loc;
    return _loaded!;
  }
}
