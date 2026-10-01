// «Гимнастика для глаз»: перенос правил против ЖИВОГО экрана `eye-gym.tsx`.
//
// Эталон снят `node flutter/tools/export-pause.cjs`: объявления вырезаны из исходника
// экрана и исполнены как есть, уровни и геометрия — из модулей сервисов. Сверяется
// всё, от чего зависит, что человек видит и что пишется в историю: шаги и их длина,
// уровни, минуты на тропинке, каждая точка траектории всех 11 узоров, поле.
import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/pause/eye_gym.dart';

void main() {
  final ref = jsonDecode(File('test/fixtures/eye-gym-reference.json').readAsStringSync()) as Map<String, dynamic>;

  test('последовательность, направления, режимы и множители — как на экране веба', () {
    expect(
      [for (final s in eyeSequence) {'key': s.key, 'pattern': s.pattern, 'dur': s.dur, 'instrKey': s.instrKey}],
      ref['sequence'],
    );
    expect(eyeDirections, ref['directions']);
    expect(eyeModePhases, ref['modePhases']);
    for (final m in eyeModePhases.keys) {
      expect(eyeModeMul(m), ref['modeMul'][m], reason: m);
    }
    expect(eyeMaxLevel, ref['maxLevel']);
    expect(eyeBaseTotalSec(), ref['baseTotalSec']);
  });

  test('уровни: масштаб, скорость и минуты на тропинке — на всех 15 и за краями', () {
    for (final l in ref['levels'] as List) {
      final got = eyeGymLevel(l['level'] as int);
      expect({'scale': got.scale, 'speed': got.speed}, l['cfg'], reason: 'уровень ${l['level']}');
      expect(eyeGymLevelMinutes(l['level'] as int), l['minutes'], reason: 'минуты уровня ${l['level']}');
    }
  });

  test('шаги подхода: подмножество режима, масштаб, множитель, не короче 8 с', () {
    for (final c in ref['steps'] as List) {
      final got = eyeSteps(c['mode'] as String, (c['scale'] as num).toDouble());
      expect([for (final s in got) {'key': s.key, 'dur': s.dur}], c['steps'], reason: '${c['mode']} × ${c['scale']}');
    }
  });

  test('траектория: каждая точка каждого узора — до 1e-9 px', () {
    final dots = ref['dots'] as List;
    expect(dots.map((d) => d['pattern']).toSet(), hasLength(11), reason: 'эталон обязан покрывать все узоры');
    for (final d in dots) {
      final got = eyeDotFor(d['pattern'] as String, (d['local'] as num).toDouble(), (d['localSec'] as num).toDouble(),
          150, 212, 179, 246, (d['speed'] as num).toDouble());
      final want = d['out'] as Map<String, dynamic>;
      final why = '${d['pattern']} local=${d['local']} sec=${d['localSec']} speed=${d['speed']}';
      expect(got.x, closeTo((want['x'] as num).toDouble(), 1e-9), reason: why);
      expect(got.y, closeTo((want['y'] as num).toDouble(), 1e-9), reason: why);
      expect(got.size, closeTo((want['size'] as num).toDouble(), 1e-9), reason: why);
      expect(got.big, want['big'], reason: why);
    }
  });

  test('поле: размах точки по ширине и высоте — как у веба', () {
    for (final g in ref['geometry'] as List) {
      final vp = g['viewport'] as Map<String, dynamic>;
      final f = g['field'] as Map<String, dynamic>?;
      final got = eyeGymGeometry(
        Size((vp['width'] as num).toDouble(), (vp['height'] as num).toDouble()),
        f == null ? null : Size((f['width'] as num).toDouble(), (f['height'] as num).toDouble()),
      );
      final want = g['out'] as Map<String, dynamic>;
      expect(
        {'boardW': got.boardW, 'boardH': got.boardH, 'cx': got.cx, 'cy': got.cy, 'RX': got.rx, 'RY': got.ry},
        {for (final e in want.entries) e.key: (e.value as num).toDouble()},
        reason: '$vp $f',
      );
    }
  });

  test('подход идёт по времени, пауза в зачёт не идёт, шаг и доля — как у веба', () {
    final steps = eyeSteps('full', 1);
    final run = EyeGymRun(steps: steps, level: 5, byLevel: true, speed: 1, now: 0);
    run.tick(23000);
    expect(run.position.index, 0);
    expect(run.position.localSec, closeTo(23, 1e-9));
    run.tick(25000);
    expect(run.position.index, 1, reason: 'после 24 с разминки — слежение по горизонтали');
    run.pause(25000);
    run.tick(85000);
    expect(run.elapsed, closeTo(25, 1e-9), reason: 'на паузе время стоит');
    run.resume(85000);
    run.tick(85000 + (run.totalSec - 25) * 1000);
    expect(run.done, isTrue);
    expect(run.remainSec, 0);
  });
}
