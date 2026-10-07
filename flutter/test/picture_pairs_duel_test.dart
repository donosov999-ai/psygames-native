import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/picture_pairs/duel.dart';
import 'package:psygames_flutter/games/picture_pairs/model.dart';

/// ⚔️ «ПАРНЫЕ КАРТИНКИ», ДУЭЛЬ С БОТОМ (задача cd9685ec, механика MindLab Punchline).
///
/// Сила бота — объём его памяти. Проба доказывает это ИСПОЛНЕНИЕМ: бот с бо́льшей памятью
/// обыгрывает бота с меньшей на сотнях раздач, а не только «объявлен сильнее».
void main() {
  PairsGame board(List<int> deck) =>
      PairsGame(level: 1, cfg: pairsFreeCfg(pairs: deck.length ~/ 2, photo: false, previewMs: 0), deck: deck);

  test('память бота: котёнок держит две последние карты, лиса — три, сова — все', () {
    for (final level in PairsBotLevel.values) {
      final bot = PairsBot(level);
      for (var i = 0; i < 10; i++) {
        bot.see(i, i);
      }
      final cap = level.memory ?? 10;
      expect(bot.known.toList(), [for (var i = 10 - cap; i < 10; i++) i], reason: '${level.name} помнит последние $cap');
    }
  });

  test('увиденная заново карта становится свежей — забывается самая старая', () {
    final bot = PairsBot(PairsBotLevel.kitten)
      ..see(0, 0)
      ..see(1, 1)
      ..see(0, 0)
      ..see(2, 2);
    expect(bot.known.toList(), [0, 2]);
  });

  test('🔴 карту, открытую игроком, бот помнит: открыл к ней пару — берёт', () {
    final duel = PairsDuel(game: board([0, 1, 2, 0, 1, 2]), bot: PairsBot(PairsBotLevel.owl, rnd: Random(1)));
    duel.tap(0);
    duel.settle(duel.tap(1)); // игрок: 0 и 1 — промах, ход боту
    expect(duel.botTurn, isTrue, reason: 'промах — ход сопернику');
    duel.tap(3); // первая карта бота — картинка 0, её пару открывал игрок
    expect(duel.bot.nextPick(duel.game), 0, reason: 'карта игрока видна боту');
    final r = duel.tap(0);
    expect(r, TapResult.groupMatched);
    duel.settle(r);
    expect('бот ${duel.botGroups}, ход бота ${duel.botTurn}', 'бот 1, ход бота true', reason: 'собрал — ходит ещё');
  });

  test('🔴 помнит пару — снимает её первым же ходом', () {
    final duel = PairsDuel(game: board([0, 1, 0, 1]), bot: PairsBot(PairsBotLevel.kitten, rnd: Random(5)));
    duel.bot
      ..see(0, 0)
      ..see(2, 0);
    duel.botTurn = true;
    final a = duel.bot.firstPick(duel.game);
    duel.tap(a);
    final b = duel.bot.nextPick(duel.game);
    final r = duel.tap(b);
    expect({a, b}, {0, 2});
    expect(r, TapResult.groupMatched);
    duel.settle(r);
    expect('бот ${duel.botGroups}, игрок ${duel.playerGroups}, ход бота ${duel.botTurn}', 'бот 1, игрок 0, ход бота true');
    expect(duel.bot.known, isEmpty, reason: 'снятые места забыты');
  });

  test('очередь: промах передаёт ход, сбор — оставляет; исход по числу групп', () {
    final duel = PairsDuel(game: board([0, 0, 1, 1]), bot: PairsBot(PairsBotLevel.owl, rnd: Random(2)));
    duel.tap(0);
    duel.settle(duel.tap(1)); // игрок собрал 0
    expect(duel.botTurn, isFalse);
    duel.tap(2);
    duel.settle(duel.tap(3)); // и 1
    expect(duel.over, isTrue);
    expect('${duel.playerGroups}:${duel.botGroups}, исход ${duel.outcome}', '2:0, исход 1');
  });

  test('персеверации считаются только игроку', () {
    final duel = PairsDuel(game: board([0, 1, 2, 0, 1, 2]), bot: PairsBot(PairsBotLevel.kitten, rnd: Random(3)));
    duel.tap(0);
    duel.settle(duel.tap(1)); // разведка игрока, ход боту
    duel.tap(0);
    duel.settle(duel.tap(1)); // бот повторил известный промах — не в счёт игроку
    expect(duel.game.perseverations, 1);
    expect(duel.playerPerseverations, 0);
    duel.tap(0);
    duel.settle(duel.tap(1)); // теперь игрок повторил
    expect(duel.playerPerseverations, 1);
  });

  PairsGame triples(List<int> deck) => PairsGame(
    level: 1,
    cfg: pairsFreeCfg(pairs: deck.length ~/ 3, photo: false, previewMs: 0, groupSize: 3),
    deck: deck,
  );

  test(
    '🔴 тройки: две известные карты из трёх ход не начинают — первой идёт незнакомая, известные добираются к ней',
    () {
      final g = triples([0, 0, 1, 1, 0, 1]);
      final bot = PairsBot(PairsBotLevel.owl, rnd: Random(4))
        ..see(0, 0)
        ..see(1, 0);
      expect(bot.firstPick(g), isNot(anyOf(0, 1)), reason: 'группа не известна целиком — начинает с незнакомой');
      // Незнакомая оказалась нулём — к ней добираются известные нули.
      g.tap(4);
      bot.see(4, 0);
      expect([0, 1], contains(bot.nextPick(g)));
    },
  );

  test('🔴 тройки: известна вся тройка — снимает её одним ходом', () {
    final g = triples([0, 1, 0, 1, 0, 1]);
    final duel = PairsDuel(
      game: g,
      bot: PairsBot(PairsBotLevel.fox, rnd: Random(6)),
    );
    duel.bot
      ..see(0, 0)
      ..see(2, 0)
      ..see(4, 0);
    duel.botTurn = true;
    final opened = <int>[];
    late TapResult r;
    do {
      final i = g.open.isEmpty ? duel.bot.firstPick(g) : duel.bot.nextPick(g);
      opened.add(i);
      r = duel.tap(i);
    } while (r == TapResult.opened);
    expect('${opened.toSet()} $r', '{0, 2, 4} TapResult.groupMatched');
  });

  /// Сыграть дуэль ботом за игрока: обе стороны — боты, у каждой своя память. Ход — открыть
  /// [size] карт: две на парах, три на тройках.
  int play(PairsBotLevel me, PairsBotLevel rival, int seed, int pairs, {int size = 2}) {
    final rnd = Random(seed);
    final deck = [for (var s = 0; s < pairs; s++) for (var k = 0; k < size; k++) s]..shuffle(rnd);
    final duel = PairsDuel(game: size == 3 ? triples(deck) : board(deck), bot: PairsBot(rival, rnd: Random(seed * 31 + 7)));
    final mine = PairsBot(me, rnd: Random(seed * 17 + 3));
    final g = duel.game;
    while (!duel.over) {
      final side = duel.botTurn ? duel.bot : mine;
      late TapResult r;
      do {
        final i = g.open.isEmpty ? side.firstPick(g) : side.nextPick(g);
        r = duel.tap(i);
        mine.see(i, g.cards[i].symbol); // соперник видит каждую открытую карту
      } while (r == TapResult.opened);
      if (r == TapResult.groupMatched) mine.forget(List.of(g.open));
      duel.settle(r);
    }
    return duel.outcome;
  }

  test('🔴 сила — это память: сова обыгрывает лису, лиса — котёнка на ЛЮБОМ поле (6 и 12 пар, по 300 раздач)', () {
    // На маленьком поле память в шесть карт — почти всё поле: с ней лиса играла с совой вровень
    // (замер 01.10: 428:448 на 6 парах). Поэтому сила проверяется и на самом маленьком поле.
    double winRate(PairsBotLevel me, PairsBotLevel rival, int pairs) {
      var wins = 0;
      var games = 0;
      for (var seed = 1; seed <= 300; seed++) {
        final o = play(me, rival, seed, pairs);
        if (o != 0) games++;
        if (o > 0) wins++;
      }
      return wins / games;
    }

    final verdict = <String>[];
    final rates = <String>[];
    for (final pairs in [6, 12]) {
      final owlFox = winRate(PairsBotLevel.owl, PairsBotLevel.fox, pairs);
      final foxKitten = winRate(PairsBotLevel.fox, PairsBotLevel.kitten, pairs);
      verdict.add('$pairs пар: сова/лиса ${owlFox > 0.7}, лиса/котёнок ${foxKitten > 0.7}');
      rates.add('$pairs пар: ${owlFox.toStringAsFixed(2)} · ${foxKitten.toStringAsFixed(2)}');
    }
    expect(verdict.join('; '), '6 пар: сова/лиса true, лиса/котёнок true; 12 пар: сова/лиса true, лиса/котёнок true',
        reason: 'доли побед без ничьих — ${rates.join('; ')}');
  });

  test('🔴 тройки: сила — та же память — сова обыгрывает лису, лиса — котёнка (6 и 12 троек, по 1000 раздач)', () {
    // Замер 02.10.2026 на тех же 1000 раздачах: 6 троек — 996:1 и 644:165, 12 троек — 1000:0 и 779:95.
    final verdict = <String>[];
    final rates = <String>[];
    for (final groups in [6, 12]) {
      String duel(PairsBotLevel me, PairsBotLevel rival) {
        var wins = 0;
        var losses = 0;
        for (var seed = 1; seed <= 1000; seed++) {
          final o = play(me, rival, seed, groups, size: 3);
          if (o > 0) wins++;
          if (o < 0) losses++;
        }
        rates.add('$groups троек ${me.name}/${rival.name} $wins:$losses');
        return '${wins / (wins + losses) > 0.7}';
      }

      verdict.add(
        '$groups троек: сова/лиса ${duel(PairsBotLevel.owl, PairsBotLevel.fox)}, '
        'лиса/котёнок ${duel(PairsBotLevel.fox, PairsBotLevel.kitten)}',
      );
    }
    expect(
      verdict.join('; '),
      '6 троек: сова/лиса true, лиса/котёнок true; 12 троек: сова/лиса true, лиса/котёнок true',
      reason: rates.join(' · '),
    );
  });
}
