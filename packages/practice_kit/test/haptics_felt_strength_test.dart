import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';

/// 🔴 ВИБРАЦИЯ ДОЛЖНА ОЩУЩАТЬСЯ В РУКЕ, А НЕ ТОЛЬКО «ВКЛЮЧАТЬСЯ».
///
/// Денис, 01.10.2026, на 0.4.3 (29): «вибрации нет нихуя». Включена по умолчанию
/// она уже была (haptics_on_by_default_test зелёный), и сигнал уходил — но с силой
/// 0,25 из 1,0 и резкостью 0,15, а iOS ещё и обрезал всё выше 0,6. На Taptic Engine
/// это едва различимый гул: проба «канал позвали» зеленела, а человек не чувствовал
/// ничего. Здесь проверяется ЧИСЛО, с которым сигнал уходит, и потолок в нативном
/// коде обеих платформ — его Dart-проба иначе не видит.
const _swift = 'ios/practice_kit/Sources/practice_kit/PracticeKitPlugin.swift';
const _kotlin = 'android/src/main/kotlin/pro/psygames/practice_kit/PracticeKitHaptics.kt';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final calls = <MethodCall>[];
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  final engine = Practices(
    jsonDecode(File('assets/practices.json').readAsStringSync()),
  );
  setUp(() {
    calls.clear();
    messenger.setMockMethodCallHandler(PracticeHaptics.channel, (call) async {
      calls.add(call);
      return null;
    });
  });
  tearDown(
    () => messenger.setMockMethodCallHandler(PracticeHaptics.channel, null),
  );

  Json kegel() => engine.plan({
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

  /// Сила, с которой ушло удержание первого сжатия.
  double squeezeStrength(Json config) {
    final session = kegel();
    final squeeze = objects(
      session['timeline'],
    ).firstWhere((s) => '${s['stepId']}'.endsWith('squeeze'));
    calls.clear();
    final h = PracticeHaptics();
    h.update(session, squeeze['startMs'] as int, config);
    h.dispose();
    final play = calls.firstWhere((c) => c.method == 'play');
    expect(play.arguments['continuous'], isTrue, reason: 'Кегель держит гул');
    return (play.arguments['strength'] as num).toDouble();
  }

  test('без настроек: удержание Кегеля уходит с силой 0,8', () {
    expect(squeezeStrength(const {}), PracticeHaptics.defaultStrength);
    expect(PracticeHaptics.defaultStrength, greaterThanOrEqualTo(.8));
  });

  test('старое слабое значение `strength` (шкала до 0,6) не переносится', () {
    expect(
      squeezeStrength(const {
        'practiceHaptics': {'strength': .25},
      }),
      .8,
    );
  });

  test('выбор человека держится; потолок 1,0, пол 0,1', () {
    expect(
      squeezeStrength(const {
        'practiceHaptics': {'intensity': .3},
      }),
      .3,
    );
    expect(
      squeezeStrength(const {
        'practiceHaptics': {'intensity': 5},
      }),
      1.0,
    );
    expect(
      squeezeStrength(const {
        'practiceHaptics': {'intensity': 0},
      }),
      .1,
    );
  });

  test('короткий сигнал смены шага — той же силой', () {
    final h = PracticeHaptics();
    h.event(const {}, 'eyes');
    h.dispose();
    expect(
      calls.firstWhere((c) => c.method == 'play').arguments['strength'],
      .8,
    );
  });

  test('iOS: нативный код не режет силу до 0,6 и не глушит резкость', () {
    final plugin = File(_swift).readAsStringSync();
    expect(plugin, contains('min(1.0, max(0.1'));
    expect(plugin, isNot(contains('min(0.6')));
    expect(plugin, isNot(contains('value: 0.15')));
  });

  // Денис, 01.10.2026 на 31: «дребезжание при удержании в Кегеле не работает… у
  // конкурентов всё работает». Основной канал — системный вибромотор, как у них:
  // удержание — импульсы до конца шага, а пауза/выход их гасят.
  test('iOS: системный вибромотор — основной канал, импульсы снимаются в stop()', () {
    final plugin = File(_swift).readAsStringSync();
    expect(plugin, contains('import AudioToolbox'));
    expect(plugin, contains('AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)'));
    final stop = plugin.substring(
      plugin.indexOf('private func stop()'),
      plugin.indexOf('}', plugin.indexOf('private func stop()')),
    );
    expect(stop, contains('pulse?.invalidate()'), reason: 'пауза гасит импульсы');
    final play = plugin.substring(plugin.indexOf('guard call.method == "play"'));
    expect(play.indexOf('buzz('), lessThan(play.indexOf('guard supported')),
        reason: 'вибромотор не зависит от поддержки Core Haptics');
  });

  test('iOS: вибрация разрешена и при записи (метка голосом, крик)', () {
    final plugin = File(_swift).readAsStringSync();
    final play = plugin.substring(plugin.indexOf('guard call.method == "play"'));
    expect(play.indexOf('setAllowHapticsAndSystemSoundsDuringRecording(true)'),
        lessThan(play.indexOf('buzz(')));
  });

  test('отчёт об ошибке видит, ушла ли вибрация', () async {
    PracticeHaptics.recent.clear();
    final h = PracticeHaptics();
    h.event(const {}, 'eyes');
    await Future<void>.delayed(Duration.zero);
    h.dispose();
    final d = await PracticeHaptics.diagnostics(const {'practiceHaptics': {'kegel': 'hold'}});
    expect(d['settings'], {'kegel': 'hold'});
    final recent = d['recent'] as List;
    expect(recent, isNotEmpty);
    expect((recent.last as Map)['m'], 'play');
    expect((recent.last as Map)['ok'], true);
  });

  test('Android: нативный код не режет силу до 0,6', () {
    final kotlin = File(_kotlin).readAsStringSync();
    expect(kotlin, contains('coerceIn(.1, 1.0)'));
    expect(kotlin, isNot(contains('coerceIn(.1, .6)')));
  });
}
