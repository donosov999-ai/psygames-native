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
  '/games/quick-count',
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
