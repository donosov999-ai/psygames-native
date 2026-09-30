/// «ПРОЧТИ ЭМОЦИЮ» — ПРАВИЛА ПАРТИИ.
///
/// ⚠️ ЭТО УПРАЖНЕНИЕ ПО МОТИВАМ ПАРАДИГМЫ, А НЕ ТЕСТ RMET. Материал свой:
/// схематичные глаза и свои слова; фотографии Барона-Коэна под копирайтом и не
/// используются. Поэтому здесь НЕТ И НЕ БУДЕТ чужой нормы («22–30 из 36»):
/// приложить норму чужого инструмента к своему — значит сказать человеку, что
/// он ниже планки, которая к нему неприменима. Меряем долю верных и время на
/// верных ответах, и только их.
///
/// 🔴 МАТЕРИАЛ НЕ ПЕРЕПИСАН, А ВЫГРУЖЕН из веб-версии в `assets/rmet.json`
/// (прибор `frontend/scripts/flutter-rmet-reference.test.ts`). Свой список
/// разошёлся бы с первым молча, и игра стала бы РАЗНОЙ в двух половинах.
library;

import 'dart:convert';
import 'dart:math';

class EyeItem {
  const EyeItem({
    required this.emoji,
    required this.hint,
    required this.correct,
    required this.options,
    required this.files,
  });

  final String emoji;
  final Map<String, String> hint;
  final Map<String, String> correct;
  final Map<String, List<String>> options;

  /// Три снимка на эмоцию: разные лица, как в исходной парадигме.
  final List<String> files;

  String hintFor(String locale) => hint[locale] ?? hint['en']!;
  String correctFor(String locale) => correct[locale] ?? correct['en']!;
  List<String> optionsFor(String locale) => options[locale] ?? options['en']!;

  factory EyeItem.fromJson(Map<String, dynamic> j) => EyeItem(
        emoji: j['emoji'] as String,
        hint: (j['hint'] as Map).map((k, v) => MapEntry(k as String, v as String)),
        correct: (j['correct'] as Map).map((k, v) => MapEntry(k as String, v as String)),
        options: (j['options'] as Map).map(
          (k, v) => MapEntry(k as String, [for (final x in v as List) x as String]),
        ),
        files: [for (final f in j['files'] as List) f as String],
      );
}

class RmetContent {
  const RmetContent({required this.items});

  final List<EyeItem> items;

  static RmetContent fromJsonString(String source) {
    final j = jsonDecode(source) as Map<String, dynamic>;
    return RmetContent(
      items: [for (final i in j['items'] as List) EyeItem.fromJson(i as Map<String, dynamic>)],
    );
  }
}

class RmetMetrics {
  const RmetMetrics({
    required this.hits,
    required this.total,
    required this.errors,
    required this.meanRtMs,
  });

  final int hits;
  final int total;
  final int errors;
  final double meanRtMs;

  double get accuracy => total == 0 ? 0 : hits / total;

  /// 🔴 ПОРОГ ЗДЕСЬ — НАШ И НАЗВАН СВОИМ ИМЕНЕМ: две трети верных. Это планка
  /// упражнения, а не «норма популяции»: своей выборки у нас нет, а чужую
  /// прикладывать нельзя.
  bool get passed => accuracy >= 2 / 3;
}

/// Один заход: 9 или 18 пунктов, у каждого четыре слова.
class RmetSession {
  RmetSession({required this.items, required this.locale, Random? random})
      : _random = random ?? Random();

  final List<EyeItem> items;
  final String locale;
  final Random _random;

  int round = 0;
  int hits = 0;
  int errors = 0;
  final List<int> rts = [];

  /// Что показано сейчас: выбранное слово и верно ли оно. `null` — ждём ответа.
  ({String chosen, bool correct})? feedback;
  bool finished = false;

  late List<String> options = _shuffledOptions();
  late List<int> variants = [
    for (final item in items) item.files.isEmpty ? 0 : _random.nextInt(item.files.length),
  ];

  static RmetSession start(
    RmetContent content,
    String locale,
    int trials, {
    Random? random,
  }) {
    final rnd = random ?? Random();
    final pool = [...content.items]..shuffle(rnd);
    return RmetSession(
      items: pool.take(trials).toList(),
      locale: locale,
      random: rnd,
    );
  }

  EyeItem get current => items[round];

  /// Снимок текущего пункта: своя картинка на каждый заход, как в вебе.
  String? get currentFile {
    final files = current.files;
    if (files.isEmpty) return null;
    return files[variants[round] % files.length];
  }

  List<String> _shuffledOptions() => [...items[round].optionsFor(locale)]..shuffle(_random);

  /// Ответ. `rtMs` — время от показа: считается только на ВЕРНЫХ, иначе
  /// среднее мерило скорости смешалось бы со скоростью промахов.
  void answer(String chosen, int rtMs) {
    if (feedback != null || finished) return;
    final correct = chosen == current.correctFor(locale);
    if (correct) {
      hits += 1;
      rts.add(rtMs);
    } else {
      errors += 1;
    }
    feedback = (chosen: chosen, correct: correct);
  }

  /// Шаг дальше после показа разбора.
  void next() {
    if (feedback == null) return;
    feedback = null;
    if (round + 1 >= items.length) {
      finished = true;
      return;
    }
    round += 1;
    options = _shuffledOptions();
  }

  RmetMetrics get metrics => RmetMetrics(
        hits: hits,
        total: items.length,
        errors: errors,
        meanRtMs: rts.isEmpty ? 0 : rts.reduce((a, b) => a + b) / rts.length,
      );
}
