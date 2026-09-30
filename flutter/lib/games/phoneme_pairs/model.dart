/// «ФОНЕМЫ: МИНИМАЛЬНЫЕ ПАРЫ» — правила на Flutter.
///
/// Перенос `frontend/app/games/phoneme-pairs.tsx` (`levelParams`, `buildTrials`).
/// Сверка — с ИСПОЛНЕНИЕМ живого TS на заданной очереди случайных чисел:
/// `test/fixtures/phoneme-pairs-reference.json`, прибор
/// `frontend/scripts/flutter-phoneme-pairs-reference.test.ts`. Пары и пиньинь —
/// ассетом оттуда же (`assets/vocab/phoneme-pairs.json`), второй копии нет.
library;

import 'dart:math';

class PhLevelParams {
  const PhLevelParams({
    required this.trials,
    required this.easyOnly,
    required this.showWord,
    required this.blind,
    required this.rate,
    required this.snrDb,
    required this.maxErrors,
  });
  final int trials;

  /// Только лёгкая половина пар.
  final bool easyOnly;

  /// После ответа показывается прозвучавшее слово.
  final bool showWord;

  /// Слепой режим: верность — только звуком, без подсветки кнопок.
  final bool blind;
  final double rate;
  final double? snrDb;

  /// Сколько ошибок ещё считается прохождением.
  final int maxErrors;
}

PhLevelParams phLevelParams(int level) {
  final l = min(15, max(1, level));
  final (trials, easyOnly, showWord, blind) =
      l <= 5 ? (8, true, true, false) : (l <= 10 ? (10, false, false, false) : (12, false, false, true));
  return PhLevelParams(
    trials: trials,
    easyOnly: easyOnly,
    showWord: showWord,
    blind: blind,
    rate: ((0.95 - (l - 1) * 0.015) * 1000).round() / 1000,
    snrDb: l < 6 ? null : (max(0, 18 - (l - 6) * 2) * 10).round() / 10,
    maxErrors: l <= 5 ? 2 : (l <= 10 ? 1 : 0),
  );
}

/// Пул пар уровня: лёгкая половина — первые ⌈n/2⌉ (не меньше двух).
List<(String, String)> phPool(List<(String, String)> all, bool easyOnly) =>
    easyOnly ? all.take(max(2, (all.length / 2).ceil())).toList() : all;

class PhTrial {
  const PhTrial(this.words, this.correctIdx);

  /// Порядок на кнопках (перемешан).
  final (String, String) words;

  /// Какое слово прозвучит: 0 или 1.
  final int correctIdx;
  String get spoken => correctIdx == 0 ? words.$1 : words.$2;
  String wordAt(int i) => i == 0 ? words.$1 : words.$2;
}

/// Пробы партии — `buildTrials` веба: пара, перестановка, какое звучит — три числа на пробу.
List<PhTrial> buildPhTrials(List<(String, String)> pool, int count, double Function() rng) => [
      for (var i = 0; i < count; i += 1)
        () {
          final pair = pool[(rng() * pool.length).floor()];
          final swap = rng() < 0.5;
          final words = swap ? (pair.$2, pair.$1) : pair;
          return PhTrial(words, rng() < 0.5 ? 0 : 1);
        }(),
    ];

/// Очки партии — как в вебе: 100 за попадание, −30 за ошибку, не ниже нуля.
int phScore(int hits, int errors) => max(0, hits * 100 - errors * 30);

/// Данные: пары по языкам в порядке веба и пиньинь к иероглифам.
class PhData {
  const PhData(this.pairs, this.pinyin);
  factory PhData.fromJson(Map<dynamic, dynamic> j) => PhData(
        {
          for (final e in (j['pairs'] as Map).entries)
            '${e.key}': [for (final p in (e.value as List)) ('${(p as List)[0]}', '${p[1]}')],
        },
        {for (final e in (j['pinyin'] as Map? ?? const {}).entries) '${e.key}': '${e.value}'},
      );
  final Map<String, List<(String, String)>> pairs;
  final Map<String, String> pinyin;
  List<String> get langs => pairs.keys.toList();
}
