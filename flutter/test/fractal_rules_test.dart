import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fractal/levels.dart';
import 'package:psygames_flutter/games/fractal/rules.dart';

/// 🔴 ФРАКТАЛ СВЕРЯЕТСЯ ЛЕНТОЙ ХОДОВ, А НЕ ОТВЕТАМИ ОДНОЙ ФУНКЦИИ.
///
/// Правило здесь — не «можно ли цифру», а что ход ТЯНЕТ ЗА СОБОЙ: дочерняя, добранная
/// до порога, открывается и отправляет цифру наверх; ход в клетку-портал ложится сразу
/// в две сетки и может открыть обе; отмена обязана снять всё это вместе.
///
/// Эталон — 38 шагов живого TS (`test/fixtures/fractal-reference.json`): после каждого
/// хода записаны корень, девять дочерних, признаки открытия, зеркало и откат. Наш порт
/// проигрывает ту же ленту и обязан совпасть ПОКЛЕТОЧНО на каждом шаге.
void main() {
  final data = jsonDecode(File('test/fixtures/fractal-reference.json').readAsStringSync())
      as Map<String, Object?>;
  final steps = (data['steps'] as List).cast<Map<String, Object?>>();
  final game = (data['партия'] as Map).cast<String, Object?>();
  final ladder = (data['ladder'] as List).cast<Map<String, Object?>>();

  FractalPuzzle build() => puzzleFromJson({
        'level': game['level'],
        'root': game['root'],
        'children': game['children'],
        'portals': game['portals'],
      });

  test('есть что сверять: партия, лента ходов и лестница', () {
    expect(steps.length, greaterThan(30), reason: 'шагов в эталоне: ${steps.length}');
    expect(ladder.length, fractalMaxLevel);
    expect((game['portals'] as List).length, greaterThan(0), reason: 'нужен портал в эталоне');
    expect((game['children'] as List).length, 9);
  });

  test('🔴 кормящие клетки и центр: девять адресов совпадают с TS', () {
    final cells = (data['feedCells'] as List)
        .map((e) => (e as List).map((x) => (x as num).toInt()).toList())
        .toList();
    expect(feedCells().map((e) => e.join(',')).toList(), cells.map((e) => e.join(',')).toList());
    final fc = (data['feedCell'] as List).map((x) => (x as num).toInt()).toList();
    expect(feedCell, fc, reason: 'цифру наверх отдаёт центр дочерней');
  });

  test('🔴 где корень редактируется: 81 ответ совпадает с TS', () {
    final f = build();
    final expected = game['rootEditable'] as String;
    final got = StringBuffer();
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        got.write(rootEditable(f.rootPuzzle, r, c) ? '1' : '0');
      }
    }
    expect(got.toString(), expected);
    // Кормящие клетки пусты и руками не заполняются — иначе игра обходится.
    for (final cell in feedCells()) {
      expect(rootEditable(f.rootPuzzle, cell[0], cell[1]), isFalse,
          reason: 'кормящая клетка ${cell.join(',')} не должна редактироваться');
    }
  });

  test('🔴 порог открытия на старте не взят: подсказки задания не считаются прогрессом', () {
    final f = build();
    final st = startPlayState(f);
    for (var i = 0; i < 9; i++) {
      final ch = f.children[i];
      final n = solvedCount(st.children[i].grid, ch.solution, givenOf(ch.puzzle));
      expect(n, 0, reason: 'дочерняя $i: на старте решено $n клеток');
      expect(isUnlocked(st.children[i].grid, ch.solution, givenOf(ch.puzzle), ch.unlockCells), isFalse);
    }
    expect(rootSolved(st.rootGrid, f.rootSolution), game['rootSolvedНаСтарте'] == true);
  });

  /// 🔴 ГЛАВНАЯ ПРОБА: та же лента, тот же результат на каждом шаге.
  test('🔴 38 шагов живого движка: состояние совпадает поклеточно', () {
    final f = build();
    var state = startPlayState(f);
    final history = <FractalMove>[];
    final diffs = <String>[];

    for (var i = 0; i < steps.length && diffs.length < 6; i++) {
      final s = steps[i];
      final note = s['note'] as String;

      if (note == 'откат') {
        expect(history, isNotEmpty, reason: 'шаг $i: откатывать нечего');
        state = revertMove(state, f, history.removeLast());
      } else {
        final target = (
          child: (s['child'] as num?)?.toInt(),
          r: (s['r'] as num).toInt(),
          c: (s['c'] as num).toInt(),
        );
        final res = playDigit(state, f, target, (s['n'] as num).toInt());
        final accepted = s['принят'] == true;
        if ((res != null) != accepted) {
          diffs.add('шаг $i ($note): TS принял=$accepted, у нас ${res != null}');
          continue;
        }
        if (res != null) {
          state = res.next;
          history.add(res.move);
          if (res.move.unlocked != (s['unlocked'] == true)) {
            diffs.add('шаг $i ($note): открытие TS ${s['unlocked']}, у нас ${res.move.unlocked}');
          }
          final mirror = s['mirror'] as Map<String, Object?>?;
          if ((res.move.mirror != null) != (mirror != null)) {
            diffs.add('шаг $i ($note): зеркало TS ${mirror != null}, у нас ${res.move.mirror != null}');
          } else if (mirror != null && res.move.mirror != null) {
            final m = res.move.mirror!;
            if (m.child != (mirror['child'] as num).toInt() ||
                m.r != (mirror['r'] as num).toInt() ||
                m.c != (mirror['c'] as num).toInt() ||
                m.unlocked != (mirror['unlocked'] == true)) {
              diffs.add('шаг $i: зеркало разошлось — TS $mirror, у нас '
                  '(${m.child},${m.r},${m.c},${m.unlocked})');
            }
          }
        }
      }

      final after = (s['after'] as Map).cast<String, Object?>();
      if (encode81(state.rootGrid) != after['root']) {
        diffs.add('шаг $i ($note): корень разошёлся');
      }
      final done = state.children.map((c) => c.done ? '1' : '0').join();
      if (done != after['done']) {
        diffs.add('шаг $i ($note): открытые сетки TS ${after['done']}, у нас $done');
      }
      final kids = (after['kids'] as List).cast<String>();
      for (var k = 0; k < 9; k++) {
        if (encode81(state.children[k].grid) != kids[k]) {
          diffs.add('шаг $i ($note): дочерняя $k разошлась');
          break;
        }
      }
    }

    expect(diffs, isEmpty, reason: diffs.take(6).join(' · '));
  });

  /// ⚠️ Отдельно — то, ради чего лента вообще писалась: в ней ЕСТЬ открытие, зеркало и
  /// отказ. Лента без этих событий проверяла бы только переписывание клеток.
  test('🔴 лента разборчива: в ней есть открытие, зеркало портала и отказ хода', () {
    final unlocked = steps.where((s) => s['unlocked'] == true).length;
    final mirrors = steps.where((s) => s['mirror'] != null).length;
    final refused = steps.where((s) => s.containsKey('принят') && s['принят'] != true).length;
    final reverts = steps.where((s) => s['note'] == 'откат').length;
    expect(unlocked, greaterThan(0), reason: 'открытий в ленте: $unlocked');
    expect(mirrors, greaterThan(0), reason: 'зеркал портала: $mirrors');
    expect(refused, greaterThan(0), reason: 'отказов: $refused (подсказка, кормящая, та же цифра)');
    expect(reverts, greaterThan(0), reason: 'откатов: $reverts');
  });

  test('🔴 отмена открывающего хода забирает цифру из корня обратно', () {
    final f = build();
    var state = startPlayState(f);
    final ch = f.children[0];
    final history = <FractalMove>[];

    // Добираем дочернюю 0 до порога — в этот момент корень получает цифру снизу.
    var filled = 0;
    for (var r = 0; r < 9 && filled <= ch.unlockCells; r++) {
      for (var c = 0; c < 9 && filled <= ch.unlockCells; c++) {
        if (ch.puzzle[r][c] != 0) continue;
        final res = playDigit(state, f, (child: 0, r: r, c: c), ch.solution[r][c]);
        if (res == null) continue;
        state = res.next;
        history.add(res.move);
        filled++;
      }
    }
    final fed = ch.feedsCell;
    expect(state.children[0].done, isTrue, reason: 'порог ${ch.unlockCells} взят');
    expect(state.rootGrid[fed[0]][fed[1]], ch.solution[feedCell[0]][feedCell[1]],
        reason: 'цифра ушла наверх');

    // Отменяем ровно тот ход, что открыл: корень обязан опустеть, а сетка закрыться.
    final opener = history.lastWhere((m) => m.unlocked);
    while (history.isNotEmpty) {
      final m = history.removeLast();
      state = revertMove(state, f, m);
      if (identical(m, opener)) break;
    }
    expect(state.children[0].done, isFalse, reason: 'сетка закрылась обратно');
    expect(state.rootGrid[fed[0]][fed[1]], 0,
        reason: 'цифру, которую нечем подтвердить, в корне не оставляют');
  });
}
