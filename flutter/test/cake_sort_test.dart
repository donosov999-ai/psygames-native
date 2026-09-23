import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cake_sort/layout.dart';
import 'package:psygames_flutter/games/cake_sort/model.dart';

/// СВЕРКА «ТОРТОВ» С ЖИВЫМ TS, А НЕ С СОБСТВЕННОЙ ФОРМУЛОЙ.
///
/// Ответы выгружены прогоном живого TS: 240 ходов (верхним сектором и выбранным
/// видом), 80 схлопываний с очередью, 120 попаданий пальцем, раскладки стола,
/// звёзды и лестница уровней.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/cake-sort-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('премиса: эталоны на месте, и в них есть обе ветки хода', () {
    final moves = ref['moves'] as List;
    expect(moves.length, 240);
    final legal = moves.where((m) => (m as Map)['afterTop'] != null).length;
    expect(legal, greaterThan(20));
    expect(legal, lessThan(240));
    final cleared = (ref['collapses'] as List).where((c) => ((c as Map)['cleared'] as List).isNotEmpty).length;
    expect(cleared, greaterThan(0), reason: 'собранные круги в эталонах обязаны быть');
  });

  test('🔴 ход, схлопывание и очередь совпадают с живым TS на 240 досках', () {
    final bad = <String>[];
    for (final raw in ref['moves'] as List) {
      final m = raw as Map<String, dynamic>;
      final b = CakeBoard.fromJson(m['board'] as Map<String, dynamic>);
      final from = m['from'] as int;
      final to = m['to'] as int;
      final type = m['type'] as int;
      final at = 'ход $from→$to на ${jsonEncode(m['board'])}';
      void same(String name, Object? got, Object? want) {
        if (jsonEncode(got) != jsonEncode(want)) bad.add('$name: TS $want, Dart $got · $at');
      }

      final src = b.plates[from];
      same('можно верхний', src.isNotEmpty && b.canPlace(to, src.last), m['canPlaceTop']);
      same('можно выбранный', src.isNotEmpty && b.canPlace(to, type), m['canPlaceType']);
      same('место', b.roomIn(to), m['room']);
      same('пусто', b.isEmpty(to), m['empty']);
      same('круг собран', b.completeAt(from), m['completeFrom']);
      same('виды в тарелке', b.typesIn(from), m['typesFrom']);
      same('партия сошлась', b.isCleared, m['cleared']);
      same('есть ход', b.hasAnyMove, m['anyMove']);
      same('круги тарелок', [for (var i = 0; i < b.length; i += 1) b.capOf(i)], m['caps']);

      final top = moveTop(b, from, to);
      same('доска после хода верхним', top?.toJson(), m['afterTop']);
      final byType = src.isEmpty ? null : moveType(b, from, type, to);
      same('доска после хода выбранным', byType?.toJson(), m['afterType']);
    }
    expect(bad, isEmpty, reason: '${bad.length} расхождений, первые три:\n${bad.take(3).join('\n')}');
  });

  test('🔴 каскад схлопывания и приход из очереди совпадают (80 досок)', () {
    final bad = <String>[];
    for (final raw in ref['collapses'] as List) {
      final c = raw as Map<String, dynamic>;
      final got = collapse(CakeBoard.fromJson(c['board'] as Map<String, dynamic>));
      if (jsonEncode(got.board.toJson()) != jsonEncode(c['result'])) {
        bad.add('доска:\n  TS   ${jsonEncode(c['result'])}\n  Dart ${jsonEncode(got.board.toJson())}');
      }
      if (jsonEncode(got.cleared) != jsonEncode(c['cleared'])) {
        bad.add('собрано: TS ${c['cleared']}, Dart ${got.cleared}');
      }
    }
    expect(bad, isEmpty, reason: bad.take(3).join('\n'));
  });

  test('🔴 готовый круг — полный и одноцветный СВОЕЙ высоты', () {
    for (final raw in ref['circles'] as List) {
      final c = raw as Map<String, dynamic>;
      final plate = (c['plate'] as List).cast<int>();
      expect(completeIn(plate, c['cap'] as int), c['complete'],
          reason: 'круг $plate при высоте ${c['cap']}');
    }
  });

  test('🔴 раскладка стола совпадает до числа', () {
    final bad = <String>[];
    for (final raw in ref['layouts'] as List) {
      final c = raw as Map<String, dynamic>;
      final l = tableLayout((c['width'] as num).toDouble(), c['cols'] as int);
      void near(String name, double got, num want) {
        if ((got - want).abs() > 1e-9) bad.add('$name при ${c['width']}×${c['cols']}: TS $want, Dart $got');
      }

      near('тарелка', l.plate, c['plate'] as num);
      near('радиус', l.radius, c['radius'] as num);
      near('сектор', l.sector, c['sector'] as num);
      near('дуга', l.sectorOuter, c['sectorOuter'] as num);
      near('радиус торта', cakeRadius(l.plate), c['cakeRadius'] as num);
      near('ширина сектора', sectorWidth(l.plate), c['sectorWidth'] as num);
    }
    expect(bad, isEmpty, reason: '${bad.length} расхождений:\n${bad.take(3).join('\n')}');
  });

  test('🔴 выбор колонок под ширину И высоту совпадает', () {
    final bad = <String>[];
    for (final raw in ref['fits'] as List) {
      final c = raw as Map<String, dynamic>;
      if (c['maxCols'] != null) {
        final got = maxCols((c['width'] as num).toDouble());
        if (got != c['maxCols']) bad.add('maxCols при ${c['width']}: TS ${c['maxCols']}, Dart $got');
        continue;
      }
      final f = tableFit(
        (c['width'] as num).toDouble(),
        (c['height'] as num).toDouble(),
        c['plates'] as int,
      );
      final at = '${c['width']}×${c['height']}, тарелок ${c['plates']}';
      if (f.cols != c['fitCols']) bad.add('колонок при $at: TS ${c['fitCols']}, Dart ${f.cols}');
      if (f.rows != c['fitRows']) bad.add('рядов при $at: TS ${c['fitRows']}, Dart ${f.rows}');
      if ((f.plate - (c['fitPlate'] as num)).abs() > 1e-9) {
        bad.add('тарелка при $at: TS ${c['fitPlate']}, Dart ${f.plate}');
      }
    }
    expect(bad, isEmpty, reason: '${bad.length} расхождений:\n${bad.take(3).join('\n')}');
  });

  test('🔴 ПОПАДАНИЕ ПАЛЬЦЕМ: хват по клетке, наведение по кругу (120 точек)', () {
    // 📍 Правка 3c085b4d: хват считается по КЛЕТКЕ, и охват касания вырос с
    // 61,5 % до 100 %. Если перенос спутает две функции местами, треть касаний
    // снова начнёт пропадать молча — и это читается как «не перетаскивается».
    final bad = <String>[];
    var grabWider = 0;
    for (final raw in ref['hits'] as List) {
      final c = raw as Map<String, dynamic>;
      final x = (c['x'] as num).toDouble();
      final y = (c['y'] as num).toDouble();
      final cols = c['cols'] as int;
      final plate = (c['plate'] as num).toDouble();
      final count = c['count'] as int;
      void same(String name, Object? got, Object? want) {
        if (got != want) bad.add('$name в ($x,$y): TS $want, Dart $got');
      }

      same('по точке', plateAtPoint(x, y, cols, plate, count), c['atPoint']);
      same('для хвата', plateForGrab(x, y, cols, plate, count), c['forGrab']);
      same('по точке (центр.)', plateAtPoint(x, y, cols, plate, count, 390), c['atPointCentered']);
      same('для хвата (центр.)', plateForGrab(x, y, cols, plate, count, 390), c['forGrabCentered']);
      if (c['forGrab'] != null && c['atPoint'] == null) grabWider += 1;
    }
    expect(bad, isEmpty, reason: bad.take(3).join('\n'));
    expect(grabWider, greaterThan(0),
        reason: 'в эталонах обязаны быть точки, где хват берёт, а «по кругу» — нет');
  });

  test('🔴 ряды центрируются по числу тарелок В НИХ', () {
    for (final raw in ref['rows'] as List) {
      final c = raw as Map<String, dynamic>;
      expect(inRow(c['row'] as int, c['cols'] as int, c['count'] as int), c['inRow']);
      expect(rowLeft(390, 96, c['inRow'] as int), closeTo((c['rowLeft'] as num).toDouble(), 1e-9));
    }
  });

  test('🔴 звёзды и эталон ходов совпадают', () {
    for (final raw in ref['stars'] as List) {
      final s = raw as Map<String, dynamic>;
      final circles = s['circles'] as int;
      if (s['reference'] != null) {
        expect(moveReference(circles), s['reference'], reason: 'эталон для $circles кругов');
        continue;
      }
      final exact = (s['exact'] as num?)?.toInt();
      final known = (s['known'] as num?)?.toInt();
      expect(referenceFor(circles, exact, known), s['referenceFor'],
          reason: 'эталон: кругов $circles, минимум $exact, путь $known');
      final moves = [10, 30, 60, 120];
      for (var i = 0; i < moves.length; i += 1) {
        expect(starsFor(moves[i], circles, exact, known), (s['stars'] as List)[i],
            reason: 'звёзды за ${moves[i]} ходов');
      }
    }
  });

  test('🔴 лестница уровней и вшитые расклады совпадают', () {
    for (final raw in ref['levels'] as List) {
      final l = raw as Map<String, dynamic>;
      final cfg = levelCfg(l['level'] as int);
      expect(cfg.types, l['types'], reason: 'видов на L${l['level']}');
      expect(cfg.plates, l['plates'], reason: 'тарелок на L${l['level']}');
      expect(cfg.queue, l['queue'], reason: 'очередь на L${l['level']}');
    }
  });

  test('🔴 вшитые уровни читаются и доказаны', () {
    final set = CakeLevelSet.fromJsonString(File('assets/levels/cake_sort.json').readAsStringSync());
    expect(set.levels.length, 120);
    expect(set.circleSize, 6);
    expect(set.levels.every((l) => l.proven), isTrue, reason: 'все расклады доказаны решателем');
    final l1 = set.byLevel(1);
    expect(l1.plates.length, 5);
    expect(l1.min, 11);
    // За последним вшитым лестница идёт по кругу с конца, а не обрывается.
    expect(set.byLevel(121).level, greaterThan(110));
  });
}
