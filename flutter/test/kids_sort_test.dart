import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/kids_sort/model.dart';

/// «ЦВЕТА И ФОРМЫ»: перенос движка MindLab `kids/sort.py`. Пробы — те же, что
/// `test_kids.py` движка, в обличье коробок-образцов (см. шапку модели).
void main() {
  test('признак по правилу (test_rule_keys)', () {
    const card = KidsCard(KidsColor.red, KidsShape.circle, KidsSize.big);
    final byColor = KidsSortTask(KidsRule.color, Random(1), 1);
    final byShape = KidsSortTask(KidsRule.shape, Random(1), 1);
    expect(byColor.keyOf(card), KidsColor.red);
    expect(byShape.keyOf(card), KidsShape.circle);
    // Правила «по размеру» у движка нет — и в переносе его нельзя задать вовсе:
    // KidsRule знает только color и shape.
    expect(KidsRule.values, [KidsRule.color, KidsRule.shape]);
  });

  test('🔴 персеверации: ответы по СТАРОМУ правилу после смены (test_perseveration)', () {
    final s = KidsSortSession(Random(3), nCards: 4);
    int byColor(KidsCard c) => kidsTargets.indexWhere((t) => t.color == c.color);
    int byShape(KidsCard c) => kidsTargets.indexWhere((t) => t.shape == c.shape);
    for (final c in s.phase1.cards) {
      expect(s.answer(1, c, byColor(c)), isTrue, reason: 'фаза 1 по цвету — всё верно');
    }
    // Фаза 2: отвечаем по-старому, цветом. Ошибка — только на карточках, где
    // цвет и форма ведут в РАЗНЫЕ коробки; каждая такая ошибка — персеверация.
    final conflicts = s.phase2.cards.where((c) => byColor(c) != byShape(c)).length;
    for (final c in s.phase2.cards) {
      s.answer(2, c, byColor(c));
    }
    expect(s.total, 8);
    expect(s.errors, conflicts);
    expect(s.perseverative, conflicts, reason: 'каждая ошибка по цвету во второй фазе — персеверация');

    // А по форме — всё верно.
    final s2 = KidsSortSession(Random(3), nCards: 4);
    for (final c in s2.phase2.cards) {
      expect(s2.answer(2, c, byShape(c)), isTrue);
    }
    expect(s2.errors, 0);
  });

  test('на конфликтной карточке ответ по цвету — ошибка и персеверация', () {
    // Красный квадрат: по цвету — к красному кругу, по форме — к синему квадрату.
    const c = KidsCard(KidsColor.red, KidsShape.square, KidsSize.small);
    final s = KidsSortSession(Random(1), nCards: 1);
    expect(s.answer(2, c, 0), isFalse);
    expect(s.perseverative, 1);
    expect(s.answer(2, c, 1), isTrue);
  });

  test('лестница: от шести карточек в фазе до двенадцати', () {
    expect(kidsCardsFor(1), 6);
    expect(kidsCardsFor(4), 12);
    expect(kidsCardsFor(30), 12);
  });
}
