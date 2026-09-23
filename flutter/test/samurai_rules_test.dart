import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/samurai/rules.dart';

/// 🔴 ПРАВИЛА САМУРАЯ СОВПАДАЮТ С ЖИВЫМ TS, А НЕ «ПОХОЖИ НА НЕГО».
///
/// Эталоны выгружены прогоном нынешней веб-версии (`app/games/sudoku-samurai.tsx`) и
/// лежат в `test/fixtures/samurai-reference.json`: раскладка пяти сеток, лестница из 12
/// ступеней, 400 случаев «поставить цифру» с ответом движка и 57 клеток, размеченных
/// `samuraiCellWrong` на доске с чужими цифрами.
///
/// ⚠️ Сверяется и то, и другое. Проверить один `isValid` мало: экран красит клетки и
/// считает ошибки ДРУГОЙ функцией, и разойтись они могут независимо — в вебе на этой
/// паре уже теряли неверные цифры.
void main() {
  final file = File('test/fixtures/samurai-reference.json');
  final data = jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
  final cases = (data['cases'] as List).cast<Map<String, Object?>>();
  final marks = (data['marks'] as List).cast<Map<String, Object?>>();
  final ladder = (data['ladder'] as List).cast<Map<String, Object?>>();
  final board = (data['board'] as Map).cast<String, Object?>();

  final puzzle = parseSamurai(board['puzzle'] as String);
  final solution = parseSamurai(board['solution'] as String);
  final dirty = parseSamurai(data['dirty'] as String);
  final overlapCases = (data['overlapCases'] as List).cast<Map<String, Object?>>();
  final overlapMarks = (data['overlapMarks'] as List).cast<Map<String, Object?>>();
  final overlapBoard = parseSamurai(data['overlapBoard'] as String);

  test('есть что сверять: 400 случаев хода, разметка и случаи на перекрытиях', () {
    expect(cases.length, 400);
    expect(marks.length, greaterThan(40), reason: 'ошибочных клеток в эталоне: ${marks.length}');
    expect(ladder.length, samuraiMaxLevel);
    // 🔴 Без целевых случаев проба слепа к главному в самурае — см. пробу ниже.
    expect(overlapCases.length, greaterThan(20),
        reason: 'случаев на перекрытиях: ${overlapCases.length}');
    expect(overlapMarks.length, greaterThan(10),
        reason: 'меток на перекрытиях: ${overlapMarks.length}');
  });

  test('🔴 эталоны разборчивы: законных и незаконных ходов примерно поровну', () {
    var ok = 0, bad = 0;
    for (final cs in cases) {
      if (cs['ok'] == true) { ok++; } else { bad++; }
    }
    // Односторонние эталоны ловили бы только половину поломок.
    expect(ok, greaterThan(80), reason: 'законных ходов мало: $ok');
    expect(bad, greaterThan(80), reason: 'незаконных ходов мало: $bad');
  });

  test('🔴 геометрия совпадает: 21×21, пять сеток, 369 клеток', () {
    expect(samuraiSize, (data['size'] as num).toInt());
    expect(samuraiCells.length, (data['cells'] as num).toInt());
    final grids = (data['grids'] as List)
        .map((g) => (g as List).map((x) => (x as num).toInt()).toList())
        .toList();
    expect(gridOrigins.map((g) => g.join(',')).toList(), grids.map((g) => g.join(',')).toList());
    // Углы центральной сетки принадлежат двум сеткам сразу — на этом держится вся игра.
    expect(gridsOf(6, 6).length, 2);
    expect(gridsOf(10, 10).length, 1, reason: 'середина центральной — только своя сетка');
    expect(isSamuraiCell(0, 10), isFalse, reason: 'клетки между сетками не существует');
  });

  test('🔴 400 ходов: наш ответ совпадает с ответом живого TS', () {
    final wrong = <String>[];
    for (final cs in cases) {
      final r = (cs['r'] as num).toInt();
      final c = (cs['c'] as num).toInt();
      final val = (cs['val'] as num).toInt();
      final expected = cs['ok'] == true;

      // В вебе клетку перед проверкой освобождают — повторяем то же.
      final was = puzzle[r][c];
      puzzle[r][c] = 0;
      final got = isValid(puzzle, r, c, val);
      puzzle[r][c] = was;

      if (got != expected) wrong.add('($r,$c)=$val: TS $expected, у нас $got');
    }
    expect(wrong, isEmpty, reason: '${wrong.length} расхождений · ${wrong.take(5).join(' · ')}');
  });

  test('🔴 разметка ошибочных клеток совпадает: и какие, и почему', () {
    final expected = {
      for (final m in marks)
        '${(m['r'] as num).toInt()},${(m['c'] as num).toInt()}':
            (dup: m['duplicate'] == true, wrong: m['wrongValue'] == true),
    };

    final got = <String, ({bool dup, bool wrong})>{};
    for (final cell in samuraiCells) {
      final w = cellWrong(dirty, solution, cell[0], cell[1]);
      if (w.error) got['${cell[0]},${cell[1]}'] = (dup: w.duplicate, wrong: w.wrongValue);
    }

    expect(got.keys.toSet(), expected.keys.toSet(),
        reason: 'у TS ${expected.length} ошибочных клеток, у нас ${got.length}');
    final reasons = <String>[];
    for (final e in expected.entries) {
      final ours = got[e.key];
      if (ours == null) continue;
      if (ours.dup != e.value.dup || ours.wrong != e.value.wrong) {
        reasons.add('${e.key}: TS дубль=${e.value.dup}/не та=${e.value.wrong}, '
            'у нас дубль=${ours.dup}/не та=${ours.wrong}');
      }
    }
    expect(reasons, isEmpty, reason: reasons.take(5).join(' · '));
  });

  test('🔴 верная цифра ошибкой не считается — иначе экран красит всю доску', () {
    var checked = 0;
    for (final cell in samuraiCells) {
      final r = cell[0], c = cell[1];
      if (puzzle[r][c] != 0) continue;
      final grid = [for (final row in puzzle) [...row]];
      grid[r][c] = solution[r][c];
      expect(cellWrong(grid, solution, r, c).error, isFalse,
          reason: 'цифра из решения в ($r,$c) помечена ошибкой');
      checked++;
    }
    expect(checked, greaterThan(100), reason: 'проверено пустых клеток: $checked');
  });

  /// 🔴 ГЛАВНАЯ ПРОБА САМУРАЯ: КЛЕТКА ПЕРЕКРЫТИЯ ДЕРЖИТ ОБЕ СВОИ СЕТКИ.
  ///
  /// Замер 23.09: мутация «смотреть только первую сетку клетки» прошла мимо всех 400
  /// случайных случаев — они зелёные и с ней. Случайная клетка почти всегда лежит в
  /// одной сетке, а на перекрытии нарушение обычно видно и в первой тоже. Здесь случаи
  /// подобраны: цифра законна в ОДНОЙ сетке клетки и незаконна в ДРУГОЙ, поэтому потеря
  /// любой из двух сразу краснеет.
  test('🔴 перекрытия: цифра судится по ОБЕИМ сеткам клетки', () {
    final wrong = <String>[];
    var second = 0;
    for (final cs in overlapCases) {
      final r = (cs['r'] as num).toInt();
      final c = (cs['c'] as num).toInt();
      final val = (cs['val'] as num).toInt();
      final expected = cs['ok'] == true;
      if (cs['onlyIn'] == 'second') second++;

      final was = overlapBoard[r][c];
      final base = [for (final row in overlapBoard) [...row]];
      base[r][c] = 0;
      final got = isValid(base, r, c, val);
      overlapBoard[r][c] = was;

      if (got != expected) {
        wrong.add('($r,$c)=$val мешает только ${cs['onlyIn']}: TS $expected, у нас $got');
      }
    }
    expect(wrong, isEmpty, reason: '${wrong.length} расхождений · ${wrong.take(5).join(' · ')}');
    expect(second, greaterThan(0),
        reason: 'нужны случаи, где мешает именно ВТОРАЯ сетка, иначе проба слепа');
  });

  test('🔴 перекрытия: дубль во второй сетке тоже красит клетку', () {
    final expected = {
      for (final m in overlapMarks)
        '${(m['r'] as num).toInt()},${(m['c'] as num).toInt()}':
            (dup: m['duplicate'] == true, wrong: m['wrongValue'] == true),
    };
    final got = <String, ({bool dup, bool wrong})>{};
    for (final cell in samuraiCells) {
      final w = cellWrong(overlapBoard, solution, cell[0], cell[1]);
      if (w.error) got['${cell[0]},${cell[1]}'] = (dup: w.duplicate, wrong: w.wrongValue);
    }
    expect(got.keys.toSet(), expected.keys.toSet(),
        reason: 'у TS ${expected.length} клеток, у нас ${got.length}');
    final reasons = <String>[];
    for (final e in expected.entries) {
      final ours = got[e.key];
      if (ours != null && ours.dup != e.value.dup) {
        reasons.add('${e.key}: TS дубль=${e.value.dup}, у нас ${ours.dup}');
      }
    }
    expect(reasons, isEmpty, reason: reasons.take(5).join(' · '));
  });

  test('лестница совпадает с TS: прощаемые ошибки и потолок подсказок', () {
    for (final row in ladder) {
      final lv = (row['level'] as num).toInt();
      final p = samuraiLevelParams(lv);
      expect(p.maxErrors, (row['maxErrors'] as num).toInt(), reason: 'ошибки на ступени $lv');
      expect(p.hintMax, (row['hintMax'] as num).toInt(), reason: 'подсказки на ступени $lv');
    }
    // Лестница обязана становиться строже, а не гулять.
    expect(samuraiLevelParams(1).maxErrors, greaterThan(samuraiLevelParams(12).maxErrors));
    expect(samuraiLevelParams(1).hintMax, greaterThan(samuraiLevelParams(12).hintMax));
  });

  test('решённость видна только когда доска сошлась целиком', () {
    expect(isSolved(puzzle, solution), isFalse);
    expect(isSolved(solution, solution), isTrue);
  });
}
