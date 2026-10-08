/// Поле серии «Корректуры» — перенос `frontend/src/games/proofreading/core/field.ts` (VER 1).
///
/// 🔴 ОДНО ПОЛЕ НА ТРИ БЛОКА — В ЭТОМ ВЕСЬ ЗАМЕР. Квадрат 5×5…8×8, разбитый на слова (раскладка
/// филвордов), слова подобраны так, что часть — из ОДНОЙ категории («Смысл»), остальные — из
/// чужих; знаки блока «Знак» выбраны так, чтобы их клеток было примерно столько же, сколько
/// слов. Тогда разности времён блоков — цена сегментации и цена смысла, а не разница полей.
///
/// ⚠️ Сверяется с живым TS число в число (`test/fixtures/proofreading-series-reference.json`):
/// порядок обращений к ГПСЧ тот же, что у веба, — иначе одно зерно дало бы два разных поля.
library;

import 'dart:math';

import '../../fillwords/core/fillwords.dart';
import 'series_data.dart';

/// Слов категории на поле не меньше — иначе «Смысл» вырождается в одно слово.
const int minSenseWords = 2;

/// Клеток-знаков не меньше — иначе блок «Знак» кончается, не начавшись.
const int minSignCells = 4;
const int _fieldAttempts = 24;

class ProofField {
  const ProofField({
    required this.locale,
    required this.size,
    required this.puzzle,
    required this.signs,
    required this.signCells,
    required this.category,
    required this.senseWords,
  });
  final String locale;

  /// Сторона квадрата.
  final int size;
  final FillwordsPuzzle puzzle;

  /// Знаки блока «Знак» (одна или две буквы) и все их клетки по порядку поля.
  final List<String> signs;
  final List<int> signCells;

  /// Категория блока «Смысл» и индексы её слов в [FillwordsPuzzle.words].
  final String category;
  final List<int> senseWords;
}

int clampProofSize(num size, {int minSize = 5, int maxSize = 8}) {
  final n = size.isFinite ? (size + 0.5).floor() : minSize; // `Math.round` веба
  return min(maxSize, max(minSize, n));
}

Map<int, List<int>> _slotsByLength(FillwordsPuzzle puzzle) {
  final out = <int, List<int>>{};
  for (var i = 0; i < puzzle.words.length; i++) {
    (out[puzzle.words[i].path.length] ??= []).add(i);
  }
  return out;
}

int _targetSeats(int groupSize) => groupSize ~/ 2;

bool _categoryFits(SensePool pool, String cat, Map<int, List<int>> slots) {
  var seats = 0;
  for (final e in slots.entries) {
    final mine = min(_targetSeats(e.value.length), categoryWords(pool, cat, e.key).length);
    if (otherCategoryWords(pool, cat, e.key).length < e.value.length - mine) return false;
    seats += mine;
  }
  return seats >= minSenseWords;
}

({FillwordsPuzzle puzzle, String category, List<int> senseWords})? _dress(
    FillwordsPuzzle base, SensePool pool, FillwordsRng rng) {
  final slots = _slotsByLength(base);
  final fit = [for (final cat in pool.targets) if (_categoryFits(pool, cat, slots)) cat];
  if (fit.isEmpty) return null;
  final category = rng.pick(fit)!;
  final used = <String>{};
  final chosen = List<String>.filled(base.words.length, '');
  final senseWords = <int>[];
  for (final len in slots.keys.toList()..sort()) {
    final group = rng.shuffle([...slots[len]!]);
    final seats = min(_targetSeats(group.length), categoryWords(pool, category, len).length);
    for (var i = 0; i < group.length; i++) {
      final slot = group[i];
      final wantTarget = i < seats;
      final bank = [
        for (final w in (wantTarget ? categoryWords(pool, category, len) : otherCategoryWords(pool, category, len)))
          if (!used.contains(w)) w,
      ];
      final word = rng.pick(bank);
      if (word == null || word.isEmpty) continue; // не набралось — гнездо останется пустым
      used.add(word);
      chosen[slot] = word;
      if (wantTarget) senseWords.add(slot);
    }
  }
  if (chosen.any((w) => w.isEmpty)) return null; // пустое гнездо = дыра в поле
  if (senseWords.length < minSenseWords) return null;
  if (base.words.length - senseWords.length < senseWords.length) return null;
  final letters = [...base.letters];
  final words = <PlantedWord>[];
  for (var index = 0; index < base.words.length; index++) {
    final planted = base.words[index];
    final word = chosen[index];
    final chars = [for (final r in word.runes) String.fromCharCode(r)]; // `[...word]` веба
    for (var i = 0; i < chars.length; i++) {
      letters[planted.path[i]] = chars[i];
    }
    words.add(PlantedWord(word: word, path: planted.path));
  }
  final puzzle = FillwordsPuzzle(
    rows: base.rows,
    cols: base.cols,
    locale: base.locale,
    seed: base.seed,
    letters: letters,
    words: words,
    diagonals: base.diagonals,
  );
  assertFullCoverage(puzzle);
  return (puzzle: puzzle, category: category, senseWords: senseWords..sort());
}

({List<String> signs, List<int> cells})? _pickSigns(FillwordsPuzzle puzzle) {
  final counts = <String, List<int>>{};
  for (var i = 0; i < puzzle.letters.length; i++) {
    (counts[puzzle.letters[i]] ??= []).add(i);
  }
  final alphabet = counts.keys.toList()..sort();
  final want = puzzle.words.length;
  ({List<String> signs, List<int> cells})? best;
  void offer(List<String> signs) {
    final cells = [for (final s in signs) ...counts[s]!]..sort();
    if (cells.length < minSignCells) return;
    final b = best;
    if (b == null) {
      best = (signs: signs, cells: cells);
      return;
    }
    final mine = (cells.length - want).abs();
    final theirs = (b.cells.length - want).abs();
    if (mine < theirs || (mine == theirs && signs.length < b.signs.length)) best = (signs: signs, cells: cells);
  }

  for (final a in alphabet) {
    offer([a]);
  }
  for (var i = 0; i < alphabet.length; i++) {
    for (var j = i + 1; j < alphabet.length; j++) {
      offer([alphabet[i], alphabet[j]]);
    }
  }
  return best;
}

/// Поле серии (`buildProofField`). Словарь филвордов ([words]) и категорий ([data]) —
/// загруженные заранее: у веба их собирает сам вызов, здесь — ассеты.
ProofField buildProofField(ProofSeriesData data, FillwordsPool words, String locale, num size, int seed) {
  final pool = data.sense(locale);
  if (pool == null) throw ArgumentError('proofreading: no sense categories for locale $locale');
  final n = clampProofSize(size, minSize: data.minSize, maxSize: data.maxSize);
  final maxWordLen = min(fillwordsMaxWord, n);
  for (var attempt = 0; attempt < _fieldAttempts; attempt++) {
    final attemptSeed = normalizeSeed(seed + attempt * 7919);
    final base = generateFillwords(
      FillwordsRequest(rows: n, cols: n, locale: locale, seed: attemptSeed, maxWordLen: maxWordLen),
      words,
    );
    final dressed = _dress(base, pool, createRng(attemptSeed + 1));
    if (dressed == null) continue;
    final sign = _pickSigns(dressed.puzzle);
    if (sign == null) continue;
    return ProofField(
      locale: locale,
      size: n,
      puzzle: dressed.puzzle,
      signs: sign.signs,
      signCells: sign.cells,
      category: dressed.category,
      senseWords: dressed.senseWords,
    );
  }
  throw StateError('proofreading: series field ${n}x$n failed to build for locale $locale');
}
