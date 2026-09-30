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

/// Сколько карточек на поле на ступени: 6 → 9 → 12 → 15. Дальше лестницу растит
/// раздел «Поиск» (два признака сразу, время на раунд — задача 664b414a).
int traitCardsFor(int level) => level <= 1 ? 6 : level <= 3 ? 9 : level <= 6 ? 12 : 15;

class TraitRound {
  TraitRound({required this.cards, required this.trait, required this.value}) {
    if (target.isEmpty) throw ArgumentError('признака нет ни у одной карточки');
  }

  /// Раздача ступени: признак есть хотя бы у двух карточек и нет хотя бы у двух —
  /// иначе «отметь всех» вырождается в «отметь всё» или «отметь одну».
  factory TraitRound.deal(int level, Random rnd) {
    final count = traitCardsFor(level);
    for (var attempt = 0; attempt < 200; attempt++) {
      final cards = (List<Monster>.of(allMonsters)..shuffle(rnd)).take(count).toList();
      final trait = Trait.values[rnd.nextInt(3)];
      final values = cards.map((m) => m.valueOf(trait)).toSet().toList()..sort();
      final value = values[rnd.nextInt(values.length)];
      final hits = cards.where((m) => m.valueOf(trait) == value).length;
      if (hits >= 2 && hits <= count - 2) return TraitRound(cards: cards, trait: trait, value: value);
    }
    throw StateError('не нашлось раздачи на ступень $level');
  }

  final List<Monster> cards;
  final Trait trait;
  final int value;

  /// Номера карточек с признаком.
  Set<int> get target => {
        for (var i = 0; i < cards.length; i++)
          if (cards[i].valueOf(trait) == value) i,
      };

  /// Разбор ответа: кого пропустил и кого отметил лишним.
  ({Set<int> missed, Set<int> extras}) grade(Set<int> selected) {
    final t = target;
    return (missed: t.difference(selected), extras: selected.difference(t));
  }
}
