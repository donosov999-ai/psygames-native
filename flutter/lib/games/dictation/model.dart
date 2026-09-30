/// «ДИКТАНТ» — правила на Flutter.
///
/// Перенос `frontend/src/games/dictation/core/phrases.ts` (`buildPhrases`,
/// `dictationLangs`, `levelPhrases`, `levelCount`, `dictationLevelParams`) и
/// `core/phonoHint.ts` (`слогДо`). Сверка — с ИСПОЛНЕНИЕМ живого TS:
/// `test/fixtures/dictation-reference.json`, прибор
/// `frontend/scripts/flutter-dictation-reference.test.ts`.
///
/// Фразы собираются из тех же данных, что у веба: корпус cloze и словарь
/// переводов (`assets/vocab/`); таблица гласных подсказки — ассетом.
library;

import 'dart:math';

import '../cloze/model.dart';

class DictationPhrase {
  const DictationPhrase(this.text, this.answer, this.length);
  final String text;
  final String answer;

  /// Длина в ЗНАКАХ (кодовых точках), как `[...текст].length` в вебе.
  final int length;
}

/// Фразы языка: пропуск в фразе cloze заменён ответом из словаря. Нечего
/// подставить или пропуск не заменился — фраза пропускается.
List<DictationPhrase> buildDictationPhrases(
    Map<String, List<ClozePhrase>> cloze, List<Map<String, String>> vocab, String lang) {
  final bank = cloze[lang];
  if (bank == null) return const [];
  final out = <DictationPhrase>[];
  for (final f in bank) {
    final row = vocab.where((w) => w['en'] == f.answerEn).firstOrNull;
    final answer = row?[lang];
    if (answer == null || answer.isEmpty) continue;
    final text = f.text.replaceFirst('___', answer);
    if (text.contains('___')) continue;
    out.add(DictationPhrase(text, answer, text.runes.length));
  }
  return out;
}

/// Языки, на которых диктант собирается, — в порядке корпуса cloze.
List<String> dictationLangs(Map<String, List<ClozePhrase>> cloze, List<Map<String, String>> vocab) =>
    [for (final l in cloze.keys) if (buildDictationPhrases(cloze, vocab, l).isNotEmpty) l];

/// Фразы уровня: порог длины 26 → 34 → 44 → любой; меньше трёх годных — все.
List<DictationPhrase> levelPhrases(List<DictationPhrase> all, int level) {
  final limit = level <= 3 ? 26 : (level <= 6 ? 34 : (level <= 9 ? 44 : 1 << 30));
  final fit = [for (final f in all) if (f.length <= limit) f];
  return fit.length >= 3 ? fit : all;
}

int dictationLevelCount(int level) => level <= 3 ? 4 : (level <= 6 ? 5 : 6);

class DictationLevelParams {
  const DictationLevelParams(this.count, this.rate, this.snrDb, this.delayMs);
  final int count;
  final double rate;
  final double? snrDb;

  /// Пауза между концом фразы и открытием ввода: удержать фразу в голове.
  final int delayMs;
}

DictationLevelParams dictationLevelParams(int level) {
  final l = min(15, max(1, level));
  return DictationLevelParams(
    dictationLevelCount(l),
    ((0.95 - (l - 1) * 0.015) * 1000).round() / 1000,
    l < 5 ? null : (max(0.0, 18 - (l - 5) * 1.8) * 10).round() / 10,
    l < 8 ? 0 : min(2800, (l - 7) * 350),
  );
}

/// Три ошибки подряд на одном знаке — открыть слог.
const int dictationErrorsBeforeHint = 3;

final RegExp _space = RegExp(r'\s');

/// До какого знака открыть подсказку — `слогДо` веба: приступ слога и его гласный.
int syllableEnd(String text, int pos, Set<String> vowels) {
  final ch = [for (final r in text.runes) String.fromCharCode(r)];
  if (pos < 0 || pos >= ch.length) return max(0, pos);
  var start = pos;
  while (start > 0 && !_space.hasMatch(ch[start - 1])) {
    start -= 1;
  }
  var end = pos;
  while (end < ch.length && !_space.hasMatch(ch[end])) {
    end += 1;
  }
  if (end - start <= 1) return max(pos, end);
  var i = start;
  while (i < end && !vowels.contains(ch[i])) {
    i += 1;
  }
  if (i == end) return min(start + 1, end);
  while (i < end && vowels.contains(ch[i])) {
    i += 1;
  }
  return min(i, end - 1) > start ? min(i, end - 1) : start + 1;
}

/// Итог партии — как в вебе: знаков в минуту и точность; проход — от 90 %.
({int cpm, int accuracy, bool passed}) dictationSummary(int chars, int typos, double seconds) {
  final cpm = seconds > 0 ? (chars / seconds * 60).round() : 0;
  final accuracy = chars + typos > 0 ? (chars / (chars + typos) * 100).round() : 100;
  return (cpm: cpm, accuracy: accuracy, passed: accuracy >= 90);
}
