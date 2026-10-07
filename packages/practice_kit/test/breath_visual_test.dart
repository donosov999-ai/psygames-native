import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';

void main() {
  test('breathing aliases, sigh continuity and both holds', () {
    expect(breathExpansion('inhale', 0), 0);
    expect(breathExpansion('inhale', 1), 1);
    expect(breathExpansion('left-in', .4), .4);
    expect(breathExpansion('right-out', .4), .6);
    expect(breathExpansion('inhale-one', 1), breathExpansion('inhale-two', 0));
    expect(breathExpansion('inhale-two', 1), 1);
    for (final p in [0.0, .5, 1.0]) {
      expect(breathExpansion('hold-in', p), 1);
      expect(breathExpansion('hold-out', p), 0);
    }
  });

  testWidgets(
    'orb and independent ring keep layout and freeze without new cue',
    (tester) async {
      Future<void> draw(double progress, String muscle) => tester.pumpWidget(
        MaterialApp(
          home: Center(
            child: SizedBox(
              width: 200,
              height: 200,
              child: BreathVisual(
                breath: {
                  'stepId': 'inhale',
                  'progress': progress,
                  'title': 'Вдох',
                },
                muscle: {'stepId': muscle, 'title': muscle},
              ),
            ),
          ),
        ),
      );
      await draw(0, 'long-release');
      final finder = find.byKey(const Key('practice-breath-visual'));
      final rect = tester.getRect(finder);
      await draw(.9, 'long-squeeze');
      expect(tester.getRect(finder), rect);
      final painter =
          tester.widget<CustomPaint>(finder).painter as BreathVisualPainter;
      expect(painter.expansion, .9);
      expect(painter.squeezing, isTrue);
      await tester.pump(const Duration(seconds: 20));
      expect(
        (tester.widget<CustomPaint>(finder).painter as BreathVisualPainter)
            .expansion,
        .9,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'square hold-out relaxes, haptics never play competing breath cue',
    (tester) async {
      final engine = Practices(
        jsonDecode(File('assets/practices.json').readAsStringSync()),
      );
      final square = objects(engine.set('breathing')['programs']).firstWhere(
        (p) => objects(p['steps']).any((s) => s['id'] == 'hold-out'),
      );
      final plan = engine.plan({
        'mode': 'parallel',
        'durationMs': 60000,
        'locale': 'ru',
        'guideMode': 'visual',
        'context': 'home',
        'advisory': true,
        'selections': [
          {'setId': 'breathing', 'programId': square['id']},
          {'setId': 'pelvic-floor', 'programId': 'balanced'},
        ],
      });
      final timeline = objects(plan['timeline']);
      final calls = <MethodCall>[];
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      messenger.setMockMethodCallHandler(PracticeHaptics.channel, (call) async {
        calls.add(call);
        return null;
      });
      addTearDown(
        () => messenger.setMockMethodCallHandler(PracticeHaptics.channel, null),
      );
      final h = PracticeHaptics();
      addTearDown(h.dispose);
      for (final breath in timeline.where((s) => s['setId'] == 'breathing')) {
        final t = breath['startMs'] as int;
        final cues = objects(engine.frame(plan, t)['cues']);
        final muscle = cues.firstWhere((c) => c['setId'] == 'pelvic-floor');
        final squeeze = '${breath['stepId']}'.contains('exhale');
        expect(
          '${muscle['stepId']}'.endsWith('squeeze'),
          squeeze,
          reason: '${breath['stepId']} must not invent a contraction',
        );
        calls.clear();
        h.update(plan, t, const {});
        final play = calls.where((c) => c.method == 'play').toList();
        if (!squeeze) expect(play, isEmpty);
        if (squeeze) {
          expect(play, hasLength(1));
          expect(play.single.arguments['continuous'], isTrue);
        }
      }
    },
  );
}
