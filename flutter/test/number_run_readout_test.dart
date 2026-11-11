import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/number_run/level.dart';
import 'package:psygames_flutter/games/number_run/readout.dart';
import 'package:psygames_flutter/games/number_run/screen.dart';
import 'package:psygames_flutter/games/number_run/visual_geometry.dart';
import 'package:psygames_flutter/games/runner/road.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() async {
    resetGameClock();
    await L.load('en');
  });
  tearDown(resetGameClock);

  test(
    'distance and active time are independent; exact does not use player sum',
    () {
      final c = makeLevel(9, 1, countingTasks, boss: true);
      final s = roadInitial(c)
        ..elapsed = 12
        ..z = c.length / 4
        ..sum = 999;
      final row = c.rows.firstWhere((r) => r.exact != null);
      s
        ..nextRow = row.id
        ..z = row.z - 10
        ..collected = [0];
      final v = NumberRunReadout.from(c, s);
      expect(v.remaining, 78);
      expect(v.time, '1:18');
      expect(v.distance, closeTo((row.z - 10) / c.length, 1e-9));
      expect(v.collected, row.items.first.part ? row.items.first.value : 0);
      expect(v.collected, isNot(999));
      expect(v.guard, c.finale!.boss);
      expect(s.sum, 999, reason: 'presentation must never award or deduct');
    },
  );

  test(
    'future exact task starts at zero, not previous row collected indexes',
    () {
      final c = makeLevel(9, 1, countingTasks);
      final row = c.rows.firstWhere((r) => r.exact != null);
      final s = roadInitial(c)
        ..nextRow = row.id - 1
        ..z = row.z - 20
        ..collected = [0, 1];
      expect(NumberRunReadout.from(c, s).collected, 0);
      s.elapsed = 1000;
      expect(NumberRunReadout.from(c, s).time, '0:00');
    },
  );

  test('projected actual glyphs fit ground/jump and outer lanes without collider changes', () {
    final raw = jsonDecode(
      File('assets/number_run/numerals.json').readAsStringSync(),
    ) as Map;
    final glyphs = raw['glyphs'] as Map;
    for (final viewport in const [
      Size(320, 300),
      Size(360, 520),
      Size(390, 600),
      Size(430, 640),
      Size(1024, 360),
    ]) {
      for (final number in ['1', '111', '888', '1000', '9999', '-9999']) {
        final width = number
            .split('')
            .fold<double>(
              -.07,
              (v, c) => v + (glyphs[c]['width'] as num).toDouble() + .07,
            );
        for (final x in [-2.4, 0.0, 2.4]) {
          for (final jump in [0.0, 1.2, 2.0]) {
            final scale = fitRunnerNumeral(
              viewport,
              width: width,
              requested: 2.4,
              laneX: x,
              jump: jump,
            );
            final rect = runnerNumeralBounds(
              viewport,
              width: width,
              scale: scale,
              laneX: x,
              jump: jump,
            );
            expect(scale, greaterThan(0));
            expect(rect.left, greaterThanOrEqualTo(6 - 1e-6));
            expect(rect.right, lessThanOrEqualTo(viewport.width - 6 + 1e-6));
            expect(rect.width, lessThanOrEqualTo(viewport.width * .34 + 1e-6));
            expect(
              rect.height,
              lessThanOrEqualTo(viewport.height * .16 + 1e-6),
            );
          }
        }
      }
    }
  });

  for (final width in [320.0, 390.0, 430.0]) {
    for (final dark in [false, true]) {
      testWidgets('readout wraps without shrinking text $width dark=$dark', (
        t,
      ) async {
        t.view
          ..devicePixelRatio = 1
          ..physicalSize = Size(width, 550);
        addTearDown(t.view.reset);
        final c = makeLevel(9, 1, countingTasks, boss: true);
        final row = c.rows.firstWhere((r) => r.exact != null);
        final s = roadInitial(c)
          ..nextRow = row.id
          ..z = row.z - 10;
        await t.pumpWidget(
          MaterialApp(
            theme: dark ? ThemeData.dark() : ThemeData.light(),
            home: MediaQuery(
              data: MediaQueryData(
                size: Size(width, 550),
                textScaler: const TextScaler.linear(2),
              ),
              // Как на экране (`nr-readout-viewport`): панель в прокрутке — при тексте ×2 карточки
              // заданий (лист 02 референса) выше одной строки и не обязаны влезать в 550 без неё.
              child: Scaffold(
                body: SingleChildScrollView(
                  child: NumberRunReadoutPanel(
                    value: NumberRunReadout.from(c, s),
                    showTask: true,
                  ),
                ),
              ),
            ),
          ),
        );
        await t.pump();
        expect(t.takeException(), isNull);
        // Одно активное задание (UI-референс 06.11, UI09): пока впереди станция — её карточка,
        // цель стража возвращается, когда станции нет.
        expect(find.byKey(const Key('nr-exact-counter')), findsOneWidget);
        expect(find.byKey(const Key('nr-guard-target')), findsNothing);
        expect(find.byKey(const Key('nr-distance')), findsOneWidget);
        expect(find.byType(FittedBox), findsNothing);
        final plain = roadInitial(c)
          ..nextRow = 0
          ..z = 0;
        await t.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: NumberRunReadoutPanel(value: NumberRunReadout.from(c, plain), showTask: true),
            ),
          ),
        );
        expect(find.byKey(const Key('nr-guard-target')), findsOneWidget);
      });
    }
  }

  testWidgets('shared pause freezes road and active timer without catch-up', (
    t,
  ) async {
    SharedPreferences.setMockInitialValues({'language': 'en'});
    final state = await SharedState.open();
    final reports = <String>[];
    SessionReport.sink = (r) async => reports.add(r);
    addTearDown(() => SessionReport.sink = null);
    await t.pumpWidget(
      MaterialApp(home: NumberRunScreen(state: state, seed: 1)),
    );
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('nr-start')));
    await t.pump();
    await t.pump(const Duration(milliseconds: 50));
    final before = t
        .widget<NumberRunReadoutPanel>(find.byKey(const Key('nr-sign')))
        .value;
    final release = holdGame();
    await t.pump(const Duration(seconds: 30));
    final held = t
        .widget<NumberRunReadoutPanel>(find.byKey(const Key('nr-sign')))
        .value;
    expect(held.remaining, before.remaining);
    expect(held.distance, before.distance);
    release();
    await t.pump(const Duration(milliseconds: 50));
    final after = t
        .widget<NumberRunReadoutPanel>(find.byKey(const Key('nr-sign')))
        .value;
    expect(after.remaining, greaterThanOrEqualTo(before.remaining - 1));
    expect(after.distance, closeTo(before.distance, .01));
    expect(reports, isEmpty);
  });
}
