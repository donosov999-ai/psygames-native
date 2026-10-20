import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

// Structural source contracts, matching haptics_felt_strength_test.dart.
// These do not compile/run Swift/Kotlin or measure a device's vibration.
const swiftPath =
    'ios/practice_kit/Sources/practice_kit/PracticeKitPlugin.swift';
const kotlinPath =
    'android/src/main/kotlin/pro/psygames/practice_kit/PracticeKitHaptics.kt';

String source(String path) => File(
  path,
).readAsStringSync().replaceAll(RegExp(r'//[^\n]*|/\*[\s\S]*?\*/'), '');
String compact(String text) => text.replaceAll(RegExp(r'\s+'), '');

String block(String text, String marker) {
  final markerAt = text.indexOf(marker);
  expect(
    markerAt,
    greaterThanOrEqualTo(0),
    reason: 'missing source marker: $marker',
  );
  final start = text.indexOf('{', markerAt);
  expect(start, greaterThan(markerAt));
  var depth = 0;
  for (var i = start; i < text.length; i++) {
    if (text[i] == '{') depth++;
    if (text[i] == '}' && --depth == 0) return text.substring(start + 1, i);
  }
  throw StateError('Unclosed source block: $marker');
}

int occurrences(String text, String value) => value.allMatches(text).length;

void main() {
  late String swift, kotlin;
  setUpAll(() {
    swift = source(swiftPath);
    kotlin = source(kotlinPath);
  });

  test(
    'iOS micro gate excludes continuous and requires duration/intensity ceilings',
    () {
      final text = compact(swift);
      expect(
        text,
        contains('letmicro=!continuous&&duration<=0.020&&strength<=0.25'),
      );
      expect(
        text,
        contains(
          'letstrength=min(1.0,max(0.1,(args["strength"]as?NSNumber)?.doubleValue??0.8))',
        ),
      );
      expect(text, contains('letintensity=Float(strength)'));
      expect(text.indexOf('letmicro='), lessThan(text.indexOf('if!micro{')));
    },
  );

  test(
    'iOS system buzz is called only outside micro; unsupported micro returns before Core',
    () {
      final normal = block(swift, 'if !micro');
      expect(occurrences(normal, 'buzz('), 1);
      expect(normal, isNot(contains('UIImpactFeedbackGenerator')));
      final unsupported = block(swift, 'else if !supported');
      expect(occurrences(unsupported, 'UIImpactFeedbackGenerator'), 1);
      expect(
        compact(unsupported),
        contains(
          'UIImpactFeedbackGenerator(style:.light).impactOccurred(intensity:CGFloat(strength))',
        ),
      );
      expect(unsupported, isNot(contains('buzz(')));
      final guard = block(swift, 'guard supported else');
      expect(compact(guard), 'result(nil);return');
      expect(
        swift.indexOf('else if !supported'),
        lessThan(swift.indexOf('guard supported else')),
      );
      expect(
        swift.indexOf('guard supported else'),
        lessThan(swift.indexOf('    do {')),
      );
      // One call site in the entire handler, not a second unconditional buzz.
      final handle = block(swift, 'public func handle');
      expect(occurrences(handle, 'buzz('), 1);
    },
  );

  test(
    'iOS catch stops failed Core player then performs a single micro-only fallback',
    () {
      final caught = block(swift, '} catch');
      final fallback = block(caught, 'if micro');
      expect(occurrences(caught, 'UIImpactFeedbackGenerator'), 1);
      expect(
        compact(fallback),
        'UIImpactFeedbackGenerator(style:.light).impactOccurred(intensity:CGFloat(strength))',
      );
      expect(
        caught.indexOf('player?.stop'),
        lessThan(caught.indexOf('if micro')),
      );
      expect(
        caught.indexOf('player = nil'),
        lessThan(caught.indexOf('if micro')),
      );
      expect(caught, isNot(contains('buzz(')));
      expect(compact(caught), endsWith('result(nil)'));
      final normalTry = block(swift, '    do {');
      expect(normalTry, isNot(contains('UIImpactFeedbackGenerator')));
      expect(
        occurrences(
          block(swift, 'public func handle'),
          'UIImpactFeedbackGenerator',
        ),
        2,
        reason:
            'only mutually exclusive unsupported and Core-error fallback sites',
      );
    },
  );

  test(
    'iOS continuous duration, legacy buzz timer and cancellation remain present',
    () {
      final text = compact(swift);
      expect(text, contains('relativeTime:0,duration:continuous?duration:0'));
      expect(
        text,
        contains('eventType:continuous?.hapticContinuous:.hapticTransient'),
      );
      final buzz = compact(block(swift, 'private func buzz'));
      expect(
        buzz,
        contains('AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)'),
      );
      expect(buzz, contains('letinterval=continuous?0.5:0.45'));
      expect(buzz, contains('Int((duration/interval).rounded(.down))'));
      final stop = block(swift, 'private func stop()');
      expect(stop, contains('pulse?.invalidate()'));
      expect(stop, contains('player?.stop'));
      final handle = block(swift, 'public func handle');
      expect(
        handle.indexOf(
          'guard UIApplication.shared.applicationState == .active',
        ),
        lessThan(handle.indexOf('let micro')),
      );
    },
  );

  test(
    'Android honors requested micro duration but retains legacy 35ms and continuous clamp',
    () {
      final text = compact(kotlin);
      expect(
        text,
        contains(
          'valrequestedDuration=call.argument<Number>("durationMs")?.toLong()?:60L',
        ),
      );
      expect(
        text,
        contains(
          'valduration=if(continuous)requestedDuration.coerceIn(1,30000)elseif(requestedDuration<=20L)requestedDuration.coerceIn(1,20)else35L',
        ),
      );
      expect(
        text,
        contains(
          'VibrationEffect.createOneShot(duration,if(amplitude)(strength*255).toInt().coerceAtLeast(1)elseVibrationEffect.DEFAULT_AMPLITUDE)',
        ),
      );
      expect(
        text,
        contains(
          'valcontinuous=call.argument<Boolean>("continuous")==true&&amplitude',
        ),
      );
    },
  );

  test(
    'Android keeps no-amplitude fallback, double cues, alarm and foreground guards',
    () {
      final text = compact(kotlin);
      expect(
        text,
        contains(
          'elseif(!amplitude&&Build.VERSION.SDK_INT>=29){VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)',
        ),
      );
      expect(text, contains('longArrayOf(0,35,125,35)'));
      expect(
        text,
        contains(
          'valdoubleCue=!continuous&&call.argument<Number>("count")?.toInt()==2',
        ),
      );
      expect(
        text,
        contains(
          'if(!supported||alarm||!foreground){result.success(null);return}',
        ),
      );
      expect(
        text.indexOf('if(!supported||alarm||!foreground)'),
        lessThan(text.indexOf('valrequestedDuration=')),
      );
      expect(
        occurrences(
          block(kotlin, 'fun handle'),
          'target!!.vibrate(effect, attributes)',
        ),
        1,
      );
      expect(
        compact(block(kotlin, 'fun stop()')),
        contains(
          'if(!alarm&&SystemClock.uptimeMillis()<ownedUntil)vibrator?.cancel()',
        ),
      );
    },
  );
}
