import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/math_sprint/model.dart';

/// СВЕРКА ПРАВИЛ «СПРИНТА» С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// `test/fixtures/math-sprint-reference.json` выгружен прогоном веб-ядра:
/// 20 уровней по шесть задач с одним зерном, темы всех сорока уровней, перенос
/// прогресса v1→v2 и раскладка клавиатуры на шести экранах.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/math-sprint-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 полосы лестницы стоят там же и верх обещанного тот же', () {
    expect(sprintMaxLevel, ref['maxLevel']);
    for (final raw in ref['bands'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(sprintBandFor(e['level'] as int), e['band'], reason: 'L${e['level']} тема');
    }
  });

  test('🔴 20 уровней отдают те же задачи — текст и ответ побайтно', () {
    var checked = 0;
    for (final raw in ref['rows'] as List) {
      final e = raw as Map<String, dynamic>;
      final level = e['level'] as int;
      final rnd = createRng('sprint|$level');
      expect(sprintBandFor(level), e['band'], reason: 'L$level тема');
      for (final rawP in (e['problems'] as List)) {
        final want = rawP as Map<String, dynamic>;
        final got = generateSprintProblem(level, rnd);
        final at = 'L$level задача $checked';
        expect(got.display, want['display'], reason: '$at текст');
        expect(got.answer, want['answer'], reason: '$at ответ');
        expect(got.kind, want['kind'], reason: '$at вид');
        checked += 1;
      }
    }
    expect(checked, 120, reason: '20 уровней по шесть задач');
  });

  test('🔴 ответ у каждой задачи сходится с её же текстом', () {
    // Независимая проверка: разбираем ПОКАЗАННЫЙ текст и считаем сами.
    // Так проверяется не «то же, что в вебе», а «задача не врёт игроку».
    for (final level in [1, 5, 9, 13, 17, 21, 25, 30]) {
      final rnd = createRng('свой|$level');
      for (var i = 0; i < 40; i += 1) {
        final p = generateSprintProblem(level, rnd);
        // ⚠️ Сперва убираем хвост уравнения: в нём тоже есть « = ?».
        final text = p.display.replaceAll(',  x = ?', '').replaceAll(' = ?', '');
        switch (p.kind) {
          case 'square':
            final n = int.parse(text.replaceAll('²', ''));
            expect(p.answer, n * n, reason: text);
          case 'root':
            final v = int.parse(text.replaceAll('√', ''));
            expect(p.answer * p.answer, v, reason: text);
          case 'equation':
            final parts = text.split(' = ');
            final c = int.parse(parts[1]);
            final left = parts[0].split('x ');
            final a = int.parse(left[0]);
            final b = int.parse(left[1].substring(2));
            final sign = left[1][0];
            expect(a * p.answer + (sign == '+' ? b : -b), c, reason: text);
          case 'div':
            final parts = text.split(' ÷ ');
            expect(int.parse(parts[0]) ~/ int.parse(parts[1]), p.answer, reason: text);
            expect(int.parse(parts[0]) % int.parse(parts[1]), 0, reason: '$text делится нацело');
          default:
            // plus-minus, mult, chain — считаем слева направо с учётом × перед ±
            var tokens = text.split(' ');
            var acc = int.parse(tokens[0]);
            for (var j = 1; j < tokens.length; j += 2) {
              final op = tokens[j];
              final v = int.parse(tokens[j + 1]);
              acc = switch (op) {
                '+' => acc + v,
                '-' || '−' => acc - v,
                '×' => acc * v,
                _ => acc,
              };
            }
            expect(acc, p.answer, reason: text);
        }
      }
    }
  });

  test('🔴 перенос прогресса v1→v2 не сжигает семейство', () {
    for (final raw in ref['migrate'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(migrateSprintLevelV1toV2(e['from'] as int), e['to'], reason: 'с ${e['from']}');
    }
  });

  test('🔴 РАСКЛАДКА КЛАВИАТУРЫ: те же числа, что в вебе, и клавиша не мельче пальца', () {
    final c = ref['constants'] as Map<String, dynamic>;
    expect(topOfField, (c['ВЕРХ_ПОЛЯ'] as num).toDouble());
    expect(answerGutters, (c['ПОЛЯ_ОТВЕТА'] as num).toDouble());
    expect(fingerSize, (c['ПАЛЕЦ'] as num).toDouble());
    expect(actionRow, (c['РЯД_ДЕЙСТВИЙ'] as num).toDouble());
    for (final raw in ref['keypads'] as List) {
      final e = raw as Map<String, dynamic>;
      final k = keypadFor((e['w'] as num).toDouble(), (e['h'] as num).toDouble());
      final at = 'экран ${e['w']}×${e['h']}';
      expect(k.keyW, (e['keyW'] as num).toDouble(), reason: '$at ширина клавиши');
      expect(k.keyH, (e['keyH'] as num).toDouble(), reason: '$at высота клавиши');
      expect(k.low, e['low'], reason: '$at низкий ли экран');
      expect(k.keyW >= fingerSize && k.keyH >= fingerSize, isTrue,
          reason: '$at клавиша не мельче пальца: ${k.keyW}×${k.keyH}');
      expect(k.keyW * 3 <= (e['w'] as num).toDouble(), isTrue,
          reason: '$at три клавиши в ряд помещаются по ширине');
    }
  });

  test('🔴 нижняя граница клавиши в палец РАБОТАЕТ — проверено там, где она включается', () {
    // ⚠️ Мутация «убрать max(ПАЛЕЦ) у ШИРИНЫ» не покраснела, и это не дыра, а
    // равносильность на наборе: при экране от 320 точек ширина и без границы
    // выходит 56 и больше. Граница включается в другом месте — по ВЫСОТЕ на
    // низком экране. Там её и проверяем, иначе правило держится на слово.
    final narrow = keypadFor(320, 568);
    expect(narrow.low, isTrue, reason: '568 — низкий экран');
    expect((568 - topOfField - narrow.column - 101) / 4 < fingerSize, isTrue,
        reason: 'без границы высота клавиши вышла бы ${(568 - topOfField - narrow.column - 101) / 4}');
    expect(narrow.keyH, fingerSize, reason: 'граница подняла клавишу до пальца');

    // И по ширине — на экране, которого в эталонах нет, но правило обязано держать.
    final tiny = keypadFor(260, 900);
    expect((260 - answerGutters - 16 - 2) / 3 < fingerSize, isTrue);
    expect(tiny.keyW, fingerSize, reason: 'на узком экране ширина тоже не ниже пальца');
  });

  test('🔴 очки за серию и штраф — те же, что в вебе', () {
    // Перенос из app/games/math-sprint.tsx:246 (`10 + Math.min(newStreak * 2, 30)`)
    // и :255 (`Math.max(0, s - 5)`).
    expect(pointsForStreak(1), 12);
    expect(pointsForStreak(5), 20);
    expect(pointsForStreak(15), 40);
    expect(pointsForStreak(40), 40, reason: 'добавка за серию упирается в тридцать');
    expect(sprintPenalty, 5);
    expect(sprintCorrectToPass, 12);
    expect(sprintSeconds, 60);
    expect(sprintMaxDigits, 6);
  });
}
