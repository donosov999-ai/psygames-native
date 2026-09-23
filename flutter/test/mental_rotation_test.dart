import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/mental_rotation/cube_faces.dart';
import 'package:psygames_flutter/games/mental_rotation/formation.dart';
import 'package:psygames_flutter/games/mental_rotation/geometry.dart';
import 'package:psygames_flutter/games/mental_rotation/levels.dart';
import 'package:psygames_flutter/games/mental_rotation/memory.dart';
import 'package:psygames_flutter/games/mental_rotation/net.dart';
import 'package:psygames_flutter/games/mental_rotation/oblique.dart';
import 'package:psygames_flutter/games/mental_rotation/pieces.dart';
import 'package:psygames_flutter/games/mental_rotation/projection.dart';
import 'package:psygames_flutter/games/mental_rotation/rng.dart';
import 'package:psygames_flutter/games/mental_rotation/rotation.dart';
import 'package:psygames_flutter/games/mental_rotation/same.dart';
import 'package:psygames_flutter/games/mental_rotation/section.dart';
import 'package:psygames_flutter/games/mental_rotation/session.dart';
import 'package:psygames_flutter/games/mental_rotation/shapes.dart';
import 'package:psygames_flutter/games/mental_rotation/task.dart';
import 'package:psygames_flutter/games/mental_rotation/viewpoint.dart';

/// СВЕРКА ПЕРЕНОСА «МЫСЛЕННОГО ВРАЩЕНИЯ» С ЖИВЫМ TS.
///
/// Эталоны выгружены прогоном самого TS (временная проба
/// `frontend/src/__tests__/mental-rotation-fixture-export.test.ts`, после выгрузки удалена) в
/// `test/fixtures/mental-rotation-reference.json`. Проверять перенос той же формулой, которой
/// переносил, нельзя — такая проба зелёная всегда, поэтому здесь сравниваются ЧИСЛА И ФИГУРЫ,
/// посчитанные другой стороной.
///
/// 🔴 Задания сравниваются целиком: эталон, порядок вариантов, верный номер, путь поворота. Это же
/// и проверка случайности: разойдись поток на один бросок — совпадут разве что первые два поля.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(
      File('test/fixtures/mental-rotation-reference.json').readAsStringSync(),
    ) as Map<String, dynamic>;
  });

  Shape asShape(dynamic raw) => [
    for (final c in raw as List) [for (final v in c as List) v as int],
  ];

  String keyOf(Shape s) => shapeKey(normalizeShape(s));
  double round6(double x) => (x * 1e6).round() / 1e6;

  /// Каждое задание вида — отдельным сравнением, с именем уровня и семени в причине.
  void forEachCase(String section, void Function(Map<String, dynamic> e, String at) body) {
    final cases = ref[section] as List;
    expect(cases, isNotEmpty, reason: 'эталоны «$section» выгружены');
    for (final raw in cases) {
      final e = raw as Map<String, dynamic>;
      body(e, '$section L${e['level']} семя ${e['seed']}');
    }
  }

  test('🔴 поток случайности совпадает с TS до последнего знака', () {
    for (final raw in ref['rng']['hashes'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(hashSeed(e['seed'] as String), e['hash'], reason: 'семя «${e['seed']}»');
    }
    for (final raw in ref['rng']['streams'] as List) {
      final e = raw as Map<String, dynamic>;
      final rng = createRng(e['seed'] as String);
      for (final expected in e['values'] as List) {
        expect(rng(), expected as double, reason: 'поток «${e['seed']}»');
      }
    }
    final ints = createRng('ints');
    for (final expected in ref['rng']['ints'] as List) {
      expect(randomInt(ints, 0, 9), expected);
    }
    final sh = createRng('shuffle');
    for (final expected in ref['rng']['shuffles'] as List) {
      expect(shuffle(sh, [0, 1, 2, 3, 4]), (expected as List).cast<int>());
    }
  });

  test('🔴 геометрия: 24 ориентации, зеркало, киральность, габарит — как в TS', () {
    final geometry = ref['geometry'] as List;
    expect(geometry.length, shapeLibrary.length, reason: 'библиотека фигур того же размера');
    for (final raw in geometry) {
      final e = raw as Map<String, dynamic>;
      final shape = <Cube>[
        for (final c in shapeLibrary[e['index'] as int]) [...c],
      ];
      final at = 'фигура ${e['index']} (${e['cubes']} кубиков)';
      expect(shapeKey(normalizeShape(shape)), e['key'], reason: '$at: отпечаток');
      expect(allOrientations(shape).length, e['orientations'], reason: '$at: ориентаций');
      expect(
        (allOrientations(shape).map(shapeKey).toList()..sort()).first,
        e['canonical'],
        reason: '$at: канонический вид',
      );
      expect(shapeKey(normalizeShape(mirrorShape(shape))), e['mirrorKey'], reason: '$at: зеркало');
      expect(
        isValidRotation(shape, mirrorShape(shape)),
        e['mirrorIsRotation'],
        reason: '$at: зеркало — поворот?',
      );
      expect(isChiral(shape), e['chiral'], reason: '$at: киральная?');
      expect(isVolumetric(shape), e['volumetric'], reason: '$at: объёмная?');
      expect(boundingBox(shape), (e['box'] as List).cast<int>(), reason: '$at: габарит');
    }
  });

  test('🔴 полосы размеров 4…13: те же фигуры, включая достроенные генератором', () {
    for (final raw in ref['bands'] as List) {
      final e = raw as Map<String, dynamic>;
      final n = e['cubes'] as int;
      final keys = shapesOfSize(n, n).map(keyOf).toList();
      expect(keys, (e['shapes'] as List).cast<String>(), reason: 'полоса $n кубиков');
    }
  });

  test('🔴 лестница из 50 ступеней совпадает по пути, вариантам и подделкам', () {
    final levels = ref['levels'] as List;
    expect(levels.length, 50);
    for (final raw in levels) {
      final e = raw as Map<String, dynamic>;
      final level = e['level'] as int;
      final s = rotationLevelSpec(level);
      final p = levelParams(level);
      final at = 'L$level';
      expect(s.cubes, e['cubes'], reason: '$at: кубиков');
      expect(
        s.path.map(axisName).toList(),
        (e['path'] as List).cast<String>(),
        reason: '$at: путь',
      );
      expect(s.optionCount, e['optionCount'], reason: '$at: вариантов');
      expect(s.foil, e['foil'], reason: '$at: подделки');
      final params = e['params'] as Map<String, dynamic>;
      expect(p.minC, params['minC'], reason: '$at: минимум кубиков');
      expect(p.maxC, params['maxC'], reason: '$at: максимум кубиков');
      expect(
        p.axes.map(axisName).toList(),
        (params['axes'] as List).cast<String>(),
        reason: '$at: оси подделок',
      );
      expect(p.compound, params['compound'], reason: '$at: составной поворот');
      expect(rotationCandidates(p).length, e['candidates'], reason: '$at: фигур-кандидатов');
    }
  });

  test('🔴 «Поворот» целиком: эталон, порядок вариантов, верный номер, путь поворота', () {
    final tasks = ref['tasks'] as List;
    expect(tasks.length, 32);
    for (final raw in tasks) {
      final e = raw as Map<String, dynamic>;
      final at = 'L${e['level']} семя ${e['seed']}';
      final task = buildRotationTask(e['level'] as int, createRng(e['seed'] as String));
      expect(shapeKey(task.base), shapeKey(asShape(e['base'])), reason: '$at: эталон');
      expect(task.steps.map((s) => axisName(s.axis)).toList(), [
        for (final s in e['steps'] as List) (s as Map<String, dynamic>)['axis'] as String,
      ], reason: '$at: путь поворота');
      expect(task.angleSum, e['angleSum'], reason: '$at: сумма углов');
      expect(task.correctIdx, e['correctIdx'], reason: '$at: номер верного');
      final options = e['options'] as List;
      expect(task.options.length, options.length, reason: '$at: число вариантов');
      for (var i = 0; i < options.length; i++) {
        final o = options[i] as Map<String, dynamic>;
        expect(
          shapeKey(task.options[i].shape),
          shapeKey(asShape(o['shape'])),
          reason: '$at: вариант $i',
        );
        expect(task.options[i].isMatch, o['isMatch'], reason: '$at: вариант $i — верный?');
        expect(task.options[i].flaw.name, o['flaw'], reason: '$at: вариант $i — чем плох');
      }
    }
  });

  test('🔴 «Проекция»: фигура, ось взгляда, сетки вариантов и подделки', () {
    forEachCase('projection', (e, at) {
      final p = levelParams(e['level'] as int);
      final t = buildProjectionTask(p.minC, p.maxC, p.optionCount, createRng(e['seed'] as String));
      expect(keyOf(t.shape), e['shape'], reason: '$at: фигура');
      expect(t.view.name, e['view'], reason: '$at: вид');
      expect(t.correctIdx, e['correctIdx'], reason: '$at: номер верного');
      final options = e['options'] as List;
      expect(t.options.length, options.length, reason: '$at: число вариантов');
      for (var i = 0; i < options.length; i++) {
        final o = options[i] as Map<String, dynamic>;
        expect(gridKey(t.options[i].cells), o['cells'], reason: '$at: вариант $i — сетка');
        expect(t.options[i].isMatch, o['isMatch'], reason: '$at: вариант $i — верный?');
        expect(
          projectionFlawName(t.options[i].flaw),
          o['flaw'],
          reason: '$at: вариант $i — чем плох',
        );
      }
    });
  });

  test('🔴 «Развёртка»: складывание выкройки, значки клеток и видимые тройки вариантов', () {
    forEachCase('net', (e, at) {
      final t = buildNetTask(
        levelParams(e['level'] as int).optionCount,
        createRng(e['seed'] as String),
      );
      expect(t.net.id, e['net'], reason: '$at: выкройка');
      expect(faceKey(t.cube), e['cube'], reason: '$at: собранный куб');
      final marks = (t.markOfCell.keys.toList()..sort())
          .map((k) => '$k=${t.markOfCell[k]!.name}')
          .toList();
      expect(marks, (e['marks'] as List).cast<String>(), reason: '$at: значки на клетках');
      expect(t.correctIdx, e['correctIdx'], reason: '$at: номер верного');
      final options = e['options'] as List;
      expect(t.options.length, options.length, reason: '$at: число вариантов');
      for (var i = 0; i < options.length; i++) {
        final o = options[i] as Map<String, dynamic>;
        expect(faceKey(t.options[i].faces), o['faces'], reason: '$at: вариант $i — куб');
        expect(visibleTriple(t.options[i].faces), o['triple'], reason: '$at: вариант $i — видно');
        expect(t.options[i].isMatch, o['isMatch'], reason: '$at: вариант $i — верный?');
        expect(t.options[i].flaw.name, o['flaw'], reason: '$at: вариант $i — чем плох');
      }
    });
  });

  test('🔴 «Точка зрения»: различимые ракурсы считаются рисователем, а не на глаз', () {
    forEachCase('viewpoint', (e, at) {
      final t = buildViewpointTask(e['level'] as int, createRng(e['seed'] as String));
      expect(keyOf(t.shape), e['shape'], reason: '$at: фигура');
      expect(axisName(t.axis), e['axis'], reason: '$at: ось обзора');
      expect(t.degrees, e['degrees'], reason: '$at: верный угол');
      expect(t.correctIdx, e['correctIdx'], reason: '$at: номер верного');
      final options = e['options'] as List;
      expect(t.options.length, options.length, reason: '$at: число вариантов');
      for (var i = 0; i < options.length; i++) {
        final o = options[i] as Map<String, dynamic>;
        expect(t.options[i].degrees, o['degrees'], reason: '$at: вариант $i — угол');
        expect(t.options[i].isMatch, o['isMatch'], reason: '$at: вариант $i — верный?');
      }
    });
  });

  test('🔴 «Одинаковы?»: пара, ответ и чем подделка плоха', () {
    forEachCase('same', (e, at) {
      final t = buildSameTask(e['level'] as int, createRng(e['seed'] as String));
      expect(keyOf(t.left), e['left'], reason: '$at: левая фигура');
      expect(keyOf(t.right), e['right'], reason: '$at: правая фигура');
      expect(t.isSame, e['isSame'], reason: '$at: одинаковы?');
      expect(sameFlawName(t.flaw), e['flaw'], reason: '$at: чем подделка плоха');
      expect(t.correctIdx, e['correctIdx'], reason: '$at: номер верного');
      final options = e['options'] as List;
      for (var i = 0; i < options.length; i++) {
        final o = options[i] as Map<String, dynamic>;
        expect(t.options[i].answer, o['answer'], reason: '$at: кнопка $i');
        expect(t.options[i].isMatch, o['isMatch'], reason: '$at: кнопка $i — верная?');
      }
    });
  });

  test('🔴 «Сборка»: два куска и варианты целого', () {
    forEachCase('assembly', (e, at) {
      final t = buildAssemblyTask(e['level'] as int, createRng(e['seed'] as String));
      expect(
        t.parts.map(keyOf).toList(),
        (e['parts'] as List).cast<String>(),
        reason: '$at: куски',
      );
      expect(t.correctIdx, e['correctIdx'], reason: '$at: номер верного');
      final options = e['options'] as List;
      expect(t.options.length, options.length, reason: '$at: число вариантов');
      for (var i = 0; i < options.length; i++) {
        final o = options[i] as Map<String, dynamic>;
        expect(keyOf(t.options[i].shape), o['shape'], reason: '$at: вариант $i');
        expect(t.options[i].isMatch, o['isMatch'], reason: '$at: вариант $i — верный?');
        expect(pieceFlawName(t.options[i].flaw), o['flaw'], reason: '$at: вариант $i — чем плох');
      }
    });
  });

  test('🔴 «Память»: то же поворотное задание плюс время показа ступени', () {
    final exposures = ref['exposures'] as List;
    for (var i = 0; i < exposures.length; i++) {
      expect(memoryExposureMs(i + 1), exposures[i], reason: 'время показа на L${i + 1}');
    }
    forEachCase('memory', (e, at) {
      final t = buildMemoryTask(e['level'] as int, createRng(e['seed'] as String));
      expect(t.exposureMs, e['exposureMs'], reason: '$at: время показа');
      expect(keyOf(t.rotation.base), e['base'], reason: '$at: эталон');
      expect(t.rotation.angleSum, e['angleSum'], reason: '$at: сумма углов');
      expect(
        t.rotation.steps.map((s) => axisName(s.axis)).toList(),
        (e['steps'] as List).cast<String>(),
        reason: '$at: путь поворота',
      );
      expect(t.rotation.correctIdx, e['correctIdx'], reason: '$at: номер верного');
      final options = e['options'] as List;
      for (var i = 0; i < options.length; i++) {
        final o = options[i] as Map<String, dynamic>;
        expect(keyOf(t.rotation.options[i].shape), o['shape'], reason: '$at: вариант $i');
        expect(t.rotation.options[i].flaw.name, o['flaw'], reason: '$at: вариант $i — чем плох');
      }
    });
  });

  test('🔴 «Три вида»: три сетки и набор подделок, где один вид не выдаёт ответ', () {
    forEachCase('formation', (e, at) {
      final t = buildFormationTask(e['level'] as int, createRng(e['seed'] as String));
      final views = [gridKey(t.views.top), gridKey(t.views.front), gridKey(t.views.side)];
      expect(views, (e['views'] as List).cast<String>(), reason: '$at: три вида');
      expect(t.correctIdx, e['correctIdx'], reason: '$at: номер верного');
      final options = e['options'] as List;
      expect(t.options.length, options.length, reason: '$at: число вариантов');
      for (var i = 0; i < options.length; i++) {
        final o = options[i] as Map<String, dynamic>;
        expect(keyOf(t.options[i].shape), o['shape'], reason: '$at: вариант $i');
        expect(t.options[i].isMatch, o['isMatch'], reason: '$at: вариант $i — верный?');
        expect(pieceFlawName(t.options[i].flaw), o['flaw'], reason: '$at: вариант $i — чем плох');
      }
    });
  });

  test('🔴 «Срез»: слой, его проекция и пять видов ошибки в подделках', () {
    forEachCase('section', (e, at) {
      final t = buildSectionTask(e['level'] as int, createRng(e['seed'] as String));
      expect(keyOf(t.shape), e['shape'], reason: '$at: фигура');
      expect(t.view.name, e['view'], reason: '$at: вид');
      expect(t.layer, e['layer'], reason: '$at: слой');
      expect(keyOf(t.cubes), e['cubes'], reason: '$at: кубики слоя');
      expect(t.rest.length, e['rest'], reason: '$at: кубиков вне слоя');
      expect(t.correctIdx, e['correctIdx'], reason: '$at: номер верного');
      final options = e['options'] as List;
      expect(t.options.length, options.length, reason: '$at: число вариантов');
      for (var i = 0; i < options.length; i++) {
        final o = options[i] as Map<String, dynamic>;
        expect(gridKey(t.options[i].cells), o['cells'], reason: '$at: вариант $i — сетка');
        expect(t.options[i].isMatch, o['isMatch'], reason: '$at: вариант $i — верный?');
        expect(sectionFlawName(t.options[i].flaw), o['flaw'], reason: '$at: вариант $i — чем плох');
      }
    });
  });

  test('🔴 «Недостающая часть»: пустота к зрителю и куски-варианты', () {
    forEachCase('missing', (e, at) {
      final t = buildMissingTask(e['level'] as int, createRng(e['seed'] as String));
      expect(keyOf(t.whole), e['whole'], reason: '$at: целое');
      expect(keyOf(t.hole), e['hole'], reason: '$at: пустота');
      expect(t.correctIdx, e['correctIdx'], reason: '$at: номер верного');
      final options = e['options'] as List;
      expect(t.options.length, options.length, reason: '$at: число вариантов');
      for (var i = 0; i < options.length; i++) {
        final o = options[i] as Map<String, dynamic>;
        expect(keyOf(t.options[i].shape), o['shape'], reason: '$at: вариант $i');
        expect(t.options[i].isMatch, o['isMatch'], reason: '$at: вариант $i — верный?');
        expect(pieceFlawName(t.options[i].flaw), o['flaw'], reason: '$at: вариант $i — чем плох');
      }
    });
  });

  test('🔴 «Сечение»: косая плоскость, многоугольник разреза и его подделки', () {
    forEachCase('oblique', (e, at) {
      final t = buildObliqueTask(e['level'] as int, createRng(e['seed'] as String));
      expect(t.dims.map(round6).toList(), [
        for (final v in e['dims'] as List) (v as num).toDouble(),
      ], reason: '$at: тело');
      expect(t.sides, e['sides'], reason: '$at: сторон у верного');
      expect(t.plane.normal.map(round6).toList(), [
        for (final v in e['normal'] as List) (v as num).toDouble(),
      ], reason: '$at: нормаль');
      expect(round6(t.plane.offset), (e['offset'] as num).toDouble(), reason: '$at: сдвиг');
      final section = e['section'] as List;
      expect(t.section.length, section.length, reason: '$at: вершин сечения');
      for (var i = 0; i < section.length; i++) {
        expect(t.section[i].map(round6).toList(), [
          for (final v in section[i] as List) (v as num).toDouble(),
        ], reason: '$at: вершина $i');
      }
      expect(t.correctIdx, e['correctIdx'], reason: '$at: номер верного');
      final options = e['options'] as List;
      expect(t.options.length, options.length, reason: '$at: число вариантов');
      for (var i = 0; i < options.length; i++) {
        final o = options[i] as Map<String, dynamic>;
        final points = o['points'] as List;
        expect(t.options[i].points.length, points.length, reason: '$at: вариант $i — вершин');
        for (var j = 0; j < points.length; j++) {
          expect(t.options[i].points[j].map(round6).toList(), [
            for (final v in points[j] as List) (v as num).toDouble(),
          ], reason: '$at: вариант $i, вершина $j');
        }
        expect(t.options[i].isMatch, o['isMatch'], reason: '$at: вариант $i — верный?');
        expect(t.options[i].flaw.name, o['flaw'], reason: '$at: вариант $i — чем плох');
      }
    });
  });

  test('🔴 партия: открытие видов, план смеси, отработка и биомаркер', () {
    final s = ref['session'] as Map<String, dynamic>;

    for (final raw in s['unlock'] as List) {
      final e = raw as Map<String, dynamic>;
      final kind = TaskKind.values.byName(e['kind'] as String);
      expect(kindUnlock[kind], e['level'], reason: 'открытие «${e['kind']}»');
    }
    expect(kindUnlock.keys.map((k) => k.name).toList(), [
      for (final raw in s['unlock'] as List) (raw as Map<String, dynamic>)['kind'],
    ], reason: 'порядок видов в карте открытий');

    for (final raw in s['unlocked'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(
        unlockedKinds(e['level'] as int).map((k) => k.name).toList(),
        (e['kinds'] as List).cast<String>(),
        reason: 'открыто на L${e['level']}',
      );
    }

    for (final raw in s['practiceLevel'] as List) {
      final e = raw as Map<String, dynamic>;
      final kind = TaskKind.values.byName(e['kind'] as String);
      expect(
        practiceLevel(kind, e['level'] as int),
        e['at'],
        reason: 'отработка «${e['kind']}» с L${e['level']}',
      );
    }
    expect(
      planPractice(TaskKind.section, 5).map((k) => k.name).toList(),
      (s['practicePlan'] as List).cast<String>(),
      reason: 'план отработки',
    );
    expect(
      [practiceMode(7, null), practiceMode(7, TaskKind.projection)],
      (s['practiceMode'] as List).cast<String>(),
      reason: 'режим партии для истории',
    );

    for (final raw in s['plans'] as List) {
      final e = raw as Map<String, dynamic>;
      final level = e['level'] as int, trials = e['trials'] as int;
      final plan = planTaskKinds(level, trials, createRng('${e['seed']}-$level-$trials'));
      expect(
        plan.map((k) => k.name).toList(),
        (e['plan'] as List).cast<String>(),
        reason: 'план партии L$level ×$trials семя ${e['seed']}',
      );
      final rotations = plan.where((k) => k == TaskKind.rotation).length;
      expect(
        rotations / plan.length,
        greaterThanOrEqualTo(minRotationShare),
        reason: 'доля поворотных проб L$level ×$trials',
      );
    }

    // Биомаркер: в регрессию идут только поворотные пробы с верным ответом и ненулевым углом.
    const records = [
      TrialRecord(kind: TaskKind.rotation, angle: 90, rt: 1200, correct: true),
      TrialRecord(kind: TaskKind.rotation, angle: 180, rt: 1900, correct: true),
      TrialRecord(kind: TaskKind.rotation, angle: 270, rt: 2600, correct: true),
      TrialRecord(kind: TaskKind.rotation, angle: 180, rt: 9000, correct: false),
      TrialRecord(kind: TaskKind.projection, angle: 0, rt: 800, correct: true),
      TrialRecord(kind: TaskKind.net, angle: 0, rt: 2000, correct: true),
      TrialRecord(kind: TaskKind.same, angle: 0, rt: 700, correct: false),
      TrialRecord(kind: TaskKind.memory, angle: 90, rt: 1500, correct: true),
    ];
    expect(
      round6(angleResponseSlope(records)),
      (s['slope'] as num).toDouble(),
      reason: 'наклон времени ответа по углу',
    );
    expect(meanSlopeRt(records), s['meanRt'], reason: 'среднее время по тем же пробам');
    final counts = taskKindCounts(records);
    for (final raw in s['counts'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(
        counts[TaskKind.values.byName(e['kind'] as String)],
        e['n'],
        reason: 'проб вида «${e['kind']}»',
      );
    }
  });
}
