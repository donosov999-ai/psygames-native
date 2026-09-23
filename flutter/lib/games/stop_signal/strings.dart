import 'dart:convert';

import 'package:flutter/services.dart';

import '../../shell/l10n.dart';

/// СЛОВАРЬ «СТОП-СИГНАЛА» — ТОТ ЖЕ, ЧТО У ВЕБ-ВЕРСИИ, А НЕ ВТОРОЙ.
///
/// 🔴 ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ ОБЩИЕ КЛЮЧИ. Подписи лестницы и SSRT живут в
/// модуле игры (`frontend/src/games/stop-signal/core/i18n.ts`) сразу на двенадцати
/// языках — их намеренно не клали в общий словарь приложения, который правят
/// параллельно другие заходы. Нативный экран берёт ровно тот же модуль: он
/// вырезан в `assets/l10n/stop-signal.json` прогоном живого TS, как
/// `tools/embed-l10n.mjs` вырезает общий словарь. Источник правды один — TS-модуль;
/// перевод, сделанный для веба, приезжает сюда сам.
///
/// ⚠️ Пересобрать после правки модуля: временной jest-пробой, которая зовёт
/// `getStopSignalStrings` по всем локалям и пишет этот JSON (см. коммит переноса).
class StopSignalStrings {
  StopSignalStrings._(this._map);

  final Map<String, String> _map;

  static StopSignalStrings? _loaded;
  static String? _loadedLocale;

  /// Подпись по ключу. Ключа нет — возвращается сам ключ: молчаливая пустота
  /// на экране выглядела бы как «так и задумано».
  String t(String key) => _map[key] ?? key;

  /// Подставить значения в шаблон вида «{n} проб · стоп-проб {p}%».
  String fill(String key, Map<String, Object> values) {
    var out = t(key);
    values.forEach((k, v) => out = out.replaceAll('{$k}', '$v'));
    return out;
  }

  /// Загрузить словарь для текущего языка приложения. Незнакомый язык —
  /// английский, как и у общего словаря.
  static Future<StopSignalStrings> load({AssetBundle? bundle, String? locale}) async {
    final loc = L.resolve(locale ?? L.locale);
    if (_loaded != null && _loadedLocale == loc) return _loaded!;
    final b = bundle ?? rootBundle;
    try {
      final raw = await b.loadString('assets/l10n/stop-signal.json');
      final all = jsonDecode(raw) as Map<String, dynamic>;
      final one = (all[loc] ?? all['en']) as Map<String, dynamic>?;
      _loaded = StopSignalStrings._((one ?? const {}).map((k, v) => MapEntry(k, '$v')));
    } catch (_) {
      _loaded = StopSignalStrings._(const {});
    }
    _loadedLocale = loc;
    return _loaded!;
  }
}
