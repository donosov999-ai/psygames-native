/// СЛОВАРНЫЙ СЛОЙ ФИЛВОРДОВ — перенос `frontend/src/games/fillwords/core/words.ts` ДАННЫМИ.
///
/// 🔴 ПУЛЫ НЕ СОБИРАЮТСЯ ЗДЕСЬ ЗАНОВО, А ПРИЕЗЖАЮТ ГОТОВЫМИ ИЗ ЖИВОГО TS. Веб строит пул
/// языка из трёх источников (корпус переводов, банк анаграмм, наборы «Все слова») и
/// фильтрует слова правилами JS: `\p{L}`, «заглавная форма — один символ». На втором
/// правило JS и Dart расходятся: `'ß'.toUpperCase()` в JS даёт «SS» (слово отсеивается),
/// а в Dart остаётся «ß» (прошло бы). Переписанный фильтр совпадал бы «почти» и расходился
/// молча. Поэтому экспортёр
/// `frontend/src/games/fillwords/tools/record-flutter-reference.gen.ts` пишет итог веба:
///   · `assets/fillwords/pools.json` — пулы языков, в порядке веба (длина, затем алфавит);
///   · `words_data.g.dart` — список поддержанных языков и пол длины слова каждого.
/// Правка `words.ts` или его источников → перезапустить экспортёр и закоммитить итог.
library;

import 'dart:convert';

import 'package:flutter/services.dart';

import 'types.dart';
import 'words_data.g.dart';

/// Короче трёх букв слова в поле не кладём: «дом» ещё слово, «до» — уже слог.
const fillwordsMinWord = 3;

/// Длиннее восьми не кладём: змея из девяти букв на поле 5×5 съедает треть поля.
const fillwordsMaxWord = 8;

/// Языки, на которых режим предлагается (`FILLWORDS_LOCALES`) — вычислены вебом.
List<String> get fillwordsLocales => fillwordsLocalesData;

bool isFillwordsLocale(String locale) => fillwordsLocalesData.contains(locale);

/// Пол длины слова у языка (`полДлиныЯзыка`); незнакомый язык — 3, как у веба.
int minWordLenOfLocale(String locale) => fillwordsMinLenData[locale] ?? 3;

/// Слово → форма для поля (заглавные) или null (`normalizeWord`).
///
/// ⚠️ Для разбора ввода, а не для сборки пула — пул готовый. Расхождение с JS здесь
/// закрыто явно: символ, чья заглавная форма в JS длиннее одного (`ß` → «SS»),
/// не годится и тут.
String? normalizeWord(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;
  final chars = trimmed.runes.map(String.fromCharCode).toList();
  if (chars.length < fillwordsMinWord || chars.length > fillwordsMaxWord) return null;
  for (final ch in chars) {
    if (!_letter.hasMatch(ch)) return null;
    if (_jsUpperIsLonger.contains(ch) || ch.toUpperCase().runes.length != 1) return null;
  }
  return chars.map((ch) => ch.toUpperCase()).join();
}

final _letter = RegExp(r'^\p{L}$', unicode: true);

/// Буквы, которые JS поднимает в НЕСКОЛЬКО символов, а Dart — нет.
const _jsUpperIsLonger = {'ß', 'ŉ', 'ǰ', 'ΐ', 'ΰ', 'և', 'ẖ', 'ẗ', 'ẘ', 'ẙ', 'ẚ'};

/// Слова такой длины (`wordsOfLength`).
List<String> wordsOfLength(FillwordsPool pool, int len) => pool.byLength[len] ?? const [];

Map<String, List<String>>? _raw;
final _pools = <String, FillwordsPool>{};

/// Словарь языка (`wordPool`) — один раз на язык.
///
/// Байты, а не `loadString`: тот кэширует будущее, и вторая проба в файле ждала бы его из
/// зоны первой вечно (ловушка 07.10.2026 у анаграмм).
Future<FillwordsPool> loadWordPool(String locale, {AssetBundle? bundle}) async {
  final have = _pools[locale];
  if (have != null) return have;
  var raw = _raw;
  if (raw == null) {
    final data = await (bundle ?? rootBundle).load('assets/fillwords/pools.json');
    final json = jsonDecode(utf8.decode(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes)))
        as Map<String, dynamic>;
    raw = {for (final e in json.entries) e.key: [for (final w in e.value as List) w as String]};
    _raw = raw;
  }
  final all = raw[locale] ?? const <String>[];
  final byLength = <int, List<String>>{};
  for (final w in all) {
    (byLength[w.length] ??= []).add(w);
  }
  return _pools[locale] = FillwordsPool(locale: locale, all: all, byLength: byLength);
}
