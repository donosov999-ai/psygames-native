import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/rules.dart';

/// 🔴 ПРАВИЛА СУДОКУ СОВПАДАЮТ С ЖИВЫМ TS, А НЕ «ПОХОЖИ НА НЕГО».
///
/// Эталоны выгружены прогоном нынешней веб-версии (`sudoku-core.ts`, функция `isValid`)
/// и лежат в `test/fixtures/sudoku-rules-reference.json`: 16 вариантов, у каждого своя
/// геометрия (регионы, термометры, стрелки, клетки-суммы, знаки, подсказки небоскрёбов)
/// и по 40 случаев «поставить цифру в клетку» с ответом движка. Половина случаев —
/// цифра из решения, половина — соседняя, то есть заведомо нарушающая правило.
///
/// ⚠️ Проверять перенос ТОЙ ЖЕ формулой, которой переносил, нельзя: такая проба зелёная
/// всегда. Поэтому здесь сравнение с чужим ответом, посчитанным ДО переноса.
void main() {
  final file = File('test/fixtures/sudoku-rules-reference.json');
  final data = jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
  final boards = (data['boards'] as List).cast<Map<String, Object?>>();
  final ladder = (data['ladder'] as List).cast<Map<String, Object?>>();

  test('есть что сверять: 16 вариантов, 640 случаев, лестница на 92 ступени', () {
    expect(boards.length, 16);
    expect(ladder.length, 92);
    final cases = boards.fold<int>(0, (s, b) => s + (b['cases'] as List).length);
    expect(cases, 640);
  });

  test('🔴 эталоны разборчивы: законных и незаконных ходов примерно поровну', () {
    var ok = 0, bad = 0;
    for (final b in boards) {
      for (final cs in (b['cases'] as List).cast<Map<String, Object?>>()) {
        if (cs['ok'] == true) { ok++; } else { bad++; }
      }
    }
    // Если бы все случаи были одного знака, проба ловила бы только половину поломок.
    expect(ok, greaterThan(100), reason: 'законных ходов слишком мало');
    expect(bad, greaterThan(100), reason: 'незаконных ходов слишком мало');
  });

  for (final board in boards) {
    final variant = board['variant'] as String;
    test('🔴 «$variant»: ответ переноса совпадает с живым TS на всех случаях', () {
      final n = (board['n'] as num).toInt();
      final br = (board['br'] as num).toInt();
      final bc = (board['bc'] as num).toInt();
      final grid = (board['grid'] as List)
          .map((row) => (row as List).cast<num>().map((x) => x.toInt()).toList())
          .toList();
      final geometry = BoardGeometry.fromJson((board['extras'] as Map).cast<String, Object?>());

      final wrong = <String>[];
      for (final cs in (board['cases'] as List).cast<Map<String, Object?>>()) {
        final r = (cs['r'] as num).toInt();
        final c = (cs['c'] as num).toInt();
        final val = (cs['val'] as num).toInt();
        final expected = cs['ok'] == true;

        final was = grid[r][c];
        grid[r][c] = 0;                       // ставим в пустую клетку, как делает игрок
        final got = isValid(grid, r, c, val, n, br, bc, variant: variant, geometry: geometry);
        grid[r][c] = was;

        if (got != expected) wrong.add('($r,$c)=$val ждали $expected, получили $got');
      }
      expect(wrong, isEmpty, reason: '$variant: ${wrong.take(5).join(' · ')}');
    });
  }

  test('небоскрёбы: видимость и неполный ряд считаются как в TS', () {
    expect(visibleCount([1, 2, 3, 4]), 4);
    expect(visibleCount([4, 3, 2, 1]), 1);
    expect(visibleCount([2, 1, 4, 3]), 2);
    // Неполный ряд: подсказка проходит, пока попадает в границы «видно сейчас…+пустые».
    // Ряд [2,_,_,3]: видно уже два, пустых две — значит подсказка от 2 до 4 законна,
    // а 1 и 5 — нет. (Первая редакция пробы ждала здесь «нельзя» на четвёрке: ошибка была
    // в ожидании, а не в переносе — TS отвечает так же.)
    expect(towersLineOk([2, 0, 0, 3], 2), isTrue);
    expect(towersLineOk([2, 0, 0, 3], 4), isTrue);
    expect(towersLineOk([2, 0, 0, 3], 5), isFalse);
    expect(towersLineOk([2, 0, 0, 3], 1), isFalse);
    expect(towersLineOk([1, 2, 3, 4], 4), isTrue);
    expect(towersLineOk([1, 2, 3, 4], 3), isFalse);
    expect(towersLineOk([1, 2, 3, 4], 0), isTrue, reason: 'нет подсказки — нет ограничения');
  });

  test('дополнительные зоны «гипера» — те же четыре квадрата', () {
    expect(inHyper(0, 0), isNull);
    expect(inHyper(1, 1), [1, 1]);
    expect(inHyper(3, 3), [1, 1]);
    expect(inHyper(6, 6), [5, 5]);
    expect(inHyper(4, 4), isNull, reason: 'середина между зонами');
  });
}
