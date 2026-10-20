import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';

/// These tests prove channel arguments, not physical motor duration/strength.
Json plan({
  int duration = 2000,
  int start = 0,
  String set = 'breathing',
  String program = 'test',
  String step = 'exhale',
}) => {
  'id': 'microhaptics',
  'timeline': [
    {
      'setId': set,
      'programId': program,
      'stepId': step,
      'startMs': start,
      'endMs': start + duration,
    },
  ],
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final calls = <MethodCall>[];
  final instances = <PracticeHaptics>[];
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  PracticeHaptics haptics() {
    final h = PracticeHaptics();
    instances.add(h);
    return h;
  }

  List<MethodCall> getPlays() =>
      calls.where((c) => c.method == 'play').toList();
  Map<dynamic, dynamic> payload() => getPlays().single.arguments as Map;
  Future<void> flush() => Future<void>.delayed(Duration.zero);
  setUp(() {
    calls.clear();
    instances.clear();
    PracticeHaptics.recent.clear();
    messenger.setMockMethodCallHandler(PracticeHaptics.channel, (call) async {
      calls.add(call);
      return null;
    });
  });
  tearDown(() async {
    for (final h in instances) {
      h.dispose();
    }
    await flush();
    messenger.setMockMethodCallHandler(PracticeHaptics.channel, null);
    PracticeHaptics.recent.clear();
  });

  for (final duration in [1, 20, 250, 1000, 1999, 2000]) {
    test('discrete phase ${duration}ms sends one 20ms micro pulse', () async {
      haptics().update(plan(duration: duration), 0, const {});
      await flush();
      expect(payload(), {
        'durationMs': 20,
        'strength': .25,
        'continuous': false,
        'count': 1,
      });
    });
  }

  for (final intensity in [.1, .2, .25, .8, 1.0, 5.0]) {
    test(
      'fast phase intensity $intensity respects user value and .25 ceiling',
      () async {
        haptics().update(plan(), 0, {
          'practiceHaptics': {'intensity': intensity},
        });
        await flush();
        expect(payload()['strength'], intensity <= .25 ? intensity : .25);
      },
    );
  }

  for (final duration in [2001, 3000, 10000]) {
    for (final step in ['inhale', 'exhale']) {
      test(
        'normal ${duration}ms $step retains 60ms and normal cue count',
        () async {
          haptics().update(plan(duration: duration, step: step), 0, const {
            'practiceHaptics': {'intensity': .7},
          });
          await flush();
          expect(payload(), {
            'durationMs': 60,
            'strength': .7,
            'continuous': false,
            'count': step == 'exhale' ? 2 : 1,
          });
        },
      );
    }
  }

  for (final set in ['eye-gym', 'face-massage', 'pelvic-floor', 'abdomen']) {
    test('fast $set discrete release/rest is one micro pulse', () async {
      haptics().update(
        plan(set: set, step: set == 'pelvic-floor' ? 'quick-release' : 'rest'),
        0,
        const {
          'practiceHaptics': {'kegel': 'phases', 'abdomen': 'phases'},
        },
      );
      await flush();
      expect(payload(), {
        'durationMs': 20,
        'strength': .25,
        'continuous': false,
        'count': 1,
      });
    });
  }

  for (final set in ['pelvic-floor', 'abdomen']) {
    for (final duration in [1000, 2000, 3000, 45000]) {
      test(
        '$set continuous ${duration}ms tension remains uncapped in strength',
        () async {
          final step = plan(
            duration: duration,
            set: set,
            step: set == 'pelvic-floor' ? 'quick-squeeze' : 'hold',
          );
          haptics().update(step, 100, const {
            'practiceHaptics': {'intensity': .9},
          });
          await flush();
          expect(payload(), {
            'durationMs': (duration - 100).clamp(1, 30000),
            'strength': .9,
            'continuous': true,
            'count': 1,
          });
        },
      );
    }
  }

  test('a short remainder of a normal phase does not become micro', () async {
    haptics().update(plan(duration: 5000), 4999, const {});
    await flush();
    expect(payload()['durationMs'], 60);
    expect(payload()['strength'], .8);
    expect(payload()['count'], 2);
  });

  test(
    'fast phase sends once across ticks; next phase sends its own pulse',
    () async {
      final p = plan(duration: 1000);
      (p['timeline'] as List).add(
        (plan(duration: 1000, start: 1000, step: 'inhale')['timeline'] as List)
            .single,
      );
      final h = haptics();
      for (final at in [0, 16, 100, 500, 999]) {
        h.update(p, at, const {});
      }
      await flush();
      expect(getPlays(), hasLength(1));
      for (final at in [1000, 1016, 1500, 1999]) {
        h.update(p, at, const {});
      }
      await flush();
      expect(getPlays(), hasLength(2));
      h.update(p, 2000, const {});
      await flush();
      expect(getPlays(), hasLength(2));
      expect(calls.last.method, 'stop');
    },
  );

  test('silent guards remain silent for fast phases', () async {
    final h = haptics();
    h.update(plan(), 0, const {
      'practiceHaptics': {'enabled': false},
    });
    h.update(plan(), 0, const {
      'practiceHaptics': {'breathing': 'off'},
    });
    h.update(plan(step: 'hold-in'), 0, const {});
    h.update(plan(set: 'pelvic-floor', step: 'release'), 0, const {});
    h.update(plan(set: 'eye-gym', program: 'catch-overlap'), 0, const {});
    await flush();
    expect(getPlays(), isEmpty);
  });

  test('event and preview signals are not timeline micro phases', () async {
    final h = haptics();
    h.event(const {}, 'eyes', count: 2);
    await flush();
    expect(payload(), {
      'durationMs': 60,
      'strength': .8,
      'continuous': false,
      'count': 2,
    });
    calls.clear();
    h.preview('phases', .8);
    await flush();
    expect(payload(), {'durationMs': 60, 'strength': .8, 'continuous': false});
  });

  testWidgets('stop and dispose never schedule delayed micro pulses', (
    t,
  ) async {
    final h = haptics();
    h.update(plan(), 0, const {});
    await t.pump();
    h.stop();
    await t.pump(const Duration(seconds: 5));
    expect(getPlays(), hasLength(1));
    h.dispose();
    h.update(plan(start: 2000), 2000, const {});
    await t.pump(const Duration(seconds: 5));
    expect(getPlays(), hasLength(1));
  });
}
