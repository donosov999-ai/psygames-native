import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/hidden_character/model.dart';

/// 🔴 «КТО СПРЯТАЛСЯ?»: СТУПЕНЬ ЗАСЛУЖИВАЕТ СВОЁ ИМЯ, СЧЁТ МЕРИТ НАВЫК (задача 5c011a93).
///
/// Меряется исполнением: на каждой ступени раздаются расклады, по ним играет «игрок
/// наугад» (любой полезный вопрос с равной вероятностью), и считается, сколько он
/// ошибается в выборе вопроса. Ступень выше обязана ловить его чаще — иначе номер
/// ступени ничего не значит.
///
/// ЗАМЕР 30.09.2026 (200 раскладов на ступень, зёрна 13 и 97): ошибок наугад в среднем
/// 0 · 0,66–0,69 · 0,77 · 1,00–1,03 · 1,05–1,06 · 1,24–1,25 · 1,31 · 1,36–1,40; три звезды
/// наугад 100 · 35–39 · 23–25 · 16–17 · 8–9 · 4–5 · 4–5 · 3 %. Прежняя таблица давала
/// 100 % трёх звёзд наугад на ступенях 1–3 и 79–89 % на остальных: счёт мерил удачу.
void main() {
  /// Партия игрока наугад по раскладу [r]: сколько ошибочных выборов.
  int randomMistakes(HiddenRound r, Random rnd) {
    final play = HiddenRound(features: r.features, suspects: r.suspects, target: r.target, withOr: r.withOr);
    while (play.remaining.length > 1) {
      final useful = play.questions.where((q) {
        if (play.wasAskedQuestion(q)) return false;
        final y = play.remaining.where((i) => answersYes(play.suspects[i], q)).length;
        return y > 0 && y < play.remaining.length;
      }).toList();
      if (useful.isEmpty) break;
      play.askQuestion(useful[rnd.nextInt(useful.length)]);
    }
    return play.mistakes;
  }

  /// Партия лучшего игрока: всегда вопрос с наименьшим худшим случаем.
  int bestMistakes(HiddenRound r) {
    final play = HiddenRound(features: r.features, suspects: r.suspects, target: r.target, withOr: r.withOr);
    while (play.remaining.length > 1) {
      final q = play.bestNow();
      if (q == null) break;
      play.askQuestion(q);
    }
    return play.mistakes;
  }

  test('🔴 мера честная: ловушки расклада = среднее ошибок у 2000 игроков наугад', () {
    // Ловушки считаются точной рекурсией; если формула врёт, лестница держится на вымысле.
    final rnd = Random(42);
    for (final lv in [3, 5, 8, 10, 13]) {
      final r = HiddenRound.deal(lv, rnd);
      var sum = 0;
      const n = 2000;
      for (var g = 0; g < n; g++) {
        final t = HiddenRound(features: r.features, suspects: r.suspects, target: rnd.nextInt(r.suspects.length), withOr: r.withOr);
        sum += randomMistakes(t, rnd);
      }
      expect(sum / n, closeTo(r.traps, 0.06),
          reason: 'ступень $lv: мера ${r.traps.toStringAsFixed(3)}, партии наугад ${(sum / n).toStringAsFixed(3)}');
    }
  });

  test('🔴 каждая раздача попадает в окно своей ступени; окна идут вверх без перекрытий', () {
    final rnd = Random(97);
    for (var lv = 1; lv <= hiddenStepCount; lv++) {
      final st = hiddenStep(lv);
      if (lv > 1) {
        expect(st.minTraps, greaterThanOrEqualTo(hiddenStep(lv - 1).maxTraps),
            reason: 'окно ступени $lv заходит в окно ступени ${lv - 1}');
      }
      for (var d = 0; d < 60; d++) {
        final r = HiddenRound.deal(lv, rnd);
        expect(r.traps, inInclusiveRange(st.minTraps, st.maxTraps),
            reason: 'ступень $lv: расклад с ловушками ${r.traps.toStringAsFixed(2)} вне окна');
      }
    }
  });

  test('🔴 счёт мерит навык: наугад три звезды — только внизу лестницы', () {
    final rnd = Random(13);
    double threeStars(int lv) {
      var three = 0;
      const n = 150;
      for (var d = 0; d < n; d++) {
        if (randomMistakes(HiddenRound.deal(lv, rnd), rnd) == 0) three++;
      }
      return three / n;
    }

    expect(threeStars(1), 1.0, reason: 'первая ступень — знакомство: любой вопрос годится');
    final top = threeStars(8);
    expect(top, lessThanOrEqualTo(0.10), reason: 'на верху одиночных вопросов три звезды наугад — редкость; вышло $top');
    expect(threeStars(4), greaterThan(top), reason: 'середина лестницы щедрее вершины');
    final orTop = threeStars(hiddenStepCount);
    expect(orTop, lessThanOrEqualTo(top), reason: 'вершина с «или» не щедрее вершины без него; вышло $orTop');
  });

  test('🔴 лучший игрок не ошибается ни на одной ступени — звёзды за выбор, а не за удачу', () {
    final rnd = Random(5);
    for (var lv = 1; lv <= hiddenStepCount; lv++) {
      for (var d = 0; d < 30; d++) {
        expect(bestMistakes(HiddenRound.deal(lv, rnd)), 0, reason: 'ступень $lv: эталонная игра засчитана ошибкой');
      }
    }
  });

  test('🔴 отбор расклада не зависает: при одной попытке раздача всё равно есть', () {
    final r = HiddenRound.deal(8, Random(1), attempts: 1);
    expect(r.suspects, isNotEmpty);
  });
}
