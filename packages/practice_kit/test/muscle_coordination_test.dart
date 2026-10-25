import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';

void main() {
  setUpAll(() async {
    final file = File(
      '/opt/homebrew/share/flutter/bin/cache/artifacts/material_fonts/Roboto-Regular.ttf',
    );
    if (file.existsSync()) {
      final loader = FontLoader('Roboto')
        ..addFont(Future.value(ByteData.sublistView(file.readAsBytesSync())));
      await loader.load();
    }
  });
  final engine = Practices(
    jsonDecode(File('assets/practices.json').readAsStringSync()),
  );
  Json request({
    bool sync = true,
    bool breath = true,
    String abdomen = 'level-1',
    String breathing = 'coherent',
    bool reverse = false,
  }) {
    final selections = <Json>[
      if (breath) {'setId': 'breathing', 'programId': breathing},
      {'setId': 'pelvic-floor', 'programId': 'holds'},
      {'setId': 'abdomen', 'programId': abdomen},
      {'setId': 'eye-gym', 'programId': 'two-dots'},
    ];
    return {
      'mode': 'parallel',
      'durationMs': 60000,
      'locale': 'ru',
      'guideMode': 'visual',
      'context': 'home',
      'advisory': true,
      'selections': reverse ? selections.reversed.toList() : selections,
      if (sync) 'muscleCoordination': 'gentle',
    };
  }

  for (final breath in [false, true]) {
    for (final reverse in [false, true]) {
      test(
        'explicit coordination is aligned, order independent breath=$breath reverse=$reverse',
        () {
          final p = engine.plan(request(breath: breath, reverse: reverse));
          for (var ms = 0; ms < 60000; ms += 250) {
            final cues = objects(engine.frame(p, ms)['cues']);
            final a = cues.firstWhere((c) => c['setId'] == 'abdomen');
            final k = cues.firstWhere((c) => c['setId'] == 'pelvic-floor');
            expect(
              PracticeHaptics.isTension('abdomen', a['stepId']),
              PracticeHaptics.isTension('kegel', k['stepId']),
            );
            expect(a['progress'], k['progress']);
            expect(k['cue'], isNot(contains('живот расслаб')));
            expect(k['coordination'], 'gentle');
          }
          expect(
            p['id'],
            isNot(
              engine.plan(
                request(sync: false, breath: breath, reverse: reverse),
              )['id'],
            ),
          );
        },
      );
    }
  }
  test(
    'vacuum, breath holds and quick squeezes are not silently coordinated',
    () {
      expect(
        () => engine.plan(request(abdomen: 'level-4')),
        throwsA(isA<PlanFailure>()),
      );
      expect(
        () => engine.plan(request(breathing: 'box')),
        throwsA(isA<PlanFailure>()),
      );
      expect(
        engine.canCoordinateMuscles(request()..['mode'] = 'solo'),
        isFalse,
      );
      final r = request();
      objects(
        r['selections'],
      ).firstWhere((s) => s['setId'] == 'pelvic-floor')['programId'] = 'quick';
      expect(engine.canCoordinateMuscles(r), isFalse);
    },
  );
  test(
    'independent mode stays default and session pause freezes both zones',
    () {
      final p = engine.plan(request(sync: false));
      expect(p.containsKey('muscleCoordination'), isFalse);
      var s = sessionAction(newSession(p), 'start', 1000);
      s = sessionAction(s, 'pause', 2500);
      expect(elapsedTime(s, 100000), 1500);
    },
  );
  for (final dark in [false, true]) {
    for (final large in [false, true]) {
      testWidgets(
        'body zones remain visible with eye targets dark=$dark large=$large',
        (t) async {
          t.view.physicalSize = const Size(320, 480);
          t.view.devicePixelRatio = 1;
          addTearDown(t.view.reset);
          final plan = engine.plan(request());
          await t.pumpWidget(
            MaterialApp(
              theme: ThemeData(
                fontFamily: 'Roboto',
                brightness: dark ? Brightness.dark : Brightness.light,
              ),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: TextScaler.linear(large ? 1.6 : 1)),
                child: child!,
              ),
              home: Scaffold(
                body: RepaintBoundary(
                  key: const Key('body-shot'),
                  child: ColoredBox(
                    color: dark
                        ? const Color(0xff0b1622)
                        : const Color(0xfffaf6ef),
                    child: PracticeStage(
                      engine: engine,
                      cues: objects(engine.frame(plan, 7000)['cues']),
                      elapsed: 7000,
                    ),
                  ),
                ),
              ),
            ),
          );
          await t.pumpAndSettle();
          expect(find.byKey(const Key('muscle-zone-abdomen')), findsOneWidget);
          expect(find.byKey(const Key('muscle-zone-kegel')), findsOneWidget);
          expect(find.byType(EyeModes), findsOneWidget);
          for (final kind in ['abdomen', 'kegel']) {
            final r = t.getRect(find.byKey(Key('muscle-phase-$kind')));
            expect(r.top, greaterThanOrEqualTo(0));
            expect(r.bottom, lessThanOrEqualTo(480));
          }
          expect(t.takeException(), isNull);
          final out = Platform.environment['MUSCLE_SHOTS'];
          if (out != null) {
            final boundary = t.renderObject<RenderRepaintBoundary>(
              find.byKey(const Key('body-shot')),
            );
            await t.runAsync(() async {
              final image = await boundary.toImage(pixelRatio: 2);
              final bytes = await image.toByteData(
                format: ui.ImageByteFormat.png,
              );
              File(
                '$out/body-${dark ? 'dark' : 'light'}-${large ? 'large' : 'normal'}.png',
              ).writeAsBytesSync(bytes!.buffer.asUint8List());
              image.dispose();
            });
          }
        },
      );
    }
  }
}
