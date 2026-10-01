// Дорога раннера — перенос ядра «Числового забега»: сверка с прогоном живого runner-core.mjs.
//
// Эталон: test/fixtures/road-reference.json (frontend/src/games/number-run/tools/record-road-reference.mjs).
// Каждый сценарий — трасса из рядов-ответов, лента нажатий «перед каким кадром что нажато»
// и неровные кадры (60/30 Гц, дрожание, догон, прерывание > 0,8 с). Сверяется след каждого
// 16-го кадра и каждого кадра с событием, и все события целиком — точным равенством чисел.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/search_runner/road.dart';

void main() {
  final ref = jsonDecode(File('test/fixtures/road-reference.json').readAsStringSync()) as Map<String, dynamic>;
  final scenarios = (ref['scenarios'] as List).cast<Map<String, dynamic>>();

  test('шаг интегрирования тот же, что у ядра', () {
    expect(roadFixedDt, ref['fixedDt']);
  });

  for (final scn in scenarios) {
    test('🔴 ${scn['name']}: след и события совпадают с живым ядром', () {
      final course = RoadCourse.fromJson(scn['course'] as Map<String, dynamic>);
      final frames = [for (final f in scn['frames'] as List) (f as num).toDouble()];
      final applied = <int, List<Map<String, dynamic>>>{};
      for (final a in (scn['applied'] as List).cast<Map<String, dynamic>>()) {
        applied.putIfAbsent(a['i'] as int, () => []).add(a);
      }
      final trace = (scn['trace'] as List).cast<Map<String, dynamic>>();
      var s = roadResume(roadInitial(course));
      var k = 0;
      for (var i = 0; i < frames.length; i += 1) {
        for (final a in applied[i] ?? const <Map<String, dynamic>>[]) {
          s = switch (a['op']) {
            'lane' => roadChangeLane(s, a['d'] as int),
            'target' => roadSetTarget(s, (a['x'] as num).toDouble()),
            'pause' => roadPause(s),
            _ => roadResume(s),
          };
        }
        s = roadAdvanceFrame(s, frames[i], course);
        if (k < trace.length && trace[k]['i'] == i) {
          final t = trace[k];
          final got = {
            'z': s.z,
            'x': s.x,
            'target': s.target,
            'nextRow': s.nextRow,
            'sum': s.sum,
            'mistakes': s.mistakes,
            'status': s.status.name,
            'elapsed': s.elapsed,
            'slowFrames': s.slowFrames,
            'discardedTime': s.discardedTime,
            'pauses': s.pauses,
            'events': s.events.length,
          };
          for (final key in got.keys) {
            expect(got[key], t[key], reason: '${scn['name']}, кадр $i: $key');
          }
          k += 1;
        }
      }
      expect(k, trace.length, reason: 'след пройден не весь');
      final events = [for (final e in s.events) jsonDecode(jsonEncode(e.toJson()))];
      expect(events, scn['events']);
    });
  }

  test('ответ считается по полосе НА ПЕРЕСЕЧЕНИИ ряда, а не по цели', () {
    // Цель уже справа, но за 0,1 с до ряда машина успевает сдвинуться только на 0,4 полосы:
    // на пересечении она ещё в средней полосе.
    const course = RoadCourse(levelId: 1, seed: 1, rows: [RoadRow(id: 0, z: 8, correct: 2)]);
    var s = roadResume(roadInitial(course));
    for (var i = 0; i < 54; i += 1) {
      s = roadAdvanceFrame(s, 1 / 60, course); // 0,9 с — до ряда 0,8 единицы
    }
    s = roadChangeLane(s, 1);
    for (var i = 0; i < 12; i += 1) {
      s = roadAdvanceFrame(s, 1 / 60, course);
    }
    final a = s.answers.single;
    expect(a.lane, 0, reason: 'на пересечении машина ещё в средней полосе');
    expect(a.ok, isFalse);
  });

  test('полоса округляется как Math.round: −0,5 — средняя, а не левая', () {
    const course = RoadCourse(levelId: 2, seed: 2, rows: [RoadRow(id: 0, z: 4, correct: 1)]);
    var s = roadResume(roadInitial(course));
    s = roadSetTarget(s, -0.5);
    for (var i = 0; i < 40; i += 1) {
      s = roadAdvanceFrame(s, 1 / 60, course);
    }
    expect(s.answers.single.lane, 0);
    expect(s.answers.single.ok, isTrue);
  });
}
