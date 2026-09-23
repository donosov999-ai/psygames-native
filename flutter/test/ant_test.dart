import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/ant/model.dart';

/// СВЕРКА ANT С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Эталон выгружен прогоном `frontend/app/games/ant.tsx` (VER 2) в
/// `test/fixtures/ant-reference.json`: лестница L1…L15, доли и замер потока по
/// 300 000 проб (доли согласованности, равновероятность подсказок, позиций и
/// направлений).
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/ant-reference.json').readAsStringSync()) as Map<String, dynamic>;
  });

  test('🔴 доли проб и потолок лестницы — те же, что в живом коде', () {
    expect(antIncongruentProb, ref['incongruentProb']);
    expect(antNeutralProb, ref['neutralProb']);
    expect(antMaxLevel, ref['maxLevel']);
    // Канон Fan 2002: 1/3 : 1/3 : 1/3.
    expect(antIncongruentProb, closeTo(1 / 3, 1e-12));
    expect(antNeutralProb, closeTo(1 / 3, 1e-12));
    expect(1 - antIncongruentProb - antNeutralProb, closeTo(1 / 3, 1e-12));
  });

  test('🔴 лестница уровней совпадает с эталоном по всем полям', () {
    for (final row in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final l = AntLevel.of(row['level'] as int);
      final at = 'L${row['level']}';
      expect(l.trials, row['trials'], reason: '$at: объём проб');
      expect(l.windowMs, row['windowMs'], reason: '$at: окно ответа');
      expect(l.preJitterMs, row['preJitterMs'], reason: '$at: разброс пред-паузы');
      expect(l.ctoaVarMs, row['ctoaVarMs'], reason: '$at: разброс CTOA');
      expect(l.condition, (row['condition'] as Map).cast<String, Object?>(),
          reason: '$at: условие, при котором сняты меры');
    }
  });

  test('🔴 доли НЕ ось сложности: сложность растёт РАЗБРОСОМ интервалов', () {
    for (var l = 2; l <= antMaxLevel; l++) {
      final a = AntLevel.of(l - 1);
      final b = AntLevel.of(l);
      expect(b.windowMs <= a.windowMs, isTrue, reason: 'L$l: окно выросло');
      expect(b.preJitterMs > a.preJitterMs, isTrue, reason: 'L$l: разброс пред-паузы не вырос');
      expect(b.ctoaVarMs > a.ctoaVarMs, isTrue, reason: 'L$l: разброс CTOA не вырос');
    }
    expect(AntLevel.of(1).preJitterMs, 400);
    expect(AntLevel.of(15).preJitterMs, 1520);
    expect(AntLevel.of(1).ctoaVarMs, 100);
    expect(AntLevel.of(15).ctoaVarMs, 660);
    expect(AntLevel.of(1).windowMs, 3000);
    expect(AntLevel.of(15).windowMs, 1040);
  });

  test('🔴 пол окна держится и за потолком лестницы', () {
    expect(3000 - (25 - 1) * 140, lessThan(1000));
    expect(AntLevel.of(25).windowMs, 1000);
    // ⚠️ На L15 пол ещё НЕ связывает: 1040 > 1000. Значит без max() лестница
    // до потолка выглядела бы так же — мутация ловится только за потолком.
    expect(AntLevel.of(15).windowMs, 1040);
  });

  test('🔴 поток проб совпадает с замером живого TS по всем четырём осям', () {
    final rnd = Random(20260923);
    const n = 300000;
    final cong = <Congruence, int>{}, cue = <CueType, int>{}, pos = <Position, int>{}, dir = <Direction, int>{};
    for (var i = 0; i < n; i++) {
      final t = makeTrial(rnd.nextDouble);
      cong[t.cong] = (cong[t.cong] ?? 0) + 1;
      cue[t.cue] = (cue[t.cue] ?? 0) + 1;
      pos[t.pos] = (pos[t.pos] ?? 0) + 1;
      dir[t.dir] = (dir[t.dir] ?? 0) + 1;
    }
    final want = ref['замер потока'] as Map<String, dynamic>;
    expect(want['прогонов'], n, reason: 'эталон снят на другом числе прогонов');
    final shares = (want['доли'] as Map).cast<String, num>();
    expect(cong[Congruence.incongruent]! / n, closeTo(shares['incongruent']!.toDouble(), 0.01));
    expect(cong[Congruence.neutral]! / n, closeTo(shares['neutral']!.toDouble(), 0.01));
    expect(cong[Congruence.congruent]! / n, closeTo(shares['congruent']!.toDouble(), 0.01));
    // Четыре вида подсказки — поровну, иначе alerting и orienting считаются по
    // ячейкам разного объёма.
    for (final c in CueType.values) {
      expect(cue[c]! / n, closeTo(0.25, 0.01), reason: 'подсказка $c: ${cue[c]! / n}');
    }
    for (final p in Position.values) {
      expect(pos[p]! / n, closeTo(0.5, 0.01), reason: 'позиция $p');
    }
    for (final d in Direction.values) {
      expect(dir[d]! / n, closeTo(0.5, 0.01), reason: 'направление $d');
    }
  });

  test('🔴 фланги строятся ПО согласованности, а не как попало', () {
    final rnd = Random(5);
    for (var i = 0; i < 5000; i++) {
      final t = makeTrial(rnd.nextDouble);
      switch (t.cong) {
        case Congruence.neutral:
          // Нейтральная — флангов НЕТ вовсе. Не «смотрят куда-то»: отсутствие
          // флангов и есть отсутствие конфликта.
          expect(t.flankers, isNull, reason: 'нейтральная проба с флангами');
        case Congruence.congruent:
          expect(t.flankers, isNotNull);
          expect(t.flankers!.length, 4);
          expect(t.flankers!.every((d) => d == t.dir), isTrue, reason: 'согласованная проба с чужими флангами');
        case Congruence.incongruent:
          expect(t.flankers, isNotNull);
          expect(t.flankers!.length, 4);
          expect(t.flankers!.every((d) => d != t.dir), isTrue, reason: 'конфликтная проба со своими флангами');
      }
    }
  });

  test('🔴 три сети — РАЗНОСТИ ячеек, а не средние по партии', () {
    // Числа подобраны так, чтобы каждая сеть вышла своей: alerting 100,
    // orienting 50, executive 80.
    final data = <AntRt>[
      const AntRt(cue: CueType.none, cong: Congruence.congruent, rt: 600),
      const AntRt(cue: CueType.none, cong: Congruence.congruent, rt: 600),
      const AntRt(cue: CueType.double_, cong: Congruence.congruent, rt: 500),
      const AntRt(cue: CueType.double_, cong: Congruence.congruent, rt: 500),
      const AntRt(cue: CueType.center, cong: Congruence.incongruent, rt: 630),
      const AntRt(cue: CueType.center, cong: Congruence.incongruent, rt: 630),
      const AntRt(cue: CueType.spatial, cong: Congruence.incongruent, rt: 580),
      const AntRt(cue: CueType.spatial, cong: Congruence.incongruent, rt: 580),
    ];
    final n = calcNetworks(data);
    expect(n.alertingMs, 100, reason: 'RT(без подсказки) − RT(двойная)');
    expect(n.orientingMs, 50, reason: 'RT(центральная) − RT(пространственная)');
    // Конфликтные 605 против согласованных 550.
    expect(n.executiveMs, 55);
    expect(n.meanRtMs, 578, reason: '4620/8 = 577,5, округление вверх');
    // ⚠️ Слепое место, закрытое нарочно: если считать executive как
    // «конфликтные минус СРЕДНЕЕ по партии», выйдет 605 − 577,5 = 28, а не 55.
    expect(n.executiveMs, isNot(28));
  });

  test('🔴 пустая ячейка даёт 0, и это читается вместе с числом проб', () {
    // Двойной подсказки не было вовсе — alerting выходит равным среднему
    // «без подсказки». Так же в веб-версии; цифру нельзя читать в отрыве от
    // числа проб, и ради этого рядом лежит n_trials.
    final n = calcNetworks(const [
      AntRt(cue: CueType.none, cong: Congruence.congruent, rt: 700),
    ]);
    expect(n.alertingMs, 700);
    expect(n.orientingMs, 0, reason: 'обе ячейки пусты — разность 0');
    expect(calcNetworks(const []).meanRtMs, 0);
  });

  test('🔴 в ячейки идут ТОЛЬКО верные пробы', () {
    var now = 0;
    final g = AntGame(level: 1, rnd: Random(3), nowMs: () => now, trialsOverride: 6);
    g.begin();
    var hits = 0, wrong = 0;
    while (g.nextTrial()) {
      now += g.preDelayMs();
      now += AntGame.cueMs;
      now += g.blankMs(g.trial!.cue);
      g.showTarget();
      now += 500;
      // Через одну отвечаем НЕВЕРНО.
      final d = hits.isEven ? g.trial!.dir : (g.trial!.dir == Direction.left ? Direction.right : Direction.left);
      final out = g.answer(d);
      if (out == AntOutcome.hit) {
        hits++;
      } else {
        wrong++;
      }
    }
    expect(hits + wrong, 6);
    expect(wrong, greaterThan(0), reason: 'ни одного неверного ответа — проба ничего не проверяет');
    expect(g.records.length, hits, reason: 'в ячейки попали ошибочные пробы');
    expect(g.hits, hits);
    expect(g.errors, wrong);
    expect(g.meanRtMs, 500);
  });

  test('🔴 время реакции идёт от МИШЕНИ, а не от начала пробы', () {
    var now = 0;
    final g = AntGame(level: 15, rnd: Random(8), nowMs: () => now, trialsOverride: 1);
    g.begin();
    g.nextTrial();
    // Пред-пауза и CTOA на L15 длинные — если считать оттуда, время вырастет
    // на сотни миллисекунд, и все три разности поедут.
    final pre = g.preDelayMs();
    now += pre + AntGame.cueMs + g.blankMs(g.trial!.cue);
    expect(pre, greaterThanOrEqualTo(400));
    g.showTarget();
    now += 420;
    expect(g.answer(g.trial!.dir), AntOutcome.hit);
    expect(g.records.single.rt, 420, reason: 'в время реакции попали паузы');
  });

  test('🔴 ответ до мишени и второй ответ не засчитываются', () {
    var now = 0;
    final g = AntGame(level: 1, rnd: Random(1), nowMs: () => now, trialsOverride: 2);
    g.begin();
    g.nextTrial();
    expect(g.answer(Direction.left), AntOutcome.miss, reason: 'ответ до мишени');
    expect(g.hits, 0);
    expect(g.errors, 0);
    g.showTarget();
    now += 300;
    expect(g.answer(g.trial!.dir), AntOutcome.hit);
    expect(g.answer(g.trial!.dir), AntOutcome.miss, reason: 'второй ответ в пробе');
    expect(g.hits, 1);
    expect(g.records.length, 1);
  });

  test('🔴 просрочка окна — ошибка', () {
    var now = 0;
    final g = AntGame(level: 1, rnd: Random(1), nowMs: () => now, trialsOverride: 3);
    g.begin();
    while (g.nextTrial()) {
      g.showTarget();
      now += g.params.windowMs + 1;
      expect(g.timeout(), AntOutcome.miss);
    }
    expect(g.errors, 3);
    expect(g.hits, 0);
    expect(g.accuracy, 0);
    expect(g.records, isEmpty);
    expect(g.meanRtMs, isNull, reason: 'среднее без верных проб — прочерк, а не ноль');
  });

  test('🔴 паузы гуляют в пределах разброса уровня и растут с ним', () {
    List<int> pre(int level) {
      final g = AntGame(level: level, rnd: Random(11), nowMs: () => 0);
      return [for (var i = 0; i < 400; i++) g.preDelayMs()];
    }

    final low = pre(1), high = pre(15);
    expect(low.reduce(min), greaterThanOrEqualTo(400));
    expect(low.reduce(max), lessThan(400 + AntLevel.of(1).preJitterMs));
    expect(high.reduce(max), greaterThan(low.reduce(max)), reason: 'разброс не вырос с уровнем');
    expect(low.toSet().length, greaterThan(100), reason: 'пауза почти не гуляет');
  });

  test('🔴 пауза без подсказки длиннее ровно на время подсказки', () {
    // Иначе пробы «без подсказки» шли бы раньше остальных, и alerting мерил бы
    // разницу в МОМЕНТЕ, а не в готовности.
    final g = AntGame(level: 1, rnd: Random(1), nowMs: () => 0);
    final spread = AntLevel.of(1).ctoaVarMs;
    final noCue = [for (var i = 0; i < 400; i++) g.blankMs(CueType.none)];
    final withCue = [for (var i = 0; i < 400; i++) g.blankMs(CueType.center)];
    // ⚠️ Проверяем ГРАНИЦЫ, а не минимум выборки: минимум на четырёх сотнях
    // розыгрышей до нижней границы может и не дойти, и проба падала бы на
    // 302 вместо 300 — то есть на разбросе, а не на правиле.
    expect(noCue.every((x) => x >= 400 && x < 400 + spread), isTrue, reason: 'без подсказки вне [400, ${400 + spread})');
    expect(withCue.every((x) => x >= 300 && x < 300 + spread), isTrue, reason: 'с подсказкой вне [300, ${300 + spread})');
    expect(400 - 300, AntGame.cueMs, reason: 'основания пауз разошлись не на время подсказки');
  });
}
