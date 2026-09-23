import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/choice_rt/model.dart';

/// СВЕРКА «ВЫБОРА-РЕАКЦИИ» С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Эталон выгружен прогоном `frontend/app/games/choice-rt.tsx` и
/// `frontend/src/games/attention/hick.ts` в `test/fixtures/choicert-reference.json`:
/// levelParams L1…L15, направленияБлока, nextStim на заданной очереди и НАКЛОН ХИКА
/// на четырёх наборах точек.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/choicert-reference.json').readAsStringSync()) as Map<String, dynamic>;
  });

  test('🔴 доля нейтралей и границы окна — те же константы, что в живом коде', () {
    expect(neutralRate, ref['neutralRate']);
    expect(choiceRtWindowFloorMs, ref['windowFloorMs']);
    expect(choiceRtWindowStartMs, ref['windowStartMs']);
  });

  test('🔴 лестница уровней совпадает с эталоном по всем полям', () {
    for (final row in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final l = ChoiceRtLevel.of(row['level'] as int);
      final at = 'L${row['level']}';
      expect(l.trials, row['trials'], reason: '$at: объём проб');
      expect(l.windowMs, row['windowMs'], reason: '$at: окно ответа');
      expect(l.glyph.name, row['glyph'], reason: '$at: начертание знака');
      expect(l.dirs.map((d) => d.name).toList(), (row['dirs'] as List).cast<String>(), reason: '$at: направления');
      expect(l.blocks, (row['hickBlocks'] as List).cast<int>(), reason: '$at: блоки Хика');
    }
  });

  test('🔴 окно спускается ровно до пола на L15, и ни одна ступень не встаёт раньше', () {
    expect(ChoiceRtLevel.of(15).windowMs, choiceRtWindowFloorMs);
    for (var l = 2; l <= 15; l++) {
      final a = ChoiceRtLevel.of(l - 1).windowMs;
      final b = ChoiceRtLevel.of(l).windowMs;
      expect(b < a, isTrue, reason: 'L$l: окно не сузилось — ступень мёртвая по этой оси');
    }
  });

  test('🔴 наборы направлений блока совпадают с эталоном', () {
    for (final row in (ref['blocks'] as List).cast<Map<String, dynamic>>()) {
      expect(dirsForBlock(row['n'] as int).map((d) => d.name).toList(),
          (row['dirs'] as List).cast<String>(), reason: 'блок ${row['n']}');
    }
    // Края: меньше двух и больше четырёх не бывает.
    expect(dirsForBlock(1).length, 2);
    expect(dirsForBlock(9).length, 4);
  });

  test('🔴 раздача проб совпадает с живым TS — и по числу взятых случайных', () {
    // ⚠️ На нейтрали функция берёт ОДНО число, иначе ДВА. Эталон хранит реально
    // взятые числа, поэтому проба ловит и лишний, и недостающий розыгрыш.
    for (final row in (ref['stims'] as List).cast<Map<String, dynamic>>()) {
      final taken = (row['взятые'] as List).cast<num>().map((e) => e.toDouble()).toList();
      var i = 0;
      final got = nextStim(dirsForBlock(4), () => taken[i++]);
      expect(i, taken.length, reason: 'взято розыгрышей ${taken.length}, а функция взяла $i');
      expect(got?.name ?? 'neutral', row['stim'], reason: 'раздача при $taken');
    }
  });

  test('🔴 ровно 0,15 — уже НЕ нейтраль: сравнение строгое', () {
    expect(nextStim(dirsForBlock(2), _queue([0.1499])), isNull);
    expect(nextStim(dirsForBlock(2), _queue([0.15, 0.0])), ChoiceDirection.left);
  });

  test('🔴 наклон Хика считается как в живом модуле, включая «мало точек — пусто»', () {
    for (final row in (ref['slopes'] as List).cast<Map<String, dynamic>>()) {
      final points = (row['points'] as List)
          .map((p) => HickPoint((p as Map)['n'] as int, p['rt'] as int))
          .toList();
      final want = row['out'] as Map<String, dynamic>;
      final got = hickSlope(points);
      expect(got.slopeMsPerBit, want['slopeMsPerBit'], reason: 'наклон при ${points.length} точках');
      expect(got.interceptMs, want['interceptMs'], reason: 'отрезок при ${points.length} точках');
      expect(got.distinctN, want['distinctN']);
      expect(got.trials, want['trials']);
      expect(got.byN.map((m) => {'n': m.n, 'meanRt': m.meanRt, 'trials': m.trials}).toList(),
          (want['byN'] as List).map((m) => {'n': (m as Map)['n'], 'meanRt': m['meanRt'], 'trials': m['trials']}).toList());
    }
  });

  test('🔴 пусто, а не ноль, когда разных n меньше двух', () {
    final one = hickSlope([const HickPoint(2, 400), const HickPoint(2, 500)]);
    expect(one.slopeMsPerBit, isNull, reason: 'ноль означал бы «перебор бесплатен»');
    expect(one.distinctN, 1);
    expect(hickSlope([]).slopeMsPerBit, isNull);
  });

  test('🔴 блок меняется по номеру пробы, и первый блок — самый малый', () {
    final g = ChoiceRtGame(level: 11, rnd: _Queue([0.9, 0.0, 0.5]), nowMs: () => 0);
    expect(g.params.blocks, [2, 3, 4]);
    final seen = <int>[];
    for (var i = 0; i < g.trialsTotal; i++) {
      g.nextTrial();
      seen.add(g.activeDirs.length);
      g.showStimulus();
      g.timeout();
    }
    expect(seen.first, 2, reason: 'вход в задание — на простом наборе');
    expect(seen.last, 4);
    // 20 проб на три блока → по 7: 2,2,2,2,2,2,2 · 3×7 · 4×6
    expect(seen.where((n) => n == 2).length, 7);
    expect(seen.where((n) => n == 3).length, 7);
    expect(seen.where((n) => n == 4).length, 6);
  });

  test('🔴 на нейтрали молчание — ВЕРНЫЙ ответ, а нажатие — ложная тревога', () {
    final g = ChoiceRtGame(level: 1, rnd: _Queue([0.0, 0.5]), nowMs: () => 0);
    g.begin();
    g.nextTrial();
    expect(g.isNeutral, isTrue);
    g.showStimulus();
    expect(g.timeout(), ChoiceOutcome.heldOnNeutral);
    expect(g.hits, 1, reason: 'удержался — значит ответил верно');
    expect(g.correctRejections, 1);
    expect(g.errors, 0);

    final g2 = ChoiceRtGame(level: 1, rnd: _Queue([0.0, 0.5]), nowMs: () => 0);
    g2.begin();
    g2.nextTrial();
    g2.showStimulus();
    expect(g2.answer(ChoiceDirection.left), ChoiceOutcome.falseAlarm);
    expect(g2.falseAlarms, 1);
    expect(g2.errors, 1);
    expect(g2.hits, 0);
  });

  test('🔴 точка наклона берётся только с ВЕРНОГО ответа на направление', () {
    var clock = 0;
    final g = ChoiceRtGame(
      level: 1,
      // проба 1: направление left (0.9 → не нейтраль, 0.0 → left); проба 2: то же
      rnd: _Queue([0.9, 0.0, 0.5, 0.9, 0.0, 0.5, 0.0, 0.5]),
      nowMs: () => clock,
    );
    g.begin();
    g.nextTrial(); g.showStimulus(); clock += 420; g.answer(ChoiceDirection.left);   // верно
    g.nextTrial(); g.showStimulus(); clock += 900; g.answer(ChoiceDirection.right);  // промах
    g.nextTrial(); g.showStimulus(); clock += 700; g.answer(ChoiceDirection.left);   // нейтраль → ложная тревога
    expect(g.hickPoints.length, 1, reason: 'ни промах, ни нейтраль в наклон не идут');
    expect(g.hickPoints.first.rt, 420);
    expect(g.hickPoints.first.n, 2);
    expect(g.meanRtMs, 420);
  });

  test('🔴 точность считается от полного объёма партии', () {
    final g = ChoiceRtGame(level: 1, rnd: _Queue([0.0, 0.5]), nowMs: () => 0, trialsOverride: 4);
    g.begin();
    g.nextTrial(); g.showStimulus(); g.timeout();   // нейтраль, удержался → верно
    g.nextTrial(); g.showStimulus(); g.timeout();
    expect(g.accuracy, 0.5, reason: '2 верных из четырёх проб партии');
  });

  test('🔴 очки — формулой веб-версии', () {
    var clock = 0;
    final g = ChoiceRtGame(level: 1, rnd: _Queue([0.9, 0.0, 0.5]), nowMs: () => clock);
    g.begin();
    g.nextTrial(); g.showStimulus(); clock += 500; g.answer(ChoiceDirection.left);
    // h·100 − e·50 − среднее·0,1 = 100 − 0 − 50 = 50
    expect(g.score, max(0, (1 * 100 - 0 * 50 - 500 * 0.1).round()));
    expect(g.score, 50);
  });
}

double Function() _queue(List<double> values) {
  var i = 0;
  return () => values[i++ % values.length];
}

class _Queue implements Random {
  _Queue(this.values);
  final List<double> values;
  int i = 0;

  @override
  double nextDouble() => values[i++ % values.length];

  @override
  int nextInt(int max) => (nextDouble() * max).floor();

  @override
  bool nextBool() => nextDouble() < 0.5;
}
