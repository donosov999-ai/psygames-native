import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/navigator/generator.dart';
import 'package:psygames_flutter/games/navigator/input.dart';
import 'package:psygames_flutter/games/navigator/scoring.dart';
import 'package:psygames_flutter/games/navigator/session.dart';
import 'package:psygames_flutter/games/navigator/types.dart';

/// ВВОД, СЧЁТ И ПАРТИИ «НАВИГАТОРА» НА DART — ТЕ ЖЕ, ЧТО У ЖИВОГО TS-ЯДРА.
///
/// 🔴 Эталон `test/fixtures/navigator-session-reference.json` снят прогоном ЖИВОГО ядра
/// экспортёром из репозитория: `frontend/src/games/navigator/tools/record-flutter-reference.gen.ts`.
/// После любой правки `frontend/src/games/navigator/core/*` его обязаны переснять.
///
/// 🔴 ПОЧЕМУ ЗДЕСЬ ЕСТЬ ВВОД. Перенос «Лаборатории» потерял двойное нажатие: эталон сверял
/// правила, а жест в эталон не попадал. Здесь клавиши и свайпы сверяются наравне с правилами —
/// включая точки ровно на пороге свайпа, где «корень из суммы квадратов» и `Math.hypot` V8
/// расходятся у каждой пятой.
///
/// ⚠️ ДРОБНЫЕ ЧИСЛА — С ДОПУСКОМ 1e-9. Промах по сектору считается от пеленга, а пеленг — через
/// `atan2`, который в V8 и в Dart может разойтись в последнем бите. Целые числа и строки —
/// точно, снимок сессии — побайтно.
void main() {
  final ref = jsonDecode(File('test/fixtures/navigator-session-reference.json').readAsStringSync())
      as Map<String, dynamic>;

  Map<String, Object?> flat(NavigatorMetrics m) => {
        'accuracy': m.accuracy,
        'durationMs': m.durationMs,
        'difficulty': m.difficulty,
        'errors': m.errors,
        'score': m.score,
        'seed': m.seed,
        'generatorVersion': m.generatorVersion,
        'level': m.level,
        'mode': m.mode.wire,
        'gridSize': m.gridSize,
        'routeSteps': m.routeSteps,
        'routeAccuracy': m.routeAccuracy,
        'extraSteps': m.extraSteps,
        'angularErrorDeg': m.angularErrorDeg,
        'routeHits': m.routeHits,
        'turnHits': m.turnHits,
        'turnTotal': m.turnTotal,
        'selectedHomeSector': m.selectedHomeSector?.wire,
        'correctHomeSector': m.correctHomeSector.wire,
        'mapRotation': m.mapRotation,
        'landmarkCount': m.landmarkCount,
        'falseBranchCount': m.falseBranchCount,
        'hideMapDuringRecall': m.hideMapDuringRecall,
        'delaySteps': m.delaySteps,
        'passed': isPassed(m),
      };

  void expectMetrics(Map<String, Object?> got, Map<String, dynamic> want, String at) {
    // Состав полей сверяется целиком: поле, добавленное в TS, не должно потеряться в переносе молча.
    expect(got.keys.toSet(), want.keys.toSet(), reason: '$at: состав полей итога');
    for (final key in want.keys) {
      final g = got[key];
      final w = want[key];
      if (g is double && w is num) {
        expect(g, closeTo(w.toDouble(), 1e-9), reason: '$at: $key');
      } else {
        expect(g, w, reason: '$at: $key');
      }
    }
  }

  NavigatorSession apply(NavigatorSession s, Map<String, dynamic> a) {
    num now() => a['now'] as num;
    switch (a['op']) {
      case 'start':
        return startNavigatorRound(s, now());
      case 'study':
        return completeNavigatorStudy(s);
      case 'delay':
        return advanceNavigatorDelay(s);
      case 'key':
        return handleNavigatorKey(s, a['key'] as String, now());
      case 'swipe':
        return handleNavigatorSwipe(s, (a['dx'] as num).toDouble(), (a['dy'] as num).toDouble(), now());
      case 'route':
        return inputNavigatorRouteDirection(s, Cardinal.fromWire(a['dir'] as String), now());
      case 'turn':
        return inputNavigatorTurn(s, Turn.fromWire(a['turn'] as String), now());
      case 'sector':
        return inputNavigatorHomeSector(s, HomeSector.fromWire(a['sector'] as String), now());
      case 'pause':
        return pauseNavigatorSession(s, now());
      case 'resume':
        return resumeNavigatorSession(s, now());
      case 'restart':
        return restartNavigatorSession(s, now());
      case 'dispose':
        return disposeNavigatorSession(s);
    }
    throw StateError('в эталоне действие, которого проба не знает: ${a['op']}');
  }

  void expectSnapshot(NavigatorSession s, Map<String, dynamic> want, String at) {
    expect(navigatorSessionFingerprint(s), want['fp'], reason: '$at: снимок сессии');
    final config = want['config'] as Map<String, dynamic>;
    expect(s.config.seed, config['seed'], reason: '$at: зерно');
    expect(s.config.level, config['level'], reason: '$at: уровень после выправки');
    expect(s.config.mode?.wire, config['mode'], reason: '$at: режим');
    expect(s.pausedFrom?.wire, want['pausedFrom'], reason: '$at: откуда пауза');
    expect(s.startedAt, want['startedAt'], reason: '$at: начало партии');
    expect(s.pauseStartedAt, want['pauseStartedAt'], reason: '$at: начало паузы');
    expect(s.pausedMs, want['pausedMs'], reason: '$at: накопленная пауза');
    final result = want['result'];
    if (result == null) {
      expect(s.result, isNull, reason: '$at: итога ещё нет');
    } else {
      expect(s.result, isNotNull, reason: '$at: итог обязан быть');
      expectMetrics(flat(s.result!), result as Map<String, dynamic>, '$at: итог');
    }
  }

  test('клавиши: сторона, поворот и сектор — как в вебе', () {
    final keys = ref['keys'] as List;
    expect(keys.length, greaterThanOrEqualTo(30));
    for (final raw in keys) {
      final e = raw as Map<String, dynamic>;
      final key = e['key'] as String;
      expect(cardinalFromKey(key)?.wire, e['cardinal'], reason: 'клавиша «$key» → сторона');
      expect(turnFromKey(key)?.wire, e['turn'], reason: 'клавиша «$key» → поворот');
      expect(homeSectorFromKey(key)?.wire, e['sector'], reason: 'клавиша «$key» → сектор');
    }
  });

  test('🔴 свайпы: порог 24 точки считается как в V8, включая точки ровно на окружности', () {
    final swipes = ref['swipes'] as List;
    var dropped = 0;
    for (final raw in swipes) {
      final e = raw as Map<String, dynamic>;
      final dx = (e['dx'] as num).toDouble();
      final dy = (e['dy'] as num).toDouble();
      final at = 'свайп ($dx, $dy)';
      expect(cardinalFromSwipe(dx, dy)?.wire, e['cardinal'], reason: '$at → сторона');
      expect(turnFromSwipe(dx, dy)?.wire, e['turn'], reason: '$at → поворот');
      expect(homeSectorFromSwipe(dx, dy)?.wire, e['sector'], reason: '$at → сектор');
      if (e['cardinal'] == null) dropped++;
    }
    // Эталон, где засчитан каждый свайп, порога не сторожит.
    expect(dropped, greaterThan(20), reason: 'в эталоне мало коротких свайпов — порог не проверяется');
  });

  test('счёт: каждый итог эталона — тот же итог на Dart', () {
    final scores = ref['scores'] as List;
    // Пять уровней на режим: маршрут — 5 состояний, повороты — 4, «домой» — 8 секторов и «нет ответа».
    expect(scores.length, 5 * 5 + 5 * 4 + 5 * 9);
    for (final raw in scores) {
      final e = raw as Map<String, dynamic>;
      final request = e['request'] as Map<String, dynamic>;
      final state = e['state'] as Map<String, dynamic>;
      final round = generateNavigatorRound(
        request['seed'] as String,
        request['level'] as int,
        NavigatorMode.fromWire(request['mode'] as String),
      );
      final sector = state['selectedHomeSector'] as String?;
      final m = scoreNavigatorCompletion(
        round,
        durationMs: (state['durationMs'] as num).toDouble(),
        routeHits: state['routeHits'] as int,
        extraSteps: state['extraSteps'] as int,
        turnHits: state['turnHits'] as int,
        selectedHomeSector: sector == null ? null : HomeSector.fromWire(sector),
      );
      expectMetrics(flat(m), e['metrics'] as Map<String, dynamic>, '${request['mode']} ур.${request['level']} ${jsonEncode(state)}');
    }
  });

  test('зачёт: 0,8 точности проходит, 0,79 нет; промах 22,5° проходит, 22,6° и «нет ответа» — нет', () {
    // Те же границы, что сторожит веб-проба navigator-integration: 22.08.2026 мутация
    // «isPassed всегда true» там жила зелёной, пока границы не проверили числом.
    NavigatorMetrics copy(NavigatorMetrics m, {double? accuracy, double? angle, bool noAngle = false}) =>
        NavigatorMetrics(
          accuracy: accuracy ?? m.accuracy,
          durationMs: m.durationMs,
          difficulty: m.difficulty,
          errors: m.errors,
          score: m.score,
          seed: m.seed,
          level: m.level,
          mode: m.mode,
          gridSize: m.gridSize,
          routeSteps: m.routeSteps,
          routeAccuracy: m.routeAccuracy,
          extraSteps: m.extraSteps,
          angularErrorDeg: noAngle ? null : (angle ?? m.angularErrorDeg),
          routeHits: m.routeHits,
          turnHits: m.turnHits,
          turnTotal: m.turnTotal,
          selectedHomeSector: m.selectedHomeSector,
          correctHomeSector: m.correctHomeSector,
          mapRotation: m.mapRotation,
          landmarkCount: m.landmarkCount,
          falseBranchCount: m.falseBranchCount,
          hideMapDuringRecall: m.hideMapDuringRecall,
          delaySteps: m.delaySteps,
        );
    final routeRound = generateNavigatorRound('nav-pass', 5, NavigatorMode.routeRecall);
    final route = scoreNavigatorCompletion(routeRound,
        durationMs: 1000, routeHits: routeRound.routeSteps, extraSteps: 0, turnHits: 0, selectedHomeSector: null);
    expect(isPassed(copy(route, accuracy: 0.79)), isFalse);
    expect(isPassed(copy(route, accuracy: 0.80)), isTrue);
    final homeRound = generateNavigatorRound('nav-pass', 5, NavigatorMode.homeDirection);
    final home = scoreNavigatorCompletion(homeRound,
        durationMs: 1000, routeHits: 0, extraSteps: 0, turnHits: 0, selectedHomeSector: homeRound.correctHomeSector);
    expect(isPassed(copy(home, angle: 22.5)), isTrue);
    expect(isPassed(copy(home, angle: 22.6)), isFalse);
    expect(isPassed(copy(home, accuracy: 1, noAngle: true)), isFalse, reason: 'ответа не было — не засчитано');
  });

  test('перезапуск с экрана правил — новая сессия, а не свежий раунд', () {
    final e = ref['restartFromRules'] as Map<String, dynamic>;
    final config = e['config'] as Map<String, dynamic>;
    final s = restartNavigatorSession(
      createNavigatorSession(NavigatorSessionConfig(seed: config['seed'] as String, level: config['level'] as num)),
      e['now'] as num,
    );
    expectSnapshot(s, e['s'] as Map<String, dynamic>, 'перезапуск с правил');
  });

  test('🔴 партии целиком: после каждого действия сессия Dart совпадает с веб-сессией', () {
    final sessions = ref['sessions'] as List;
    expect(sessions.length, 2 * 12 + 3 * 3 + 2);
    final ops = <String>{};
    final rotatedModes = <String>{};
    final erredModes = <String>{};
    var steps = 0;
    for (final raw in sessions) {
      final e = raw as Map<String, dynamic>;
      final config = e['config'] as Map<String, dynamic>;
      final mode = config['mode'] == null ? null : NavigatorMode.fromWire(config['mode'] as String);
      var s = createNavigatorSession(
        NavigatorSessionConfig(seed: config['seed'] as String, level: config['level'] as num, mode: mode),
      );
      final title = '«${config['seed']}» ур.${config['level']}${mode == null ? '' : ' ${mode.wire}'}';
      var i = 0;
      for (final stepRaw in e['steps'] as List) {
        final step = stepRaw as Map<String, dynamic>;
        final a = step['a'] as Map<String, dynamic>;
        s = apply(s, a);
        expectSnapshot(s, step['s'] as Map<String, dynamic>, '$title, шаг $i ${jsonEncode(a)}');
        ops.add(a['op'] as String);
        final result = (step['s'] as Map<String, dynamic>)['result'] as Map<String, dynamic>?;
        if (result != null) {
          if (result['mapRotation'] != 0) rotatedModes.add(result['mode'] as String);
          if (result['errors'] != 0) erredModes.add(result['mode'] as String);
        }
        i++;
        steps++;
      }
    }
    // Эталон сторожит только то, что в нём случилось: каждое действие, повёрнутая карта и ошибка
    // в каждом режиме обязаны там быть — иначе «забыл обратный поворот» прошёл бы зелёным.
    expect(ops, {'start', 'study', 'delay', 'key', 'swipe', 'route', 'turn', 'sector', 'pause', 'resume', 'restart', 'dispose'});
    expect(rotatedModes, {'route-recall', 'turn-sequence', 'home-direction'}, reason: 'повёрнутая карта в каждом режиме');
    expect(erredModes, {'route-recall', 'turn-sequence', 'home-direction'}, reason: 'партия с ошибками в каждом режиме');
    // 812 шагов в эталоне 30.09.2026: порог держит от случайного обрезания сценариев экспортёра.
    expect(steps, greaterThan(800));
  });
}
