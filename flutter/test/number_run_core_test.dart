// «Числовой забег» на Flutter: перенос ядра дороги, построений, уровней и забега — сверка с
// прогоном живых runner-*.mjs и настоящих генераторов станций ТОЧНЫМ равенством чисел.
//
// Эталоны (frontend/src/games/number-run/tools/record-number-run-reference.mjs):
// · number-run-courses-reference.json — жребий, правила, 31 уровень и забег целиком;
// · number-run-runs-reference.json — 15 прогонов кадров с нажатиями: след и все события (12 по
//   уровням и забегу, 3 ручные дорожки на границе взлёта с трамплина, 1 — три шкалы: в допуске,
//   «близко», мимо).
// Кадры прогонов обе стороны выводят из mulberry32 раннера — поэтому жребий сверяется первым.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/number_run/campaign.dart';
import 'package:psygames_flutter/games/number_run/level.dart';
import 'package:psygames_flutter/games/runner/road.dart';
import 'package:psygames_flutter/games/runner/rules.dart';
import 'package:psygames_flutter/games/runner/shapes.dart';
import 'package:psygames_flutter/games/runner/solver.dart';
import 'package:psygames_flutter/shell/js_compat.dart' show Rng;

Object? _plain(Object? v) => jsonDecode(jsonEncode(v));

/// Кадр от жребия — тот же, что `frameAt` выгрузчика.
double frameAt(Rng r, String profile) {
  final u = r();
  if (u < .72) return 1 / 60;
  if (u < .82) return 1 / 30;
  if (u < .92) return 1 / 60 + (r() - .5) * .006;
  if (u < .96 || profile == 'smooth') return 1 / 120;
  if (u < .995) return .12 + r() * .2;
  return .85 + r() * .3;
}

void _expectCourse(RoadCourse got, Map<String, dynamic> want, String where) {
  final g = _plain(got.toJson()) as Map<String, dynamic>;
  final gRows = g.remove('rows') as List, wRows = want['rows'] as List;
  final w = Map<String, dynamic>.of(want)..remove('rows');
  expect(gRows.length, wRows.length, reason: '$where: число рядов');
  for (var i = 0; i < wRows.length; i++) {
    expect(gRows[i], wRows[i], reason: '$where: ряд $i');
  }
  expect(g, w, reason: '$where: поля курса');
}

void main() {
  final courses =
      jsonDecode(File('test/fixtures/number-run-courses-reference.json').readAsStringSync()) as Map<String, dynamic>;
  final runsRef =
      jsonDecode(File('test/fixtures/number-run-runs-reference.json').readAsStringSync()) as Map<String, dynamic>;

  group('жребий и правила', () {
    test('версии ядра, уровней и забега — те же, что в вебе', () {
      expect(roadCoreVersion, courses['coreVersion']);
      expect(levelVersion, courses['levelVersion']);
      expect(campaignVersion, courses['campaignVersion']);
    });

    test('🔴 mulberry32 раннера: те же числа на тех же зёрнах', () {
      for (final r in (courses['random'] as List).cast<Map<String, dynamic>>()) {
        final rng = runnerRandom(r['seed'] as int);
        expect([for (var i = 0; i < 6; i++) rng()], r['values'], reason: 'зерно ${r['seed']}');
      }
    });

    test('ворота «ровно N»: цена попадания и промаха', () {
      for (final c in (courses['exactDelta'] as List).cast<List>()) {
        final e = RoadExact(
            target: (c[0] as num).toDouble(), bonus: (c[1] as num).toDouble(), unit: (c[2] as num).toDouble());
        expect(exactDelta(e, (c[3] as num).toDouble()), c[4], reason: 'цель ${c[0]}, собрано ${c[3]}');
      }
    });

    test('финальная лестница: десять круглых стен, верхнюю эталон пробивает', () {
      for (final c in (courses['finale'] as List).cast<List>()) {
        expect(finaleLadder((c[0] as num).toDouble()).walls, c[1], reason: 'эталон ${c[0]}');
      }
    });

    test('стены-операции: +, −, ×, пропуск и ошибка правил вне предела', () {
      for (final c in (courses['applyOperation'] as List).cast<List>()) {
        final sum = (c[0] as num).toDouble(), label = c[1] as String, limit = (c[2] as num).toDouble();
        if (c[3] == null) {
          expect(() => applyOperation(sum, label, limit), throwsA(anything), reason: '$sum $label');
        } else {
          expect(applyOperation(sum, label, limit), c[3], reason: '$sum $label');
        }
      }
    });
  });

  group('уровни и забег — ряд в ряд', () {
    for (final l in (courses['levels'] as List).cast<Map<String, dynamic>>()) {
      final level = l['level'] as int, seed = l['seed'] as int;
      test('🔴 уровень $level, зерно $seed: план, ряды, путь решателя, финал', () {
        expect(isBossLevel(level), l['boss']);
        expect(stationPlan(level, isBossLevel(level)), l['plan']);
        final course = makeLevel(level, seed, countingTasks, boss: isBossLevel(level));
        _expectCourse(course, l['course'] as Map<String, dynamic>, 'L$level/$seed');
        expect(_plain([for (final p in solveCourse(course)!) p.toJson()]), l['path'], reason: 'путь решателя');
        expect([for (final lane in const [-1.0, 0.0, 1.0]) stationaryWins(course, lane)], l['stationary']);
        for (final p in (l['passed'] as List).cast<List>()) {
          expect(levelPassed(course, (p[0] as num).toDouble()), p[1], reason: 'число ${p[0]}');
        }
      });
    }

    test('курс читается из JSON веба и пишется обратно без потерь', () {
      for (final l in (courses['levels'] as List).cast<Map<String, dynamic>>().take(20)) {
        final want = l['course'] as Map<String, dynamic>;
        _expectCourse(RoadCourse.fromFullJson(want), want, 'чтение L${l['level']}');
      }
      final c = (courses['campaign'] as Map<String, dynamic>)['course'] as Map<String, dynamic>;
      _expectCourse(RoadCourse.fromFullJson(c), c, 'чтение забега');
    });

    test('«стоящий на месте» за столбом: широкое число с чужой стороны не достаётся', () {
      for (final e in (courses['stationaryEdges'] as List).cast<Map<String, dynamic>>()) {
        final course = RoadCourse.fromFullJson({...e['course'] as Map<String, dynamic>, 'start': e['start']});
        expect([for (final lane in const [-1.0, 0.0, 1.0]) stationaryWins(course, lane)], e['stationary']);
      }
    });

    test('🔴 забег «Свободно»: 12 этапов, путь решателя, лестница', () {
      final c = courses['campaign'] as Map<String, dynamic>;
      final course = makeCampaign(c['seed'] as int);
      _expectCourse(course, c['course'] as Map<String, dynamic>, 'забег');
      expect(_plain([for (final p in solveCourse(course)!) p.toJson()]), c['path']);
      for (final w in (c['walls'] as List).cast<List>()) {
        expect(wallsBroken(course.finale!, (w[0] as num).toDouble()), w[1]);
      }
    });
  });

  test('🔴 вопрос шкалы на английском — дробь с точкой, остальной уровень ряд в ряд', () {
    // Веб: `шкала.formatExpression(q.expression, язык)` (NumberRunGame.web.tsx:216) — запятая только
    // по-русски. Эталоны сняты русской записью, поэтому пробы ядра идут через countingTasks ('ru'),
    // а здесь — что английская раздача отличается от неё ТОЛЬКО разделителем дробей.
    final decimalComma = RegExp(r'(?<=\d),(?=\d)');
    Object? noPrompts(RoadCourse c) => jsonDecode(jsonEncode(c.toJson()), reviver: (k, v) => k == 'prompt' ? null : v);
    var withFractions = 0;
    for (var level = 13; level <= 52; level += 1) {
      for (var seed = 1; seed <= 3; seed += 1) {
        final boss = isBossLevel(level);
        final ru = makeLevel(level, seed, countingTasks, boss: boss);
        final en = makeLevel(level, seed, countingTasksFor('en'), boss: boss);
        expect(jsonEncode(noPrompts(en)), jsonEncode(noPrompts(ru)), reason: 'L$level/$seed: раздача та же');
        for (var i = 0; i < ru.rows.length; i += 1) {
          final a = ru.rows[i].prompt, b = en.rows[i].prompt;
          if (a == null) continue;
          expect(b, a.replaceAll(decimalComma, '.'), reason: 'L$level/$seed ряд $i');
          if (a.contains(decimalComma)) withFractions += 1;
        }
      }
    }
    expect(withFractions, greaterThan(0), reason: 'ни одной дроби в вопросах шкалы — проба ничего не проверила');
  });

  group('прогоны кадров', () {
    for (final run in (runsRef['runs'] as List).cast<Map<String, dynamic>>()) {
      test('🔴 ${run['name']}: след и события совпадают с живым ядром', () {
        final src = run['source'] as Map<String, dynamic>;
        final course = src.containsKey('course')
            ? RoadCourse.fromFullJson(src['course'] as Map<String, dynamic>)
            : src.containsKey('campaign')
                ? makeCampaign(src['campaign'] as int)
                : makeLevel(src['level'] as int, src['seed'] as int, countingTasks, boss: isBossLevel(src['level'] as int));
        final fr = runnerRandom(run['frameSeed'] as int);
        final profile = run['profile'] as String;
        final applied = <int, List<List>>{};
        for (final a in (run['applied'] as List).cast<List>()) {
          applied.putIfAbsent(a[0] as int, () => []).add(a);
        }
        final trace = (run['trace'] as List).cast<List>();
        final last = trace.last[0] as int;
        var s = roadResume(roadInitial(course));
        var k = 0;
        for (var i = 0; i <= last; i++) {
          for (final a in applied[i] ?? const <List>[]) {
            s = switch (a[1]) {
              'target' => roadSetTarget(s, (a[2] as num).toDouble()),
              'lane' => roadChangeLane(s, a[2] as int),
              'pause' => roadPause(s),
              _ => roadResume(s),
            };
          }
          s = roadAdvanceFrame(s, frameAt(fr, profile), course);
          if (k < trace.length && trace[k][0] == i) {
            final got = [
              i, s.z, s.x, s.target, s.nextRow, s.sum, s.mistakes, s.status.name, s.elapsed, s.slowFrames, //
              s.discardedTime, s.pauses, s.events.length, s.hits, s.gates, s.peak, s.clearedStages, s.stage,
              s.jump != null ? 1 : 0, s.collected.length,
            ];
            expect(got, trace[k], reason: '${run['name']}, кадр $i');
            k += 1;
          }
        }
        expect(k, trace.length, reason: 'след пройден не весь');
        final events = _plain([for (final e in s.events) e.toJson()]) as List;
        final want = run['events'] as List;
        expect(events.length, want.length, reason: 'число событий');
        for (var i = 0; i < want.length; i++) {
          expect(events[i], want[i], reason: 'событие $i');
        }
        expect(_plain(s.toJson()), run['final'], reason: 'итог');
      });
    }
  });
}
