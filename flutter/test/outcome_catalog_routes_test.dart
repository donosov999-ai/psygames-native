import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';

// Snapshot of the approved game/mode canon, source commit df5d18e31808b87b.
// This checks dispatch coverage, not gameplay/outcome behavior on 145 devices.
void main() {
  test('canonical 145 routes resolve through the real native dispatch, or an explicit remaining web route', () {
    final rows = jsonDecode(
      File('test/fixtures/outcome-canonical-145.json').readAsStringSync(),
    ) as List;
    expect(rows, hasLength(145));
    final web = <String>[];
    final screens = <String>{};
    for (final row in rows) {
      final route = row['route'] as String;
      final resolved = HybridApp.routeOf('https://psygames.pro$route');
      if (resolved == null) {
        web.add(route);
        continue;
      }
      final factory = HybridApp.native[resolved] ?? HybridApp.shell[resolved];
      expect(
        factory,
        isNotNull,
        reason: '${row["number"]} ${row["name_ru"]}: $route',
      );
      screens.add(resolved);
    }
    // A practice-program launch page is not another standalone game screen.
    // If any true game loses native dispatch, this assertion must fail.
    expect(web, ['/warmup-night']);
    debugPrint(
      'OUTCOME_ROUTE_COVERAGE ${jsonEncode({"entries": rows.length, "nativeEntries": rows.length - web.length, "dispatchKeys": screens.length, "web": web})}',
    );
  });
}
