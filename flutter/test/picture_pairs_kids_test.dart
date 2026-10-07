import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/picture_pairs/duel.dart';
import 'package:psygames_flutter/games/picture_pairs/model.dart';

/// 🧸 «МАЛЫШИ» — движок MindLab «Пары» режимом «Парных картинок» (задача cd9685ec).
///
/// Ступени и звёзды проверяются ИСПОЛНЕНИЕМ: «ребёнок» — бот с памятью на N последних карт,
/// он играет один, и звёзды обязаны различать память, а не только стоять в таблице.
void main() {
  test('ступени — как KID_PAIRS движка: 4, 8, 12 пар', () {
    expect(pairsKidsSteps, [4, 8, 12]);
  });

  test('звёзды по эффективности: 0,8 и выше — три, 0,6 и выше — две, иначе одна', () {
    expect([1.2, 1.0, 0.8, 0.79, 0.6, 0.59, 0.2].map(pairsKidsStars).toList(), [3, 3, 3, 2, 2, 1, 1]);
  });

  test('ступень: две звезды и больше — дальше, одна — та же; за третьей ступенью — она же', () {
    expect([pairsKidsNextStep(0, 1), pairsKidsNextStep(0, 2), pairsKidsNextStep(1, 3), pairsKidsNextStep(2, 3)], [0, 1, 2, 2]);
  });

  /// Сыграть одному ботом с памятью [level]; вернуть звёзды партии.
  int solo(PairsBotLevel level, int pairs, int seed) {
    final rnd = Random(seed);
    final deck = [for (var s = 0; s < pairs; s++) ...[s, s]]..shuffle(rnd);
    final g = PairsGame(level: 1, cfg: pairsFreeCfg(pairs: pairs, photo: false, previewMs: 0), deck: deck);
    final bot = PairsBot(level, rnd: Random(seed * 13 + 5));
    while (!g.isWon) {
      final a = bot.firstPick(g);
      g.tap(a);
      bot.see(a, g.cards[a].symbol);
      final b = bot.nextPick(g);
      final r = g.tap(b);
      bot.see(b, g.cards[b].symbol);
      if (r == TapResult.groupMatched) {
        bot.forget([a, b]);
        g.settleMatch();
      } else {
        g.settleMiss();
      }
    }
    return pairsKidsStars(g.efficiency);
  }

  test('🔴 звёзды различают память: на 4 парах две звезды берёт и память на 2 карты, на 8 — уже нет', () {
    int twoPlus(PairsBotLevel level, int pairs) =>
        [for (var seed = 1; seed <= 400; seed++) solo(level, pairs, seed)].where((s) => s >= 2).length;
    final k4 = twoPlus(PairsBotLevel.kitten, 4);
    final k8 = twoPlus(PairsBotLevel.kitten, 8);
    final o8 = twoPlus(PairsBotLevel.owl, 8);
    expect('4 пары, память 2: ${k4 > 200} · 8 пар, память 2: ${k8 < 80} · 8 пар, вся память: ${o8 > 380}',
        '4 пары, память 2: true · 8 пар, память 2: true · 8 пар, вся память: true',
        reason: 'партий с двумя звёздами из 400: $k4 · $k8 · $o8');
  });
}
