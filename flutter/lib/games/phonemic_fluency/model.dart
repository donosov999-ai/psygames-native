/// «БЕГЛОСТЬ РЕЧИ» (COWAT) — правила на Flutter.
///
/// Перенос `frontend/src/services/phonemicFluency.ts` (`isValidWord`,
/// `phonemicSummary`, `phonemicScriptFor`) и `defaultWordLang` из
/// `frontend/src/services/wordLanguage.ts`. Сверка — с ИСПОЛНЕНИЕМ живого TS:
/// `test/fixtures/phonemic-fluency-reference.json`, прибор
/// `frontend/scripts/flutter-phonemic-fluency-reference.test.ts`.
///
/// Буквы задания и письменности (какие знаки годятся, какие гласные) — данными
/// веба: `assets/vocab/phonemic-fluency.json`. Второй копии в коде нет.
library;

/// Письменность задания: `ru` — кириллица, `en` — латиница.
String phonemicScriptFor(String lang) => lang == 'ru' ? 'ru' : 'en';

/// Язык слов по умолчанию — язык интерфейса, если слова на нём есть, иначе английский.
String phonemicDefaultWordLang(String uiLanguage, List<String> wordLangs) =>
    wordLangs.contains(uiLanguage) ? uiLanguage : 'en';

class PhonemicScript {
  PhonemicScript({required this.letters, required String chars, required String vowels, required bool ignoreCase})
      : chars = RegExp(chars, caseSensitive: !ignoreCase),
        vowels = RegExp(vowels, caseSensitive: !ignoreCase);

  final List<String> letters;
  final RegExp chars;
  final RegExp vowels;
}

class PhonemicData {
  const PhonemicData(this.scripts, this.wordLangs);

  factory PhonemicData.fromJson(Map<dynamic, dynamic> j) => PhonemicData(
        {
          for (final e in (j['scripts'] as Map).entries)
            '${e.key}': PhonemicScript(
              letters: [for (final l in ((e.value as Map)['letters'] as List)) '$l'],
              chars: '${(e.value as Map)['chars']}',
              vowels: '${(e.value as Map)['vowels']}',
              ignoreCase: (e.value as Map)['ignoreCase'] == true,
            ),
        },
        [for (final l in (j['wordLangs'] as List)) '$l'],
      );

  final Map<String, PhonemicScript> scripts;
  final List<String> wordLangs;

  /// Пул букв задания для языка слов.
  List<String> poolFor(String lang) => scripts[phonemicScriptFor(lang)]?.letters ?? const [];
}

/// Вердикт по слову: `reason` — машинное имя отказа, как в вебе.
class PhonemicVerdict {
  const PhonemicVerdict(this.valid, [this.reason]);
  final bool valid;
  final String? reason;
}

final RegExp _triple = RegExp(r'(.)\1\1');
final RegExp _pairTriple = RegExp(r'(..)\1\1');

/// Проверка слова — `isValidWord` веба. [raw] уже в нижнем регистре и без пробелов.
PhonemicVerdict phonemicCheck(String raw, String letter, PhonemicScript script) {
  if (raw.length < 3) return const PhonemicVerdict(false, 'too_short');
  if (raw.length > 30) return const PhonemicVerdict(false, 'too_long');
  if (raw[0].toUpperCase() != letter) return const PhonemicVerdict(false, 'wrong_letter');
  if (!script.chars.hasMatch(raw)) return const PhonemicVerdict(false, 'non_letters');
  // Совсем без гласных — не слово, а набор букв.
  if (!script.vowels.hasMatch(raw)) return const PhonemicVerdict(false, 'no_vowels');
  // Три одинаковых знака подряд или пара, повторённая трижды, — мусор набора.
  if (_triple.hasMatch(raw)) return const PhonemicVerdict(false, 'repetition_pattern');
  if (_pairTriple.hasMatch(raw)) return const PhonemicVerdict(false, 'repetition_pattern');
  return const PhonemicVerdict(true);
}

class PhonemicSaid {
  const PhonemicSaid(this.word, this.ts, this.valid, [this.reason]);
  final String word;
  final int ts;
  final bool valid;
  final String? reason;
}

class PhonemicSummary {
  const PhonemicSummary({
    required this.validWords,
    required this.repetitions,
    required this.wrongLetter,
    required this.tooShort,
    required this.meanInter,
    required this.firstHalf,
    required this.secondHalf,
  });
  final List<PhonemicSaid> validWords;
  final int repetitions;
  final int wrongLetter;
  final int tooShort;
  final double meanInter;
  final int firstHalf;
  final int secondHalf;
}

/// Итог подхода — `phonemicSummary` веба: темп только по верным словам,
/// половины — по времени от старта.
PhonemicSummary phonemicSummary(List<PhonemicSaid> said, int startTs, int duration) {
  final valid = [for (final w in said) if (w.valid) w];
  int count(String reason) => said.where((w) => !w.valid && w.reason == reason).length;
  var meanInter = 0.0;
  if (valid.length >= 2) {
    var total = 0.0;
    for (var i = 1; i < valid.length; i += 1) {
      total += (valid[i].ts - valid[i - 1].ts) / 1000;
    }
    meanInter = total / (valid.length - 1);
  }
  final half = startTs + (duration / 2) * 1000;
  return PhonemicSummary(
    validWords: valid,
    repetitions: count('repetition'),
    wrongLetter: count('wrong_letter'),
    tooShort: count('too_short'),
    meanInter: meanInter,
    firstHalf: valid.where((w) => w.ts < half).length,
    secondHalf: valid.where((w) => w.ts >= half).length,
  );
}

/// Вердикт с учётом уже сказанного: верное слово второй раз — повтор.
PhonemicVerdict phonemicJudge(String raw, String letter, PhonemicScript script, List<PhonemicSaid> said) {
  final v = phonemicCheck(raw, letter, script);
  if (v.valid && said.any((w) => w.word == raw && w.valid)) return const PhonemicVerdict(false, 'repetition');
  return v;
}
