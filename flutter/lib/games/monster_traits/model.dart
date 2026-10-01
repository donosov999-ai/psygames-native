/// «НАЙДИ ПРИЗНАК» — ПРАВИЛА РАУНДА, БЕЗ FLUTTER.
///
/// Происхождение: движок MindLab `mindsters/monsters.py` (режим classify, clean-room)
/// и пилот Codex (ветка codex/mindlab-five), решение Дениса 30.09.2026 «добавляем
/// нативно, дорабатываем потом». Имя Mindsters — коммерческое, в продукте его нет.
///
/// 27 монстров = цвет × тело × число глаз (по три варианта). Объявлен один признак —
/// отметить ВСЕХ, у кого он есть, и никого лишнего. Зачёт — только точный набор.
///
/// ⚠️ ЦВЕТА — КРАСНЫЙ, СИНИЙ, ЖЁЛТЫЙ, А НЕ ЗЕЛЁНЫЙ, КАК В ПИЛОТЕ. Пара «красный —
/// зелёный» у людей с нарушением цветового зрения сливается, и признак «цвет» у
/// них стал бы нерешаемым — игра мерила бы глаза, а не внимание.
library;

import 'dart:math';

/// Признак: цвет, тело или число глаз.
enum Trait { color, body, eyes }

class Monster {
  const Monster(this.color, this.body, this.eyes);

  /// 0 красный · 1 синий · 2 жёлтый.
  final int color;

  /// 0 круглое · 1 квадратное · 2 колючее.
  final int body;

  /// 1…3.
  final int eyes;

  int valueOf(Trait t) => switch (t) {
        Trait.color => color,
        Trait.body => body,
        Trait.eyes => eyes,
      };

  @override
  bool operator ==(Object other) =>
      other is Monster && other.color == color && other.body == body && other.eyes == eyes;

  @override
  int get hashCode => color * 100 + body * 10 + eyes;
}

/// Все 27 монстров.
final List<Monster> allMonsters = [
  for (var c = 0; c < 3; c++)
    for (var b = 0; b < 3; b++)
      for (var e = 1; e <= 3; e++) Monster(c, b, e),
];

/// Сколько карточек на поле: 6 · 8 · 9 · 10 · 12 · 13 · 15 на L1–7, потом 15 · 16 · 17 на
/// L8–10 уже с двумя признаками и 18 с L11. Шаг — каждую ступень: соседние ступени не
/// бывают одинаковыми (лестница без клонов, проба `ступени не повторяют соседей`).
int traitCardsFor(int level) {
  const early = [6, 8, 9, 10, 12, 13, 15];
  if (level <= early.length) return early[max(1, level) - 1];
  return min(18, 15 + (level - early.length - 1));
}

/// С какой ступени условие — два признака сразу («красный цвет И три глаза»): поиск по
/// СОЧЕТАНИЮ, та же ось, что у зрительного поиска с L8 (`vsConjFromLevel`).
const int traitPairFrom = 8;

/// С какой ступени появляется время на раунд.
const int traitTimedFrom = 12;

/// С какой ступени второй признак через уровень берётся с отрицанием («но НЕ три глаза»):
/// отметить надо, отбросив часть найденных, — это уже не поиск, а поиск с торможением.
const int traitNegateFrom = 16;

/// Ступень — все оси разом. ЛЕСТНИЦА (задача 664b414a, раздел «Поиск», 30.09.2026):
/// L1–7 число карточек · L8+ два признака (и карточек до 18 к L11) · L12+ время 40 с и
/// минус 2 с за ступень · L16+ через ступень «но не» · L26+ время минус 1 с за две ступени.
/// ⚠️ ГРАНИЦА, А НЕ ПОТОЛОК: время не опускается ниже 8 с (L36). На поле 18 карточек
/// отметить до 12 и нажать «Проверить» — около полусекунды на касание; дальше ось
/// меряет палец, а не глаза. Сдвигать границу — только по замеру на людях.
class TraitLevel {
  const TraitLevel({required this.cards, required this.pair, required this.negate, this.seconds});
  final int cards;
  final bool pair;
  final bool negate;

  /// Секунд на раунд; `null` — без времени.
  final int? seconds;

  String get signature => '$cards|$pair|$negate|$seconds';
}

TraitLevel traitLevelFor(int level) {
  int? seconds;
  if (level >= traitTimedFrom) {
    seconds = level <= 25 ? 40 - 2 * (level - traitTimedFrom) : max(8, 14 - (level - 25 + 1) ~/ 2);
  }
  return TraitLevel(
    cards: traitCardsFor(level),
    pair: level >= traitPairFrom,
    negate: level >= traitNegateFrom && level.isEven,
    seconds: seconds,
  );
}

class TraitRound {
  TraitRound({
    required this.cards,
    required this.trait,
    required this.value,
    this.trait2,
    this.value2,
    this.negate2 = false,
  }) {
    if (target.isEmpty) throw ArgumentError('признака нет ни у одной карточки');
  }

  /// Раздача ступени: условию отвечают хотя бы две карточки и не отвечают хотя бы две —
  /// иначе «отметь всех» вырождается в «отметь всё» или «отметь одну».
  factory TraitRound.deal(int level, Random rnd) {
    final lv = traitLevelFor(level);
    for (var attempt = 0; attempt < 400; attempt++) {
      final cards = (List<Monster>.of(allMonsters)..shuffle(rnd)).take(lv.cards).toList();
      final trait = Trait.values[rnd.nextInt(3)];
      final values = cards.map((m) => m.valueOf(trait)).toSet().toList()..sort();
      final value = values[rnd.nextInt(values.length)];
      Trait? trait2;
      int? value2;
      if (lv.pair) {
        final others = Trait.values.where((t) => t != trait).toList();
        trait2 = others[rnd.nextInt(others.length)];
        final v2 = cards.map((m) => m.valueOf(trait2!)).toSet().toList()..sort();
        value2 = v2[rnd.nextInt(v2.length)];
      }
      final probe = TraitRound._unchecked(cards, trait, value, trait2, value2, lv.negate);
      final hits = probe.target.length;
      if (hits >= 2 && hits <= lv.cards - 2) return probe;
    }
    throw StateError('не нашлось раздачи на ступень $level');
  }

  TraitRound._unchecked(this.cards, this.trait, this.value, this.trait2, this.value2, this.negate2);

  final List<Monster> cards;
  final Trait trait;
  final int value;

  /// Второй признак (с L8) и признак отрицания (с L16 через ступень).
  final Trait? trait2;
  final int? value2;
  final bool negate2;

  bool get isPair => trait2 != null;

  /// Отвечает ли монстр условию раунда.
  bool matches(Monster m) =>
      m.valueOf(trait) == value && (trait2 == null || (m.valueOf(trait2!) == value2) != negate2);

  /// Номера карточек, отвечающих условию.
  Set<int> get target => {
        for (var i = 0; i < cards.length; i++)
          if (matches(cards[i])) i,
      };

  /// Разбор ответа: кого пропустил и кого отметил лишним.
  ({Set<int> missed, Set<int> extras}) grade(Set<int> selected) {
    final t = target;
    return (missed: t.difference(selected), extras: selected.difference(t));
  }
}

// ─────────────────────────── «Кого не хватает» ───────────────────────────
//
// Второй режим движка MindLab (`mindsters/monsters.py`, класс `Missing`): показали руку
// монстров, одного убрали — кого не хватает. Здесь меряется ПАМЯТЬ на признаки, а не
// поиск: смотреть на поле во время ответа бесполезно — убранного на нём нет. Решение
// Дениса 30.09.2026: режимом этой же игры, отдельной лестницей (`monster_traits_missing`).

/// Ключ лестницы режима — литералом: по нему `flutter/tools/embed-hubs.mjs` находит
/// уровень карточки развилки `/games/monster-traits?mode=missing`.
const String missingLadderKey = 'monster_traits_missing';

/// Проб на ступень: одна проба из четырёх вариантов угадывается в 25 %, и лестница
/// шла бы по везению. Ступень взята при [missingPassAt] верных из [missingTrials].
const int missingTrials = 3;
const int missingPassAt = 2;

/// Ступень режима. Оси: сколько монстров в руке (3 → 8), сколько длится показ
/// (4 с → 1,5 с), похожи ли варианты на убранного (с L4 — делят с ним два признака
/// из трёх), сколько вариантов (4 → 8 с L15) и сколько убрано (два с L19).
/// ⚠️ ГРАНИЦА: дальше L19 оси не растут — «трое убранных» и показ короче 1,5 с на
/// восемь монстров мерить на людях, а не вписывать числом.
class MissingLevel {
  const MissingLevel({
    required this.hand,
    required this.studyMs,
    required this.similar,
    required this.options,
    required this.gone,
  });
  final int hand;
  final int studyMs;
  final bool similar;
  final int options;
  final int gone;

  String get signature => '$hand|$studyMs|$similar|$options|$gone';
}

MissingLevel missingLevelFor(int level) {
  const hands = [3, 4, 4, 5, 5, 6, 6, 7, 7];
  final l = max(1, level);
  return MissingLevel(
    hand: l <= hands.length ? hands[l - 1] : 8,
    studyMs: max(1500, 4000 - 200 * (l - 1)),
    similar: l >= 4,
    options: l < 15 ? 4 : min(8, 4 + (l - 14)),
    gone: l >= 19 ? 2 : 1,
  );
}

class MissingRound {
  MissingRound({required this.hand, required this.gone, required this.options});

  /// Кого показали — по порядку показа.
  final List<Monster> hand;

  /// Номера убранных в [hand].
  final Set<int> gone;

  /// Варианты ответа: все убранные и помехи, которых в руке НЕ было.
  final List<Monster> options;

  /// Кого показывают при ответе — рука без убранных, тем же порядком.
  List<Monster> get shown => [for (var i = 0; i < hand.length; i++) if (!gone.contains(i)) hand[i]];

  Set<Monster> get goneMonsters => {for (final i in gone) hand[i]};

  /// Верно ли: выбраны ровно убранные.
  bool check(Set<Monster> picked) =>
      picked.length == gone.length && picked.every(goneMonsters.contains);

  /// Раздача. Помеха берётся только из тех, кого в руке не было: показанный на поле
  /// отсеивается глазом, и вопрос вырождался бы в «кого нет на поле». С L4 помехи
  /// делят с убранным два признака из трёх — отличить можно, только если запомнил все три.
  factory MissingRound.deal(int level, Random rnd) {
    final lv = missingLevelFor(level);
    final hand = (List<Monster>.of(allMonsters)..shuffle(rnd)).take(lv.hand).toList();
    final gone = (List<int>.generate(lv.hand, (i) => i)..shuffle(rnd)).take(lv.gone).toSet();
    final goneMonsters = [for (final i in gone) hand[i]];
    final pool = allMonsters.where((m) => !hand.contains(m)).toList()..shuffle(rnd);
    int shared(Monster a, Monster b) =>
        (a.color == b.color ? 1 : 0) + (a.body == b.body ? 1 : 0) + (a.eyes == b.eyes ? 1 : 0);
    if (lv.similar) {
      // Самые похожие на кого-нибудь из убранных — первыми; порядок равных — от перемешивания.
      int best(Monster m) => goneMonsters.map((g) => shared(m, g)).reduce(max);
      pool.sort((a, b) => best(b).compareTo(best(a)));
    }
    final distractors = pool.take(lv.options - goneMonsters.length).toList();
    final options = [...goneMonsters, ...distractors]..shuffle(rnd);
    return MissingRound(hand: hand, gone: gone, options: options);
  }
}
