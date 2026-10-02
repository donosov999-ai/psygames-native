import 'dart:convert';
import 'dart:io';
import 'dart:math';

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
      final got = '${p.n} ${p.modality.name} ${p.showMs} ${p.gapMs} ${p.lureRate} ${p.switchEvery}';
      final want = '${l['n']} ${l['modality']} ${l['showMs']} ${l['gapMs']} ${(l['lureRate'] as num?)?.toDouble()} '
          '${l['switchEvery']}';
      if (got != want) bad.add('L${l['level']}: $got ≠ $want');
    }
    expect(bad, isEmpty);
  });

  test('уровни не повторяют друг друга (клонов 0 на L1…L60)', () {
    final seen = <String, int>{};
    final clones = <String>[];
    for (var level = 1; level <= 60; level++) {
      final p = NbLevelParams.of(level);
      final key = '${p.n} ${p.modality} ${p.showMs} ${p.gapMs} ${p.lureRate} ${p.switchEvery}';
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

  test('🔴 ось 9: план глубины — как в вебе (N и N − 1 отрезками по switchEvery)', () {
    final bad = <String>[];
    for (final c in (ref['plans'] as List).cast<Map<String, dynamic>>()) {
      final every = c['switchEvery'] as int;
      final got = nbPlanFor(c['trials'] as int, c['n'] as int, every == 0 ? null : every).join('');
      final want = (c['plan'] as List).join('');
      if (got != want) bad.add('t${c['trials']} n${c['n']} e$every: $got ≠ $want');
    }
    expect(bad, isEmpty);
  });

  test('🔴 ось 9: блоки с глубиной на позицию — те же позиции на том же потоке', () {
    final bad = <String>[];
    final cases = (ref['varSequences'] as List).cast<Map<String, dynamic>>();
    for (final c in cases) {
      final randoms = (c['randoms'] as List).map((e) => (e as num).toDouble()).toList();
      var used = 0;
      double rng() => randoms[used++];
      final plan = (c['plan'] as List).cast<int>();
      final s = buildNbackSequenceVar(c['trials'] as int, plan, c['alphabet'] as int, rng,
          (c['lureRate'] as num?)?.toDouble());
      final tag = 'L${c['level']} t${c['trials']} a${c['alphabet']}';
      if (s.items.join(',') != (c['items'] as List).join(',')) bad.add('$tag: стимулы');
      if (s.matchAt.join(',') != (c['matchAt'] as List).join(',')) bad.add('$tag: цели');
      if (s.lureAt.join(',') != (c['lureAt'] as List).join(',')) bad.add('$tag: приманки');
      if (used != randoms.length) bad.add('$tag: съедено ${randoms.length} чисел в вебе, $used здесь');
      if (countMatchesVar(s.items, plan) != c['matches']) bad.add('$tag: счёт целей');
      if (countLuresVar(s.items, plan) != c['lures']) bad.add('$tag: счёт приманок');
    }
    expect(cases.length, 30);
    expect(bad, isEmpty);
  });

  test('ось 9 в партии: ответ сверяется с глубиной ТЕКУЩЕЙ пробы, смена объявлена', () {
    final g = NbackGame(n: 6, trials: 20, modality: NbModality.single, lureRate: 0.45, switchEvery: 4, rng: Random(3).nextDouble);
    expect(g.plan.join(''), '66665555666655556666');
    var switches = 0;
    var hits = 0;
    while (g.next()) {
      if (g.switchedHere) switches += 1;
      if (g.isVisualMatch) {
        expect(g.pressVisual(), NbPress.hit, reason: 'проба ${g.index}: совпадение на глубине ${g.nHere}');
        hits += 1;
      }
      g.closeTrial();
    }
    expect(switches, 4, reason: 'смена глубины на пробах 4, 8, 12, 16');
    expect(hits, countMatchesVar(g.visual.items, g.plan));
    expect(g.accuracy, 100, reason: 'жал ровно на совпадениях по текущей глубине');
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
      // Поток на ЦЕЛОМ состоянии: на дроби он сходится к ≈0,22 и выдаёт почти одно и то же (01.10.2026).
      var st = 137;
      double rng() {
        st = (st * 9301 + 49297) % 233280;
        return st / 233280;
      }
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

  /// Справка двойного потока называет кнопки так, как они подписаны на экране
  /// (`suiteModeSimon` и `label_sound`), во всех 12 языках: подсказка в партии, правило
  /// уровня и его пример. Висели «👁 Position» и «🔊 Sound», когда на кнопке уже «Позиция».
  test('🔴 подсказка и правило двойного потока называют кнопки их подписями — 12 языков', () {
    final bad = <String>[];
    for (final lang in const ['ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar']) {
      final d = jsonDecode(File('assets/l10n/$lang.json').readAsStringSync()) as Map<String, dynamic>;
      final buttons = [d['suiteModeSimon'] as String, d['label_sound'] as String];
      for (final key in const ['nBackDualHint', 'lr_n_back_dual_rule', 'lr_n_back_dual_example']) {
        final text = d[key] as String;
        for (final b in buttons) {
          if (!text.contains(b)) bad.add('$lang.$key без «$b»');
        }
        if (lang != 'en' && text.contains('Sound')) bad.add('$lang.$key: «Sound»');
      }
    }
    expect(bad, isEmpty);
  });
}
