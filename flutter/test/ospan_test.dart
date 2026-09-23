import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/ospan/model.dart';

/// СВЕРКА ПРАВИЛ OSPAN С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// `test/fixtures/ospan-reference.json` выгружен прогоном веб-кода: параметры
/// 40 уровней, по двенадцать равенств на десяти уровнях с одним зерном и доли
/// форм на прогоне в 3000 равенств.
///
/// ⚠️ Чтобы выгрузка стала возможной, источник случайности в `makeEquation`
/// вынесен параметром (по умолчанию Math.random — поведение веба не менялось).
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/ospan-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 лестница 40 уровней: охват, скорость буквы и счётная нагрузка', () {
    for (final raw in ref['params'] as List) {
      final e = raw as Map<String, dynamic>;
      final p = levelParams(e['level'] as int);
      final at = 'L${e['level']}';
      expect(p.setSize, e['setSize'], reason: '$at букв в наборе');
      expect(p.letterMs, e['letterMs'], reason: '$at показ буквы');
      expect(p.hardMath, e['hardMath'], reason: '$at трудная арифметика');
      expect(p.mathLoad, closeTo((e['mathLoad'] as num).toDouble(), 1e-12), reason: '$at нагрузка');
    }
    // Оси обещаны без потолка — проверяем, что нагрузка растёт и за таблицей.
    expect(levelParams(40).mathLoad > levelParams(16).mathLoad, isTrue);
    expect(levelParams(16).letterMs, 500, reason: 'пол восприятия буквы');
    expect(levelParams(7).setSize, 9, reason: 'охват упирается в девять');
  });

  test('🔴 равенства раздаются те же — текст, число и вердикт побайтно', () {
    var checked = 0;
    for (final raw in ref['eqs'] as List) {
      final e = raw as Map<String, dynamic>;
      final level = e['level'] as int;
      final p = levelParams(level);
      final rnd = createRng('ospan|$level');
      for (final rawEq in (e['list'] as List)) {
        final want = rawEq as Map<String, dynamic>;
        final got = makeEquation(p.mathLoad, p.hardMath, rnd);
        final at = 'L$level равенство $checked';
        expect(got.left, want['left'], reason: '$at левая часть');
        expect(got.right, want['right'], reason: '$at показанное число');
        expect(got.isCorrect, want['isCorrect'], reason: '$at вердикт');
        checked += 1;
      }
    }
    expect(checked, 120, reason: 'десять уровней по двенадцать равенств');
  });

  test('🔴 состав форм на прогоне совпадает: новые формы входят долей, а не рубильником', () {
    for (final raw in ref['shapes'] as List) {
      final e = raw as Map<String, dynamic>;
      final level = e['level'] as int;
      final p = levelParams(level);
      final rnd = createRng('shape|$level');
      final n = e['n'] as int;
      final count = <String, int>{};
      for (var i = 0; i < n; i += 1) {
        final eq = makeEquation(p.mathLoad, p.hardMath, rnd);
        final kind = eq.left.contains('x=')
            ? 'x-eq'
            : (eq.left.startsWith('2') && RegExp(r'[⁰¹²³⁴⁵⁶⁷⁸⁹]').hasMatch(eq.left))
                ? 'power'
                : eq.left.contains('√')
                    ? 'root'
                    : eq.left.contains('²')
                        ? 'square'
                        : (eq.left.contains('×') && eq.left.contains('−'))
                            ? 'chain'
                            : eq.left.contains('×')
                                ? 'mult'
                                : 'plusminus';
        count[kind] = (count[kind] ?? 0) + 1;
      }
      final want = (e['count'] as Map<String, dynamic>).map((k, v) => MapEntry(k, v as int));
      expect(count, want, reason: 'L$level состав форм');
    }
  });

  test('🔴 вердикт равенства не врёт: показанное число сходится с левой частью', () {
    // Независимая проверка: разбираем ПОКАЗАННОЕ и считаем сами — вопрос равенству,
    // а не генератору. Берём формы, которые разбираются однозначно.
    for (final level in [1, 6, 16, 20, 24, 28, 31, 36]) {
      final p = levelParams(level);
      final rnd = createRng('правда|$level');
      for (var i = 0; i < 200; i += 1) {
        final eq = makeEquation(p.mathLoad, p.hardMath, rnd);
        final left = eq.left;
        int? real;
        if (left.contains('√')) {
          final v = int.parse(left.replaceAll('√', ''));
          real = intSqrt(v);
        } else if (left.endsWith('²')) {
          final n = int.parse(left.replaceAll('²', ''));
          real = n * n;
        } else if (left.contains(' × ') && left.contains(' − ')) {
          final parts = left.split(' − ');
          final mul = parts[0].split(' × ');
          real = int.parse(mul[0]) * int.parse(mul[1]) - int.parse(parts[1]);
        } else if (left.contains(' + ') || left.contains(' - ') || left.contains(' × ')) {
          if (left.contains('x=')) continue;
          final op = left.contains(' + ') ? ' + ' : (left.contains(' - ') ? ' - ' : ' × ');
          final parts = left.split(op);
          final a = int.parse(parts[0]);
          final b = int.parse(parts[1]);
          real = op == ' + ' ? a + b : (op == ' - ' ? a - b : a * b);
        }
        if (real == null) continue;
        expect(eq.isCorrect, eq.right == real,
            reason: 'L$level «$left = ${eq.right}»: вердикт ${eq.isCorrect}, а на деле $real');
      }
    }
  });

  test('уровень берётся только за чистое вспоминание', () {
    expect(ospanPassed(0), isTrue);
    expect(ospanPassed(1), isFalse);
    expect(lettersRu.length, 20);
    expect(lettersEn.length, 20);
  });
}

int intSqrt(int v) {
  var r = 0;
  while ((r + 1) * (r + 1) <= v) {
    r += 1;
  }
  return r;
}
