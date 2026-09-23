import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/goods_sort/model.dart';

/// СВЕРКА ПЕРЕНОСА С ЖИВЫМ TS, А НЕ С СОБСТВЕННОЙ ФОРМУЛОЙ.
///
/// Правила «Сортировки товаров» перенесены из `src/games/goods-sort/core/board.ts`.
/// Проверять такой перенос тем же выражением, которым переносил, нельзя — проба
/// была бы зелёной всегда. Поэтому ответы ВЫГРУЖЕНЫ прогоном самого TS:
/// 200 случайных досок с ходом, 80 разборов, тройки, цели, очки и звёзды лежат в
/// `test/fixtures/goods-sort-reference.json`. Dart обязан совпасть с ними до числа.
GoodsBoard _board(Map<String, dynamic> j) => GoodsBoard(
      cells: (j['cells'] as List).map((c) => (c as List).cast<int>()).toList(),
      caps: (j['caps'] as List).cast<int>(),
      jokers: (j['jokers'] as List?)?.cast<bool>(),
      col: (j['col'] as List?)?.cast<int>(),
      ids: (j['ids'] as List?)?.cast<int>(),
      queue: (j['queue'] as List? ?? const [])
          .map((s) => Shelf.fromJson(s as Map<String, dynamic>))
          .toList(),
      back: (j['back'] as List?)?.map((c) => (c as List).cast<int>()).toList(),
    );

Map<String, dynamic> _plain(GoodsBoard b) => {
      'cells': b.cells.map((c) => [...c]).toList(),
      'caps': [...b.caps],
      'jokers': b.jokers?.toList(),
      'col': b.col?.toList(),
      'ids': b.ids?.toList(),
      'queue': b.queue.map((s) => {'cell': [...s.cell], 'cap': s.cap, 'joker': s.joker}).toList(),
      'back': b.back?.map((x) => [...x]).toList(),
    };

Map<String, dynamic> _report(CollapseReport r) => {
      'clearedTypes': r.clearedTypes,
      'clearedIds': r.clearedIds,
      'closedIds': r.closedIds,
      'arrived': r.arrived,
      'revealedIds': r.revealedIds,
    };

void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/goods-sort-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('премиса: эталоны на месте и их есть о чём спрашивать', () {
    expect((ref['moves'] as List).length, 200);
    expect((ref['collapses'] as List).length, 80);
    // Среди ходов обязаны быть и законные, и отказы: иначе сверка проверяла бы
    // одну ветку из двух.
    final legal = (ref['moves'] as List).where((m) => (m as Map)['result'] != null).length;
    expect(legal, greaterThan(20));
    expect(legal, lessThan(200));
  });

  test('🔴 ход, разбор троек и отчёт совпадают с живым TS на 200 досках', () {
    final bad = <String>[];
    for (final raw in ref['moves'] as List) {
      final m = raw as Map<String, dynamic>;
      final board = _board(m['board'] as Map<String, dynamic>);
      final from = m['from'] as int;
      final to = m['to'] as int;
      final strict = m['strict'] == true;

      if (m['canPlaceTo'] != null) {
        final top = board.cells[from].last;
        final got = board.canPlace(to, top, strict);
        if (got != m['canPlaceTo']) bad.add('canPlace $from→$to: TS ${m['canPlaceTo']}, Dart $got');
      }
      if (board.freeNiches() != m['freeNiches']) {
        bad.add('freeNiches: TS ${m['freeNiches']}, Dart ${board.freeNiches()}');
      }
      if (board.isCleared != m['cleared']) {
        bad.add('isCleared: TS ${m['cleared']}, Dart ${board.isCleared}');
      }

      final report = CollapseReport();
      final after = moveTop(board, from, to, strict, report);
      if (m['result'] == null) {
        if (after != null) bad.add('ход $from→$to strict=$strict: TS запретил, Dart разрешил');
        continue;
      }
      if (after == null) {
        bad.add('ход $from→$to strict=$strict: TS сделал, Dart запретил');
        continue;
      }
      final want = jsonEncode(m['result']);
      final got = jsonEncode(_plain(after));
      if (want != got) bad.add('доска после хода $from→$to:\n  TS   $want\n  Dart $got');
      final wantR = jsonEncode(m['report']);
      final gotR = jsonEncode(_report(report));
      if (wantR != gotR) bad.add('отчёт хода $from→$to:\n  TS   $wantR\n  Dart $gotR');
    }
    expect(bad, isEmpty, reason: bad.take(3).join('\n'));
  });

  test('🔴 разбор доски без хода совпадает на 80 досках (столбцы, очередь, задние ряды)', () {
    final bad = <String>[];
    for (final raw in ref['collapses'] as List) {
      final c = raw as Map<String, dynamic>;
      final report = CollapseReport();
      final after = collapseTriples(_board(c['board'] as Map<String, dynamic>), report);
      final want = jsonEncode(c['result']);
      final got = jsonEncode(_plain(after));
      if (want != got) bad.add('разбор:\n  TS   $want\n  Dart $got');
      final wantR = jsonEncode(c['report']);
      final gotR = jsonEncode(_report(report));
      if (wantR != gotR) bad.add('отчёт разбора:\n  TS   $wantR\n  Dart $gotR');
    }
    expect(bad, isEmpty, reason: bad.take(3).join('\n'));
  });

  test('🔴 тройка ищется по содержимому и снимается так же', () {
    for (final raw in ref['triples'] as List) {
      final t = raw as Map<String, dynamic>;
      final cell = (t['cell'] as List).cast<int>();
      expect(tripleIn(cell), t['triple'], reason: 'тройка в $cell');
      if (t['triple'] != null) {
        expect(removeTriple(cell, t['triple'] as int), (t['removed'] as List).cast<int>(),
            reason: 'снятие тройки из $cell');
      }
    }
  });

  test('🔴 цель, победа и провал по ходам считаются как в TS', () {
    for (final raw in ref['goals'] as List) {
      final g = raw as Map<String, dynamic>;
      final cells = (g['cells'] as List).map((c) => (c as List).cast<int>()).toList();
      final goal = Goal.fromJson(g['goal'] as Map<String, dynamic>);
      final at = '${g['goal']} на $cells';
      expect(goalMet(cells, goal), g['goalMet'], reason: 'цель взята: $at');
      final p = goalProgress(cells, goal);
      final want = g['progress'];
      if (want == null) {
        expect(p, isNull, reason: 'прогресс: $at');
      } else {
        expect(p!.done, (want as Map)['done'], reason: 'прогресс done: $at');
        expect(p.total, want['total'], reason: 'прогресс total: $at');
      }
      expect(levelWon(cells, goal), g['wonEmptyQueue'], reason: 'победа при пустой очереди: $at');
      expect(levelWon(cells, goal, queueLength: 1), g['wonWithQueue'],
          reason: 'победа при непустой очереди: $at');
      expect(levelWon(cells, goal, back: [
        [2],
        [],
        [],
      ]), g['wonWithBack'], reason: 'победа при непустом заднем ряде: $at');
      expect(movesExhausted(10, 10, cells, goal), g['exhausted10'], reason: 'ходы кончились: $at');
      expect(movesExhausted(9, 10, cells, goal), g['exhausted9'], reason: 'ход ещё есть: $at');
    }
  });

  test('🔴 перенос ключей скрытости через изъятие совпадает с TS', () {
    // Ключи позиционные, позиции съезжают: в [скрытый, скрытый, видимый] изъятие
    // среднего не имеет права подарить его ключ вставшему на ту позицию видимому.
    final bad = <String>[];
    for (final raw in ref['covered'] as List) {
      final c = raw as Map<String, dynamic>;
      final got = shiftCoveredAfterTake(
        (c['covered'] as List).cast<String>(),
        c['fromCell'] as int,
        c['fromIdx'] as int,
      );
      final want = (c['result'] as List).cast<String>();
      if (jsonEncode(got) != jsonEncode(want)) {
        bad.add('${c['covered']} минус ${c['fromCell']}:${c['fromIdx']}: TS $want, Dart $got');
      }
    }
    expect(bad, isEmpty, reason: bad.take(3).join('\n'));
  });

  test('🔴 вскрытие: перед кем никого не осталось — тот виден', () {
    // Правило одно на обе механики скрытости. Пустую нишу отдельно чистить не
    // надо: у неё len−1 = −1, и любой ключ снимается этим же условием.
    expect(revealUncovered(['0:0', '0:1'], [
      [7, 8],
    ]), ['0:0']);
    expect(revealUncovered(['0:0'], [<int>[]]), isEmpty);
    expect(revealUncovered(['1:0', '1:1'], [
      <int>[],
      [1, 2, 3],
    ]), ['1:0', '1:1']);
  });

  test('🔴 очки за серию троек и звёзды по ходам совпадают', () {
    for (final raw in ref['scores'] as List) {
      final s = raw as Map<String, dynamic>;
      expect(scoreForClears(s['n'] as int), s['score'], reason: 'очки за ${s['n']}');
    }
    for (final raw in ref['stars'] as List) {
      final s = raw as Map<String, dynamic>;
      expect(starsForMoves(s['moves'] as int, s['reference'] as int), s['stars'],
          reason: 'звёзды: ходов ${s['moves']} при эталоне ${s['reference']}');
    }
  });
}
