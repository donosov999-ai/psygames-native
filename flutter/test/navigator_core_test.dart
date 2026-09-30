import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/navigator/generator.dart';
import 'package:psygames_flutter/games/navigator/geometry.dart';
import 'package:psygames_flutter/games/navigator/types.dart';

/// ГЕНЕРАТОР «НАВИГАТОРА» НА DART ДАЁТ ТЕ ЖЕ ПАРТИИ, ЧТО ЖИВОЕ TS-ЯДРО.
///
/// 🔴 Эталон `test/fixtures/navigator-reference.json` снят прогоном ЖИВОГО ядра экспортёром из
/// репозитория: `frontend/src/games/navigator/tools/record-flutter-reference.gen.ts`. После
/// любой правки `frontend/src/games/navigator/core/*` его обязаны переснять — иначе эта проба
/// сверяет перенос с устаревшим TS и остаётся зелёной, пока половины играют в разные игры.
///
/// ⚠️ ПЕЛЕНГ СВЕРЯЕТСЯ С ДОПУСКОМ, А НЕ ПОБАЙТНО. `atan2` в V8 и в Dart может разойтись в
/// последнем бите. Сектор «домой» от этого не зависит: ровная половина (22,5°) на целочисленной
/// сетке недостижима, и сектор сверяется точно.
void main() {
  final ref = jsonDecode(File('test/fixtures/navigator-reference.json').readAsStringSync())
      as Map<String, dynamic>;

  List<int> cell(GridCell c) => [c.x, c.y];

  test('🔴 каждая партия эталона — та же партия на Dart', () {
    final rounds = ref['rounds'] as List;
    expect(rounds.length, 4 * navigatorLevels + 9);
    for (final raw in rounds) {
      final e = raw as Map<String, dynamic>;
      final req = e['request'] as Map<String, dynamic>;
      final want = e['round'] as Map<String, dynamic>;
      final mode = req['mode'] == null ? null : NavigatorMode.fromWire(req['mode'] as String);
      final r = generateNavigatorRound(req['seed'] as String, req['level'] as int, mode);
      final at = '«${req['seed']}» ур.${req['level']}${mode == null ? '' : ' ${mode.wire}'}';
      expect(r.id, want['id'], reason: '$at: номер партии');
      expect(r.seed, want['seed'], reason: '$at: причёсанное зерно');
      expect(r.mode.wire, want['mode'], reason: '$at: вид');
      expect(r.difficulty, want['difficulty'], reason: '$at: трудность');
      expect(r.gridSize, want['gridSize'], reason: '$at: сетка');
      expect(r.routeSteps, want['routeSteps'], reason: '$at: шагов маршрута');
      expect(r.route.map(cell).toList(), want['route'], reason: '$at: маршрут');
      expect(r.routeDirections.map((d) => d.wire).toList(), want['routeDirections'], reason: '$at: направления');
      expect(r.startingFacing.wire, want['startingFacing'], reason: '$at: взгляд на старте');
      expect(r.turns.map((t) => t.wire).toList(), want['turns'], reason: '$at: повороты');
      expect(
        r.landmarks.map((l) => {'id': l.id, 'cell': cell(l.cell), 'symbol': l.symbol}).toList(),
        want['landmarks'],
        reason: '$at: ориентиры',
      );
      expect(
        r.falseBranches.map((b) => {'from': cell(b.from), 'to': cell(b.to)}).toList(),
        want['falseBranches'],
        reason: '$at: ложные ветви (порядок бросков: ориентиры раньше ветвей)',
      );
      expect(r.mapRotation, want['mapRotation'], reason: '$at: поворот карты');
      expect(r.hideMapDuringRecall, want['hideMapDuringRecall'], reason: '$at: карта прячется');
      expect(r.delaySteps, want['delaySteps'], reason: '$at: шагов задержки');
      expect(r.homeBearingDeg, closeTo((want['homeBearingDeg'] as num).toDouble(), 1e-9), reason: '$at: пеленг');
      expect(r.correctHomeSector.wire, want['correctHomeSector'], reason: '$at: сектор «домой»');
    }
  });

  test('🔴 вид задания по ступени — как у веба, и за краями лестницы тоже', () {
    for (final raw in ref['modeForLevel'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(navigatorModeForLevel(e['level'] as num).wire, e['mode'], reason: 'ступень ${e['level']}');
    }
  });

  test('🔴 сектор «домой» по пеленгу — с округлением JS, а не Dart', () {
    for (final raw in ref['sectors'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(homeSectorForBearing((e['bearing'] as num).toDouble()).wire, e['sector'], reason: 'пеленг ${e['bearing']}');
    }
  });
}
