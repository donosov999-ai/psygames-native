import 'dart:collection';
import 'dart:math';

import 'model.dart';

/// ⚔️ ДУЭЛЬ — «Парные картинки» на двоих с ботом. Задача cd9685ec, решение Дениса 30.09.2026:
/// движки MindLab добавляем в разделы нативно. Механика — движок MindLab Punchline
/// (abstract-games-core, engines/mindlab/punchline/punchline.py): ходят по очереди, собрал
/// группу — ходишь ещё, промах — ход сопернику, больше групп — победа.
///
/// 🔴 ОТКРЫТАЯ КАРТА ВИДНА ОБОИМ, как за столом: карты бота видит игрок, карты игрока — бот.
/// Поэтому дуэль учит не только помнить свои ходы, но и следить за чужими.
///
/// Сила бота — объём его памяти, а не «везение»: он помнит последние N увиденных карт и
/// забывает самые старые. Котёнок помнит две карты — с ним справится ребёнок; сова помнит
/// всё — это идеальная память из эталона [idealMemoryMoves].
///
/// 📍 ПОЧЕМУ У ЛИСЫ ТРИ КАРТЫ, А НЕ ШЕСТЬ. Замер 01.10.2026, по 1000 раздач бот на бота: с
/// памятью 6 лиса на 6 парах играла с совой вровень (428 побед совы, 448 поражений) — на
/// маленьком поле шесть карт это почти всё поле, и средняя ступень сливалась с верхней. С
/// памятью 3 ступени различаются на любом поле: на 6 парах сова/лиса 787:96, лиса/котёнок
/// 706:115; на 12 парах 989:2 и 863:44.
///
/// 🔺 ТРОЙКИ (задача a944dd36, как в самом Punchline: ход — открыть три). Память ботов та же, в
/// картах: на тройках она весит больше, и порядок ступеней держится. Замер 02.10.2026, те же 1000
/// раздач: на 6 тройках сова/лиса 996:1, лиса/котёнок 644:165; на 12 — 1000:0 и 779:95. Лисе с
/// памятью 6 сова на 12 тройках всё равно не по зубам (999:0) — память «в группах» вместо «в
/// картах» лестницу не выравнивает, а подпись «держит в памяти карт: N» сломала бы.
enum PairsBotLevel {
  kitten(2),
  fox(3),
  owl(null);

  const PairsBotLevel(this.memory);

  /// Сколько последних увиденных карт бот держит в памяти; `null` — все.
  final int? memory;
}

/// Пауза перед каждой картой бота: человек успевает увидеть, что тот открыл.
const pairsBotStepMs = 600;

/// Бот дуэли: помнит места и картинки увиденных карт в пределах своей памяти.
class PairsBot {
  PairsBot(this.level, {Random? rnd}) : _rnd = rnd ?? Random();

  final PairsBotLevel level;
  final Random _rnd;

  /// Место → картинка, от давно увиденного к недавнему: забывается самое старое.
  final LinkedHashMap<int, int> _known = LinkedHashMap();

  /// Места, которые бот сейчас помнит.
  Iterable<int> get known => _known.keys;

  /// Бот увидел карту — свою или чужую. Увиденная заново становится самой свежей.
  void see(int place, int symbol) {
    _known.remove(place);
    _known[place] = symbol;
    final cap = level.memory;
    while (cap != null && _known.length > cap) {
      _known.remove(_known.keys.first);
    }
  }

  /// Группа снята — её места помнить незачем.
  void forget(Iterable<int> places) {
    for (final p in places) {
      _known.remove(p);
    }
  }

  bool _free(PairsGame g, int i) => !g.cards[i].matched && !g.cards[i].flipped;

  /// Первая карта хода: помнит группу целиком — открывает её; иначе — случайную незнакомую.
  /// На тройках две известные карты из трёх группой не считаются: ход начинается с
  /// незнакомой, а известные добираются к ней ([nextPick]) — как у идеальной памяти.
  int firstPick(PairsGame g) {
    final bySymbol = <int, List<int>>{};
    for (final e in _known.entries) {
      if (_free(g, e.key)) bySymbol.putIfAbsent(e.value, () => []).add(e.key);
    }
    for (final places in bySymbol.values) {
      if (places.length >= g.cfg.groupSize) return places.first;
    }
    return _randomUnknown(g, const {});
  }

  /// Следующая карта хода: помнит такую же — открывает её; иначе — случайную незнакомую.
  int nextPick(PairsGame g) {
    final symbol = g.cards[g.open.first].symbol;
    for (final e in _known.entries) {
      if (e.value == symbol && _free(g, e.key)) return e.key;
    }
    return _randomUnknown(g, g.open.toSet());
  }

  int _randomUnknown(PairsGame g, Set<int> exclude) {
    final free = [
      for (var i = 0; i < g.cards.length; i++)
        if (_free(g, i) && !exclude.contains(i)) i,
    ];
    final unknown = free.where((i) => !_known.containsKey(i)).toList();
    final pool = unknown.isNotEmpty ? unknown : free;
    return pool[_rnd.nextInt(pool.length)];
  }
}

/// Партия-дуэль: общее поле, очередь ходов и счёт групп у каждой стороны.
class PairsDuel {
  PairsDuel({required this.game, required this.bot});

  final PairsGame game;
  final PairsBot bot;

  /// Чей ход: `false` — игрока.
  bool botTurn = false;
  int playerGroups = 0;
  int botGroups = 0;

  /// Персеверации ИГРОКА — ходы бота в его счёт не идут.
  int playerPerseverations = 0;

  /// Промахи игрока — ошибки партии в отчёте.
  int playerMisses = 0;

  /// Открыть карту за того, чей сейчас ход. Бот видит каждую открытую карту.
  TapResult tap(int i) {
    final before = game.perseverations;
    final r = game.tap(i);
    if (r == TapResult.ignored) return r;
    bot.see(i, game.cards[i].symbol);
    if (!botTurn) playerPerseverations += game.perseverations - before;
    return r;
  }

  /// Ход закончен: группа — тому, кто ходил, и он ходит ещё; промах — ход сопернику.
  void settle(TapResult r) {
    if (r == TapResult.groupMatched) {
      final places = List.of(game.open);
      game.settleMatch();
      bot.forget(places);
      if (botTurn) {
        botGroups += 1;
      } else {
        playerGroups += 1;
      }
    } else if (r == TapResult.groupMissed) {
      game.settleMiss();
      if (!botTurn) playerMisses += 1;
      botTurn = !botTurn;
    }
  }

  bool get over => game.isWon;

  /// 1 — победил игрок, 0 — ничья, −1 — победил бот.
  int get outcome => playerGroups.compareTo(botGroups);
}
