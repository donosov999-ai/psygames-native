import 'dart:convert';
import 'dart:io';
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

  test('лестница: от шести карточек до двенадцати, потом растут смены правила — без потолка', () {
    expect(kidsCardsFor(1), 6);
    expect(kidsCardsFor(4), 12);
    expect(kidsPhasesFor(4), 2);
    expect(kidsPhasesFor(5), 3, reason: 'с пятой ступени правило возвращается');
    expect(kidsPhasesFor(60), greaterThan(kidsPhasesFor(30)), reason: 'смены растут дальше');
    expect(kidsCardsFor(30), 4, reason: 'фаза короче, когда смен много, но не меньше четырёх карточек');
  });

  int byColor(KidsCard c) => kidsTargets.indexWhere((t) => t.color == c.color);
  int byShape(KidsCard c) => kidsTargets.indexWhere((t) => t.shape == c.shape);
  int byRule(KidsRule r, KidsCard c) => r == KidsRule.color ? byColor(c) : byShape(c);

  test('🔴 после смены правила каждая карточка конфликтная — персеверацию видно на каждой', () {
    // 02.10.2026, задача e95b7e2f. Движок раздавал карточки случайно, и половина карточек
    // фазы вела в одну коробку по любому правилу: ответ по старому правилу на них был
    // верным, и персеверация пряталась. Ребёнок, который держится старого правила, должен
    // ошибиться на КАЖДОЙ карточке после смены.
    final bad = <String>[];
    for (var level = 1; level <= 20; level += 1) {
      for (var seed = 1; seed <= 10; seed += 1) {
        final s = KidsSortSession(Random(seed * 13 + level), nCards: kidsCardsFor(level), phases: kidsPhasesFor(level));
        for (final c in s.phase1.cards) {
          s.answer(1, c, byColor(c));
        }
        var expected = 0;
        for (var p = 2; p <= s.phases.length; p += 1) {
          // Держится правила прошлой фазы.
          for (final c in s.phases[p - 1].cards) {
            s.answer(p, c, byRule(s.phases[p - 2].rule, c));
          }
          expected += s.nCards;
          final half = s.phases[p - 1].cards.where((c) => c.color == KidsColor.red).length;
          if (half * 2 != s.nCards) bad.add('L$level s$seed фаза $p: красных $half из ${s.nCards}');
        }
        if (s.perseverative != expected) bad.add('L$level s$seed: персевераций ${s.perseverative} из $expected');
      }
    }
    expect(bad, isEmpty);
  });

  test('🔴 серия засчитана, если смену заметил; три звезды — только неизбежные ✗', () {
    final s = KidsSortSession(Random(5), nCards: kidsCardsFor(8), phases: kidsPhasesFor(8));
    expect(s.switches, 3);
    // Внимательный: держит правило, пока не увидит ✗, потом переходит на другое.
    var rule = KidsRule.color;
    for (var p = 1; p <= s.phases.length; p += 1) {
      for (final c in s.phases[p - 1].cards) {
        if (!s.answer(p, c, byRule(rule, c))) {
          rule = rule == KidsRule.color ? KidsRule.shape : KidsRule.color;
        }
      }
    }
    expect(s.errors, s.switches, reason: 'по одной ✗ на смену');
    expect(s.passed, isTrue);
    expect(s.stars, 3, reason: 'неизбежные ✗ звёзд не отнимают');

    // Держится цвета до конца — серия не засчитана.
    final stuck = KidsSortSession(Random(5), nCards: kidsCardsFor(8), phases: kidsPhasesFor(8));
    for (var p = 1; p <= stuck.phases.length; p += 1) {
      for (final c in stuck.phases[p - 1].cards) {
        stuck.answer(p, c, byColor(c));
      }
    }
    expect(stuck.passed, isFalse);
    expect(stuck.stars, 1);
  });

  test('🔴 карточка правила объявляет смены на той ступени, где они появляются', () {
    final ranges = (jsonDecode(File('assets/level_rules.json').readAsStringSync())['games']
        as Map<String, dynamic>)['kids_sort'] as List;
    final from = (ranges.firstWhere((r) => (r as List)[2] == 'switches') as List)[0] as int;
    expect(from, List.generate(60, (i) => i + 1).firstWhere((l) => kidsPhasesFor(l) > 2));
  });
}
