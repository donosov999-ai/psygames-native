import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/rules.dart';

/// 🔴 ПРАВИЛА СУДОКУ СОВПАДАЮТ С ЖИВЫМ TS, А НЕ «ПОХОЖИ НА НЕГО».
///
/// Эталоны выгружены прогоном живой веб-версии (`sudoku-core.ts`: `isValid` И `overlayOk`)
/// скриптом `tools/export-sudoku-boards.cjs` и лежат в `test/fixtures/sudoku-rules-reference.json`:
/// по доске на каждый вариант лестницы и режимов, у каждой своя геометрия (регионы,
/// термометры, стрелки, клетки-суммы, знаки, небоскрёбы, метки чётности, точки Кропки,
/// суммы сэндвича, линии шёпота) и по 40 случаев «поставить цифру в клетку» с ответом
/// движка. Половина случаев — цифра из решения, половина — соседняя.
///
/// 🔴 Эталоны 23.09 выгружались без скрипта и без вариантов с показанными подсказками —
/// поэтому выброс чётности, Кропки и сэндвича из разбора натива прошёл эту пробу и уехал
/// в Play 2.56.2 (задача 450c0211). Теперь варианты берутся из лестницы, а проба ниже
/// требует, чтобы каждый вариант лестницы был в эталонах.
///
/// ⚠️ Проверять перенос ТОЙ ЖЕ формулой, которой переносил, нельзя: такая проба зелёная
/// всегда. Поэтому здесь сравнение с чужим ответом, посчитанным ДО переноса.
void main() {
  final file = File('test/fixtures/sudoku-rules-reference.json');
  final data = jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
  final boards = (data['boards'] as List).cast<Map<String, Object?>>();
  final ladder = (data['ladder'] as List).cast<Map<String, Object?>>();

  test('есть что сверять: вариант на каждое правило лестницы и режимов, по 40 ходов, лестница целиком', () {
    // Числа не зашиты: новое правило лестницы обязано приехать в эталоны само (выгрузка).
    final ladderVariants = {for (final l in ladder) l['variant'] as String};
    // Правила, собранные раньше своих ступеней (RULES_AHEAD выгрузки): встанут на лестницу — уйдут отсюда.
    const rulesAhead = {'argyle', 'littlekiller', 'xsums', 'cipher'};
    expect(boards.length, ladderVariants.length + 3 + rulesAhead.difference(ladderVariants).length,
        reason: 'варианты лестницы + killer, unequal, towers + правила впереди лестницы');
    expect({for (final b in boards) b['variant'] as String}, containsAll(rulesAhead));
    expect(ladder.length, greaterThanOrEqualTo(100));
    final cases = boards.fold<int>(0, (s, b) => s + (b['cases'] as List).length);
    expect(cases, boards.length * 40);
  });

  test('🔴 каждый вариант лестницы есть в эталонах — новое правило не проходит мимо пробы', () {
    final have = {for (final b in boards) b['variant'] as String};
    final missing = {for (final l in ladder) l['variant'] as String}.difference(have);
    expect(missing, isEmpty, reason: 'вариантов лестницы нет в эталонах: $missing — перевыгрузи эталоны');
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

  /// ⚠️ Неверную цифру, которую отсекает уже строка или блок, правило варианта не решает —
  /// на таких эталонах проба зелёная и при выключенном правиле (01.10: мутация «шёпот не
  /// проверяется» прошла прежнюю выборку). Сторож: у каждого варианта со своим правилом
  /// есть ходы, где классика «можно», а эталон «нельзя».
  test('🔴 эталоны разборчивы по правилу варианта, а не только по классике', () {
    final weak = <String>[];
    for (final b in boards) {
      final variant = b['variant'] as String;
      if (variant == 'none' || variant == 'jigsaw') continue;   // своего правила сверх блока нет
      // Туман (137–140) правило ДОПУСТИМОСТИ цифр не меняет — он закрывает клетки; самосборка
      // (141–144) блоков не даёт вовсе — области выводит игрок, и её допустимость мягче
      // классики, а не строже. Их эталоны проверяют перенос («ответ совпадает с живым TS»).
      // Клетки Шрёдингера (145–148): цифры 0–9 и клетка-пара — классическая проверка «можно»
      // к ним не применима вовсе; их эталон сверяется своей пробой (sudoku_schrodinger_test).
      if (variant == 'fog' || variant == 'chaos' || variant == 'schrodinger') continue;
      final n = (b['n'] as num).toInt(), br = (b['br'] as num).toInt(), bc = (b['bc'] as num).toInt();
      final grid = (b['grid'] as List).map((row) => (row as List).cast<num>().map((x) => x.toInt()).toList()).toList();
      var byRule = 0;
      for (final cs in (b['cases'] as List).cast<Map<String, Object?>>()) {
        if (cs['ok'] == true) continue;
        final r = (cs['r'] as num).toInt(), c = (cs['c'] as num).toInt(), val = (cs['val'] as num).toInt();
        final was = grid[r][c];
        grid[r][c] = 0;
        if (isValid(grid, r, c, val, n, br, bc)) byRule++;
        grid[r][c] = was;
      }
      if (byRule < 5) weak.add('$variant: $byRule');
    }
    expect(weak, isEmpty, reason: 'мало ходов, решённых правилом варианта: $weak — перевыгрузи эталоны');
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
    // 🔴 Пустая клетка ВПЕРЕДИ закрывает видимые (задача 2ab36958): [_,2,4,1,6,3] при
    // подсказке 2 законен — [5,2,4,1,6,3] даёт ровно 2. Прежняя граница «видно среди
    // заполненных» (здесь 3) этот ряд отвергала.
    expect(towersLineOk([0, 2, 4, 1, 6, 3], 2), isTrue);
    expect(towersLineOk([0, 2, 4, 1, 6, 3], 5), isFalse, reason: 'сверху: видно три + одна пустая');
    expect(towersLineOk([6, 0, 0, 0, 0, 0], 1), isTrue, reason: 'самое высокое первым — видно ровно одно');
    expect(towersLineOk([6, 0, 0, 0, 0, 0], 2), isTrue, reason: 'сверху граница грубая — допускает, не врёт');
  });

  test('дополнительные зоны «гипера» — те же четыре квадрата', () {
    expect(inHyper(0, 0), isNull);
    expect(inHyper(1, 1), [1, 1]);
    expect(inHyper(3, 3), [1, 1]);
    expect(inHyper(6, 6), [5, 5]);
    expect(inHyper(4, 4), isNull, reason: 'середина между зонами');
  });
}
