import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/pause/practice_haptics.dart';
import 'package:practice_kit/practice_kit.dart';
import 'package:psygames_flutter/games/pause/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/voice.dart';
import 'package:psygames_flutter/shell/app_haptics.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ВИБРАЦИЯ: ОДИН ВЫКЛЮЧАТЕЛЬ НА ВЕБ И НАТИВ + УДЕРЖАНИЕ КЕГЕЛЯ В «ПАУЗЕ».
///
/// Денис, 01.10.2026: «виброотклик… дребезжание при Кегеле на удержании» и
/// «вынеси нормально в настройки всех приложений». Замер по main до правки:
/// ключ тумблера `psygames_haptic_enabled` во flutter/lib не читал никто, нативная
/// «Пауза» вибрировала при выключенном тумблере, удержание Кегеля не вибрировало.
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

  Json plan(String setId, String programId) => engine.plan({
        'mode': 'solo',
        'durationMs': 60000,
        'locale': 'ru',
        'selections': [
          {'setId': setId, 'programId': programId},
        ],
        'guideMode': 'visual',
        'context': 'home',
        'advisory': true,
      });

  test('ключ — тот же, что пишет тумблер веба; по умолчанию включено, как в feedback.ts', () async {
    expect(hapticKey, 'psygames_haptic_enabled');
    final web = File('../frontend/src/services/feedback.ts').readAsStringSync();
    expect(web, contains("'psygames_haptic_enabled'"));
    SharedPreferences.setMockInitialValues({});
    final s = await SharedState.open();
    expect(appHapticOn(s), isTrue);
    await s.set(hapticKey, 'false');
    expect(appHapticOn(s), isFalse);
    await s.set(hapticKey, 'true');
    expect(appHapticOn(s), isTrue);
  });

  test('🔴 Кегель: мягкая вибрация ВСЁ удержание, на отдыхе — тишина', () {
    for (final program in objects(engine.set('pelvic-floor')['programs'])) {
      final p = plan('pelvic-floor', program['id'] as String);
      final h = PausePracticeHaptics(() => true);
      var holds = 0;
      for (final step in objects(p['timeline'])) {
        calls.clear();
        h.update(p, step['startMs'] as int);
        final plays = calls.where((c) => c.method == 'play').toList();
        if ('${step['stepId']}'.endsWith('squeeze')) {
          holds++;
          expect(plays, hasLength(1), reason: '${program['id']}: удержание ${step['stepId']} без вибрации');
          expect(plays.single.arguments['continuous'], isTrue);
          expect(plays.single.arguments['durationMs'], (step['endMs'] as int) - (step['startMs'] as int));
        } else {
          expect(plays, isEmpty, reason: '${program['id']}: на отдыхе ${step['stepId']} вибрировать нельзя');
        }
      }
      expect(holds, greaterThan(0));
      h.dispose();
    }
  });

  test('один эффект на шаг, а не вызов на кадр', () {
    final p = plan('pelvic-floor', 'holds');
    final h = PausePracticeHaptics(() => true);
    final first = objects(p['timeline']).first;
    for (var t = first['startMs'] as int; t < (first['endMs'] as int); t += 16) {
      h.update(p, t);
    }
    expect(calls.where((c) => c.method == 'play'), hasLength(1));
    h.dispose();
  });

  test('🔴 тумблер «Вибрация» выключен — тишина, и удержание гаснет сразу', () {
    var on = true;
    final p = plan('pelvic-floor', 'holds');
    final h = PausePracticeHaptics(() => on);
    final squeeze = objects(p['timeline']).firstWhere((s) => '${s['stepId']}'.endsWith('squeeze'));
    h.update(p, squeeze['startMs'] as int);
    expect(calls.last.method, 'play');
    on = false;
    calls.clear();
    h.update(p, (squeeze['startMs'] as int) + 100);
    expect(calls.where((c) => c.method == 'play'), isEmpty);
    expect(calls.map((c) => c.method), contains('stop'));
    h.dispose();
  });

  test('🔴 голых HapticFeedback во flutter/lib нет — вибрация только через выключатель', () {
    final offenders = <String>[];
    for (final f in Directory('lib').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart') || f.path.endsWith('shell/app_haptics.dart')) continue;
      final src = f.readAsStringSync();
      if (src.contains('HapticFeedback.')) offenders.add(f.path);
    }
    expect(offenders, isEmpty, reason: 'вибрирует мимо тумблера «Вибрация»: $offenders');
  });

  test('🔴 канал реализован на обеих платформах, а не только в пробе', () {
    // Нативная часть — пакет practice_kit; приложение регистрирует его как плагин.
    const kit = '../packages/practice_kit';
    final pubspec = File('$kit/pubspec.yaml').readAsStringSync();
    expect(RegExp('pluginClass: PracticeKitPlugin').allMatches(pubspec).length, 2, reason: 'android и ios');
    final kt = File('$kit/android/src/main/kotlin/pro/psygames/practice_kit/PracticeKitPlugin.kt').readAsStringSync();
    expect(kt, contains('"pro.psygames.practice_kit/haptics"'));
    expect(File('$kit/android/src/main/kotlin/pro/psygames/practice_kit/PracticeKitHaptics.kt').readAsStringSync(),
        allOf(contains('"play"'), contains('"stop"'), contains('createOneShot')));
    expect(File('$kit/android/src/main/AndroidManifest.xml').readAsStringSync(),
        contains('android.permission.VIBRATE'), reason: 'Vibrator без разрешения молчит');
    final swift = File('$kit/ios/practice_kit/Sources/practice_kit/PracticeKitPlugin.swift').readAsStringSync();
    expect(swift, contains('"pro.psygames.practice_kit/haptics"'));
    expect(swift, contains('.hapticContinuous'));
    expect(PausePracticeHaptics.channel.name, 'pro.psygames.practice_kit/haptics');
  });

  group('🔴 экран «Паузы»', () {
    final copy = jsonDecode(File('assets/pause/copy.json').readAsStringSync()) as Json;
    var now = 0;

    Future<SharedState> open(WidgetTester tester, {String? haptic}) async {
      SharedPreferences.setMockInitialValues({hapticKey: ?haptic});
      final state = (await tester.runAsync(SharedState.open))!;
      GamePreset.clear();
      now = 0;
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp(
        home: PauseScreen(
          state: state,
          engine: engine,
          copy: copy,
          clock: () => now,
          voice: VoiceLayer(backend: _SilentVoice(), soundOn: () => false),
        ),
      ));
      await tester.pump();
      await tester.ensureVisible(find.byKey(const Key('pause-set-pelvic-floor')));
      await tester.tap(find.byKey(const Key('pause-set-pelvic-floor')));
      await tester.pump();
      await tester.ensureVisible(find.byKey(const Key('pause-start')));
      await tester.tap(find.byKey(const Key('pause-start')));
      await tester.pump();
      // Отсчёт перед началом — досчитать.
      for (var i = 0; i < 12 && find.byKey(const Key('pause-playing')).evaluate().isEmpty; i++) {
        now += 1000;
        await tester.pump(const Duration(milliseconds: 16));
      }
      return state;
    }

    Future<void> runTo(WidgetTester tester, int ms) async {
      final until = now + ms;
      while (now < until) {
        now += 100;
        await tester.pump(const Duration(milliseconds: 16));
      }
    }

    testWidgets('Кегель на экране: удержание вибрирует, пауза гасит', (tester) async {
      await open(tester);
      expect(find.byKey(const Key('pause-playing')), findsOneWidget);
      await runTo(tester, 12000);
      final holds = calls.where((c) => c.method == 'play' && c.arguments['continuous'] == true);
      expect(holds, isNotEmpty, reason: 'за 12 с Кегеля — ни одного удержания с вибрацией');
      calls.clear();
      await tester.tap(find.byKey(const Key('pause-pause')));
      await tester.pump();
      expect(calls.map((c) => c.method), contains('stop'));
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('тумблер «Вибрация» выключен в вебе — экран молчит', (tester) async {
      await open(tester, haptic: 'false');
      expect(find.byKey(const Key('pause-playing')), findsOneWidget);
      await runTo(tester, 12000);
      expect(calls.where((c) => c.method == 'play'), isEmpty);
      await tester.pumpWidget(const SizedBox());
    });
  });
}

class _SilentVoice implements VoiceBackend {
  @override
  Future<bool> playUrl(String url, double rate) async => false;

  @override
  Future<bool> speakSystem(String text, String bcp47, double rate) async => true;

  @override
  Future<bool> hasSystemVoice(String bcp47) async => true;

  @override
  Future<void> cancel() async {}
}
