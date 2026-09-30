import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/scholars_mate/ladder.dart';

/// 🔴 ЛЕСТНИЦА «ДЕТСКОГО МАТА» СВЕРЕНА С ЖИВЫМ TS НА ВСЕХ СОРОКА СТУПЕНЯХ.
///
/// Уровень у веба и нативной половины общий: разойдись числа — человек на той
/// же ступени получил бы другое время, другие виды заданий и другой порог.
void main() {
  final reference = jsonDecode(
    File('test/fixtures/scholars-mate-reference.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  ScholarsKind kindOf(String name) => switch (name) {
    'mate' => ScholarsKind.mate,
    'fromGames' => ScholarsKind.fromGames,
    'threat' => ScholarsKind.threat,
    'defend' => ScholarsKind.defend,
    _ => ScholarsKind.sacrifice,
  };

  test('🔴 сорок ступеней: время, виды, узоры, порог — всё совпадает', () {
    expect(scholarsLevels, reference['levels']);
    final perLevel = reference['perLevel'] as Map<String, dynamic>;
    expect(perLevel, hasLength(40));
    for (final entry in perLevel.entries) {
      final level = int.parse(entry.key);
      final want = entry.value as Map<String, dynamic>;
      final params = want['params'] as Map<String, dynamic>;
      final got = levelParams(level);

      expect(
        secondsAt(level),
        want['seconds'],
        reason: 'секунды, ступень $level',
      );
      expect(got.count, params['count'], reason: 'позиций, ступень $level');
      expect(
        got.minRating,
        params['minRating'],
        reason: 'низ полосы, ступень $level',
      );
      expect(
        got.maxRating,
        params['maxRating'],
        reason: 'верх полосы, ступень $level',
      );
      expect(
        got.kinds.map((k) => k.name).toList(),
        (params['kinds'] as List<dynamic>).cast<String>(),
        reason: 'виды заданий, ступень $level',
      );
      expect(
        motifsAt(level),
        (want['motifs'] as List<dynamic>).cast<String>(),
        reason: 'узоры, ступень $level',
      );
      expect(
        newMotifAt(level),
        want['newMotif'],
        reason: 'новый узор, ступень $level',
      );
      expect(
        announceKind(level),
        want['announce'],
        reason: 'объявлять вид, ступень $level',
      );
      expect(
        missAllowance(level),
        want['missAllowance'],
        reason: 'допуск промахов, $level',
      );
      expect(
        levelThreshold(level, 20),
        closeTo((want['threshold'] as num).toDouble(), 1e-9),
        reason: 'порог ступени $level',
      );
      expect(
        kindLabels(got.kinds),
        (want['labels'] as List<dynamic>).cast<String>(),
        reason: 'подписи видов, ступень $level',
      );
    }
  });

  test('🔴 время монотонно падает 20 → 4 и НИКОГДА не растёт', () {
    // Здесь была настоящая беда: надбавки за участки откатывали время назад
    // (L20 = 12 с, L21 = 16 с), и обещанные четыре секунды не выдавались.
    var prev = secondsAt(1);
    expect(prev, 20);
    for (var l = 2; l <= scholarsLevels; l++) {
      final now = secondsAt(l);
      expect(
        now,
        lessThanOrEqualTo(prev),
        reason: 'ступень $l отмотала время назад',
      );
      prev = now;
    }
    expect(secondsAt(scholarsLevels), 4);
  });

  test('🔴 время по виду задания совпадает с живым TS', () {
    for (final c
        in (reference['secondsFor'] as List<dynamic>)
            .cast<Map<String, dynamic>>()) {
      expect(
        secondsFor(kindOf(c['kind'] as String), c['level'] as int),
        c['seconds'],
        reason: '${c['kind']} на ступени ${c['level']}',
      );
    }
    for (final e
        in (reference['secondsByKind'] as Map<String, dynamic>).entries) {
      expect(
        secondsByKind[kindOf(e.key)],
        (e.value as num).toDouble(),
        reason: e.key,
      );
    }
  });

  test('🔴 звёзды и цена подсказки совпадают', () {
    for (final s
        in (reference['stars'] as List<dynamic>).cast<Map<String, dynamic>>()) {
      final ms = s['ms'] as int;
      final level = s['level'] as int;
      expect(
        starsFor(ms, level),
        s['stars'],
        reason: '$ms мс на ступени $level',
      );
      expect(
        runStars(ms, level, 1),
        s['withHint'],
        reason: 'с подсказкой, $ms/$level',
      );
      expect(
        runStars(ms, level, 0),
        s['withoutHint'],
        reason: 'без подсказки, $ms/$level',
      );
    }
  });

  test('🔴 медиана и размеры доски совпадают', () {
    for (final m
        in (reference['median'] as List<dynamic>)
            .cast<Map<String, dynamic>>()) {
      expect(
        medianMs((m['input'] as List<dynamic>).cast<int>()),
        m['out'],
        reason: 'медиана ${m['input']}',
      );
    }
    for (final b
        in (reference['board'] as List<dynamic>).cast<Map<String, dynamic>>()) {
      expect(
        cellSize(b['size'] as int),
        b['cell'],
        reason: 'клетка при ${b['size']}',
      );
      expect(
        boardWidth(b['size'] as int),
        b['width'],
        reason: 'доска при ${b['size']}',
      );
    }
  });
}
