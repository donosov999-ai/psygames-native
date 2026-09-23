import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/object_tracker/model.dart';

/// СВЕРКА ПРАВИЛ «ТРЕКЕРА ОБЪЕКТОВ» С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// `test/fixtures/object-tracker-reference.json` выгружен прогоном веб-ядра:
/// 24 круга с полным составом, вся лестница 41 уровня, второе зерно, три
/// траектории целиком, один длинный шаг против многих коротких, подсчёт очков.
///
/// 🔴 ЧТО СВЕРЯЕТСЯ ТОЧНО, А ЧТО С ДОПУСКОМ — И ПОЧЕМУ. Раздача круга (состав,
/// цели, стартовые места и скорости, трудность) и подсчёт очков сверяются ТОЧНО.
/// Траектория — с допуском: `Math.hypot`, `sin`, `cos`, `atan2` у JS и у Dart
/// расходятся в последнем знаке, а шаг физики повторяется сотни раз за круг.
/// Допуск не выдуман: проба ИЗМЕРЯЕТ накопленный разбег и печатает его.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/object-tracker-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 зерно то же: хеши, причёсывание и броски совпадают', () {
    for (final raw in ref['hashes'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(hashSeed(e['s'] as String), e['h'], reason: 'хеш «${e['s']}»');
    }
    for (final raw in ref['normalize'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(normalizeSeed(e['s'] as String), e['out'], reason: '«${e['s']}»');
    }
    final rng = createRng('object-tracker-nzt:1:$trackerGeneratorVersion');
    for (final want in (ref['draws'] as List).cast<num>()) {
      expect(rng(), closeTo(want.toDouble(), 1e-15));
    }
  });

  test('🔴 лестница 41 уровня совпадает шаг в шаг', () {
    expect(trackerLevels, ref['levels']);
    expect(trackerObjectRadius, ref['radius']);
    for (final raw in ref['ladder'] as List) {
      final e = raw as Map<String, dynamic>;
      final r = generateObjectTrackerRound('object-tracker-nzt', e['level'] as int);
      final at = 'L${e['level']}';
      expect(r.objectCount, e['objects'], reason: '$at шариков');
      expect(r.targetCount, e['targets'], reason: '$at целей');
      expect(r.speed, closeTo((e['speed'] as num).toDouble(), 1e-12), reason: '$at скорость');
      expect(r.durationMs, e['durationMs'], reason: '$at длительность');
      expect(r.closeApproachStrength, closeTo((e['close'] as num).toDouble(), 1e-12), reason: '$at стягивание');
      expect(r.difficulty, e['difficulty'], reason: '$at трудность');
    }
  });

  test('🔴 раздача круга та же: места, скорости и цели до последнего знака', () {
    var checked = 0;
    for (final raw in ref['rounds'] as List) {
      final e = raw as Map<String, dynamic>;
      final r = generateObjectTrackerRound('object-tracker-nzt', e['level'] as int);
      final at = 'L${e['level']}';
      expect(r.id, e['id'], reason: '$at номер');
      expect(r.seed, e['seed'], reason: '$at зерно');
      expect(r.targetIds, e['targetIds'], reason: '$at цели');
      final want = (e['objects'] as List).map((o) => (o as List)).toList();
      expect(r.initialWorld.objects.length, want.length, reason: '$at число шариков');
      for (var i = 0; i < want.length; i += 1) {
        final o = r.initialWorld.objects[i];
        expect(o.id, want[i][0], reason: '$at шарик $i');
        expect(o.x, closeTo((want[i][1] as num).toDouble(), 1e-15), reason: '$at x$i');
        expect(o.y, closeTo((want[i][2] as num).toDouble(), 1e-15), reason: '$at y$i');
        expect(o.vx, closeTo((want[i][3] as num).toDouble(), 1e-15), reason: '$at vx$i');
        expect(o.vy, closeTo((want[i][4] as num).toDouble(), 1e-15), reason: '$at vy$i');
      }
      expect((e['validation'] as List), isEmpty, reason: '$at веб считал круг исправным');
      expect(validateObjectTrackerRound(r), isEmpty, reason: '$at и здесь круг исправен');
      checked += 1;
    }
    expect(checked, 24);
  });

  test('🔴 второе зерно, с пробелами и подчёркиванием, даёт тот же круг', () {
    for (final raw in ref['second'] as List) {
      final e = raw as Map<String, dynamic>;
      final r = generateObjectTrackerRound('  Trek_Проба  ', e['level'] as int);
      expect(r.id, e['id']);
      expect(r.targetIds, e['targetIds']);
      final want = (e['objects'] as List).map((o) => (o as List)).toList();
      for (var i = 0; i < want.length; i += 1) {
        expect(r.initialWorld.objects[i].x, closeTo((want[i][1] as num).toDouble(), 1e-15));
        expect(r.initialWorld.objects[i].vy, closeTo((want[i][4] as num).toDouble(), 1e-15));
      }
    }
  });

  test('🔴 траектория совпадает с веб-версией; разбег ИЗМЕРЕН, а не назначен', () {
    var worstDrift = 0.0;
    var worstAt = '';
    for (final raw in ref['traces'] as List) {
      final e = raw as Map<String, dynamic>;
      final r = generateObjectTrackerRound('object-tracker-nzt', e['level'] as int);
      final frames = simulateTrackerRound(r, 50);
      expect(frames.length, e['frameCount'], reason: 'L${e['level']} столько же кадров');
      for (final rawFrame in (e['frames'] as List)) {
        final f = rawFrame as Map<String, dynamic>;
        final got = frames[f['i'] as int];
        final at = 'L${e['level']} кадр ${f['i']}';
        expect(got.timeMs, closeTo((f['t'] as num).toDouble(), 1e-9), reason: '$at время');
        expect(got.closeApproaches, f['closeApproaches'], reason: '$at сближений');
        expect(got.closePairs, f['closePairs'], reason: '$at пары вплотную');
        final want = (f['objects'] as List).map((o) => (o as List)).toList();
        for (var i = 0; i < want.length; i += 1) {
          final dx = (got.objects[i].x - (want[i][0] as num).toDouble()).abs();
          final dy = (got.objects[i].y - (want[i][1] as num).toDouble()).abs();
          final d = dx > dy ? dx : dy;
          if (d > worstDrift) {
            worstDrift = d;
            worstAt = '$at шарик $i';
          }
        }
      }
    }
    // ⚠️ ЧИСЛО НИЖЕ — ЗАМЕР, А НЕ ПОЖЕЛАНИЕ. Замер 23.09.2026: наибольший разбег
    // по трём траекториям (L1, L17, L41 — 147 кадров, 12 шариков) = 1,73e-14,
    // то есть шум последнего знака. Порог 1e-12 — с запасом в полсотни раз.
    // Вырос разбег — разошлась не арифметика, а сама физика: это дефект переноса.
    expect(worstDrift < 1e-12, isTrue,
        reason: 'наибольший разбег по всем траекториям: $worstDrift ($worstAt)');
    // Печатается всегда: пусть следующий заход видит число, а не верит на слово.
    printOnFailure('наибольший разбег: $worstDrift');
    expect(worstDrift, isNot(double.nan));
  });

  test('🔴 один длинный шаг равен многим коротким — шаг физики фиксирован', () {
    final e = ref['oneBigStep'] as Map<String, dynamic>;
    final r = generateObjectTrackerRound('object-tracker-nzt', e['level'] as int);
    final w = advanceTrackerWorld(r, r.initialWorld, r.durationMs.toDouble());
    expect(w.timeMs, closeTo((e['t'] as num).toDouble(), 1e-9));
    expect(w.closeApproaches, e['closeApproaches'], reason: 'столько же сближений');
    final want = (e['objects'] as List).map((o) => (o as List)).toList();
    for (var i = 0; i < want.length; i += 1) {
      expect(w.objects[i].x, closeTo((want[i][0] as num).toDouble(), 1e-9), reason: 'шарик $i по x');
      expect(w.objects[i].y, closeTo((want[i][1] as num).toDouble(), 1e-9), reason: 'шарик $i по y');
    }
  });

  test('🔴 очки и «взят ли уровень» считаются теми же числами', () {
    for (final raw in ref['scoreCases'] as List) {
      final e = raw as Map<String, dynamic>;
      final r = generateObjectTrackerRound('object-tracker-nzt', e['level'] as int);
      final m = scoreObjectTrackerCompletion(
        r,
        (e['selected'] as List).cast<String>(),
        durationMs: e['durationMs'] as int,
        closeApproaches: e['closeApproaches'] as int,
      );
      final want = e['metrics'] as Map<String, dynamic>;
      final at = 'L${e['level']} выбор ${e['selected']}';
      expect(m.accuracy, closeTo((want['accuracy'] as num).toDouble(), 1e-12), reason: '$at точность');
      expect(m.errors, want['errors'], reason: '$at ошибок');
      expect(m.score, want['score'], reason: '$at очки');
      expect(m.hits, want['hits'], reason: '$at попаданий');
      expect(m.misses, want['misses'], reason: '$at пропущено');
      expect(m.falseSelections, want['falseSelections'], reason: '$at лишних');
      expect(m.selectedCount, want['selectedCount'], reason: '$at отмечено (дубли не в счёт)');
      expect(isPassed(m), e['passed'], reason: '$at уровень взят?');
    }
  });

  test('🔴 шарики не налезают друг на друга и не уходят за поле ВЕСЬ круг', () {
    // Независимая проверка: вопрос доске, а не генератору. Гоняем полный круг и
    // на каждом кадре требуем, чтобы мир был исправен по тем же правилам, что в вебе.
    for (final level in [1, 9, 21, 33, 41]) {
      final r = generateObjectTrackerRound('object-tracker-nzt', level);
      final frames = simulateTrackerRound(r, 50);
      for (var i = 1; i < frames.length; i += 1) {
        final v = validateTrackerWorld(r, frames[i], previous: frames[i - 1], deltaMs: 50);
        expect(v.valid, isTrue, reason: 'L$level кадр $i: ${v.issues}');
      }
    }
  });
}
