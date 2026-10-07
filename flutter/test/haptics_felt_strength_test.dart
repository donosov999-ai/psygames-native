import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/pause/practice_haptics.dart';
import 'package:practice_kit/practice_kit.dart';

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
  final engine = Practices(jsonDecode(File('../packages/practice_kit/assets/practices.json').readAsStringSync()) as Json);

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

  // Нативная часть вибрации (потолок силы, системный вибромотор, снятие импульсов)
  // теперь одна на два приложения — в пакете practice_kit, и проверяется его пробами
  // (packages/practice_kit/test/haptics_felt_strength_test.dart). Здесь — только то,
  // что своей копии у PsyGames снова не завелось: иначе починка опять пойдёт дважды.
  test('🔴 своей нативной копии вибрации у приложения нет — только пакет', () {
    final swift = File('ios/Runner/AppDelegate.swift').readAsStringSync();
    expect(swift, isNot(contains('PracticeHapticsPlugin')));
    expect(swift, isNot(contains('CHHaptic')));
    expect(File('android/app/src/main/kotlin/pro/psygames/psygames_flutter/PracticeHaptics.kt').existsSync(), isFalse);
    expect(File('android/app/src/main/kotlin/pro/psygames/psygames_flutter/MainActivity.kt').readAsStringSync(),
        isNot(contains('MethodChannel')));
    expect(File('pubspec.yaml').readAsStringSync(), contains('path: ../packages/practice_kit'));
  });
}
