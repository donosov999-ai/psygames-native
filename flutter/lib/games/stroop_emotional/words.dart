import 'dart:convert';

import 'package:flutter/services.dart';

import 'model.dart';

/// СЛОВА-СТИМУЛЫ «ЭМОЦИОНАЛЬНОГО СТРУПА» — ИЗ ОБЩЕГО С ВЕБ-ВЕРСИЕЙ НАБОРА.
///
/// 🔴 ПОЧЕМУ АССЕТОМ, А НЕ КОНСТАНТОЙ В КОДЕ. Это МАТЕРИАЛ пробы: три списка по
/// двенадцать слов на двух языках. Зашить их в Dart значило бы завести второй
/// источник правды (первый — `frontend/app/games/stroop-emotional.tsx`) и
/// добавить три десятка русских литералов в `lib/`, против которых стоит храповик
/// `ui_text_debt_does_not_grow`. Файл `assets/l10n/stroop-emotional-words.json`
/// выгружен прогоном живого TS — тем же приёмом, что словарь «Стоп-сигнала».
///
/// ⚠️ Правишь списки в TS — перевыгружаешь JSON.
class EmoWords {
  EmoWords._(this.lang, this.byValence);

  /// Язык, на котором реально идут слова: ru или en (остальные — en).
  final String lang;
  final Map<Valence, List<String>> byValence;

  static EmoWords? _cache;
  static String? _cacheLang;

  /// Набор слов для языка приложения. Незнакомый язык — английский.
  static Future<EmoWords> load(String lang, {AssetBundle? bundle}) async {
    final resolved = emoLangFor(lang);
    if (_cache != null && _cacheLang == resolved) return _cache!;
    final b = bundle ?? rootBundle;
    Map<Valence, List<String>> parsed = const {};
    try {
      final raw = await b.loadString('assets/l10n/stroop-emotional-words.json');
      final all = jsonDecode(raw) as Map<String, dynamic>;
      final one = (all[resolved] ?? all['en']) as Map<String, dynamic>;
      parsed = {
        for (final v in Valence.values)
          v: ((one[v.name] as List?) ?? const []).map((e) => '$e').toList(),
      };
    } catch (_) {
      parsed = {for (final v in Valence.values) v: const []};
    }
    _cache = EmoWords._(resolved, parsed);
    _cacheLang = resolved;
    return _cache!;
  }

  /// Набор пуст — играть нельзя: выбор слова из пустого списка уронил бы экран.
  bool get isEmpty => byValence.values.any((l) => l.isEmpty);
}
