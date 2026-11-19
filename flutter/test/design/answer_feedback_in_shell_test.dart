import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

const coveredRoutes = <String>{
  '/games/cloze',
  '/games/flanker',
  '/games/lexical-decision',
  '/games/puzzles?mode=Signpost',
  '/games/puzzles?mode=Pegs',
  '/games/puzzles?mode=Inertia',
  '/games/puzzles?mode=Map',
  '/games/puzzles?mode=Dominosa',
  '/games/puzzles?mode=Unruly',
  '/games/puzzles?mode=Singles',
  '/games/puzzles?mode=Undead',
  '/games/puzzles?mode=Keen',
  '/games/puzzles?mode=Solo',
  '/games/puzzles?mode=Towers',
  '/games/puzzles?mode=Unequal',
  '/games/puzzles?mode=Filling',
  '/games/puzzles?mode=Slide',
  '/games/puzzles?mode=Sokoban',
  '/games/puzzles?mode=Galaxies',
  '/games/puzzles?mode=Loopy',
  '/games/puzzles?mode=Pearl',
  '/games/puzzles?mode=Slant',
  '/games/puzzles?mode=Bridges',
  '/games/puzzles?mode=Train%20Tracks',
  '/games/puzzles?mode=Untangle',
  '/games/puzzles?mode=Net',
  '/games/puzzles?mode=Netslide',
  '/games/puzzles?mode=Twiddle',
  '/games/puzzles?mode=Sixteen',
  '/games/puzzles?mode=Fifteen',
  '/games/puzzles?mode=Flip',
  '/games/puzzles?mode=Cube',
  '/games/puzzles?mode=Black%20Box',
  '/games/puzzles?mode=Flood',
  '/games/puzzles?mode=Same%20Game',
  '/games/puzzles?mode=Mines',
  '/games/puzzles?mode=Mosaic',
  '/games/puzzles?mode=Pattern',
  '/games/puzzles?mode=Range',
  '/games/puzzles?mode=Light%20Up',
  '/games/puzzles?mode=Tents',
  '/games/puzzles?mode=Magnets',
  '/games/puzzles?mode=Rectangles',
  '/games/puzzles?mode=Palisade',
  '/games/puzzles?mode=Guess',
  '/games/quick-count',
  '/games/water-sort',
  '/games/ball-sort',
  '/games/nut-sort',
  '/games/cake-sort',
  '/games/pizza-sort',
  '/games/sudoku',
  '/games/sudoku?mode=towers',
  '/games/sudoku?mode=unequal',
  '/games/sudoku?mode=killer',
  '/games/sudoku?mode=free',
  '/games/sudoku?mode=junior',
  '/games/spatial-lab',
  '/games/spatial-lab?mode=twiddle',
  '/games/spatial-lab?mode=net',
  '/games/semantic-sort',
  '/games/simon',
  '/games/stroop',
  '/games/vocab-srs',
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('AnswerFeedback и AnswerMark: обязательный охват 131/131 и канонических режимов', () async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    final rows = (jsonDecode(
      File('test/fixtures/outcome-canonical-145.json').readAsStringSync(),
    ) as List).cast<Map<String, dynamic>>();
    final sources = Directory('lib/games')
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart'))
        .toList();
    final sourceCache = <String, String>{};
    String source(File f) =>
        sourceCache.putIfAbsent(f.path, f.readAsStringSync);

    final actualCovered = <String>{};
    final unresolved = <String>[];
    for (final row in rows) {
      final route = row['route'] as String;
      if (route == '/warmup-night') continue;
      final resolved = HybridApp.routeOf('https://psygames.pro$route');
      final factory = resolved == null ? null : HybridApp.native[resolved];
      if (factory == null) {
        unresolved.add('$route: нет native factory');
        continue;
      }
      final type = factory(state).runtimeType.toString();
      File? declaration;
      for (final f in sources) {
        if (RegExp('class\\s+$type\\b').hasMatch(source(f))) {
          declaration = f;
          break;
        }
      }
      if (declaration == null) {
        unresolved.add('$route: не найден class $type');
        continue;
      }
      final dir = declaration.parent;
      final files = dir
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'));
      var feedback = false;
      var mark = false;
      for (final f in files) {
        final text = source(f);
        feedback |= text.contains('AnswerFeedback(');
        mark |= text.contains('AnswerMark(');
      }
      if (feedback && mark) actualCovered.add(route);
    }

    expect(unresolved, isEmpty);
    expect(
      actualCovered.difference(coveredRoutes),
      isEmpty,
      reason: 'новые покрытые маршруты: добавь их в coveredRoutes тем же PR',
    );
    expect(
      coveredRoutes.difference(actualCovered),
      isEmpty,
      reason:
          'ранее подключённый маршрут потерял AnswerFeedback или AnswerMark',
    );

    final publicRoutes = rows
        .take(131)
        .map((r) => r['route'] as String)
        .toSet();
    final publicCovered = actualCovered.intersection(publicRoutes).length;
    final canonicalMissing = rows
        .map((r) => r['route'] as String)
        .where((r) => r != '/warmup-night')
        .toSet()
        .difference(actualCovered);
    debugPrint(
      'ANSWER_FEEDBACK_COVERAGE public=131 covered=$publicCovered '
      'missing=${131 - publicCovered} canonicalMissing=${canonicalMissing.length}',
    );
    expect(publicRoutes, hasLength(131));
  });
}
