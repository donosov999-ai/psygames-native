import 'dart:convert';
import 'dart:math';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/stroop/model.dart';

/// СВЕРКА СТРУПА С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// Правила лежат в `frontend/app/games/stroop.tsx` и `src/games/attention/decoys.ts`.
/// Проверять перенос той же формулой, которой переносил, нельзя — такая проба зелёная
/// всегда. Поэтому значения ВЫГРУЖЕНЫ прогоном самого TS (levelParams L1…L20,
/// makeTrial, ruleForTrial, makeDecoys, палитры, цвет подписи) в
/// `test/fixtures/stroop-reference.json`.
///
/// 🔴 В эталон попал и ПОРЯДОК обращений к случайности: вместо Math.random в TS стояла
/// заданная очередь чисел, и здесь Dart получает ту же очередь. Перепутанный порядок
/// (например, помехи после ветвления по согласованности) покраснеет, даже если каждая
/// формула по отдельности верна.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/stroop-reference.json').readAsStringSync()) as Map<String, dynamic>;
  });

  /// Очередь чисел вместо случайности — точно как в выгрузке.
  double Function() queue(List<double> values) {
    var i = 0;
    return () => values[i++ % values.length];
  }

  final List<List<double>> queues = [
    [0.00, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90],
    [0.99, 0.01, 0.77, 0.33, 0.66, 0.12, 0.88, 0.44, 0.55, 0.22],
    [0.49, 0.51, 0.25, 0.75, 0.05, 0.95, 0.35, 0.65, 0.15, 0.85],
  ];

  test('🔴 канон доли конфликтных и предел помех совпадают с живым кодом', () {
    expect(incongruentRatio, ref['incongruentRatio']);
    expect(decoysMax, ref['decoysMax']);
    expect(decoyGlyphs, (ref['decoyGlyphs'] as List).cast<String>());
  });

  test('🔴 обе палитры совпадают по именам и чернилам', () {
    for (final pair in [
      ['normal', stroopColorsDefault],
      ['colorblind', stroopColorsColorblind],
    ]) {
      final name = pair[0] as String;
      final ours = pair[1] as List<StroopColor>;
      final want = (ref['palettes'] as Map)[name] as List;
      expect(ours.length, want.length, reason: 'палитра $name: число цветов');
      for (var i = 0; i < ours.length; i++) {
        final e = want[i] as Map<String, dynamic>;
        expect(ours[i].name, e['name'], reason: 'палитра $name, цвет $i: имя');
        expect(ours[i].ru, e['ru'], reason: 'палитра $name, цвет $i: подпись');
        expect(ours[i].hex, e['hex'], reason: 'палитра $name, цвет $i: чернила');
      }
    }
  });

  test('🔴 цвет подписи на кнопке выбирается так же', () {
    for (final raw in ref['labelColors'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(stroopLabelColor(e['hex'] as String), e['label'], reason: 'подпись на ${e['hex']}');
    }
  });

  test('🔴 уровень задаёт то же самое на всех 20 ступенях (включая потолок выше 15)', () {
    final levels = ref['levels'] as List;
    expect(levels.length, 20);
    for (final raw in levels) {
      final e = raw as Map<String, dynamic>;
      final p = StroopLevel.of(e['level'] as int);
      final at = 'L${e['level']}';
      expect(p.trials, e['trials'], reason: '$at число проб');
      expect(p.windowMs, e['windowMs'], reason: '$at окно ответа');
      expect(p.switchRate, closeTo((e['switchRate'] as num).toDouble(), 1e-9), reason: '$at доля смен правила');
      expect(p.decoys, e['decoys'], reason: '$at помехи');
    }
  });

  test('🔴 помехи берутся те же и в том же числе', () {
    for (final raw in ref['decoys'] as List) {
      final e = raw as Map<String, dynamic>;
      final ours = makeDecoys(e['n'] as int, queue(queues[e['queue'] as int]));
      expect(ours, (e['glyphs'] as List).cast<String>(), reason: 'помех ${e['n']}, очередь ${e['queue']}');
    }
  });

  test('🔴 правило пробы переключается на тех же числах', () {
    for (final raw in ref['rules'] as List) {
      final e = raw as Map<String, dynamic>;
      final v = (e['value'] as num).toDouble();
      final got = ruleForTrial(e['base'] as String, (e['switchRate'] as num).toDouble(), () => v);
      expect(got, e['rule'], reason: 'база ${e['base']}, доля ${e['switchRate']}, число $v');
    }
  });

  test('🔴 проба рождается так же — и по составу, и по порядку обращений к случайности', () {
    final trials = ref['trials'] as List;
    expect(trials.length, 42);
    for (final raw in trials) {
      final e = raw as Map<String, dynamic>;
      final palette = e['palette'] == 'colorblind' ? stroopColorsColorblind : stroopColorsDefault;
      final t = makeTrial(e['level'] as int, palette, queue(queues[e['queue'] as int]));
      final at = 'L${e['level']}, очередь ${e['queue']}, палитра ${e['palette']}';
      expect(t.word.name, e['word'], reason: '$at: слово');
      expect(t.ink.name, e['ink'], reason: '$at: чернила');
      expect(t.congruent, e['congruent'], reason: '$at: согласованность');
      expect(t.decoys, (e['decoys'] as List).cast<String>(), reason: '$at: помехи');
    }
  });

  test('🔴 время реакции копится только с верных проб БАЗОВОГО правила', () {
    // Часы поддельные: время задаётся числом, а не ожиданием.
    var t = 0;
    final g = StroopGame(level: 1, mode: 'ink', nowMs: () => t);
    // Подменять правила партии нельзя, поэтому ищем нужные пробы среди выданных.
    var baseCorrect = 0;
    for (var i = 0; i < g.params.trials; i++) {
      if (!g.nextTrial()) break;
      t += 500;
      final right = g.palette.firstWhere((c) => c.name == g.correctName);
      final wrong = g.palette.firstWhere((c) => c.name != g.correctName);
      // На части проб отвечаем верно, на части — заведомо нет.
      if (i.isEven) {
        g.answer(right);
        if (g.trialRule == g.mode) baseCorrect += 1;
      } else {
        g.answer(wrong);
      }
    }
    expect(g.rtsCongruent.length + g.rtsIncongruent.length, baseCorrect,
        reason: 'в копилку времени попали пробы, которых там быть не должно');
    for (final rt in [...g.rtsCongruent, ...g.rtsIncongruent]) {
      expect(rt, 500, reason: 'время реакции считается от показа стимула');
    }
  });

  test('🔴 на уровне со сменами правила время копится ТОЛЬКО с проб базового правила', () {
    // L15: доля смен 0,4. Зерно задано, чтобы смены точно случились — иначе проверка пустая.
    var t = 0;
    final g = StroopGame(level: 15, mode: 'ink', rnd: Random(42), nowMs: () => t);
    var baseCorrect = 0;
    while (g.nextTrial()) {
      t += 400;
      g.answer(g.palette.firstWhere((c) => c.name == g.correctName));
      if (g.trialRule == g.mode) baseCorrect += 1;
    }
    expect(g.switchedTrials, greaterThan(0),
        reason: 'на этом зерне смен не выпало — проверка была бы пустой, возьми другое');
    expect(g.hits, g.params.trials, reason: 'отвечали всегда верно');
    expect(g.rtsCongruent.length + g.rtsIncongruent.length, baseCorrect,
        reason: 'в копилку времени попали пробы ДРУГОГО правила: интерференция размоется их долей');
    expect(g.rtsCongruent.length + g.rtsIncongruent.length, lessThan(g.params.trials),
        reason: 'часть проб шла по другому правилу, значит копилка обязана быть короче партии');
  });

  test('🔴 интерференция пуста, пока нет обеих половин, и считается разностью средних', () {
    var t = 0;
    final g = StroopGame(level: 1, mode: 'ink', nowMs: () => t);
    expect(g.interferenceMs, isNull, reason: 'без проб интерференции нет, а ноль означал бы «нет эффекта»');
    g.rtsCongruent.addAll([400, 500]);
    expect(g.interferenceMs, isNull, reason: 'одной половины мало');
    g.rtsIncongruent.addAll([700, 800]);
    expect(g.interferenceMs, 300);
  });

  test('🔴 просрочка окна — ошибка, и время реакции с неё не копится', () {
    var t = 0;
    final g = StroopGame(level: 1, mode: 'ink', nowMs: () => t);
    g.nextTrial();
    t += 3500;
    expect(g.timeout(), StroopOutcome.miss);
    expect(g.misses, 1);
    expect(g.errors, 1);
    expect(g.rtsCongruent, isEmpty);
    expect(g.rtsIncongruent, isEmpty);
    // Ответ после просрочки уже не принимается.
    expect(g.answer(stroopColorsDefault[0]), StroopOutcome.miss);
    expect(g.hits, 0);
  });
}
