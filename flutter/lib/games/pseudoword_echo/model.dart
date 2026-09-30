/// «ЭХО: ПСЕВДОСЛОВА» — правила на Flutter.
///
/// Перенос `frontend/app/games/pseudoword-echo.tsx` (`levelParams`,
/// `maxConsonantCluster`, `mutateOnce`, `makeOptions`, `buildRounds`). Сверка — с
/// ИСПОЛНЕНИЕМ живого TS на заданной очереди случайных чисел:
/// `test/fixtures/pseudoword-echo-reference.json`, прибор
/// `frontend/scripts/flutter-pseudoword-echo-reference.test.ts`.
///
/// Генератор псевдослов — общий с «Слово или нет?» (`../lexical_decision/model.dart`,
/// перенос `pseudowords.ts`), таблицы букв — тем же ассетом. У веб-экрана «Эха»
/// своя копия таблиц, и она совпадает с таблицами генератора: эталон это меряет.
///
/// ⚠️ Порядок расхода случайных чисел — часть правила: он повторяет веб шаг в шаг.
library;

import 'dart:math';

import '../lexical_decision/model.dart';

/// Языки упражнения: на иероглифах и деванагари «похожее написание» не строится.
const List<String> echoLangs = ['en', 'es', 'pt', 'de', 'ru'];

class EchoLevelParams {
  const EchoLevelParams({
    required this.lenMin,
    required this.lenMax,
    required this.trials,
    required this.hardShare,
    required this.rate,
    required this.snrDb,
  });
  final int lenMin;
  final int lenMax;
  final int trials;

  /// Ось структуры: доля слов партии со стечением согласных.
  final double hardShare;

  /// Ось скорости: множитель темпа речи.
  final double rate;

  /// Ось отвлечения: SNR в дБ; `null` — тишина.
  final double? snrDb;
}

/// Лестница «Эха»: длина и число проб ступенями, доля трудных, темп — каждый
/// уровень, шум — с десятого.
EchoLevelParams echoLevelParams(int level) {
  final l = min(15, max(1, level));
  final (lenMin, lenMax, trials) = l <= 4 ? (4, 5, 8) : (l <= 8 ? (6, 7, 10) : (8, 9, 12));
  return EchoLevelParams(
    lenMin: lenMin,
    lenMax: lenMax,
    trials: trials,
    hardShare: l <= 3 ? 0 : min(0.9, ((l - 3) * 0.075 * 100).round() / 100),
    rate: ((0.95 - (l - 1) * 0.015) * 1000).round() / 1000,
    snrDb: l < 10 ? null : (max(0, 15 - (l - 10) * 3) * 10).round() / 10,
  );
}

String _vowels(LdLetters t, String lang) => t.vowels[lang] ?? t.vowels['en'] ?? '';
String _consonants(LdLetters t, String lang) => t.consonants[lang] ?? t.consonants['en'] ?? '';

/// Длина самого длинного стечения согласных. Буквы вне таблиц (диакритика, ъ/ь)
/// стечение не рвут и в него не считаются.
int maxConsonantCluster(String word, String lang, LdLetters letters) {
  final v = _vowels(letters, lang);
  final c = _consonants(letters, lang);
  var best = 0, run = 0;
  for (final r in word.toLowerCase().runes) {
    final ch = String.fromCharCode(r);
    if (c.contains(ch)) {
      run += 1;
      if (run > best) best = run;
    } else if (v.contains(ch)) {
      run = 0;
    }
  }
  return best;
}

int _pick(double Function() rng, int n) => (rng() * n).floor();

List<T> _shuffle<T>(List<T> arr, double Function() rng) {
  final a = [...arr];
  for (var i = a.length - 1; i > 0; i -= 1) {
    final j = _pick(rng, i + 1);
    final t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/// Один дистрактор: гласная → гласная, согласная → согласная или перестановка соседних.
String _mutateOnce(String word, String lang, LdLetters letters, double Function() rng) {
  final vowels = _vowels(letters, lang);
  final consonants = _consonants(letters, lang);
  final strategy = _pick(rng, 3);
  final chars = word.split('');
  if (strategy == 2) {
    final spots = [for (var i = 0; i < chars.length - 1; i += 1) if (chars[i] != chars[i + 1]) i];
    if (spots.isNotEmpty) {
      final i = spots[_pick(rng, spots.length)];
      final t = chars[i];
      chars[i] = chars[i + 1];
      chars[i + 1] = t;
      return chars.join();
    }
  }
  final sets = strategy == 0 ? [vowels, consonants] : [consonants, vowels];
  for (final set in sets) {
    final idxs = [for (var i = 0; i < chars.length; i += 1) if (set.contains(chars[i])) i];
    if (idxs.isEmpty) continue;
    final at = idxs[_pick(rng, idxs.length)];
    var repl = chars[at];
    for (var tries = 0; tries < 12 && repl == chars[at]; tries += 1) {
      repl = set[_pick(rng, set.length)];
    }
    if (repl == chars[at]) continue;
    chars[at] = repl;
    return chars.join();
  }
  return word;
}

/// Верное написание и три непохожих между собой дистрактора, перемешаны.
List<String> _makeOptions(String word, String lang, LdLetters letters, double Function() rng) {
  final out = <String>{};
  var guard = 0;
  while (out.length < 3 && guard < 80) {
    guard += 1;
    final d = _mutateOnce(word, lang, letters, rng);
    if (d.isNotEmpty && d != word && !out.contains(d)) out.add(d);
  }
  while (out.length < 3) {
    final i = _pick(rng, word.length);
    final d = word.substring(0, i + 1) + word[i] + word.substring(i + 1);
    if (d != word) out.add(d);
  }
  return _shuffle([word, ...out.take(3)], rng);
}

class EchoRound {
  const EchoRound(this.word, this.options);
  final String word;
  final List<String> options;
}

/// Раунды партии — `buildRounds` веба: пул нужной длины (с мягким расширением),
/// доля трудных вперёд, добор обычными, всё перемешано.
List<EchoRound> buildEchoRounds({
  required List<Map<String, String>> vocab,
  required LdLetters letters,
  required String lang,
  required int count,
  required int lenMin,
  required int lenMax,
  double hardShare = 0,
  required double Function() rng,
}) {
  final raw = <String>{
    for (final w in ldPseudowords(vocab, letters, lang, count * 25, rng)) w.toLowerCase(),
  }.where((w) => !w.contains(' ') && !w.contains('-')).toList();
  var pool = [for (final w in raw) if (w.length >= lenMin && w.length <= lenMax) w];
  if (pool.length < count) {
    final wider = [
      for (final w in raw)
        if (w.length >= lenMin - 1 && w.length <= lenMax + 1 && !pool.contains(w)) w,
    ];
    pool = [...pool, ...wider];
  }
  if (pool.length < count) pool = [...pool, for (final w in raw) if (!pool.contains(w)) w];
  final hard = _shuffle([for (final w in pool) if (maxConsonantCluster(w, lang, letters) >= 2) w], rng);
  final easy = _shuffle([for (final w in pool) if (maxConsonantCluster(w, lang, letters) < 2) w], rng);
  final need = (count * min(1.0, max(0.0, hardShare))).round();
  final taken = [
    ...hard.take(need),
    ...easy.take(max(0, count - min(need, hard.length))),
  ];
  final extra = _shuffle(pool, rng).where((w) => !taken.contains(w)).toList();
  final party = _shuffle([...taken, ...extra].take(count).toList(), rng);
  return [for (final w in party) EchoRound(w, _makeOptions(w, lang, letters, rng))];
}

/// Проход: не больше одной ошибки за партию.
bool echoPassed(int errors) => errors <= 1;

/// Очки партии — как в вебе: 120 за попадание, −40 за ошибку, не ниже нуля.
int echoScore(int hits, int errors) => max(0, hits * 120 - errors * 40);
