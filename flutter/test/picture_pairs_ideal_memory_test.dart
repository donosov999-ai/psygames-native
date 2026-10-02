import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/picture_pairs/model.dart';

/// «ПАРНЫЕ КАРТИНКИ» × MindLab «Пары»: эталон идеальной памяти и персеверации (задача cd9685ec,
/// решение Дениса 30.09.2026 — движки MindLab добавляем в разделы нативно).
///
/// 🔴 ЭТАЛОН — ИЗ ДВИЖКА, А НЕ ИЗ DART. `flutter/tools/pairs_ideal_memory_reference.py` гоняет
/// `perfect_memory_moves` движка на его же тасовке (`random.Random(seed)`) — проба сверяет перенос
/// расклад в расклад. Якорь из тестов движка: 8 пар, seed=1 — 12 ходов.
void main() {
  final ref = jsonDecode(File('test/fixtures/pairs-ideal-memory-reference.json').readAsStringSync())
      as Map<String, dynamic>;
  final pairs = (ref['pairs'] as List).cast<Map<String, dynamic>>();
  final triples = (ref['triples'] as List).cast<Map<String, dynamic>>();

  test('🔴 пары: ход в ход с движком MindLab на 100 раскладах; якорь 8 пар, seed=1 — 12 ходов', () {
    final off = <String>[];
    for (final e in pairs) {
      final got = idealMemoryMoves((e['deck'] as List).cast<int>(), 2);
      if (got != e['ideal']) off.add('${e['pairs']} пар, seed ${e['seed']}: $got вместо ${e['ideal']}');
    }
    expect('расхождений: ${off.length}${off.isEmpty ? '' : ' — ${off.take(5).join('; ')}'}', 'расхождений: 0');
    final anchor = pairs.firstWhere((e) => e['pairs'] == 8 && e['seed'] == 1);
    expect(idealMemoryMoves((anchor['deck'] as List).cast<int>(), 2), 12);
  });

  test('🔴 тройки: не хуже Punchline (он известными не добирает) и не быстрее группы за ход', () {
    var saved = 0;
    for (final e in triples) {
      final got = idealMemoryMoves((e['deck'] as List).cast<int>(), 3);
      final naive = e['naive'] as int;
      expect(got, lessThanOrEqualTo(naive), reason: '${e['sets']} троек, seed ${e['seed']}');
      expect(got, greaterThanOrEqualTo(e['sets'] as int), reason: 'больше группы за ход не снять');
      saved += naive - got;
    }
    expect(saved, greaterThan(0), reason: 'добор известными обязан где-то сэкономить ходы');
  });

  test('колода не из целых групп — ошибка с причиной, а не зависание', () {
    expect(() => idealMemoryMoves([0, 1, 2, 3, 0, 1, 2, 3], 4), throwsArgumentError);
  });

  test('эталон считается по раскладу НАЧАЛА: обмены после ошибки его не трогают', () {
    final g = PairsGame(level: 1, deck: [0, 1, 2, 3, 0, 1, 2, 3]);
    final before = idealMemoryMoves([0, 1, 2, 3, 0, 1, 2, 3], 2);
    g.swap(0, 7);
    expect(idealMemoryMoves([for (final c in g.cards) c.symbol], 2), isNot(before),
        reason: 'обмен меняет счёт на новом раскладе — иначе проба ничего не стережёт');
    expect(g.idealMoves, before);
  });

  test('лестница L1…L30: от «группа за ход» и меньше «ход на карту»', () {
    for (var level = 1; level <= 30; level++) {
      final g = PairsGame(level: level, rnd: Random(level));
      expect(g.idealMoves, greaterThanOrEqualTo(g.groups), reason: 'L$level');
      expect(g.idealMoves, lessThan(g.cards.length), reason: 'L$level');
    }
  });

  test('🔴 персеверация — повтор промаха, известного заранее; разведка и первый промах — нет', () {
    // Расклад: 0 1 2 0 1 2 3 3 — четыре пары, уровень 1.
    final g = PairsGame(level: 1, deck: [0, 1, 2, 0, 1, 2, 3, 3]);
    void move(int a, int b) {
      g.tap(a);
      final r = g.tap(b);
      if (r == TapResult.groupMatched) {
        g.settleMatch();
      } else {
        g.settleMiss();
      }
    }

    move(0, 1); // обе новые — промах-разведка
    expect(g.perseverations, 0);
    move(0, 1); // те же две, обе видены — известный промах
    expect(g.perseverations, 1);
    move(0, 2); // 2 новая — снова разведка
    expect(g.perseverations, 1);
    move(1, 4); // пара 1 собрана по памяти
    expect(g.perseverations, 1);
    move(0, 2); // обе видены, картинки разные — персеверация
    expect(g.perseverations, 2);
    move(0, 3); // пара 0 по памяти
    move(2, 5);
    move(6, 7);
    expect(g.isWon, isTrue);
    expect('ходов ${g.moves}, идеальных ${g.idealMoves}, персевераций ${g.perseverations}',
        'ходов 8, идеальных ${idealMemoryMoves([0, 1, 2, 0, 1, 2, 3, 3], 2)}, персевераций 2');
    expect(g.efficiency, g.idealMoves / 8);
  });

  test('обмен карт переносит знание вместе с картой: обмен показан подсветкой', () {
    final g = PairsGame(level: 1, deck: [0, 1, 2, 3, 0, 1, 2, 3]);
    g.tap(0);
    g.tap(1);
    g.settleMiss(); // видены 0 и 1
    g.swap(1, 2); // карта «1» уехала на место 2, на место 1 пришла невиданная «2»
    g.tap(0);
    g.tap(1); // 0 видена, 1 — нет: не персеверация
    g.settleMiss();
    expect(g.perseverations, 0);
    g.tap(0);
    g.tap(2); // 0 и «1» на месте 2 — обе видены, разные
    g.settleMiss();
    expect(g.perseverations, 1);
  });

  test('после возврата к партии знание начинается заново', () {
    final g = PairsGame(level: 1, deck: [0, 1, 2, 3, 0, 1, 2, 3]);
    g.tap(0);
    g.tap(1);
    g.settleMiss();
    final back = pairsRestore(pairsSnapshot(g, free: false, score: 0, elapsed: 3))!.game;
    back.tap(0);
    back.tap(1);
    back.settleMiss();
    expect(back.perseverations, 0, reason: 'за перерыв человек мог забыть');
    expect(back.idealMoves, g.idealMoves, reason: 'расклад тот же — и эталон тот же');
  });
}
