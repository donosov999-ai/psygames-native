import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/iowa/model.dart';

/// СВЕРКА IGT С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Эталон выгружен прогоном `frontend/app/games/iowa.tsx` (VER 2) в
/// `test/fixtures/iowa-reference.json`: лестница L1…L15, выигрыши колод,
/// расписание потерь и нетто за десять карт.
Deck _deck(String s) => switch (s) {
      'A' => Deck.a,
      'B' => Deck.b,
      'C' => Deck.c,
      _ => Deck.d,
    };

void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/iowa-reference.json').readAsStringSync()) as Map<String, dynamic>;
  });

  test('🔴 выплаты колод — канон Бехары, побайтово', () {
    final win = (ref['win'] as Map).cast<String, num>();
    final loss = (ref['lossPattern'] as Map).cast<String, List<dynamic>>();
    for (final e in win.entries) {
      expect(deckWin[_deck(e.key)], e.value, reason: 'колода ${e.key}: выигрыш');
    }
    for (final e in loss.entries) {
      expect(deckLossPattern[_deck(e.key)], e.value.cast<int>(), reason: 'колода ${e.key}: расписание потерь');
    }
    expect(iowaMaxLevel, ref['maxLevel']);
  });

  test('🔴 нетто за десять карт: A и B минус 250, C и D плюс 250', () {
    final want = (ref['нетто за 10 карт'] as Map).cast<String, num>();
    for (final d in Deck.values) {
      final net = deckWin[d]! * 10 + deckLossPattern[d]!.reduce((a, b) => a + b);
      expect(net, want[d.name.toUpperCase()], reason: 'колода $d: нетто $net');
    }
    // Проверка смысла, а не только чисел: выгодные колоды — ровно C и D.
    for (final d in Deck.values) {
      final net = deckWin[d]! * 10 + deckLossPattern[d]!.reduce((a, b) => a + b);
      expect(net > 0, advantageousDecks.contains(d), reason: 'колода $d причислена не к той половине');
    }
  });

  test('🔴 частота потерь: A и C — пять из десяти, B и D — одна', () {
    final want = (ref['карт с потерей из 10'] as Map).cast<String, num>();
    for (final d in Deck.values) {
      final n = deckLossPattern[d]!.where((x) => x != 0).length;
      expect(n, want[d.name.toUpperCase()], reason: 'колода $d: карт с потерей $n');
    }
    // ⚠️ Пара A/B и пара C/D различаются ТОЛЬКО частотой потерь при одинаковом
    // нетто — в этом и весь смысл методики. Уравняй частоты, и проба перестанет
    // различать «боится редкой крупной потери» и «боится частых мелких».
    expect(deckLossPattern[Deck.a]!.where((x) => x != 0).length,
        isNot(deckLossPattern[Deck.b]!.where((x) => x != 0).length));
    expect(deckLossPattern[Deck.c]!.where((x) => x != 0).length,
        isNot(deckLossPattern[Deck.d]!.where((x) => x != 0).length));
  });

  test('🔴 лестница совпадает с эталоном и зажата с обеих сторон', () {
    for (final row in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final l = IowaLevel.of(row['level'] as int);
      expect(l.feedbackDelayMs, row['feedbackDelayMs'], reason: 'L${row['level']}: задержка');
      expect(l.condition, (row['condition'] as Map).cast<String, Object?>(), reason: 'L${row['level']}: условие');
    }
    final edge = (ref['граничные уровни levelParams'] as Map).cast<String, dynamic>();
    // ⚠️ Уровень приходит из хранилища и бывает и нулём, и числом за потолком:
    // отрицательная или растущая без края задержка сломала бы партию молча.
    expect(IowaLevel.of(0).feedbackDelayMs, (edge['0'] as Map)['feedbackDelayMs']);
    expect(IowaLevel.of(16).feedbackDelayMs, (edge['16'] as Map)['feedbackDelayMs']);
    expect(IowaLevel.of(100).feedbackDelayMs, (edge['100'] as Map)['feedbackDelayMs']);
    expect(IowaLevel.of(1).feedbackDelayMs, 0);
    expect(IowaLevel.of(15).feedbackDelayMs, 700);
  });

  test('🔴 потери идут ПО РАСПИСАНИЮ колоды, а не случайно', () {
    final g = IowaGame(level: 1, trials: 40);
    g.begin();
    // Берём двадцать карт из B: крупная потеря обязана прийти на шестой и
    // шестнадцатой, и больше нигде.
    final losses = <int>[];
    for (var i = 0; i < 20; i++) {
      final p = g.pick(Deck.b)!;
      losses.add(p.loss);
      g.revealPending();
      g.closeTrial();
    }
    expect(losses.where((x) => x != 0).length, 2);
    expect(losses[5], -1250);
    expect(losses[15], -1250);
    // Банк за 20 карт колоды B: 20·100 − 2500 = −500 от старта.
    expect(g.bank, g.startBank - 500);
  });

  test('🔴 счётчик колоды свой у каждой: расписания не мешаются', () {
    final g = IowaGame(level: 1, trials: 40);
    g.begin();
    // Чередуем A и C: если счётчик общий, расписание поедет у обеих.
    final a = <int>[], c = <int>[];
    for (var i = 0; i < 10; i++) {
      a.add(g.pick(Deck.a)!.loss);
      g.revealPending();
      g.closeTrial();
      c.add(g.pick(Deck.c)!.loss);
      g.revealPending();
      g.closeTrial();
    }
    expect(a, deckLossPattern[Deck.a]);
    expect(c, deckLossPattern[Deck.c]);
  });

  test('🔴 расписание ЗАЦИКЛИВАЕТСЯ по десять карт, а не кончается', () {
    final g = IowaGame(level: 1, trials: 100);
    g.begin();
    final losses = <int>[];
    for (var i = 0; i < 30; i++) {
      losses.add(g.pick(Deck.a)!.loss);
      g.revealPending();
      g.closeTrial();
    }
    expect(losses.sublist(0, 10), deckLossPattern[Deck.a]);
    expect(losses.sublist(10, 20), deckLossPattern[Deck.a]);
    expect(losses.sublist(20, 30), deckLossPattern[Deck.a]);
  });

  test('🔴 замок: второе нажатие до закрытия хода не засчитывается', () {
    final g = IowaGame(level: 15, trials: 40);
    g.begin();
    expect(g.pick(Deck.c), isNotNull);
    // ⚠️ Замок ОТДЕЛЬНО от показа исхода: с задержкой 700 мс отклика ещё нет, и
    // проверка «виден ли отклик» пропустила бы нажатия насквозь — можно было бы
    // натыкать несколько карт за один ход.
    expect(g.locked, isTrue);
    expect(g.pending, isNotNull);
    expect(g.pick(Deck.a), isNull, reason: 'второе нажатие прошло сквозь замок');
    expect(g.picks.length, 1);
    g.revealPending();
    expect(g.pick(Deck.a), isNull, reason: 'нажатие прошло, пока виден отклик');
    g.closeTrial();
    expect(g.locked, isFalse);
    expect(g.pick(Deck.a), isNotNull);
  });

  test('🔴 банк двигается ВМЕСТЕ с показом исхода, а не при нажатии', () {
    final g = IowaGame(level: 15, trials: 40);
    g.begin();
    final before = g.bank;
    g.pick(Deck.b);
    expect(g.bank, before, reason: 'банк прыгнул до обратной связи и выдал исход');
    g.revealPending();
    expect(g.bank, before + 100);
    // ⚠️ Повторный показ банк НЕ двигает. Без этой строки подмена «показывать
    // сколько угодно раз» проходила: в партии экран зовёт показ ровно один раз,
    // и уехавший банк вылез бы только на живом человеке с двойным кадром.
    g.revealPending();
    g.revealPending();
    expect(g.bank, before + 100, reason: 'повторный показ увёл банк');
    expect(g.revealed, isTrue);
  });

  test('🔴 доля выгодных считается ДОЛЕЙ, а не разностью счётов', () {
    // Одинаковое поведение при разной длине партии обязано дать одну долю.
    List<IowaPick> make(int n) => [
          for (var i = 0; i < n; i++)
            IowaPick(deck: i % 4 == 0 ? Deck.a : Deck.c, win: 50, loss: 0),
        ];
    final short = summarize(make(40), 2000);
    final long = summarize(make(100), 2000);
    expect(short.advShare, long.advShare, reason: 'доля поехала от длины партии');
    // Разность счётов при этом РАЗНАЯ — ради этого доля и заведена.
    expect(short.advantageous - short.disadvantageous,
        isNot(long.advantageous - long.disadvantageous));
    expect(short.advShare, 0.5, reason: '30 выгодных против 10 на сорока картах');
  });

  test('🔴 последний блок — ровно двадцать карт с конца', () {
    final picks = [
      for (var i = 0; i < 60; i++)
        IowaPick(deck: i < 40 ? Deck.a : Deck.c, win: 50, loss: 0),
    ];
    final r = summarize(picks, 2000);
    // По последнему блоку видно, научился ли человек к концу партии.
    expect(r.lastBlockAdv, 20);
    expect(r.advantageous, 20);
    expect(r.nTrials, 60);
    // Короткая партия: блок не может быть длиннее самой партии.
    final short = summarize(picks.sublist(0, 12), 2000);
    expect(short.lastBlockAdv, 0);
    expect(short.nTrials, 12);
  });

  test('🔴 пустая партия не делит на ноль', () {
    final r = summarize(const [], 2000);
    expect(r.advShare, 0.0);
    expect(r.nTrials, 0);
    expect(r.lastBlockAdv, 0);
  });

  test('🔴 партия кончается ровно на заданном числе карт', () {
    final g = IowaGame(level: 1, trials: 40);
    g.begin();
    var taken = 0;
    while (!g.finished) {
      expect(g.pick(Deck.d), isNotNull);
      g.revealPending();
      g.closeTrial();
      taken++;
      expect(taken, lessThanOrEqualTo(40), reason: 'партия не кончилась на сороковой карте');
    }
    expect(taken, 40);
    expect(g.pick(Deck.d), isNull, reason: 'после конца партии выдалась ещё карта');
    // Колода D: за 40 карт 40·50 − 4·250 = 1000.
    expect(g.bank, g.startBank + 1000);
    expect(g.result.advantageous, 40);
    expect(g.result.advShare, 1.0);
  });
}
