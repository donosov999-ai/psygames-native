/// СЛОВАРЬ «ДОСКИ В УМЕ» — выгрузка модуля языков веб-игры.
///
/// Источник один: `frontend/src/games/chess-blind/core/i18n.ts`; выгрузка
/// `flutter/assets/chess_blind/strings.json` снимается экспортёром
/// `frontend/scripts/flutter-chess-blind-strings.test.ts`. Второй копии строк
/// серии нет нигде — правка в вебе приезжает сюда перевыпуском, а не руками.
library;

import 'dart:convert';

import 'package:flutter/services.dart' show AssetBundle, rootBundle;

import '../../shell/l10n.dart';

class ChessBlindText {
  ChessBlindText(this._strings);

  final Map<String, String> _strings;

  static Map<String, Map<String, String>>? _all;

  /// Разобрать выгрузку и взять язык; незнакомый язык — английский, как в вебе.
  static ChessBlindText parse(String raw, String locale) {
    final j = jsonDecode(raw) as Map<String, dynamic>;
    final all = {
      for (final e in j.entries)
        e.key: {
          for (final s in (e.value as Map<String, dynamic>).entries)
            s.key: s.value as String,
        },
    };
    return ChessBlindText(all[locale] ?? all['en']!);
  }

  /// Словарь для языка экрана. Байты декодируются здесь, а не `loadString`:
  /// тот уводит файлы больше 50 КБ в отдельный изолят, и под часами проб он не
  /// завершается никогда (замер раздела «Объём памяти», 30.09.2026).
  static Future<ChessBlindText> load([AssetBundle? bundle]) async {
    var all = _all;
    if (all == null) {
      final data = await (bundle ?? rootBundle).load('assets/chess_blind/strings.json');
      final raw = utf8.decode(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes));
      final j = jsonDecode(raw) as Map<String, dynamic>;
      all = {
        for (final e in j.entries)
          e.key: {
            for (final s in (e.value as Map<String, dynamic>).entries)
              s.key: s.value as String,
          },
      };
      _all = all;
    }
    return ChessBlindText(all[L.locale] ?? all['en']!);
  }

  /// Строка с подстановкой `{имя}`. Нет ключа — сам ключ: проба экрана ловит его
  /// как «сырой ключ на экране».
  String t(String key, [Map<String, Object> args = const {}]) {
    final s = _strings[key] ?? key;
    if (args.isEmpty) return s;
    return s.replaceAllMapped(
      RegExp(r'\{(\w+)\}'),
      (m) => args.containsKey(m[1]) ? '${args[m[1]]}' : m[0]!,
    );
  }
}
