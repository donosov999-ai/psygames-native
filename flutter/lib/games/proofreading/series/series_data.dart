/// Данные серии «Корректуры»: языки, категории блока «Смысл», подписи — ассетом.
///
/// `assets/proofreading/series.json` пишет выгрузчик живого TS
/// (`frontend/src/games/proofreading/tools/record-flutter-series.gen.ts`): пулы категорий —
/// ровно такими, какими их собирает `sensePool` веба. Источники пулов (корпус переводов и банк
/// анаграмм с темами) в нативе целиком не лежат, а переписанный фильтр разошёлся бы с вебом
/// молча, — поэтому сюда приезжают ДАННЫЕ, а не правило. Язык серии — тоже данными
/// (`PROOF_SENSE_LOCALES` вычислен вебом), а не списком руками.
library;

import 'dart:convert';

import 'package:flutter/services.dart';

/// Подписи серии (`core/i18n.ts`, `ProofSeriesStrings`).
class ProofSeriesStrings {
  ProofSeriesStrings(Map<String, dynamic> m)
      : entry = '${m['entry']}',
        startsAt = '${m['startsAt']}',
        yourLevels = '${m['yourLevels']}',
        blockSign = '${m['blockSign']}',
        blockWord = '${m['blockWord']}',
        blockSense = '${m['blockSense']}',
        ruleSign = '${m['ruleSign']}',
        ruleWord = '${m['ruleWord']}',
        ruleSense = '${m['ruleSense']}',
        ruleChanges = '${m['ruleChanges']}',
        sameField = '${m['sameField']}',
        blockOf = '${m['blockOf']}',
        seriesDone = '${m['seriesDone']}',
        signSpeed = '${m['signSpeed']}',
        segmentCost = '${m['segmentCost']}',
        senseCost = '${m['senseCost']}',
        notFinished = '${m['notFinished']}',
        levelUp = '${m['levelUp']}',
        heldBy = '${m['heldBy']}',
        again = '${m['again']}',
        leave = '${m['leave']}',
        noSense = '${m['noSense']}';

  final String entry;
  final String startsAt;
  final String yourLevels;
  final String blockSign;
  final String blockWord;
  final String blockSense;
  final String ruleSign;
  final String ruleWord;
  final String ruleSense;
  final String ruleChanges;
  final String sameField;
  final String blockOf;
  final String seriesDone;
  final String signSpeed;
  final String segmentCost;
  final String senseCost;
  final String notFinished;
  final String levelUp;
  final String heldBy;
  final String again;
  final String leave;
  final String noSense;
}

/// Категорийный пул языка (`SensePool` веба): категория → длина → слова (по алфавиту).
class SensePool {
  SensePool({required this.locale, required this.byCategory, required this.targets, required this.categoryNames});
  final String locale;
  final Map<String, Map<int, List<String>>> byCategory;

  /// Категории, годные В ЦЕЛЬ: имя есть и слов хватает. Алфавитный порядок.
  final List<String> targets;

  /// Имя категории словом общего словаря (`catVocab_<cat>`) на языке пула.
  final Map<String, String> categoryNames;
}

/// Слова категории заданной длины (`categoryWords`). Пустой список — законный ответ.
List<String> categoryWords(SensePool pool, String cat, int len) => pool.byCategory[cat]?[len] ?? const [];

/// Слова ЧУЖИХ категорий заданной длины — материал отвлекающих (`otherCategoryWords`).
List<String> otherCategoryWords(SensePool pool, String cat, int len) {
  final out = <String>[];
  for (final e in pool.byCategory.entries) {
    if (e.key == cat) continue;
    out.addAll(e.value[len] ?? const []);
  }
  return out..sort();
}

class ProofSeriesData {
  ProofSeriesData._(this.locales, this.plan, this.minSize, this.maxSize, this._strings, this._sense);

  /// Языки серии (`PROOF_SENSE_LOCALES`).
  final List<String> locales;
  final List<String> plan;
  final int minSize;
  final int maxSize;
  final Map<String, ProofSeriesStrings> _strings;
  final Map<String, SensePool> _sense;

  bool isSenseLocale(String locale) => locales.contains(locale);

  /// Пул языка; языка серии нет — `null`.
  SensePool? sense(String locale) => _sense[locale];

  /// Подписи на языке интерфейса; чужой язык — английские, как у веба.
  ProofSeriesStrings strings(String locale) => _strings[locale] ?? _strings['en']!;

  static ProofSeriesData? _cache;

  /// Для проб: подставить данные без ассета.
  static void useForTest(ProofSeriesData? data) => _cache = data;

  /// Байтами, а не `loadString`: тот на больших файлах уходит в `compute`, и в пробах
  /// экрана будущее не доезжает (ловушка «ассет ≥ 50 КБ вешает testWidgets»).
  static Future<ProofSeriesData> load({AssetBundle? bundle}) async {
    final have = _cache;
    if (have != null) return have;
    final data = await (bundle ?? rootBundle).load('assets/proofreading/series.json');
    return _cache = parse(utf8.decode(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes)));
  }

  static ProofSeriesData parse(String raw) {
    final j = jsonDecode(raw) as Map<String, dynamic>;
    final strings = <String, ProofSeriesStrings>{
      for (final e in (j['strings'] as Map<String, dynamic>).entries)
        e.key: ProofSeriesStrings(e.value as Map<String, dynamic>),
    };
    final sense = <String, SensePool>{};
    for (final e in (j['sense'] as Map<String, dynamic>).entries) {
      final m = e.value as Map<String, dynamic>;
      final byCategory = <String, Map<int, List<String>>>{
        for (final c in (m['byCategory'] as Map<String, dynamic>).entries)
          c.key: {
            for (final l in (c.value as Map<String, dynamic>).entries)
              int.parse(l.key): [for (final w in l.value as List) '$w'],
          },
      };
      sense[e.key] = SensePool(
        locale: e.key,
        byCategory: byCategory,
        targets: [for (final t in m['targets'] as List) '$t'],
        categoryNames: {for (final n in (m['categoryNames'] as Map<String, dynamic>).entries) n.key: '${n.value}'},
      );
    }
    return ProofSeriesData._(
      [for (final l in j['locales'] as List) '$l'],
      [for (final p in j['plan'] as List) '$p'],
      j['minSize'] as int,
      j['maxSize'] as int,
      strings,
      sense,
    );
  }
}
