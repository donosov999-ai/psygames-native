/// «СЛОВО ИЛИ НЕТ?» (лексическое решение) — правила партии на Flutter.
///
/// Перенос `frontend/app/games/lexical-decision.tsx` (`levelParams`,
/// `buildLexicalTrials`) и генератора `frontend/src/services/pseudowords.ts`.
/// Сверка — с ИСПОЛНЕНИЕМ живого TS на заданной очереди случайных чисел:
/// `test/fixtures/lexical-decision-reference.json`, прибор
/// `frontend/scripts/flutter-lexical-decision-reference.test.ts`.
///
/// ⚠️ Порядок расхода случайных чисел — часть правила: он повторяет веб шаг в шаг,
/// иначе эталон не сойдётся, а партии веба и приложения на одном зерне разъедутся.
library;

import 'dart:math';

import '../languages/bilingual.dart';

/// Уровень 1..15: окно ответа сокращается 3,0 с → 1,1 с, число проб растёт
/// ступенями 14 → 18 → 22. Язык уровень не трогает.
class LdLevelParams {
  const LdLevelParams(this.trials, this.windowMs);
  final int trials;
  final int windowMs;
}

LdLevelParams ldLevelParams(int level) => LdLevelParams(
      level <= 5 ? 14 : level <= 10 ? 18 : 22,
      max(1100, 3000 - (level - 1) * 140),
    );

/// Проход уровня: не меньше 80 % верных (не успел в окно — ошибка).
const double ldPassAccuracy = 0.8;

class LdTrial {
  const LdTrial(this.text, this.isWord, this.lang);
  final String text;
  final bool isWord;
  final String lang;
}

/// ТАБЛИЦЫ БУКВ ГЕНЕРАТОРА — ДАННЫМИ, А НЕ КОПИЕЙ В КОДЕ.
///
/// `assets/vocab/pseudoword-letters.json` выгружается из `VOWELS`, `CONSONANTS`,
/// `DEVANAGARI_CONSONANTS` веба (`pseudowords.ts`) прибором эталона. Вторая копия
/// таблиц разошлась бы с первой молча, а байт в байт важен: индекс берётся по
/// единицам UTF-16, как `str[i]` в JS, и составная буква сдвинула бы выбор.
class LdLetters {
  const LdLetters({required this.vowels, required this.consonants, required this.devanagari});

  factory LdLetters.fromJson(Map<dynamic, dynamic> j) {
    Map<String, String> m(Object? raw) => {for (final e in (raw as Map? ?? const {}).entries) '${e.key}': '${e.value}'};
    return LdLetters(vowels: m(j['vowels']), consonants: m(j['consonants']), devanagari: '${j['devanagari'] ?? ''}');
  }

  final Map<String, String> vowels;
  final Map<String, String> consonants;
  final String devanagari;

  static const empty = LdLetters(vowels: {}, consonants: {}, devanagari: '');
}

/// Слова языка из словаря — С повторами и в порядке словаря, как `realWords`.
List<String> ldRealWords(List<Map<String, String>> vocab, String lang) => [
      for (final w in vocab)
        if ((w[lang] ?? '').isNotEmpty) w[lang]!,
    ];

int _pickIndex(double Function() rng, int n) => (rng() * n).floor();

List<String> _codePoints(String s) => [for (final r in s.runes) String.fromCharCode(r)];

String _swapChar(String word, String lang, LdLetters letters, double Function() rng) {
  final vowels = letters.vowels[lang];
  final consonants = letters.consonants[lang];
  // В вебе здесь падает `undefined.includes`: у языка нет таблиц — генератора нет.
  if (vowels == null || consonants == null) throw StateError('нет таблиц букв: $lang');
  final chars = word.split('');
  final idxs = <int>[
    for (var i = 0; i < chars.length; i += 1)
      if (vowels.contains(chars[i].toLowerCase()) || consonants.contains(chars[i].toLowerCase())) i,
  ];
  if (idxs.isEmpty) return word;
  // Длинные слова — иногда две замены. Случайное число тратится ТОЛЬКО у длинных.
  final n = word.length > 5 && rng() < 0.5 ? 2 : 1;
  final out = [...chars];
  for (var k = 0; k < n && idxs.isNotEmpty; k += 1) {
    final pick = idxs.removeAt(_pickIndex(rng, idxs.length));
    final orig = out[pick];
    final lower = orig.toLowerCase();
    final set = vowels.contains(lower) ? vowels : consonants;
    var repl = lower;
    for (var tries = 0; tries < 10 && repl == lower; tries += 1) {
      repl = set[_pickIndex(rng, set.length)];
    }
    out[pick] = orig == lower ? repl : repl.toUpperCase();
  }
  return out.join();
}

String _swapDevanagari(String word, String consonants, double Function() rng) {
  final chars = _codePoints(word);
  final idxs = [for (var i = 0; i < chars.length; i += 1) if (consonants.contains(chars[i])) i];
  if (idxs.isEmpty) return word;
  final pick = idxs[_pickIndex(rng, idxs.length)];
  var repl = chars[pick];
  for (var tries = 0; tries < 10 && repl == chars[pick]; tries += 1) {
    repl = consonants[_pickIndex(rng, consonants.length)];
  }
  chars[pick] = repl;
  return chars.join();
}

String _swapHanzi(String word, List<String> pool, double Function() rng) {
  final chars = _codePoints(word);
  if (chars.length < 2) return word; // одиночный иероглиф — всегда настоящее слово
  final pick = _pickIndex(rng, chars.length);
  var repl = chars[pick];
  for (var tries = 0; tries < 10 && repl == chars[pick]; tries += 1) {
    repl = pool[_pickIndex(rng, pool.length)];
  }
  chars[pick] = repl;
  return chars.join();
}

/// [count] псевдослов языка; ни одно не совпадает со словом словаря.
///
/// Алфавитные языки — замена 1–2 букв с сохранением класса (гласная → гласная),
/// хинди — замена согласной (огласовка остаётся при ней), китайский — замена
/// одного иероглифа в слове из двух и больше.
List<String> ldPseudowords(
    List<Map<String, String>> vocab, LdLetters letters, String lang, int count, double Function() rng) {
  final words = ldRealWords(vocab, lang);
  final realSet = {for (final w in words) w.toLowerCase()};
  final hanziPool = lang == 'zh' ? <String>{for (final w in words) ..._codePoints(w)}.toList() : const <String>[];
  final sourcePool = lang == 'zh' ? [for (final w in words) if (_codePoints(w).length >= 2) w] : words;
  final out = <String>{};
  var guard = 0;
  while (out.length < count && guard < count * 40) {
    guard += 1;
    // Число тратится ДО проверки — как в вебе, где `sourcePool[…]` берётся раньше `if (!src)`.
    final at = _pickIndex(rng, sourcePool.length);
    if (sourcePool.isEmpty) break;
    final src = sourcePool[at];
    final pw = lang == 'zh'
        ? _swapHanzi(src, hanziPool, rng)
        : lang == 'hi'
            ? _swapDevanagari(src, letters.devanagari, rng)
            : _swapChar(src, lang, letters, rng);
    if (pw.isEmpty || realSet.contains(pw.toLowerCase()) || out.contains(pw)) continue;
    out.add(pw);
  }
  return out.toList();
}

/// Годится ли язык: генератор на нём правда что-то выдаёт. Список выводится из
/// РЕЗУЛЬТАТА, а не из таблиц — у хинди и китайского таблиц нет, а псевдослова есть.
bool ldProducesPseudowords(List<Map<String, String>> vocab, LdLetters letters, String lang) {
  try {
    return ldPseudowords(vocab, letters, lang, 3, Random(1).nextDouble).isNotEmpty;
  } on StateError {
    return false;
  }
}

/// [count] настоящих слов языка без повторов: весь список тасуется, берётся начало.
List<String> ldSampleRealWords(List<Map<String, String>> vocab, String lang, int count, double Function() rng) {
  final words = <String>{...ldRealWords(vocab, lang)}.toList();
  for (var i = words.length - 1; i > 0; i -= 1) {
    final j = _pickIndex(rng, i + 1);
    final t = words[i];
    words[i] = words[j];
    words[j] = t;
  }
  return words.take(count).toList();
}

/// Пробы партии — `buildLexicalTrials` веба.
///
/// 🔴 Псевдослова — ПО ЯЗЫКУ: испанское псевдослово среди английских настоящих
/// узнаётся по виду букв. В билингво пробы языков раскладываются по ряду
/// чередования, а не тасуются: узор и есть измеряемая величина.
List<LdTrial> buildLexicalTrials({
  required List<Map<String, String>> vocab,
  required LdLetters letters,
  required String target,
  required String second,
  required bool bilingual,
  required int count,
  required double Function() rng,
}) {
  final langs = bilingual ? [target, second] : [target];
  final perLang = max(1, (count / langs.length).round());
  final byLang = <String, List<LdTrial>>{};
  for (final lang in langs) {
    final half = perLang ~/ 2;
    final real = [for (final w in ldSampleRealWords(vocab, lang, perLang - half, rng)) LdTrial(w, true, lang)];
    // Язык без генератора (веб на нём падает): партия из одних настоящих слов
    // хуже падения не будет, но и такого языка нет в выборе — см. [ldProducesPseudowords].
    List<String> pseudo;
    try {
      pseudo = ldPseudowords(vocab, letters, lang, half, rng);
    } on StateError {
      pseudo = const [];
    }
    final mix = [...real, for (final w in pseudo) LdTrial(w, false, lang)];
    for (var i = mix.length - 1; i > 0; i -= 1) {
      final j = _pickIndex(rng, i + 1);
      final t = mix[i];
      mix[i] = mix[j];
      mix[j] = t;
    }
    byLang[lang] = mix;
  }
  if (bilingual) {
    return [for (final e in spreadByRow(byLang, count, [target, second]).items) e.item];
  }
  return byLang[target] ?? const [];
}
