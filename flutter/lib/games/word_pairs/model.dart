/// «ПАРЫ СЛОВ» — ПРАВИЛА ПАРТИИ И ОТБОР МАТЕРИАЛА.
///
/// 🔴 ЗАПАС НЕВИДАННОГО — НЕ УКРАШЕНИЕ. Список слов конечен, и обычный
/// «перемешать и взять N» начинает повторяться быстрее, чем кажется: замер
/// веб-стороны (`services/freshPool.ts`) — к десятой сессии до трети материала
/// уже виденное. Для игры на ЗАПОМИНАНИЕ пары это порча задания: человек не
/// запоминает связку заново, а узнаёт старую, и по времени это выглядит ростом.
/// Поэтому сначала выдаётся невиданное, а круг сбрасывается, только когда запас
/// кончился.
///
/// ⚠️ ХРАНЯТСЯ КЛЮЧИ, А НЕ НОМЕРА. Номер в списке переезжает при любой правке
/// материала, и человек получил бы «уже виденным» то, чего не видел.
///
/// 🔴 СЛОВАРЬ ПЕРЕВОДОВ БЕРЁТСЯ ГОТОВЫЙ. Он уже лежит в сборке ради «Словаря
/// SRS» (`assets/vocab/translation-vocab.json`, 283 записи на 12 языков);
/// вторая копия раздула бы сборку и разошлась бы с первой молча.
library;

import 'dart:convert';
import 'dart:math';

/// Лестница: пар больше (4 → 15), времени на пару меньше (7,0 → 2,5 с).
/// Ограничено ТОЛЬКО запоминание: соединение пар временем не ограничено,
/// ошибки и так штрафуются.
({int pairCount, int perPairMs}) wordPairsLevelParams(int level) => (
      pairCount: min(15, 4 + ((level - 1) * 0.8).floor()),
      perPairMs: max(2500, 7000 - (level - 1) * 320),
    );

/// Проход: точность ≥ 80% ⇔ ошибок не больше четверти пар.
int wordPairsMaxErrors(int pairCount) => pairCount ~/ 4;

class WordPair {
  const WordPair({required this.id, required this.left, required this.right});

  final int id;
  final String left;
  final String right;
}

/// Отбор «сначала невиданное». Чистая функция: хранилище снаружи.
({List<T> picked, List<String> seen, bool wrapped}) pickFreshFrom<T>(
  List<T> items,
  int count,
  List<String> seen,
  String Function(T) keyOf,
  Random rng,
) {
  final n = max(0, min(count, items.length));
  if (n == 0) return (picked: <T>[], seen: [...seen], wrapped: false);
  final seenSet = seen.toSet();
  final unseen = [...items.where((it) => !seenSet.contains(keyOf(it)))]..shuffle(rng);
  final picked = unseen.take(n).toList();
  if (picked.length == n) {
    return (picked: picked, seen: [...seen, ...picked.map(keyOf)], wrapped: false);
  }
  // Запас кончился: круг сбрасываем и добираем из того, что в эту раздачу ещё
  // не попало — одно и то же дважды в одной раздаче не берём никогда.
  final taken = picked.map(keyOf).toSet();
  final rest = [...items.where((it) => !taken.contains(keyOf(it)))]..shuffle(rng);
  final filled = [...picked, ...rest.take(n - picked.length)];
  return (picked: filled, seen: filled.map(keyOf).toList(), wrapped: true);
}

class WordPairsContent {
  const WordPairsContent({required this.words, this.vocab = const []});

  /// Списки слов по языку интерфейса (режим «случайные пары»).
  final Map<String, List<String>> words;

  /// Словарь переводов: записи вида {en: house, ru: дом, …}.
  final List<Map<String, String>> vocab;

  List<String> wordsFor(String locale) => words[locale] ?? words['en'] ?? const [];

  static WordPairsContent fromJsonStrings(String wordsJson, [String? vocabJson]) {
    final j = jsonDecode(wordsJson) as Map<String, dynamic>;
    return WordPairsContent(
      words: (j['words'] as Map).map(
        (k, v) => MapEntry(k as String, [for (final x in v as List) x as String]),
      ),
      vocab: vocabJson == null
          ? const []
          : [
              for (final e in jsonDecode(vocabJson) as List)
                {
                  for (final entry in (e as Map).entries)
                    if (entry.value is String) entry.key as String: entry.value as String,
                }
            ],
    );
  }
}

enum WordPairsPhase { rules, memorize, match, result }

class WordPairsSession {
  WordPairsSession({
    required this.pairs,
    required this.level,
    required this.memorizeMs,
    Random? random,
  }) : _random = random ?? Random() {
    right = [for (final p in pairs) p.right]..shuffle(_random);
  }

  final List<WordPair> pairs;
  final int level;

  /// Сколько держать показ: число пар × время на пару.
  final int memorizeMs;
  final Random _random;

  WordPairsPhase phase = WordPairsPhase.memorize;

  /// Правый столбец перемешан: иначе пара читалась бы построчно.
  late List<String> right;
  final Set<int> matched = {};
  int? selectedLeft;
  String? selectedRight;
  int errors = 0;

  /// Собрать партию: `mode` — 'random' или 'translation'.
  static ({WordPairsSession session, List<String> seen}) build({
    required WordPairsContent content,
    required String locale,
    required String targetLocale,
    required String mode,
    required int level,
    required List<String> seen,
    Random? random,
  }) {
    final rng = random ?? Random();
    final params = wordPairsLevelParams(level);
    final count = params.pairCount;
    if (mode == 'translation' && content.vocab.isNotEmpty) {
      final target = targetLocale == locale ? (locale == 'en' ? 'es' : 'en') : targetLocale;
      final res = pickFreshFrom(content.vocab, count, seen, (e) => e['en'] ?? '', rng);
      return (
        session: WordPairsSession(
          pairs: [
            for (var i = 0; i < res.picked.length; i += 1)
              WordPair(
                id: i,
                left: res.picked[i][locale] ?? res.picked[i]['en'] ?? '',
                right: res.picked[i][target] ?? res.picked[i]['en'] ?? '',
              ),
          ],
          level: level,
          memorizeMs: params.perPairMs * count,
          random: rng,
        ),
        seen: res.seen,
      );
    }
    final all = content.wordsFor(locale);
    final res = pickFreshFrom(all, count * 2, seen, (w) => w, rng);
    return (
      session: WordPairsSession(
        pairs: [
          for (var i = 0; i < count && i * 2 + 1 < res.picked.length; i += 1)
            WordPair(id: i, left: res.picked[i * 2], right: res.picked[i * 2 + 1]),
        ],
        level: level,
        memorizeMs: params.perPairMs * count,
        random: rng,
      ),
      seen: res.seen,
    );
  }

  void startMatching() {
    if (phase != WordPairsPhase.memorize) return;
    phase = WordPairsPhase.match;
  }

  /// Выбор слева. Если правое уже выбрано — сверяем сразу: порядок выбора
  /// человеку не навязывается.
  void tapLeft(int pairId) {
    if (phase != WordPairsPhase.match || matched.contains(pairId)) return;
    selectedLeft = pairId;
    final r = selectedRight;
    if (r != null) _check(pairId, r);
  }

  void tapRight(String word) {
    if (phase != WordPairsPhase.match) return;
    final owner = pairs.indexWhere((p) => p.right == word);
    if (owner >= 0 && matched.contains(owner)) return;
    selectedRight = word;
    final l = selectedLeft;
    if (l != null) _check(l, word);
  }

  void _check(int leftId, String rightWord) {
    final pair = pairs[leftId];
    selectedLeft = null;
    selectedRight = null;
    if (pair.right != rightWord) {
      errors += 1;
      return;
    }
    matched.add(leftId);
    if (matched.length == pairs.length) phase = WordPairsPhase.result;
  }

  bool get passed => errors <= wordPairsMaxErrors(pairs.length);
  int get score => pairs.length - errors;
}
