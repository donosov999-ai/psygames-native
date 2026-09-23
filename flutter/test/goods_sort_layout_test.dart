import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/goods_sort/layout.dart';

/// СВЕРКА РАСКЛАДКИ С ЖИВЫМ TS, А НЕ С СОБСТВЕННОЙ ФОРМУЛОЙ.
///
/// `gsLayout` в вебе — одна функция на игру и на гейт: до 02.09.2026 арифметика
/// была продублирована «для проверки», формулы разъехались молча, и тест шесть
/// недель проверял формулу, которой в игре нет. Тот же капкан стоит и здесь:
/// перепиши эти числа на глаз — и три починки по отчётам тестировщиц исчезнут,
/// а проба останется зелёной. Поэтому ответы ВЫГРУЖЕНЫ живым TS.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/goods-sort-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('премиса: эталонов хватает, и среди них есть едущие доски', () {
    final cases = ref['layouts'] as List;
    expect(cases.length, greaterThan(380));
    final scrolling = cases.where((c) => (c as Map)['out']['scrolls'] == true).length;
    // Обе ветки обязаны присутствовать: иначе сверка проверяла бы одну из двух.
    expect(scrolling, greaterThan(50), reason: 'едущие доски (витрина) в эталонах');
    expect(cases.length - scrolling, greaterThan(50), reason: 'вмещающиеся доски');
  });

  test('🔴 раскладка совпадает с живым TS на всех выгруженных экранах до пикселя', () {
    final bad = <String>[];
    for (final raw in ref['layouts'] as List) {
      final c = raw as Map<String, dynamic>;
      final i = c['in'] as Map<String, dynamic>;
      final want = c['out'] as Map<String, dynamic>;
      final l = GsLayout(
        width: (i['width'] as num).toDouble(),
        availH: (i['availH'] as num).toDouble(),
        cols: i['cols'] as int,
        rows: i['rows'] as int,
        capWide: i['capWide'] as int,
        hintH: (i['hintH'] as num).toDouble(),
        floorItem: i['floorItem'] as int,
      );
      final at = '${i['width']}×${i['availH']} ${i['cols']}×${i['rows']} '
          'cap=${i['capWide']} пол=${i['floorItem']} подсказка=${i['hintH']}';
      void same(String name, Object got, Object expected) {
        if (got != expected) bad.add('$name на $at: TS $expected, Dart $got');
      }

      same('boardW', l.boardW, want['boardW']);
      same('cellW', l.cellW, want['cellW']);
      same('itemSize', l.itemSize, want['itemSize']);
      same('itemH', l.itemH, want['itemH']);
      same('nicheH', l.nicheH, want['nicheH']);
      same('shelfH', l.shelfH, want['shelfH']);
      same('rowW', l.rowW, want['rowW']);
      same('boardH', l.boardH, want['boardH']);
      same('scrolls', l.scrolls, want['scrolls']);
      same('overlap', GsLayout.overlap, want['overlap']);
      for (var cap = 1; cap <= 4; cap += 1) {
        final box = (want['itemBox'] as List)[cap - 1] as Map<String, dynamic>;
        same('itemBox($cap).w', l.itemBox(cap).w, box['w']);
        same('itemBox($cap).h', l.itemBox(cap).h, box['h']);
        same('nicheW($cap)', l.nicheW(cap), (want['nicheW'] as List)[cap - 1]);
      }
    }
    expect(bad, isEmpty, reason: '${bad.length} расхождений, первые три:\n${bad.take(3).join('\n')}');
  });

  test('🔴 то, ради чего эта формула: товар узкий и высокий, а не квадрат', () {
    // Первая редакция экрана рисовала квадратный товар без нахлёста: на снимке
    // 390×844 он вышел 33 px в нише 200 px. Числа ниже — из живого TS.
    final l = GsLayout(width: 390, availH: 560, cols: 3, rows: 4, capWide: 3, hintH: 0);
    expect(l.itemSize, 44);
    expect(l.itemH, 73, reason: 'высота в 1,7 раза больше ширины — пропорция спрайтов');
    expect(l.nicheH, 126);
    expect(l.nicheW(1), 50, reason: 'полка на один товар узкая');
    expect(l.nicheW(3), l.cellW, reason: 'полная ниша занимает ячейку целиком');
    expect(l.itemBox(4).w, lessThan(l.itemBox(3).w), reason: 'в нише на четыре товар мельче');
  });
}
