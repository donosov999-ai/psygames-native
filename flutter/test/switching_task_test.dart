import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/switching_task/model.dart';

/// СВЕРКА «ПЕРЕКЛЮЧЕНИЯ ЗАДАЧ» С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Эталон выгружен прогоном `frontend/app/games/switching-task.tsx` в
/// `test/fixtures/switching-reference.json`: levelParams L1…L15, makeTrial на
/// заданной очереди случайных вместе с числом взятых розыгрышей и switchCostMs.
StimMode _mode(String s) => switch (s) {
      'num2' => StimMode.num2,
      'num3' => StimMode.num3,
      'letters' => StimMode.letters,
      _ => StimMode.mix,
    };

void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/switching-reference.json').readAsStringSync()) as Map<String, dynamic>;
  });

  test('🔴 доля переключений и потолок помех — те же, что в живом коде', () {
    expect(switchProb, ref['switchProb']);
    // Помехи берутся из общего модуля раздела, поэтому потолок сверяется через
    // уровень: своей константы у игры нет и быть не должно.
    expect(SwitchLevel.of(15).decoys, ref['decoysMax']);
  });

  test('🔴 лестница уровней совпадает с эталоном по всем полям', () {
    for (final row in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final l = SwitchLevel.of(row['level'] as int);
      final at = 'L${row['level']}';
      expect(l.trials, row['trials'], reason: '$at: объём проб');
      expect(l.switchProbability, row['switchProb'], reason: '$at: доля переключений');
      expect(l.windowMs, row['windowMs'], reason: '$at: окно ответа');
      expect(l.decoys, row['decoys'], reason: '$at: помех');
    }
  });

  test('🔴 доля переключений НЕ является осью сложности: 0,5 на всех пятнадцати', () {
    for (var l = 1; l <= switchingMaxLevel; l++) {
      expect(SwitchLevel.of(l).switchProbability, 0.5, reason: 'L$l: доля уехала');
    }
  });

  test('🔴 растут только объём, окно и помехи, и каждая ось доходит до края', () {
    for (var l = 2; l <= switchingMaxLevel; l++) {
      final a = SwitchLevel.of(l - 1);
      final b = SwitchLevel.of(l);
      expect(b.windowMs <= a.windowMs, isTrue, reason: 'L$l: окно выросло');
      expect(b.trials >= a.trials, isTrue, reason: 'L$l: проб стало меньше');
      expect(b.decoys >= a.decoys, isTrue, reason: 'L$l: помех стало меньше');
    }
    final first = SwitchLevel.of(1);
    final last = SwitchLevel.of(switchingMaxLevel);
    expect(first.windowMs, 3400);
    expect(last.windowMs, 1400, reason: 'окно упирается в пол 1400');
    expect(first.trials, 12);
    expect(last.trials, 20);
    expect(first.decoys, 0);
    expect(last.decoys, 4);
  });

  test('🔴 пол окна 1400 мс держится и за потолком лестницы', () {
    // Формула 3400 − (L−1)·145 ушла бы ниже 1400 уже на L15, если снять max().
    expect(SwitchLevel.of(20).windowMs, 1400);
    expect(3400 - (15 - 1) * 145, lessThan(1400), reason: 'пол реально связывает, а не декоративен');
  });

  test('🔴 проба рождается точно как в TS — на той же очереди случайных', () {
    for (final row in (ref['trials'] as List).cast<Map<String, dynamic>>()) {
      final draws = (row['взятые'] as List).cast<num>().map((e) => e.toDouble()).toList();
      var i = 0;
      double rnd() {
        expect(i, lessThan(draws.length), reason: 'взято больше розыгрышей, чем в эталоне');
        return draws[i++];
      }

      final t = makeTrial(_mode(row['mode'] as String), row['level'] as int, row['last'] as int?, rnd);
      final at = '${row['mode']} L${row['level']} last=${row['last']}';
      expect(t.taskIdx, row['taskIdx'], reason: '$at: задача');
      expect(t.num, row['num'], reason: '$at: число');
      expect(t.letter, row['letter'], reason: '$at: буква');
      expect(t.full, row['full'], reason: '$at: что видно на экране');
      expect(t.correctLeft, row['correctLeft'], reason: '$at: верный ответ');
      expect(t.isSwitch, row['isSwitch'], reason: '$at: смена задачи');
      expect(t.decoys, (row['decoys'] as List).cast<String>(), reason: '$at: помехи');
      expect(i, draws.length, reason: '$at: взято розыгрышей $i вместо ${draws.length}');
    }
  });

  test('🔴 цена переключения — разность двух плеч, а не разность со средним', () {
    for (final row in (ref['цены'] as List).cast<Map<String, dynamic>>()) {
      final sw = (row['sw'] as List).cast<int>();
      final rep = (row['rep'] as List).cast<int>();
      expect(switchCostMs(sw, rep), row['cost'], reason: 'sw=$sw rep=$rep');
    }
  });

  test('🔴 цены НЕТ, а не ноль по умолчанию, когда одно из плеч пусто', () {
    // Пустое плечо в эталоне даёт 0 — и это «меры нет», а не «разницы нет».
    expect(switchCostMs(const [], const [700]), 0);
    expect(switchCostMs(const [800], const []), 0);
    // А вот при обоих непустых 0 означает именно равенство плеч.
    expect(switchCostMs(const [700], const [700]), 0);
  });

  test('🔴 правило левой кнопки своё у каждой задачи каждого режима', () {
    // mix: задача 0 — нечётность числа, задача 1 — гласная.
    expect(judgeLeft(StimMode.mix, 0, 3, 'B'), isTrue);
    expect(judgeLeft(StimMode.mix, 0, 4, 'B'), isFalse);
    expect(judgeLeft(StimMode.mix, 1, 4, 'E'), isTrue);
    expect(judgeLeft(StimMode.mix, 1, 3, 'B'), isFalse);
    // num2/num3: задача 1 — «меньше середины», и середина у них РАЗНАЯ.
    expect(midFor(StimMode.num2), 50);
    expect(midFor(StimMode.num3), 500);
    expect(judgeLeft(StimMode.num2, 1, 49, ''), isTrue);
    expect(judgeLeft(StimMode.num2, 1, 50, ''), isFalse, reason: 'ровно середина — НЕ «меньше»');
    expect(judgeLeft(StimMode.num3, 1, 499, ''), isTrue);
    expect(judgeLeft(StimMode.num3, 1, 500, ''), isFalse);
    // ⚠️ Слепая проверка: 49 в num3 тоже «меньше», и на нём подмена середины
    // незаметна. Поэтому выше стоит пара ровно на границе каждого режима.
    expect(judgeLeft(StimMode.num3, 1, 49, ''), isTrue);
    // letters: задача 0 — гласная, задача 1 — первая половина алфавита.
    expect(judgeLeft(StimMode.letters, 0, 0, 'I'), isTrue);
    expect(judgeLeft(StimMode.letters, 0, 0, 'K'), isFalse);
    expect(judgeLeft(StimMode.letters, 1, 0, 'M'), isTrue, reason: 'M включительно');
    expect(judgeLeft(StimMode.letters, 1, 0, 'N'), isFalse);
  });

  test('🔴 партия копит два плеча порознь и считает цену по ним', () {
    var now = 0;
    // ⚠️ Сид задан, а не взят случайный: на неспящем Random бывают партии из
    // одних повторов, и тогда проверка цены молча пропускалась бы. Сид 1 даёт
    // расклад [повтор, повтор, СМЕНА, повтор] — оба плеча непусты всегда.
    final g = SwitchingGame(level: 1, rnd: Random(1), nowMs: () => now, trialsOverride: 4);
    g.begin();
    while (g.nextTrial()) {
      g.showStimulus();
      // Смена задачи «стоит» на 200 мс дороже повтора — ровно это и должна
      // увидеть мера.
      now += g.trial!.isSwitch ? 900 : 700;
      expect(g.answer(g.trial!.correctLeft), SwitchOutcome.hit);
    }
    expect(g.hits, 4);
    expect(g.errors, 0);
    expect(g.switchRts.length, 1, reason: 'на сиде 1 смена ровно одна');
    expect(g.repeatRts.length, 3);
    expect(g.switchCost, 200, reason: 'цена = 900 − 700');
    expect(g.finished, isTrue);
  });

  test('🔴 время реакции идёт от ПОКАЗА стимула, а не от начала пробы', () {
    // Между началом пробы и показом стимула в экране лежит пауза 500 мс. Считай
    // мы оттуда — каждое время выросло бы на неё, а вместе с ним и цена
    // переключения: пауза не зависит от того, сменилась задача или нет, но
    // попадает в оба плеча по-разному, если плечи разной длины.
    var now = 0;
    final g = SwitchingGame(level: 1, rnd: Random(1), nowMs: () => now, trialsOverride: 1);
    g.begin();
    g.nextTrial();
    now += 500; // пауза перед стимулом
    g.showStimulus();
    now += 400; // человек думал 400 мс
    expect(g.answer(g.trial!.correctLeft), SwitchOutcome.hit);
    expect(g.rts.single, 400, reason: 'в время реакции попала пауза перед стимулом');
    expect(g.meanRtMs, 400);
  });

  test('🔴 промах и ошибка не попадают ни в одно плечо', () {
    var now = 0;
    final g = SwitchingGame(level: 1, nowMs: () => now, trialsOverride: 3);
    g.begin();
    g.nextTrial();
    g.showStimulus();
    now += 600;
    expect(g.answer(!g.trial!.correctLeft), SwitchOutcome.wrong);
    g.nextTrial();
    g.showStimulus();
    expect(g.timeout(), SwitchOutcome.miss);
    g.nextTrial();
    g.showStimulus();
    now += 500;
    expect(g.answer(g.trial!.correctLeft), SwitchOutcome.hit);
    expect(g.hits, 1);
    expect(g.errors, 2);
    expect(g.switchRts.length + g.repeatRts.length, 1, reason: 'в плечи попала только верная проба');
    expect(g.rts.length, 1);
  });

  test('🔴 второй ответ в пробе не засчитывается', () {
    var now = 0;
    final g = SwitchingGame(level: 1, nowMs: () => now, trialsOverride: 2);
    g.begin();
    g.nextTrial();
    g.showStimulus();
    now += 500;
    expect(g.answer(g.trial!.correctLeft), SwitchOutcome.hit);
    expect(g.answer(g.trial!.correctLeft), SwitchOutcome.miss, reason: 'повторный тап по пробе');
    expect(g.hits, 1);
    expect(g.errors, 0, reason: 'повтор не стал и ошибкой');
  });

  test('🔴 ответ до показа стимула не засчитывается', () {
    final g = SwitchingGame(level: 1, nowMs: () => 0, trialsOverride: 2);
    g.begin();
    g.nextTrial();
    expect(g.answer(true), SwitchOutcome.miss, reason: 'до showStimulus');
    expect(g.hits, 0);
    expect(g.errors, 0);
  });
}
