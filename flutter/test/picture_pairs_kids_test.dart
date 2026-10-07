import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/picture_pairs/duel.dart';
import 'package:psygames_flutter/games/picture_pairs/model.dart';

/// 🧸 «МАЛЫШИ» — движок MindLab «Пары» режимом «Парных картинок» (задача cd9685ec).
///
/// Ступени и звёзды проверяются ИСПОЛНЕНИЕМ: «ребёнок» — бот с памятью на N последних карт,
/// он играет один, и звёзды обязаны различать память, а не только стоять в таблице.
void main() {
  test('ступени: первые три — KID_PAIRS движка (4, 8, 12 пар), дальше — похожие пары', () {
    expect(pairsKidsSteps.map((s) => s.pairs).toList(), [4, 8, 12, 12, 12, 12, 16, 20, 24]);
    expect(pairsKidsSteps.map((s) => s.twins).toList(), [0, 0, 0, 2, 4, 6, 8, 10, 12]);
  });

  test('🔴 колода ступени: пары целые, двойников ровно сколько объявлено, у каждого на поле есть обычная пара', () {
    final bad = <String>[];
    for (var step = 0; step < pairsKidsSteps.length; step++) {
      final cfg = pairsKidsSteps[step];
      for (var seed = 1; seed <= 50; seed++) {
        final deck = pairsKidsDeck(cfg, Random(seed));
        final counts = <int, int>{};
        for (final c in deck) {
          counts[c] = (counts[c] ?? 0) + 1;
        }
        final twins = counts.keys.where(pairsIsTwin).toList();
        final orphan = twins.where((t) => !counts.containsKey(pairsSpriteOf(t))).length;
        final got =
            'пар ${counts.length}, жёлтых ${twins.length}, по две карты ${counts.values.every((n) => n == 2)}, '
            'без обычной пары $orphan, картинок ${counts.keys.map(pairsSpriteOf).toSet().length}';
        final want =
            'пар ${cfg.pairs}, жёлтых ${cfg.twins}, по две карты true, без обычной пары 0, '
            'картинок ${cfg.pairs - cfg.twins}';
        if (got != want) bad.add('ступень ${step + 1}, зерно $seed: $got ≠ $want');
      }
    }
    expect(bad, isEmpty);
  });

  test('звёзды по эффективности: 0,8 и выше — три, 0,6 и выше — две, иначе одна', () {
    expect([1.2, 1.0, 0.8, 0.79, 0.6, 0.59, 0.2].map(pairsKidsStars).toList(), [3, 3, 3, 2, 2, 1, 1]);
  });

  test('ступень: две звезды и больше — дальше, одна — та же; за последней ступенью — она же', () {
    final top = pairsKidsSteps.length - 1;
    expect([pairsKidsNextStep(0, 1), pairsKidsNextStep(0, 2), pairsKidsNextStep(2, 3), pairsKidsNextStep(top, 3)],
        [0, 1, 3, top]);
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

  /// «Ребёнок» — бот с памятью на три последние карты (лиса), который цвет карточки удерживает
  /// с вероятностью `1 − confuse`: жёлтую карту он иначе запоминает обычной. Эффективность —
  /// ходы идеальной памяти на его ходы.
  double childEfficiency(int step, int seed, {required double confuse}) {
    final rnd = Random(seed);
    final g = PairsGame(
      level: 1,
      cfg: pairsKidsCfg(pairsKidsSteps[step]),
      deck: pairsKidsDeck(pairsKidsSteps[step], rnd),
    );
    final bot = PairsBot(PairsBotLevel.fox, rnd: Random(seed * 13 + 5));
    final memo = Random(seed * 7 + 1);
    void see(int i) {
      final s = g.cards[i].symbol;
      bot.see(i, pairsIsTwin(s) && memo.nextDouble() < confuse ? pairsSpriteOf(s) : s);
    }

    while (!g.isWon) {
      final a = bot.firstPick(g);
      g.tap(a);
      see(a);
      final b = bot.nextPick(g);
      final r = g.tap(b);
      see(b);
      if (r == TapResult.groupMatched) {
        bot.forget([a, b]);
        g.settleMatch();
      } else {
        g.settleMiss();
      }
    }
    return g.efficiency;
  }

  List<double> stepMeans({required double confuse}) => [
    for (var step = 0; step < pairsKidsSteps.length; step++)
      [for (var seed = 1; seed <= 300; seed++) childEfficiency(step, seed, confuse: confuse)].reduce((a, b) => a + b) /
          300,
  ];

  test('🔴 каждая ступень труднее прежней для ребёнка, который путает цвет (замер исполнением, а не объявление)', () {
    // Замер 02.10.2026, 400 раздач, память 3 и цвет удержан в половине случаев: 0,92 · 0,64 · 0,48 ·
    // 0,43 · 0,39 · 0,35 · 0,27 · 0,22 · 0,19. Двойники на 12 парах роняют эффективность так же
    // заметно, как рост поля с 8 до 12 пар.
    final e = stepMeans(confuse: 0.5);
    final falls = [for (var i = 1; i < e.length; i++) e[i] < e[i - 1]];
    expect(
      'ступеней ниже прежней: ${falls.where((f) => f).length} из ${falls.length}',
      'ступеней ниже прежней: ${falls.length} из ${falls.length}',
      reason: 'средняя эффективность ступеней 1…${e.length}: ${e.map((x) => x.toStringAsFixed(3)).join(' · ')}',
    );
  });

  test('🔴 двойники трудны только цветом: кто держит цвет, тому ступени 3–6 одинаковы до последней цифры', () {
    final e = stepMeans(confuse: 0);
    expect(e.sublist(2, 6).toSet().length, 1, reason: 'ступени 3–6: ${e.sublist(2, 6).join(' · ')}');
  });

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
