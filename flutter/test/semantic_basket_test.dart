import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/semantic_sort/basket_model.dart';
import 'package:psygames_flutter/games/semantic_sort/model.dart';

void main() {
  List<SemanticRound> rounds(int n) => [
    for (var i = 0; i < n; i++)
      SemanticRound(
        word: 'word$i',
        correctCat: i.isEven ? 'home' : 'adjectives',
        cats: const ['home', 'adjectives'],
        lang: 'en',
      ),
  ];

  test('balanced batches respect 8-card ceiling and never leave a tiny final board', () {
    expect(basketBatchSizes(10), [5, 5]);
    expect(basketBatchSizes(12), [6, 6]);
    expect(basketBatchSizes(15), [8, 7]);
    expect(basketBatchSizes(3), [3]);
    expect(basketBatchSizes(0), isEmpty);
  });

  test(
    'wrong drop stays on board; correction never restores first-attempt credit',
    () {
      final p = SemanticBasketParty(rounds(2));
      expect(p.answer(0, 'adjectives'), BasketAnswer.wrong);
      expect(p.completed, 0);
      expect(p.visibleIds, [0, 1]);
      expect(p.answer(0, 'home'), BasketAnswer.placed);
      expect(p.answer(0, 'home'), BasketAnswer.ignored);
      expect(p.answer(1, 'adjectives'), BasketAnswer.placed);
      expect(p.correctFirst, 1);
      expect(p.errors, 1);
      expect(p.accuracy, .5);
      expect(p.complete, isTrue);
    },
  );

  test('foreign/stale cards and unknown categories cannot change a party', () {
    final p = SemanticBasketParty(rounds(10));
    expect(p.answer(8, 'home'), BasketAnswer.ignored);
    expect(p.answer(-1, 'home'), BasketAnswer.ignored);
    expect(p.answer(0, 'not-a-category'), BasketAnswer.ignored);
    expect(p.advance(), isFalse);
    for (final i in p.visibleIds) {
      p.answer(i, p.rounds[i].correctCat);
    }
    expect(p.advance(), isTrue);
    expect(p.visibleIds, [5, 6, 7, 8, 9]);
    expect(p.answer(0, 'home'), BasketAnswer.ignored);
    expect(p.errors, 0);
  });

  test('bilingual cards come from the selected dictionary fields without translation leakage', () {
    final r = buildBasketRounds(
      picked: const [
        {'en': 'chair', 'es': 'silla', 'cat': 'home'},
        {'en': 'soft', 'es': 'suave', 'cat': 'adjectives'},
      ],
      cats: const ['home', 'adjectives'],
      target: 'en',
      languages: const ['en', 'es'],
    );
    expect(r.map((w) => w.word), ['chair', 'suave']);
    expect(r.map((w) => w.lang), ['en', 'es']);
    expect(r.last.correctCat, 'adjectives');
  });
}
