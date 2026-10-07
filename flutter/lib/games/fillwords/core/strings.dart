/// ПОДПИСИ МОДУЛЯ ФИЛВОРДОВ — перенос `frontend/src/games/fillwords/core/i18n.ts` ДАННЫМИ.
///
/// Веб держит шесть строк режима (название, задание, правила, строка уровня, проход,
/// «нет словаря») в модуле игры на всех двенадцати языках — так решено ради гейта дублей
/// общего словаря. Сюда они приезжают как есть: экспортёр
/// `frontend/src/games/fillwords/tools/record-flutter-reference.gen.ts` пишет их в
/// `assets/l10n/fillwords.json`, тем же путём, что подписи n-back (`n_back.json`).
/// Остальное — find, btn_hint, label_found, level, start, proofreading — экран берёт
/// через `L.t`, как и веб.
library;

import 'dart:convert';

import 'package:flutter/services.dart';

/// Подписи режима (`FillwordsStrings` веба).
class FillwordsStrings {
  const FillwordsStrings({
    required this.modeName,
    required this.task,
    required this.rules,
    required this.levelLine,
    required this.pass,
    required this.noDictionary,
  });

  factory FillwordsStrings.fromJson(Map<String, dynamic> j) => FillwordsStrings(
        modeName: j['modeName'] as String,
        task: j['task'] as String,
        rules: j['rules'] as String,
        levelLine: j['levelLine'] as String,
        pass: j['pass'] as String,
        noDictionary: j['noDictionary'] as String,
      );

  /// Название режима.
  final String modeName;

  /// Задание одной строкой.
  final String task;

  /// Правила.
  final String rules;

  /// Строка уровня: {rows}, {cols}, {words}, {sec}.
  final String levelLine;

  /// Условие прохода.
  final String pass;

  /// Нет словаря языка: {langs}.
  final String noDictionary;
}

Map<String, FillwordsStrings>? _strings;

/// Подписи на языке [locale] (`getFillwordsStrings`); незнакомый язык → английский.
Future<FillwordsStrings> loadFillwordsStrings(String locale, {AssetBundle? bundle}) async {
  var all = _strings;
  if (all == null) {
    final data = await (bundle ?? rootBundle).load('assets/l10n/fillwords.json');
    final json = jsonDecode(utf8.decode(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes)))
        as Map<String, dynamic>;
    all = {for (final e in json.entries) e.key: FillwordsStrings.fromJson(e.value as Map<String, dynamic>)};
    _strings = all;
  }
  return all[locale] ?? all['en']!;
}

/// Языки, на которых есть подписи (`FILLWORDS_UI_LOCALES`), — после [loadFillwordsStrings].
List<String> get fillwordsUiLocales => [...?_strings?.keys]..sort();

final _placeholder = RegExp(r'\{(\w+)\}');

/// Подстановка `{name}` (`interpolate`): незнакомая подстановка остаётся как есть —
/// опечатка в имени видна на экране, а не превращается в пустоту.
String interpolate(String template, Map<String, Object> values) =>
    template.replaceAllMapped(_placeholder, (m) => values.containsKey(m[1]) ? '${values[m[1]]}' : m[0]!);
