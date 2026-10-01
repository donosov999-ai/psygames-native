import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/n_back/model.dart';

/// 🔴 N-BACK: ПЕРЕНОС СВЕРЯЕТСЯ С ЭТАЛОНОМ ЖИВОГО TS, А НЕ С САМИМ СОБОЙ.
///
/// Эталон `test/fixtures/n-back-reference.json` снимает экспортёр
/// `frontend/src/games/n-back/tools/record-flutter-reference.gen.ts` прогоном веб-кода.
/// Блоки ряда сверяются на ЗАПИСАННОМ потоке случайных чисел: Dart обязан дать те же
/// позиции и съесть ровно столько же чисел — иначе порядок вызовов ГПСЧ разошёлся, и
/// доля целей поплыла бы между платформами молча.
void main() {
  final ref = jsonDecode(File('test/fixtures/n-back-reference.json').readAsStringSync()) as Map<String, dynamic>;

  test('правила уровней L1…L60 — как в вебе', () {
    expect(nbVolumeTop, ref['volumeTop']);
    expect(nbMatchRate, ref['matchRate']);
    final bad = <String>[];
    for (final l in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final p = NbLevelParams.of(l['level'] as int);
      final got = '${p.n} ${p.modality.name} ${p.showMs} ${p.gapMs} ${p.lureRate}';
      final want = '${l['n']} ${l['modality']} ${l['showMs']} ${l['gapMs']} ${(l['lureRate'] as num?)?.toDouble()}';
      if (got != want) bad.add('L${l['level']}: $got ≠ $want');
    }
    expect(bad, isEmpty);
  });

  test('уровни не повторяют друг друга (клонов 0 на L1…L60)', () {
    final seen = <String, int>{};
    final clones = <String>[];
    for (var level = 1; level <= 60; level++) {
      final p = NbLevelParams.of(level);
      final key = '${p.n} ${p.modality} ${p.showMs} ${p.gapMs} ${p.lureRate}';
      if (seen.containsKey(key)) clones.add('L$level = L${seen[key]}');
      seen[key] = level;
    }
    expect(clones, isEmpty);
  });

  test('доли приманок по глубине и разбор режима шага', () {
    for (final e in (ref['lures'] as List).cast<Map<String, dynamic>>()) {
      expect(lureRateFor(e['n'] as int), (e['rate'] as num).toDouble(), reason: 'n=${e['n']}');
    }
    for (final e in (ref['modes'] as List).cast<Map<String, dynamic>>()) {
      expect(nFromModeParam(e['s'] as String), e['n'], reason: '«${e['s']}»');
    }
  });

  test('🔴 блоки ряда — те же позиции на том же потоке случайных чисел', () {
    final bad = <String>[];
    final cases = (ref['sequences'] as List).cast<Map<String, dynamic>>();
    for (final c in cases) {
      final randoms = (c['randoms'] as List).map((e) => (e as num).toDouble()).toList();
      var used = 0;
      double rng() => randoms[used++];
      final s = buildNbackSequence(c['trials'] as int, c['n'] as int, c['alphabet'] as int, rng,
          (c['lureRate'] as num?)?.toDouble());
      final tag = 't${c['trials']} n${c['n']} a${c['alphabet']} l${c['lureRate']}';
      if (s.items.join(',') != (c['items'] as List).join(',')) bad.add('$tag: стимулы');
      if (s.matchAt.join(',') != (c['matchAt'] as List).join(',')) bad.add('$tag: цели');
      if (s.lureAt.join(',') != (c['lureAt'] as List).join(',')) bad.add('$tag: приманки');
      if (used != randoms.length) bad.add('$tag: съедено ${randoms.length} чисел в вебе, $used здесь');
      if (countMatches(s.items, c['n'] as int) != c['matches']) bad.add('$tag: счёт целей');
      if (countLures(s.items, c['n'] as int) != c['lures']) bad.add('$tag: счёт приманок');
    }
    expect(cases.length, greaterThan(40));
    expect(bad, isEmpty);
  });

  test('d′ и точность — как в вебе, включая пустой поток и идеальную партию', () {
    for (final e in (ref['signals'] as List).cast<Map<String, dynamic>>()) {
      final c = e['counts'] as Map<String, dynamic>;
      final counts = NbCounts(
        hits: c['hits'] as int,
        misses: c['misses'] as int,
        falseAlarms: c['falseAlarms'] as int,
        correctRejections: c['correctRejections'] as int,
      );
      final s = nbSignalDetection(counts);
      expect(s.answered, e['answered']);
      expect(s.hitRate, closeTo((e['hitRate'] as num).toDouble(), 1e-12));
      expect(s.falseAlarmRate, closeTo((e['falseAlarmRate'] as num).toDouble(), 1e-12));
      expect(s.dPrime, (e['dPrime'] as num).toDouble(), reason: '$c');
      expect(nbAccuracyPercent(counts, 0), e['accuracy0']);
      expect(nbAccuracyPercent(counts, 100), e['accuracy100']);
    }
  });

  group('партия', () {
    /// Ряд, который знают ответы: стимулы идут из настоящего генератора на фиксированном потоке.
    NbackGame game({NbModality modality = NbModality.single, int n = 2, int trials = 20}) {
      var x = 0.137;
      double rng() => x = (x * 9301 + 49297) % 233280 / 233280;
      return NbackGame(n: n, trials: trials, modality: modality, rng: rng);
    }

    test('идеальная игра: жмёт ровно на совпадениях — 100 % и зачёт', () {
      final g = game();
      while (g.next()) {
        if (g.isVisualMatch) expect(g.pressVisual(), NbPress.hit);
        g.closeTrial();
      }
      expect(g.misses + g.falseAlarms, 0);
      expect(g.hits, countMatches(g.visual.items, 2));
      expect(g.accuracy, 100);
      expect(g.passed, isTrue);
    });

    test('первые n проб без ответа: нажатие не считается, отказ тоже', () {
      final g = game(n: 3)..next();
      expect(g.pressVisual(), NbPress.ignored);
      g.closeTrial();
      expect(g.visualCounts.answered, 0);
    });

    test('второе нажатие в той же пробе не считается', () {
      final g = game();
      while (g.next() && !g.canMatch) {}
      g.pressVisual();
      expect(g.pressVisual(), NbPress.ignored);
    });

    test('молчание всю партию — промахи и верные отказы; зачёт только при доле ≥ 80 %', () {
      final g = game();
      while (g.next()) {
        g.closeTrial();
      }
      final matches = countMatches(g.visual.items, 2);
      expect(g.misses, matches);
      expect(g.correctRejections, 18 - matches);
      expect(g.passed, g.accuracy >= nbPassAccuracy);
    });

    test('двойной поток: итог по ХУДШЕМУ потоку, а не среднему', () {
      final g = game(modality: NbModality.dual);
      while (g.next()) {
        if (g.isVisualMatch) g.pressVisual();   // клетки — идеально, буквы — молчание
        g.closeTrial();
      }
      expect(g.accuracy, 100);
      expect(g.audioAccuracy, lessThan(100));
      expect(g.combinedAccuracy, g.audioAccuracy);
      expect(g.letter, isNull, reason: 'после конца партии буквы нет');
    });

    test('разброс паузы: ±15 %, не больше 200 мс и не меньше 300 мс', () {
      expect(jitteredGapMs(1100, () => 0.5), 1100);
      expect(jitteredGapMs(1100, () => 0.0), 1100 - 165);
      expect(jitteredGapMs(3900, () => 0.999999), 4100);
      expect(jitteredGapMs(300, () => 0.0), 300);
    });
  });
}
