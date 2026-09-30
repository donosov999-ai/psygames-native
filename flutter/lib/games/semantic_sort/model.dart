/// «СОРТИРОВКА СЛОВ» — ПРАВИЛА ПАРТИИ, перенос `frontend/app/games/semantic-sort.tsx`.
///
/// Слово на изучаемом языке → к какой категории относится? Категоризация БЕЗ
/// перевода — прямой доступ к значению слова на втором языке.
///
/// 🔴 ДАННЫЕ, А НЕ КОД. Слова и категории — поле `cat` того же словаря, что уже
/// лежит в сборке ради «Словаря SRS» (`assets/vocab/translation-vocab.json`).
/// «Коварные» категории-дистракторы — предрасчитанная таблица эмбеддинг-близости
/// (bge-m3), вынесена ассетом `assets/vocab/semantic-distractors.json` как есть.
///
/// Сверка с живым TS: `flutter/test/fixtures/semantic-sort-reference.json`
/// (прибор `frontend/scripts/flutter-semantic-sort-reference.test.ts`), где раунды
/// сняты ИСПОЛНЕНИЕМ веб-функции `buildSemanticRounds`, а не её копией.
library;

/// Проход уровня: точность не ниже 80 %.
const double semanticPassAccuracy = 0.8;

/// Ключ запаса невиданного — тот же, что у веба.
const String semanticSeenPool = 'semantic_sort_words';

/// Лестница: больше категорий-дистракторов (2 → 4) и больше раундов (10 → 15).
({int catsPerRound, int roundsCount}) semanticLevelParams(int level) => (
      catsPerRound: level <= 3 ? 2 : level <= 8 ? 3 : 4,
      roundsCount: level <= 5 ? 10 : level <= 10 ? 12 : 15,
    );

class SemanticRound {
  const SemanticRound({required this.word, required this.correctCat, required this.cats, required this.lang});
  final String word;
  final String correctCat;
  final List<String> cats;

  /// Язык слова: в билингво раунды идут на двух языках вперемешку.
  final String lang;
}

/// Категории языка и обратная карта «слово → категория» — ровно как в вебе:
/// категория годится, только если в ней не меньше трёх слов этого языка.
({List<String> cats, Map<String, String> wordCat}) semanticCategories(
  List<Map<String, String>> vocab,
  String tgt,
) {
  final byCat = <String, List<String>>{};
  final wordCat = <String, String>{};
  for (final w in vocab) {
    final word = w[tgt] ?? '';
    final cat = w['cat'] ?? '';
    if (word.isEmpty || cat.isEmpty) continue;
    byCat.putIfAbsent(cat, () => []).add(word);
    wordCat[word] = cat;
  }
  // Порядок категорий — порядок первой встречи, как у Map в JS.
  return (cats: [for (final e in byCat.entries) if (e.value.length >= 3) e.key], wordCat: wordCat);
}

/// Раунды из уже отобранных слов — перенос `buildSemanticRounds` ДО ЗНАКА.
///
/// ⚠️ «Коварные» ищутся по ключу `tgt:word` даже для слова второго языка в
/// билингво — так делает веб: таблица построена под первый язык, у второго ключ
/// просто не находится, и дистракторы берутся случайные.
List<SemanticRound> buildSemanticRounds({
  required List<Map<String, String>> picked,
  required int rounds,
  required List<String> cats,
  required int effCats,
  required Map<String, String> wordCat,
  required String tgt,
  required List<String> langsByRound,
  required bool bilingual,
  required Map<String, List<String>> distractors,
  required double Function() rng,
}) {
  final out = <SemanticRound>[];
  for (var r = 0; r < rounds; r += 1) {
    if (r >= picked.length) break;
    final entry = picked[r];
    final correctCat = entry['cat'] ?? '';
    final lang = bilingual ? (r < langsByRound.length ? langsByRound[r] : tgt) : tgt;
    final word = entry[lang] ?? '';
    final others = [for (final c in cats) if (c != correctCat) c];
    for (var i = others.length - 1; i > 0; i -= 1) {
      final j = (rng() * (i + 1)).floor();
      final t = others[i];
      others[i] = others[j];
      others[j] = t;
    }
    final smart = <String>[];
    for (final dw in distractors['$tgt:$word'] ?? const <String>[]) {
      final dc = wordCat[dw];
      if (dc != null && dc != correctCat && cats.contains(dc) && !smart.contains(dc)) smart.add(dc);
      if (smart.length >= effCats - 1) break;
    }
    final fill = [for (final c in others) if (!smart.contains(c)) c];
    final roundCats = [correctCat, ...smart, ...fill].take(effCats).toList();
    for (var i = roundCats.length - 1; i > 0; i -= 1) {
      final j = (rng() * (i + 1)).floor();
      final t = roundCats[i];
      roundCats[i] = roundCats[j];
      roundCats[j] = t;
    }
    out.add(SemanticRound(word: word, correctCat: correctCat, cats: roundCats, lang: lang));
  }
  return out;
}

/// Слова партии: только категории из годных и только записи, заполненные на
/// нужных языках (в билингво — на обоих: иначе на половине раундов пришлось бы
/// показывать пустую строку).
List<Map<String, String>> semanticWordsPool(
  List<Map<String, String>> vocab,
  List<String> cats,
  List<String> langs,
) =>
    [
      for (final w in vocab)
        if ((w['cat'] ?? '').isNotEmpty &&
            cats.contains(w['cat']) &&
            langs.every((l) => (w[l] ?? '').isNotEmpty))
          w,
    ];
