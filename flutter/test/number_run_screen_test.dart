// «Числовой забег» — экран на общем ядре дороги: партия нажатиями, итог и запись партии,
// падение, режим «Свободно», руление протяжкой, табло станции, разбор, раскладка.
//
// 🔴 ГЛАВНАЯ ПРОБА — ТЕНЕВОЙ ПРОГОН. Экран ведут кнопками руля, а рядом то же ядро гоняется
// на тех же кадрах и тех же нажатиях. Число на машине и в шапке обязано совпасть с тенью на
// каждом кадре: так видно, что экран кормит ядро кадрами как есть и ничего не досчитывает сам.
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/number_run/campaign.dart';
import 'package:psygames_flutter/games/number_run/level.dart';
import 'package:psygames_flutter/games/number_run/screen.dart';
import 'package:psygames_flutter/games/runner/road.dart';
import 'package:psygames_flutter/games/runner/solver.dart';
import 'package:psygames_flutter/shell/js_compat.dart' show jsRound;
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

const int seed = 41;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));
  late List<Map<String, dynamic>> reports;

  setUp(() {
    reports = [];
    SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
  });
  tearDown(() {
    SessionReport.sink = null;
    LessonUsed.reset();
  });

  Future<SharedState> open(WidgetTester tester, {int level = 1, Size screen = const Size(390, 844)}) async {
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = screen;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({
      if (level != 1) '${SharedState.prefix}number_run_level_nzt48': '$level',
    });
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: NumberRunScreen(key: UniqueKey(), state: state, seed: seed)));
    await tester.pump();
    await tester.pump();
    return state;
  }

  /// Число на машине игрока — то, что человек видит.
  String car(WidgetTester tester) =>
      tester.widget<Text>(find.descendant(of: find.byKey(const Key('nr-car')), matching: find.byType(Text))).data!;
  String shown(double v) => v < 0 ? '\u2212${jsRound(-v).toInt()}' : '${jsRound(v).toInt()}';

  /// Автопилот по пути решателя, как у выгрузчика эталона, но кнопками: полоса −1 / 0 / 1.
  double aim(RoadCourse course, List<SolverStep> path, RoadState s) {
    if (s.nextRow >= path.length) return s.target;
    final p = path[s.nextRow];
    if (p.route == null) return p.lane;
    final row = course.rows[p.id];
    final route = row.routes!.firstWhere((r) => r.id == p.route);
    for (final w in route.waypoints) {
      if (row.z + w.dz >= s.z - 1e-9) return w.x;
    }
    return p.lane;
  }

  final buttons = {-1.0: 'nr-steer-left', 0.0: 'nr-steer-center', 1.0: 'nr-steer-right'};

  /// Ведёт партию кнопками до итога; тень — то же ядро на тех же кадрах и нажатиях.
  Future<RoadState> drive(WidgetTester tester, RoadCourse course,
      {bool steer = true, double dt = .05, void Function(RoadState s)? onFrame}) async {
    final path = solveCourse(course)!;
    var shadow = roadResume(roadInitial(course));
    await tester.tap(find.byKey(const Key('nr-start')));
    await tester.pump(); // первый кадр часов — dt = 0
    double? pressed;
    var frames = 0;
    while (find.byKey(const Key('nr-next')).evaluate().isEmpty && frames < 4000) {
      if (steer && shadow.status == RoadStatus.running) {
        final want = jsRound(aim(course, path, shadow)).clamp(-1.0, 1.0);
        if (want != pressed) {
          await tester.tap(find.byKey(Key(buttons[want]!)));
          shadow = roadSetTarget(shadow, want);
          pressed = want;
        }
      }
      await tester.pump(Duration(milliseconds: (dt * 1000).round()));
      frames++;
      onFrame?.call(shadow);
      if (shadow.status == RoadStatus.running) {
        shadow = roadAdvanceFrame(shadow, dt, course);
        // На кадре, где тень доехала или упала, экран уже в финале или итоге — машины там нет.
        if (shadow.status == RoadStatus.running) {
          expect(car(tester), shown(shadow.sum), reason: 'кадр $frames: число на экране ≠ ядро');
          // И МЕСТО: машина стоит там, где её держит ядро, — руль не подмешивает своего.
          final road = tester.getRect(find.byKey(const Key('nr-road')));
          final carX = tester.getRect(find.byKey(const Key('nr-car'))).center.dx;
          expect(carX, closeTo(road.center.dx + shadow.x * road.width / 3, .5),
              reason: 'кадр $frames: машина не там, где ядро (x = ${shadow.x})');
        }
      }
    }
    return shadow;
  }

  testWidgets('настройка: правило, режим, длительность; старт ведёт на дорогу', (tester) async {
    await open(tester);
    expect(find.byKey(const Key('nr-rule')), findsOneWidget);
    expect(find.text('${L.t('level')} 1 · $numberRunLevelSeconds ${L.t('secShort')}'), findsOneWidget);
    await tester.tap(find.byKey(const Key('nr-start')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byKey(const Key('nr-road')), findsOneWidget);
    expect(find.byKey(const Key('nr-car')), findsOneWidget);
    expect(find.byKey(const Key('nr-steer-center')), findsOneWidget);
  });

  testWidgets('🔴 уровень 1 кнопками: число = ядро на тех же кадрах, финал, итог и запись партии', (tester) async {
    await open(tester);
    final course = makeLevel(1, seed, countingTasks);
    var finaleFrames = 0;
    final shadow = await drive(tester, course, onFrame: (_) {
      // Финал идёт ДО итога: лестница на экране, а кнопки «дальше» ещё нет.
      if (find.byKey(const Key('nr-finale')).evaluate().isNotEmpty && find.byKey(const Key('nr-next')).evaluate().isEmpty) {
        finaleFrames++;
      }
    });
    expect(shadow.status, RoadStatus.won, reason: 'автопилот по кнопкам не доехал: ${shadow.failure}');
    final seconds = finaleDuration(course, shadow.sum);
    expect(finaleFrames * .05, closeTo(seconds, .1), reason: 'финал шёл ${finaleFrames * .05} с, а должен $seconds с');
    final o = numberRunOutcome(course, shadow);
    // Подпись и число — через неразрывный пробел: «10/10» не отрывается от «Пробито стен».
    expect(find.textContaining('${L.t('numberRunWalls')}\u00a0${o.walls}/10'), findsOneWidget);
    final r = reports.single;
    expect(r['game_type'], 'number_run');
    expect(r['mode'], 'levels');
    expect(r['difficulty'], 'level-1');
    expect(r['score'], o.number);
    final d = r['details'] as Map<String, dynamic>;
    expect([d['walls'], d['walls_total'], d['level'], d['boss'], d['reason'], d['seed']], [o.walls, 10, 1, false, 'finished', seed]);
    expect(find.text(o.passed ? L.t('levelDone').replaceAll('{n}', '1') : L.t('levelAlmost').replaceAll('{n}', '1')),
        findsOneWidget, reason: 'вердикт словами итога');
    // Лестница: засчитанный уровень ведёт на следующий.
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('${SharedState.prefix}number_run_level_nzt48'), o.passed ? '2' : '1');
    expect(o.passed, isTrue, reason: 'автопилот по пути решателя обязан пробить ≥ 5 стен: ${o.walls}');
  });

  testWidgets('🔴 без руления — падение с первого моста: итог «упал», уровень не засчитан', (tester) async {
    await open(tester);
    final course = makeLevel(1, seed, countingTasks);
    final shadow = await drive(tester, course, steer: false);
    expect(shadow.status, RoadStatus.failed);
    expect(shadow.failure?['kind'], 'fall');
    final d = reports.single['details'] as Map<String, dynamic>;
    expect([d['reason'], d['walls']], ['fell', 0]);
    expect(find.byKey(const Key('nr-finale')), findsNothing, reason: 'после падения финала нет');
    expect(find.text(L.t('retry')), findsWidgets);
  });

  testWidgets('«Свободно»: забег на 12 этапов, в шапке этап, а не уровень', (tester) async {
    await open(tester);
    await tester.tap(find.text(L.t('sudokuModeFree')));
    await tester.pump();
    expect(find.textContaining(L.t('numberRunMarathonHint')), findsOneWidget);
    expect(find.text('1/$campaignStageCount'), findsOneWidget);
    await tester.tap(find.byKey(const Key('nr-start')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('1/$campaignStageCount'), findsOneWidget);
    expect(makeCampaign(seed).rows.length, campaignStageCount * 14);
  });

  testWidgets('протяжка пальцем рулит свободно: треть ширины — полный размах, без округления', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('nr-start')));
    await tester.pump();
    final road = tester.getRect(find.byKey(const Key('nr-road')));
    // 0,15 ширины = половина размаха → цель 0,5 полосы (веб: делитель 0,3 ширины).
    final g = await tester.startGesture(road.center);
    await g.moveBy(Offset(road.width * 0.075, 0));
    await g.moveBy(Offset(road.width * 0.075, 0));
    await g.up();
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    final car = tester.getRect(find.byKey(const Key('nr-car')));
    final lw = road.width / 3;
    expect(car.center.dx, closeTo(road.center.dx + 0.5 * lw, 1.5), reason: 'машина не на половине полосы');
  });

  testWidgets('🔴 табло: пример блиц-арки впереди — тот же, что в ряду ядра', (tester) async {
    await open(tester, level: 4);
    final course = makeLevel(4, seed, countingTasks);
    final blitz = course.rows.firstWhere((r) => r.station == 'blitz');
    bool? atFirstSight;
    await drive(tester, course, onFrame: (s) {
      // Табло обязано показать пример СРАЗУ, как станция подошла на 70 единиц (≈ 9 с): считать
      // надо успеть до арок, а не увидеть пример в последний момент.
      if (atFirstSight == null && s.status == RoadStatus.running && blitz.z - s.z <= 70) {
        atFirstSight = find.text(blitz.prompt!).evaluate().isNotEmpty;
      }
    });
    expect(atFirstSight, isTrue, reason: 'пример «${blitz.prompt}» не на табло, когда до арок 70 единиц');
  });

  testWidgets('🔴 разбор: шаги по главам — дорога всегда, станции введённые, «Страж» на его уровне', (tester) async {
    for (final k in numberRunLessonKeys) {
      expect(L.t(k), isNot(k), reason: '$k не собран в словарь');
    }
    // Дорога — 5 шагов; блиц +2 (арки и округление), ровно N, ряд, шкала, память — по одному;
    // «Страж» — на уровне-боссе.
    for (final (level, steps) in const [(1, 5), (4, 7), (6, 8), (16, 11), (18, 12), (22, 12), (24, 13)]) {
      await open(tester, level: level);
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pumpAndSettle();
      expect(LessonUsed.inRound, isTrue);
      final counter = tester.widget<Text>(find.byKey(const Key('lesson-counter'))).data!;
      final want = L.t('teachStepOf').replaceFirst('{i}', '1').replaceFirst('{n}', '$steps');
      expect(counter, want, reason: 'L$level: шагов не $steps');
      expect(tester.widget<Text>(find.byKey(const Key('lesson-text'))).data, contains(L.t('teachRunMiddle')));
      await tester.tap(find.byKey(const Key('lesson-close')));
      await tester.pumpAndSettle();
      LessonUsed.reset();
    }
  });

  group('кучка клеток вместо цифры (перенос counter)', () {
    List<(RoadRow, int)> plain(RoadCourse c) => [
          for (final r in c.rows)
            if (const {'snake', 'grid'}.contains(r.shape))
              for (var i = 0; i < r.items.length; i++)
                if (!r.items[i].part) (r, i),
        ];

    test('🔴 правило по уровням: до L21 цифры, L22–24 все мелкие — кучкой, с L25 — половина', () {
      for (var level = 1; level <= 21; level++) {
        final c = makeLevel(level, seed, countingTasks, boss: isBossLevel(level));
        expect(plain(c).where((e) => pileOf(c, e.$1, e.$2) != null), isEmpty, reason: 'L$level: кучка раньше главы');
      }
      for (final level in const [22, 23, 24]) {
        final c = makeLevel(level, seed, countingTasks, boss: isBossLevel(level));
        for (final (r, i) in plain(c)) {
          final v = r.items[i].value.abs().round();
          final pile = pileOf(c, r, i);
          // Предел — РЕШЕНИЕ (49: четыре рамки и неполная), а не константа кода: проба с
          // `pileMax` из кода сверяла бы правило с самим собой (порча 01.10 выжила).
          if (v <= 49) {
            expect(pile, (v ~/ 10, v % 10), reason: 'L$level ряд ${r.id}: $v не кучкой');
          } else {
            expect(pile, isNull, reason: 'L$level: $v больше 49, а кучкой');
          }
        }
      }
      for (final level in const [25, 28, 31]) {
        final c = makeLevel(level, seed, countingTasks, boss: isBossLevel(level));
        final small = plain(c).where((e) => e.$1.items[e.$2].value.abs() <= 49).toList();
        final piled = small.where((e) => pileOf(c, e.$1, e.$2) != null).length;
        expect(piled, greaterThan(0), reason: 'L$level: в смеси нет кучек');
        expect(piled, lessThan(small.length), reason: 'L$level: в смеси нет цифр');
      }
    });

    test('строй, стопки, трамплин, части «ровно N» и забег «Свободно» — всегда цифрой', () {
      for (final level in const [22, 25, 30]) {
        final c = makeLevel(level, seed, countingTasks, boss: isBossLevel(level));
        for (final r in c.rows) {
          if (const {'snake', 'grid'}.contains(r.shape)) continue;
          for (var i = 0; i < r.items.length; i++) {
            expect(pileOf(c, r, i), isNull, reason: 'L$level ${r.shape}: кучкой');
          }
        }
      }
      final free = makeCampaign(seed);
      for (final r in free.rows) {
        for (var i = 0; i < r.items.length; i++) {
          expect(pileOf(free, r, i), isNull, reason: 'забег: кучкой');
        }
      }
    });

    testWidgets('🔴 на дороге L22 кучки НАРИСОВАНЫ, на L21 — ни одной за весь уровень', (tester) async {
      for (final (level, want) in const [(21, false), (22, true)]) {
        await open(tester, level: level);
        final course = makeLevel(level, seed, countingTasks, boss: isBossLevel(level));
        var drawn = 0;
        RoadPainter.lastPiles = 0;
        await drive(tester, course, onFrame: (_) => drawn = math.max(drawn, RoadPainter.lastPiles));
        expect(drawn > 0, want, reason: 'L$level: нарисовано кучек $drawn');
      }
    });
  });

  for (final screen in const [Size(320, 568), Size(360, 640), Size(390, 844)]) {
    testWidgets('🔴 раскладка ${screen.width.toInt()}×${screen.height.toInt()}: дорога, табло и руль внутри поля', (tester) async {
      await open(tester, screen: screen);
      await tester.tap(find.byKey(const Key('nr-start')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      final field = tester.getRect(find.byKey(const Key('game-field')));
      for (final k in const ['nr-road', 'nr-sign']) {
        final r = tester.getRect(find.byKey(Key(k)));
        expect(r.top >= field.top - .5 && r.bottom <= field.bottom + .5, isTrue, reason: '$k вне поля: $r при $field');
      }
      for (final k in const ['nr-steer-left', 'nr-steer-center', 'nr-steer-right']) {
        final b = tester.getRect(find.byKey(Key(k)));
        expect(b.width >= 48 && b.height >= 48, isTrue, reason: '$k мельче пальца: $b');
      }
    });
  }
}
