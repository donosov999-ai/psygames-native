import 'dart:math';

/// «Парные картинки» — найти одинаковые карты по памяти.
///
/// Правила перенесены из `frontend/app/games/picture-pairs.tsx` и сверены с
/// эталонами, выгруженными прогоном ЖИВОГО TS (`test/fixtures/picture-pairs-reference.json`):
/// параметры уровня на L1…L60, число обменов после ошибки и раскладка сетки на пяти
/// размерах окна. Проверять перенос той же формулой, которой переносил, нельзя.

/// Картинок в наборе. Групп на поле больше не бывает — отсюда потолок объёма.
const pairsSpriteCount = 12;

/// Последний уровень, где растёт ОБЪЁМ: с L13 групп 4 + (L − 13), и на L21 их
/// двенадцать — все картинки набора. Показ упёрся в пол 250 мс ещё на L14. Выше
/// растёт другая ось — обмены карт после ошибки (починка 16.09, cdc75852).
const pairsVolumeTop = 13 + pairsSpriteCount - 4;

/// Сколько пара подсвечена перед обменом и пауза до следующей пары.
const swapLitMs = 450;
const swapGapMs = 150;

/// Зазор между картами и норма пальца — карта мельче не бывает.
const pairsCardGap = 8.0;
const pairsFingerMin = 48.0;

/// Что задаёт уровень.
class LevelCfg {
  const LevelCfg({
    required this.pairs,
    required this.groupSize,
    required this.photo,
    required this.previewMs,
    required this.swapsPerMiss,
  });

  /// Сколько групп на поле (пар, троек или четвёрок).
  final int pairs;

  /// Сколько одинаковых карт в группе: L1–9 пары, L10–12 тройки, L13+ четвёрки.
  final int groupSize;

  /// Фото-показ перед партией — на лестнице всегда включён.
  final bool photo;

  /// Сколько длится показ всех карт лицом вверх.
  final int previewMs;

  /// Среднее обменов закрытых карт на одну ошибку; дробная часть — броском.
  final double swapsPerMiss;

  static LevelCfg of(int level) {
    final groupSize = level <= 9 ? 2 : level <= 12 ? 3 : 4;
    final wanted = level <= 9
        ? min(12, 3 + level)
        : level <= 12
            ? 4 + (level - 10)
            : 4 + (level - 13);
    return LevelCfg(
      pairs: min(wanted, pairsSpriteCount),
      groupSize: groupSize,
      photo: true,
      previewMs: max(250, 800 - level * 40),
      swapsPerMiss: max(0, level - pairsVolumeTop) / 4,
    );
  }

  /// Какое правило уровня действует — для карточки перед партией. Побеждает
  /// ПОСЛЕДНЕЕ подошедшее, как в вебе (правила идут по возрастанию уровня).
  static String? ruleAt(int level) {
    if (level >= pairsVolumeTop + 1) return 'swap';
    if (level >= 13) return 'quad';
    if (level >= 10 && level <= 12) return 'triple';
    return null;
  }
}

/// Сколько обменов после этой ошибки: целая часть среднего — всегда, дробная — броском.
int swapsAfterMiss(double swapsPerMiss, double Function() rnd) {
  final whole = swapsPerMiss.floor();
  return whole + (rnd() < swapsPerMiss - whole ? 1 : 0);
}

/// Раскладка поля: столбцы и сторона карты.
class PairsGrid {
  const PairsGrid({
    required this.cols,
    required this.card,
    required this.width,
    required this.height,
    required this.fits,
  });

  final int cols;
  final double card;
  final double width;
  final double height;

  /// Поле целиком помещается без прокрутки.
  final bool fits;
}

/// Перенос `сеткаПар` из веба. Сторона карты — по ширине И по высоте поля, но не
/// мельче пальца; ширина — жёсткий предел. Столбцы 4 или 6 выбираются по тому,
/// что помещается: правило «до 10 групп — 4 столбца» писалось под пары, у
/// четвёрок оно давало 9–10 рядов и не помещалось даже на 390×844.
PairsGrid pairsGrid({
  required int groups,
  required int cards,
  required double containerWidth,
  required double fieldHeight,
  required double bottomReserve,
  required double hint,
}) {
  PairsGrid variant(int cols) {
    final rows = max(1, (cards / cols).ceil());
    final byWidth = (containerWidth - (cols - 1) * pairsCardGap) / cols;
    final byHeight = fieldHeight > 0
        ? (fieldHeight - bottomReserve - hint - (rows - 1) * pairsCardGap) / rows
        : double.infinity;
    final card = min(byWidth, max(pairsFingerMin, byHeight)).floorToDouble();
    final height = rows * card + (rows - 1) * pairsCardGap;
    return PairsGrid(
      cols: cols,
      card: card,
      width: cols * card + (cols - 1) * pairsCardGap,
      height: height,
      fits: fieldHeight <= 0 || height + hint + bottomReserve <= fieldHeight,
    );
  }

  final previous = groups <= 10 ? 4 : 6;
  if (fieldHeight <= 0) return variant(previous);
  final four = variant(4);
  final six = variant(6);
  if (four.fits != six.fits) return four.fits ? four : six;
  if (four.card != six.card) return four.card > six.card ? four : six;
  return previous == 4 ? four : six;
}

/// Карта поля: номер картинки и её состояние.
class PairCard {
  PairCard(this.symbol);
  final int symbol;
  bool flipped = false;
  bool matched = false;
}

/// Чем кончилось нажатие.
enum TapResult {
  /// Не в счёт: карта уже открыта или собрана, или группа набрана.
  ignored,

  /// Карта открыта, группа ещё не набрана.
  opened,

  /// Набрана группа одинаковых — её можно снимать.
  groupMatched,

  /// Набрана группа, и в ней разные картинки — промах.
  groupMissed,
}

/// Партия на одном уровне: колода, открытые карты, ходы и ошибки.
class PairsGame {
  PairsGame({required this.level, List<int>? deck, Random? rnd})
      : cfg = LevelCfg.of(level),
        _rnd = rnd ?? Random() {
    final symbols = deck ?? _buildDeck();
    cards = [for (final s in symbols) PairCard(s)];
  }

  final int level;
  final LevelCfg cfg;
  final Random _rnd;
  late final List<PairCard> cards;

  /// Карты, открытые в текущем ходе (номера мест на поле).
  final List<int> open = [];
  int moves = 0;
  int errors = 0;

  /// Сколько групп в колоде — считается ПО КОЛОДЕ, а не по уровню. В вебе победа
  /// когда-то сверялась с конфигом, и при расхождении партия не кончалась никогда.
  int get groups => cards.map((c) => c.symbol).toSet().length;
  int get matchedGroups => cards.where((c) => c.matched).length ~/ cfg.groupSize;
  bool get isWon => cards.every((c) => c.matched);

  /// Колода: случайные картинки набора, каждая по `groupSize` раз, вперемешку.
  List<int> _buildDeck() {
    final symbols = List.generate(pairsSpriteCount, (i) => i)..shuffle(_rnd);
    final deck = <int>[
      for (final s in symbols.take(min(cfg.pairs, pairsSpriteCount)))
        for (var k = 0; k < cfg.groupSize; k++) s,
    ]..shuffle(_rnd);
    return deck;
  }

  TapResult tap(int i) {
    if (i < 0 || i >= cards.length) return TapResult.ignored;
    final c = cards[i];
    if (c.matched || c.flipped || open.length >= cfg.groupSize) return TapResult.ignored;
    c.flipped = true;
    open.add(i);
    if (open.length < cfg.groupSize) return TapResult.opened;
    moves += 1;
    final first = cards[open.first].symbol;
    if (open.every((j) => cards[j].symbol == first)) return TapResult.groupMatched;
    errors += 1;
    return TapResult.groupMissed;
  }

  /// Снять набранную группу одинаковых.
  void settleMatch() {
    for (final j in open) {
      cards[j].matched = true;
    }
    open.clear();
  }

  /// Закрыть промах — карты лицом вниз, ход закончен.
  void settleMiss() {
    for (final j in open) {
      cards[j].flipped = false;
    }
    open.clear();
  }

  /// Закрытые карты — только они и меняются местами.
  List<int> get closed => [
        for (var i = 0; i < cards.length; i++)
          if (!cards[i].matched && !cards[i].flipped) i,
      ];

  /// Поменять местами две карты.
  void swap(int a, int b) {
    final t = cards[a];
    cards[a] = cards[b];
    cards[b] = t;
  }

  /// Счёт уровня — как в вебе: лишние ходы и время снимают очки, но не ниже 50.
  int score(int seconds) => max(50, (400 - max(0, moves - groups) * 15 - seconds * 2).round());
}
