import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'l10n.dart';

/// СЛОВАРЬ МОДУЛЯ ИГРЫ — ТОТ ЖЕ, ЧТО У ВЕБ-ВЕРСИИ, А НЕ ВТОРОЙ.
///
/// У лабораторных игр веба текст партии живёт не в общем словаре, а в самом модуле:
/// `frontend/src/games/<игра>/core/i18n.ts`, сразу на двенадцати языках (почему так — шапка
/// любого из этих файлов). Сюда такой словарь приезжает файлом `assets/l10n/<игра>.json`, который
/// пишет экспортёр из репо — `frontend/src/games/<игра>/tools/record-flutter-strings.gen.ts`.
/// Перевод правят в TS и пересобирают JSON; руками JSON не трогают — первая пересборка сотрёт.
///
/// ⚠️ ОБЩИЙ СЛОВАРЬ (`L.t`) — ДЛЯ ПОДПИСЕЙ КАРКАСА, ЭТОТ — ДЛЯ ТЕКСТА ПАРТИИ. «Уровень», «Заново»,
/// «Показать решение» берутся из общего: так их читают все экраны приложения одинаково. Отсюда —
/// только то, что есть лишь у этой игры: вопросы заданий, разборы, подписи вариантов.
///
/// Первым так был устроен «Навигатор» (`games/navigator/strings.dart`, свои помощники к ключам);
/// этот класс — то же самое без помощников, для игр, которым хватает `t` и `fill`.
class ModuleStrings {
  ModuleStrings._(this._map);

  final Map<String, String> _map;

  static final _placeholder = RegExp(r'\{(\w+)\}');
  static final _cache = <String, ModuleStrings>{};

  /// Подпись по ключу. Ключа нет — возвращается сам ключ: пустота на экране выглядела бы
  /// как «так и задумано», а ключ виден сразу (и его ловит проба двенадцати языков).
  String t(String key) => _map[key] ?? key;

  /// Шаблон вида «Шаг {n}: {axis}» — за один проход, как `interpolate…` модулей веба:
  /// незнакомая метка остаётся как есть, вставленный текст повторно не разбирается.
  String fill(String key, Map<String, Object> values) =>
      t(key).replaceAllMapped(_placeholder, (m) => values.containsKey(m[1]) ? '${values[m[1]]}' : m[0]!);

  /// Все ключи — для проб полноты.
  Iterable<String> get keys => _map.keys;

  /// Пустой словарь — до загрузки: экран покажет ключи, а не упадёт.
  static final ModuleStrings empty = ModuleStrings._(const {});

  @visibleForTesting
  static ModuleStrings fromMap(Map<String, String> map) => ModuleStrings._(map);

  /// Словарь игры `name` для языка приложения. Незнакомый язык — английский, как у общего словаря.
  /// Кэш — по паре «игра и язык»: пробы перебирают двенадцать языков подряд в одном прогоне.
  static Future<ModuleStrings> load(String name, {AssetBundle? bundle, String? locale}) async {
    final loc = L.resolve(locale ?? L.locale);
    final cacheKey = '$name/$loc';
    final hit = _cache[cacheKey];
    if (hit != null) return hit;
    try {
      // Байты и разбор здесь, как в `L.load`: `loadString` от 50 КБ уходит в изолят,
      // а поддельное время проб изолят не ждёт — проба висит десять минут.
      final data = await (bundle ?? rootBundle).load('assets/l10n/$name.json');
      final all = jsonDecode(utf8.decode(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes)))
          as Map<String, dynamic>;
      final one = (all[loc] ?? all['en']) as Map<String, dynamic>?;
      return _cache[cacheKey] = ModuleStrings._((one ?? const {}).map((k, v) => MapEntry(k, '$v')));
    } catch (_) {
      // Файла нет — экран покажет ключи, а не упадёт: проба двенадцати языков это поймает.
      // В кэш провал не кладём: иначе один неудачный запуск спрятал бы словарь до перезапуска.
      return empty;
    }
  }
}
