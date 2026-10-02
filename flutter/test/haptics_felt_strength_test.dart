import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/pause/practice_haptics.dart';
import 'package:psygames_flutter/games/pause/practices.dart';

/// 🔴 ВИБРАЦИЯ ДОЛЖНА ОЩУЩАТЬСЯ В РУКЕ, А НЕ ТОЛЬКО «УХОДИТЬ В КАНАЛ».
///
/// Денис, 01.10.2026: «вибрации нет нихуя». Пробы haptics_setting_test зеленели —
/// удержание Кегеля звало канал, — но с силой 0,25 из 1,0 при резкости 0,15, и iOS
/// ещё обрезал всё выше 0,6. На Taptic Engine это едва различимый гул. Здесь — ЧИСЛО,
/// с которым уходит сигнал, и потолок в нативном коде обеих платформ: Dart-проба
/// канала его не видит.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final calls = <MethodCall>[];
  final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  final engine = Practices(jsonDecode(File('assets/pause/practices.json').readAsStringSync()) as Json);

  setUp(() {
    calls.clear();
    messenger.setMockMethodCallHandler(PausePracticeHaptics.channel, (c) async {
      calls.add(c);
      return null;
    });
  });
  tearDown(() => messenger.setMockMethodCallHandler(PausePracticeHaptics.channel, null));

  test('удержание Кегеля уходит с силой ≥ 0,8', () {
    final p = engine.plan({
      'mode': 'solo',
      'durationMs': 60000,
      'locale': 'ru',
      'selections': [
        {'setId': 'pelvic-floor', 'programId': 'balanced'},
      ],
      'guideMode': 'visual',
      'context': 'home',
      'advisory': true,
    });
    final squeeze = objects(p['timeline']).firstWhere((s) => '${s['stepId']}'.endsWith('squeeze'));
    final h = PausePracticeHaptics(() => true);
    h.update(p, squeeze['startMs'] as int);
    h.dispose();
    final play = calls.firstWhere((c) => c.method == 'play');
    expect(play.arguments['continuous'], isTrue);
    expect((play.arguments['strength'] as num).toDouble(), greaterThanOrEqualTo(.8));
  });

  test('iOS: нативный код не режет силу до 0,6 и не глушит резкость', () {
    final swift = File('ios/Runner/AppDelegate.swift').readAsStringSync();
    final start = swift.indexOf('final class PracticeHapticsPlugin');
    expect(start, isNonNegative);
    final end = swift.indexOf('\nfinal class', start + 1);
    final plugin = swift.substring(start, end < 0 ? swift.length : end);
    expect(plugin, contains('min(1.0, max(0.1'));
    expect(plugin, isNot(contains('min(0.6')));
    expect(plugin, isNot(contains('value: 0.15')));
  });

  // Денис, 01.10.2026: «дребезжание при удержании в Кегеле не работает… у
  // конкурентов всё работает». Основной канал — системный вибромотор, как у них.
  test('iOS: системный вибромотор — основной канал, импульсы снимаются в stop()', () {
    final swift = File('ios/Runner/AppDelegate.swift').readAsStringSync();
    final start = swift.indexOf('final class PracticeHapticsPlugin');
    final end = swift.indexOf('\nfinal class', start + 1);
    final plugin = swift.substring(start, end < 0 ? swift.length : end);
    expect(swift, contains('import AudioToolbox'));
    expect(plugin, contains('AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)'));
    final s = plugin.indexOf('private func stop()');
    expect(plugin.substring(s, plugin.indexOf('}', s)), contains('pulse?.invalidate()'));
    final play = plugin.substring(plugin.indexOf('guard call.method == "play"'));
    expect(play.indexOf('buzz('), lessThan(play.indexOf('guard supported')),
        reason: 'вибромотор не зависит от поддержки Core Haptics');
  });

  test('Android: нативный код не режет силу до 0,6', () {
    final kotlin = File('android/app/src/main/kotlin/pro/psygames/psygames_flutter/PracticeHaptics.kt')
        .readAsStringSync();
    expect(kotlin, contains('coerceIn(.1, 1.0)'));
    expect(kotlin, isNot(contains('coerceIn(.1, .6)')));
  });
}
