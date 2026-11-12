import 'model.dart';

enum SemanticPlayMode { baskets, single }

const semanticBasketSeenPool = 'semantic_sort_baskets_words';

/// Keep the legacy single-word generator unchanged (including its RNG order).
/// Basket rounds share one set of categories throughout a party.
List<SemanticRound> buildBasketRounds({
  required List<Map<String, String>> picked,
  required List<String> cats,
  required String target,
  required List<String> languages,
}) => [
  for (var i = 0; i < picked.length; i++)
    SemanticRound(
      word: picked[i][languages[i % languages.length]] ?? '',
      correctCat: picked[i]['cat']!,
      cats: List.unmodifiable(cats),
      lang: languages[i % languages.length],
    ),
];

/// 10 -> 5+5, 12 -> 6+6, 15 -> 8+7. Short dictionaries remain playable.
List<int> basketBatchSizes(int count) {
  if (count <= 0) return const [];
  final batches = (count / 8).ceil();
  return [
    for (var i = 0; i < batches; i++)
      count ~/ batches + (i < count % batches ? 1 : 0),
  ];
}

enum BasketAnswer { placed, wrong, ignored }

/// One card has one identity even if its printed word appears in two languages.
/// A correction never erases the first mistake or creates another scoring event.
class SemanticBasketParty {
  SemanticBasketParty(List<SemanticRound> rounds)
    : rounds = List.unmodifiable(rounds),
      batches = basketBatchSizes(rounds.length);

  final List<SemanticRound> rounds;
  final List<int> batches;
  final Set<int> _placed = {};
  final Set<int> _attempted = {};
  int batch = 0;
  int correctFirst = 0;
  int errors = 0;

  int get offset => batches.take(batch).fold(0, (a, b) => a + b);
  List<int> get visibleIds => batch < batches.length
      ? List.generate(batches[batch], (i) => offset + i)
      : const [];
  bool placed(int id) => _placed.contains(id);
  int get completed => _placed.length;
  bool get complete => completed == rounds.length;
  bool get batchComplete => visibleIds.every(placed);
  double get accuracy => rounds.isEmpty ? 0 : correctFirst / rounds.length;

  BasketAnswer answer(int id, String cat) {
    if (!visibleIds.contains(id) ||
        placed(id) ||
        !rounds[id].cats.contains(cat)) {
      return BasketAnswer.ignored;
    }
    final first = _attempted.add(id);
    if (rounds[id].correctCat != cat) {
      errors++;
      return BasketAnswer.wrong;
    }
    _placed.add(id);
    if (first) correctFirst++;
    return BasketAnswer.placed;
  }

  bool advance() {
    if (!batchComplete || complete || batch + 1 >= batches.length) return false;
    batch++;
    return true;
  }
}
