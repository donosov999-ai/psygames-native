import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/spatial_span/model.dart';

/// СВЕРКА ПЕРЕНОСА «ПРОСТРАНСТВЕННОГО РЯДА» С ЖИВЫМ TS.
///
/// Эталоны выгружены прогоном самого TS (временная проба
/// `frontend/src/__tests__/spatial-span-fixture-export.test.ts`, после выгрузки удалена).
/// Вся арифметика игры — лестница: объём, сетка, темп показа, вспышка и задержка перед вводом.
/// Ряд строится системной случайностью, сверять там нечего — зато правила ответа проверяются
/// разыгранными партиями, а не чтением формул.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref =
        jsonDecode(File('test/fixtures/spatial-span-reference.json').readAsStringSync())
            as Map<String, dynamic>;
  });

  test('🔴 лестница 60 ступеней: объём, сетка, темп, вспышка и задержка — как в TS', () {
    expect(volumeTop, ref['volumeTop'], reason: 'верх объёма и скорости');
    final levels = ref['levels'] as List;
    expect(levels.length, 60);
    for (final raw in levels) {
      final e = raw as Map<String, dynamic>;
      final p = levelParams(e['level'] as int);
      final at = 'L${e['level']}';
      expect(p.startSpan, e['startSpan'], reason: '$at: стартовая длина');
      expect(p.gridSize, e['gridSize'], reason: '$at: сетка');
      expect(p.tickMs, e['tickMs'], reason: '$at: шаг показа');
      expect(p.flashMs, e['flashMs'], reason: '$at: вспышка');
      expect(p.holdMs, e['holdMs'], reason: '$at: задержка перед вводом');
      expect(p.cells, e['cells'], reason: '$at: клеток в сетке');
    }
  });

  test('🔴 ответ идёт В ОБРАТНОМ ПОРЯДКЕ — прямой считается ошибкой', () {
    final g = SpatialSpanGame(level: 3, random: Random(1));
    g.deal(4);
    g.recalling = true;
    expect(g.expected, g.sequence.reversed.toList());
    // Прямой порядок: первая же клетка не та (у ряда из четырёх разных клеток).
    expect(g.tap(g.sequence.first), Tap.wrong, reason: 'прямой порядок — не ответ');
  });

  test('🔴 две ошибки на ОДНОЙ длине заканчивают партию, одна — нет', () {
    final g = SpatialSpanGame(level: 1, random: Random(7));
    g.deal(3);
    g.recalling = true;
    final wrong = [for (var i = 0; i < g.params.cells; i++) i].firstWhere((c) => c != g.expected[0]);

    expect(g.tap(wrong), Tap.wrong);
    expect(g.finished, isFalse, reason: 'одна ошибка — тот же ряд ещё раз');
    expect(g.errorsAtLength, 1);

    g.deal(3); // ряд той же длины, счётчик ошибок длины НЕ сбрасывается
    g.recalling = true;
    final wrong2 = [
      for (var i = 0; i < g.params.cells; i++) i,
    ].firstWhere((c) => c != g.expected[0]);
    expect(g.tap(wrong2), Tap.wrong);
    expect(g.finished, isTrue, reason: 'вторая ошибка на той же длине — конец партии');
  });

  test('🔴 пройденный ряд растит спан и обнуляет ошибки длины', () {
    final g = SpatialSpanGame(level: 2, random: Random(3));
    g.deal(3);
    g.recalling = true;
    final wrong = [for (var i = 0; i < g.params.cells; i++) i].firstWhere((c) => c != g.expected[0]);
    expect(g.tap(wrong), Tap.wrong);
    expect(g.errorsAtLength, 1);

    g.deal(3);
    g.recalling = true;
    for (var i = 0; i < g.expected.length - 1; i++) {
      expect(g.tap(g.expected[i]), Tap.ok);
    }
    expect(g.tap(g.expected.last), Tap.done);
    expect(g.span, 3, reason: 'спан — длина пройденного ряда');
    expect(g.errorsAtLength, 0, reason: 'ошибки считаются на КАЖДОЙ длине заново');
    expect(g.finished, isFalse);
    expect(g.passed, isTrue, reason: 'планка ступени L2 — три клетки');
  });

  test('🔴 сетка кончилась — партия закрывается на достигнутом', () {
    final g = SpatialSpanGame(level: 1, random: Random(5));
    g.deal(g.params.cells);
    g.recalling = true;
    for (final c in g.expected) {
      g.tap(c);
    }
    expect(g.finished, isTrue);
    expect(g.span, g.params.cells);
  });

  test('🔴 ряд — разные клетки своей сетки, без повторов', () {
    for (final level in [1, 8, 11, 20, 60]) {
      final g = SpatialSpanGame(level: level, random: Random(level));
      final p = levelParams(level);
      g.deal(p.startSpan);
      expect(g.sequence.length, p.startSpan, reason: 'L$level: длина ряда');
      expect(g.sequence.toSet().length, p.startSpan, reason: 'L$level: без повторов');
      expect(g.sequence.every((c) => c >= 0 && c < p.cells), isTrue,
          reason: 'L$level: клетки своей сетки');
    }
  });

  test('🔴 до открытия ввода тычки не принимаются', () {
    final g = SpatialSpanGame(level: 1, random: Random(2));
    g.deal(2);
    expect(g.tap(g.expected.first), Tap.ignored, reason: 'показ ещё идёт — отвечать нечего');
    expect(g.entered, isEmpty);
  });
}
