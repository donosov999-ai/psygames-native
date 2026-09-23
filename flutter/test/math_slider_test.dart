import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/math_slider/model.dart';

/// СВЕРКА ПРАВИЛ «МАТЕМАТИЧЕСКОЙ ШКАЛЫ» С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// `test/fixtures/math-slider-reference.json` выгружен прогоном веб-ядра:
/// 32 уровня по три вопроса, второе зерно, тренировка, срезы фигур, очки и
/// перенос прогресса v1→v2.
///
/// ⚠️ Вопросы раздаются ПО ЗЕРНУ. Поэтому проверяется не «похоже», а побайтно:
/// тот же сид обязан дать те же выражения, ту же шкалу и ту же работу вопроса.
/// Своей формулой свою же формулу здесь не проверяют — эталон пришёл со стороны.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/math-slider-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  void checkQuestion(MathSliderQuestion got, Map<String, dynamic> want, String at) {
    expect(got.id, want['id'], reason: '$at номер');
    expect(got.index, want['index'], reason: '$at место');
    expect(got.level, want['level'], reason: '$at уровень');
    expect(got.kind, want['kind'], reason: '$at семейство');
    expect(jsonEncode(got.expression.toJson()), jsonEncode(want['expression']),
        reason: '$at выражение');
    expect(got.answer, closeTo((want['answer'] as num).toDouble(), 1e-9), reason: '$at ответ');
    expect(jsonEncode(got.scale.toJson()), jsonEncode(want['scale']), reason: '$at шкала');
    expect(got.difficulty, closeTo((want['difficulty'] as num).toDouble(), 1e-9),
        reason: '$at трудность');
    expect(got.expressionDifficulty,
        closeTo((want['expressionDifficulty'] as num).toDouble(), 1e-9), reason: '$at трудность выражения');
    expect(got.scaleDifficulty, closeTo((want['scaleDifficulty'] as num).toDouble(), 1e-9),
        reason: '$at трудность шкалы');
    expect(got.seed, want['seed'], reason: '$at зерно');
    expect(got.text, want['textRu'], reason: '$at подпись');
    expect(expressionWork(got.expression), closeTo((want['exprWork'] as num).toDouble(), 1e-9),
        reason: '$at работа выражения');
    expect(questionWork(got), closeTo((want['qWork'] as num).toDouble(), 1e-9),
        reason: '$at работа вопроса');
  }

  test('🔴 зерно крутится точно так же: те же броски из той же строки', () {
    for (final raw in ref['hashes'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(hashSeed(e['s'] as String), e['h'], reason: 'хеш «${e['s']}»');
    }
    final rng = createRng('nzt|1|$generatorVersion');
    final draws = (ref['draws'] as List).cast<num>();
    for (var i = 0; i < draws.length; i += 1) {
      expect(rng(), closeTo(draws[i].toDouble(), 1e-15), reason: 'бросок $i');
    }
  });

  test('🔴 зерно причёсывается так же', () {
    for (final raw in ref['normalize'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(normalizeSeed(e['s'] as String), e['out'], reason: '«${e['s']}»');
    }
  });

  test('🔴 версия генератора и верх обещанной лестницы не разъехались', () {
    expect(generatorVersion, ref['generatorVersion']);
    expect(sliderMaxLevel, ref['maxLevel']);
    expect(workNorm, ref['workNorm']);
  });

  test('🔴 32 уровня отдают те же вопросы — выражение, ответ, шкала, работа', () {
    var checked = 0;
    for (final raw in ref['packs'] as List) {
      final pack = raw as Map<String, dynamic>;
      final got = generateMathSliderQuestions(pack['seed'] as String, pack['level'] as int, 3);
      final want = (pack['questions'] as List).cast<Map<String, dynamic>>();
      expect(got.length, want.length);
      for (var i = 0; i < want.length; i += 1) {
        checkQuestion(got[i], want[i], 'L${pack['level']}#$i');
        checked += 1;
      }
    }
    expect(checked, 96, reason: 'проверено 32 уровня по три вопроса');
  });

  test('🔴 второе зерно, с пробелами и подчёркиваниями, даёт ту же партию', () {
    for (final raw in ref['second'] as List) {
      final pack = raw as Map<String, dynamic>;
      final got = generateMathSliderQuestions(pack['seed'] as String, pack['level'] as int, 2);
      final want = (pack['questions'] as List).cast<Map<String, dynamic>>();
      for (var i = 0; i < want.length; i += 1) {
        checkQuestion(got[i], want[i], 'второе зерно L${pack['level']}#$i');
      }
    }
  });

  test('🔴 тренировочный вопрос тот же — он берётся с отдельного зерна', () {
    checkQuestion(generateTrainingQuestion('nzt'), ref['training'] as Map<String, dynamic>, 'тренировка');
  });

  test('🔴 срезы фигуры совпадают — рисунок и площадь считает одна кривая', () {
    final byId = <String, MathSliderQuestion>{};
    for (final raw in ref['packs'] as List) {
      final pack = raw as Map<String, dynamic>;
      for (final q in generateMathSliderQuestions(pack['seed'] as String, pack['level'] as int, 3)) {
        byId[q.id] = q;
      }
    }
    final areas = (ref['areas'] as List).cast<Map<String, dynamic>>();
    expect(areas, isNotEmpty, reason: 'в эталоне есть фигуры-интегралы');
    for (final a in areas) {
      final q = byId[a['id']]!;
      final got = sampleAreaHeights(q.expression as IntegralArea, 24);
      final want = (a['heights'] as List).cast<num>();
      expect(got.length, want.length);
      for (var i = 0; i < want.length; i += 1) {
        expect(got[i], closeTo(want[i].toDouble(), 1e-9), reason: '${a['id']} срез $i');
      }
    }
  });

  test('🔴 очки за попытку считаются теми же числами', () {
    for (final raw in ref['scoreCases'] as List) {
      final e = raw as Map<String, dynamic>;
      final parts = (e['id'] as String).split(':');
      final q = generateMathSliderQuestions(parts[0], int.parse(parts[1]), 3)[int.parse(parts[2])];
      final got = scoreEstimate(q, (e['estimate'] as num).toDouble(), e['elapsedMs'] as int);
      final want = e['score'] as Map<String, dynamic>;
      final at = e['id'];
      expect(got.questionId, want['questionId'], reason: '$at номер вопроса');
      expect(got.accuracy, closeTo((want['accuracy'] as num).toDouble(), 1e-9), reason: '$at точность');
      expect(got.signedError, closeTo((want['signedError'] as num).toDouble(), 1e-9), reason: '$at смещение');
      expect(got.normalizedError, closeTo((want['normalizedError'] as num).toDouble(), 1e-9),
          reason: '$at ошибка от ширины');
      expect(got.speedFactor, closeTo((want['speedFactor'] as num).toDouble(), 1e-9), reason: '$at скорость');
      expect(got.speedTieBreak, want['speedTieBreak'], reason: '$at разрыв по скорости');
      expect(got.score, want['score'], reason: '$at очки');
      expect(got.outsideTarget, want['outsideTarget'], reason: '$at за пределами 10%');
    }
  });

  test('🔴 округление ведёт себя как в JS: ровная половина уходит ВВЕРХ, а не от нуля', () {
    // Ожидания взяты из правил самого JavaScript (Math.round округляет половину
    // к +∞), а не из моей же реализации. Именно этим `Math.round` расходится с
    // `round()` в Dart на отрицательных половинах — и именно через него идут
    // прилипание шкалы, переносы в модели работы и сами броски генератора.
    expect(jsRound(-2.5), -2.0);
    expect(jsRound(-1.5), -1.0);
    expect(jsRound(-0.5), 0.0);
    expect(jsRound(2.5), 3.0);
    expect(jsRound(1.5), 2.0);
    expect(jsRound(-2.6), -3.0);
    // И сразу — где это видно снаружи: шаг шкалы 5, значение ровно посередине
    // между делениями уходит к БОЛЬШЕМУ, как в вебе.
    const scale = MathSliderScale(
      min: -100, max: 100, width: 200, majorStep: 50, keyboardStep: 5,
      tickCount: 4, ticks: [-100, -50, 0, 50, 100], precision: 0,
    );
    expect(snapValue(-2.5, scale), 0.0);
    expect(snapValue(-7.5, scale), -5.0);
  });

  test('перенос прогресса v1→v2 не сжигает семейство, на котором стоял игрок', () {
    for (final raw in ref['migrate'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(migrateSliderLevelV1toV2(e['from'] as int), e['to'], reason: 'с ${e['from']}');
    }
  });
}
