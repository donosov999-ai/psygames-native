import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/bart/model.dart';

/// СВЕРКА BART С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Эталон выгружен прогоном `frontend/app/games/bart.tsx` (VER 3) в
/// `test/fixtures/bart-reference.json`: лестница L1…L15, пределы пресетов и
/// ЗАМЕР генератора предела шара по 200 000 прогонов на трёх уровнях.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/bart-reference.json').readAsStringSync()) as Map<String, dynamic>;
  });

  test('🔴 лестница и пределы пресетов совпадают с эталоном', () {
    for (final row in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final l = BartLevel.of(row['level'] as int);
      final at = 'L${row['level']}';
      expect(l.balloons, row['balloons'], reason: '$at: шаров');
      expect(l.maxBurst, row['maxBurst'], reason: '$at: предел');
      expect(l.burstSpread, closeTo((row['burstSpread'] as num).toDouble(), 1e-12), reason: '$at: разброс');
    }
    expect(bartMaxLevel, ref['maxLevel']);
    final diff = (ref['maxBurstByDiff'] as Map).cast<String, num>();
    expect(maxBurstByDiff[Difficulty.easy], diff['easy']);
    expect(maxBurstByDiff[Difficulty.medium], diff['medium']);
    expect(maxBurstByDiff[Difficulty.hard], diff['hard']);
    // ⚠️ Норма батареи adj_avg_pumps = 16±5 откалибрована на medium: предел 32,
    // оптимум качать до 16. Сдвинь предел — и норма перестанет значить то же.
    expect(maxBurstByDiff[Difficulty.medium], 32);
  });

  test('🔴 мёртвых переходов НЕТ: третья ось держит лестницу до пятнадцати', () {
    expect((ref['мёртвые переходы'] as List), isEmpty, reason: 'эталон уже содержит дубли');
    for (var l = 2; l <= bartMaxLevel; l++) {
      expect(BartLevel.of(l - 1).condition.toString(), isNot(BartLevel.of(l).condition.toString()),
          reason: 'L$l не отличается от L${l - 1}');
    }
    // Первые две оси упираются раньше: предел на L13, число шаров на L10.
    expect(BartLevel.of(13).maxBurst, BartLevel.of(15).maxBurst);
    expect(BartLevel.of(10).balloons, BartLevel.of(15).balloons);
    expect(BartLevel.of(13).burstSpread, isNot(BartLevel.of(15).burstSpread));
  });

  test('🔴 полы и потолки держатся за границами лестницы', () {
    final edge = (ref['граничные уровни'] as Map).cast<String, dynamic>();
    for (final k in ['0', '16', '40']) {
      final want = (edge[k] as Map).cast<String, dynamic>();
      final l = BartLevel.of(int.parse(k));
      expect(l.balloons, want['balloons'], reason: 'L$k: шаров');
      expect(l.maxBurst, want['maxBurst'], reason: 'L$k: предел');
      expect(l.burstSpread, closeTo((want['burstSpread'] as num).toDouble(), 1e-12), reason: 'L$k: разброс');
    }
    expect(BartLevel.of(40).maxBurst, 128, reason: 'предел не зажат потолком');
    expect(BartLevel.of(40).burstSpread, 0.5, reason: 'разброс не зажат потолком');
  });

  test('🔴 СРЕДНЕЕ предела шара равно maxBurst: третья ось не двигает меру', () {
    // Это главное свойство третьей оси. Сдвинь центр разброса — и adj_avg_pumps
    // поедет вместе с ним, то есть ручка начнёт двигать саму измеряемую величину.
    final want = (ref['замер предела шара'] as Map).cast<String, dynamic>();
    final rnd = Random(20260923);
    const n = 200000;
    for (final entry in [[1, 'L1'], [8, 'L8'], [15, 'L15']]) {
      final level = entry[0] as int;
      final label = entry[1] as String;
      final p = BartLevel.of(level);
      var sum = 0, lo = 1 << 30, hi = -1;
      for (var i = 0; i < n; i++) {
        final c = burstCapForBalloon(p.maxBurst, p.burstSpread, rnd.nextDouble);
        sum += c;
        if (c < lo) lo = c;
        if (c > hi) hi = c;
      }
      final mean = sum / n;
      expect(mean, closeTo((want[label] as num).toDouble(), 0.6), reason: '$label: среднее $mean');
      expect(mean, closeTo(p.maxBurst.toDouble(), 0.6), reason: '$label: среднее разошлось с пределом уровня');
      expect(lo, greaterThanOrEqualTo((want['${label}_min'] as num).toInt() - 1), reason: '$label: низ $lo');
      expect(hi, lessThanOrEqualTo((want['${label}_max'] as num).toInt() + 1), reason: '$label: верх $hi');
    }
  });

  test('🔴 при нулевом разбросе все шары одинаковы, при 0,5 — гуляют вдвое', () {
    final rnd = Random(4);
    final flat = [for (var i = 0; i < 500; i++) burstCapForBalloon(32, 0, rnd.nextDouble)];
    expect(flat.toSet().length, 1, reason: 'на L1 предел обязан быть один на всю партию');
    expect(flat.first, 32);
    final wide = [for (var i = 0; i < 2000; i++) burstCapForBalloon(128, 0.5, rnd.nextDouble)];
    expect(wide.reduce(min), greaterThanOrEqualTo(64));
    expect(wide.reduce(max), lessThanOrEqualTo(192));
    expect(wide.toSet().length, greaterThan(50), reason: 'предел почти не гуляет');
    // Пол 4 держит шар осмысленным даже при огромном разбросе.
    expect(burstCapForBalloon(4, 0.5, () => 0.0), greaterThanOrEqualTo(4));
  });

  test('🔴 лопнувший шар денег НЕ приносит', () {
    final g = BartGame(level: 1, rnd: Random(3));
    g.begin();
    // Качаем, пока не лопнет.
    var out = g.pump();
    while (out == PumpOutcome.grew) {
      out = g.pump();
    }
    expect(out, PumpOutcome.popped);
    expect(g.bank, 0, reason: 'взрыв принёс деньги');
    expect(g.history.single.popped, isTrue);
    expect(g.pending, 0);
    expect(g.pump(), isNull, reason: 'лопнувший шар качается дальше');
    expect(g.cashOut(), isFalse, reason: 'лопнувший шар обналичен');
  });

  test('🔴 взрыв приходит ровно на burstAt, ни раньше, ни позже', () {
    final g = BartGame(level: 5, rnd: Random(11));
    g.begin();
    final at = g.burstAt;
    for (var i = 1; i < at; i++) {
      expect(g.pump(), PumpOutcome.grew, reason: 'нажатие $i из $at лопнуло раньше срока');
      expect(g.pumps, i);
    }
    expect(g.pump(), PumpOutcome.popped, reason: 'нажатие $at не лопнуло');
  });

  test('🔴 обналичивание кладёт в банк ровно число нажатий', () {
    final g = BartGame(level: 15, rnd: Random(6));
    g.begin();
    // Качаем заведомо меньше предела этого шара.
    final safe = (g.burstAt / 2).floor();
    expect(safe, greaterThan(0));
    for (var i = 0; i < safe; i++) {
      expect(g.pump(), PumpOutcome.grew);
    }
    expect(g.pending, safe);
    expect(g.cashOut(), isTrue);
    expect(g.bank, safe);
    expect(g.history.single.popped, isFalse);
    expect(g.history.single.pumps, safe);
    expect(g.cashOut(), isFalse, reason: 'второе обналичивание того же шара');
  });

  test('🔴 нулевое обналичивание не считается шаром', () {
    final g = BartGame(level: 1, rnd: Random(2));
    g.begin();
    expect(g.cashOut(), isFalse, reason: 'шар без единого нажатия засчитан');
    expect(g.history, isEmpty);
    expect(g.bank, 0);
  });

  test('🔴 adj_avg_pumps считается ТОЛЬКО по не лопнувшим шарам', () {
    // В лопнувших число нажатий задано не решением человека, а точкой взрыва:
    // подмешав их, мы мерили бы генератор, а не поведение.
    final m = calcMetrics(const [
      BalloonRecord(pumps: 10, popped: false),
      BalloonRecord(pumps: 14, popped: false),
      BalloonRecord(pumps: 40, popped: true),
      BalloonRecord(pumps: 60, popped: true),
    ], 4);
    expect(m.adjAvgPumps, 12.0);
    // ⚠️ Среднее по ВСЕМ было бы 31 — вдвое с лишним больше.
    expect(m.adjAvgPumps, isNot(31.0));
    expect(m.popRate, 0.5);
    expect(m.popped, 2);
  });

  test('🔴 доля взрывов считается от ЗАДУМАННОГО числа шаров, а не сыгранного', () {
    // Оборванная партия не должна выглядеть безопаснее, чем была.
    final m = calcMetrics(const [
      BalloonRecord(pumps: 5, popped: true),
      BalloonRecord(pumps: 6, popped: false),
    ], 8);
    expect(m.popRate, closeTo(1 / 8, 1e-12));
    expect(m.balloonsPlayed, 2);
  });

  test('🔴 lose-shift: разность «после кэша» и «после взрыва», пустое плечо — 0', () {
    // > 0 означает «после взрыва рискует меньше».
    final m = calcMetrics(const [
      BalloonRecord(pumps: 10, popped: true),
      BalloonRecord(pumps: 4, popped: false), // после взрыва
      BalloonRecord(pumps: 12, popped: false), // после кэша
      BalloonRecord(pumps: 14, popped: false), // после кэша
    ], 4);
    // после взрыва: [4]; после кэша: [12, 14] → 13 − 4 = 9.
    expect(m.loseShift, 9.0);
    // Ни одного взрыва — плеча нет, и мера НЕ выдумывается.
    final noBurst = calcMetrics(const [
      BalloonRecord(pumps: 10, popped: false),
      BalloonRecord(pumps: 12, popped: false),
    ], 2);
    expect(noBurst.loseShift, 0.0);
  });

  test('🔴 проход: не робко И без частых взрывов, порог масштабируется пределом', () {
    // Порог среднего — доля от предела УРОВНЯ: фиксированное число означало бы
    // разное на L1 (предел 16) и L15 (предел 128).
    final g = BartGame(level: 1, rnd: Random(1));
    g.begin();
    expect(g.params.maxBurst, 16);
    // Робко: по одному нажатию на каждый шар — среднее 1 против порога 3,2.
    for (var i = 0; i < g.params.balloons; i++) {
      g.pump();
      if (!g.popped) g.cashOut();
      if (!g.finished) g.newBalloon();
    }
    expect(g.metrics.adjAvgPumps, lessThan(16 * bartMinAdjShare));
    expect(g.passed, isFalse, reason: 'робкая партия засчитана');
  });

  test('🔴 ОБА условия прохода проверяются порознь, и порог масштабируется', () {
    // ⚠️ Партии «робко» и «всё лопнуло» проваливаются при любом пороге и подмен
    // не видят. Нужны расклады, где условия расходятся.
    BalloonRecord cash(int pumps) => BalloonRecord(pumps: pumps, popped: false);
    BalloonRecord pop(int pumps) => BalloonRecord(pumps: pumps, popped: true);

    // 1) L15: предел 128, порог среднего 25,6. Среднее 10 — мало, взрывов нет.
    final timidHigh = BartGame(level: 15, rnd: Random(1));
    timidHigh.begin();
    timidHigh.history
      ..clear()
      ..addAll([for (var i = 0; i < 20; i++) cash(10)]);
    expect(timidHigh.params.maxBurst, 128);
    expect(timidHigh.metrics.adjAvgPumps, 10.0);
    expect(timidHigh.metrics.popRate, 0.0);
    // Фиксированный порог «≥ 3» засчитал бы это проходом.
    expect(10.0 >= 3, isTrue);
    expect(timidHigh.passed, isFalse, reason: 'порог не масштабируется пределом уровня');
    // Тот же средний накач на L1 (предел 16, порог 3,2) — уже проход.
    final sameOnLow = BartGame(level: 1, rnd: Random(1));
    sameOnLow.begin();
    sameOnLow.history
      ..clear()
      ..addAll([for (var i = 0; i < 8; i++) cash(10)]);
    expect(sameOnLow.passed, isTrue, reason: 'на L1 тот же накач обязан проходить');

    // 2) Высокое среднее, но взрывов больше порога 0,6.
    final reckless = BartGame(level: 5, rnd: Random(1));
    reckless.begin();
    final n = reckless.params.balloons;
    reckless.history
      ..clear()
      ..addAll([for (var i = 0; i < 4; i++) cash(40), for (var i = 4; i < n; i++) pop(60)]);
    expect(reckless.metrics.adjAvgPumps, 40.0);
    expect(reckless.metrics.adjAvgPumps, greaterThan(reckless.params.maxBurst * bartMinAdjShare));
    expect(reckless.metrics.popRate, greaterThan(bartMaxPopRate));
    expect(reckless.passed, isFalse, reason: 'порог доли взрывов не смотрится');
  });

  test('🔴 безрассудная партия НЕ проходит даже при высоком среднем', () {  test('🔴 безрассудная партия НЕ проходит даже при высоком среднем', () {
    // Все шары лопнули: adj_avg_pumps равен нулю, доля взрывов 1,0.
    final g = BartGame(level: 5, rnd: Random(8));
    g.begin();
    for (var i = 0; i < g.params.balloons; i++) {
      while (g.pump() == PumpOutcome.grew) {}
      if (!g.finished) g.newBalloon();
    }
    expect(g.metrics.popRate, 1.0);
    expect(g.passed, isFalse, reason: 'партия из одних взрывов засчитана');
  });

  test('🔴 в классике исхода нет и разброса нет', () {
    final g = BartGame(level: 12, useLevels: false, classicDifficulty: Difficulty.medium, rnd: Random(5));
    g.begin();
    expect(g.params.maxBurst, 32);
    expect(g.params.burstSpread, 0, reason: 'разброс — ось лестницы, а лестницы в классике нет');
    expect(g.params.balloons, 15);
    // Даже безупречная партия не «проходит»: исхода нет.
    for (var i = 0; i < 3; i++) {
      for (var k = 0; k < 8; k++) {
        if (g.pump() != PumpOutcome.grew) break;
      }
      if (!g.popped) g.cashOut();
      if (!g.finished) g.newBalloon();
    }
    expect(g.passed, isFalse);
  });

  test('🔴 партия кончается ровно на числе шаров уровня', () {
    final g = BartGame(level: 1, rnd: Random(7));
    g.begin();
    var n = 0;
    while (!g.finished) {
      g.pump();
      if (!g.popped) g.cashOut();
      n++;
      expect(n, lessThanOrEqualTo(g.params.balloons + 1));
      if (!g.finished) g.newBalloon();
    }
    expect(n, g.params.balloons);
    expect(g.pump(), isNull, reason: 'после конца партии шар качается дальше');
  });

  test('🔴 пустая партия не делит на ноль', () {
    final m = calcMetrics(const [], 0);
    expect(m.adjAvgPumps, 0.0);
    expect(m.popRate, 0.0);
    expect(m.loseShift, 0.0);
    expect(m.balloonsPlayed, 0);
  });
}
