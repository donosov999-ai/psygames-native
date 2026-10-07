import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';
import 'package:psygames_flutter/games/pause/practice_haptics.dart';
import 'package:psygames_flutter/games/pause/screen.dart';
import 'package:psygames_flutter/games/pause/stage.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/voice.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ПАУЗА» НА ОБЩЕМ ПАКЕТЕ practice_kit — ВИДНО, ЧТО ДЕЛАТЬ, И ЕСТЬ ВСЁ, ЧТО В БУДИЛЬНИКЕ.
///
/// Денис, 02.10.2026: «по животу непонятно, когда держать, когда отпускать; текстов
/// нет», и «вынести практики в один общий блок — чиню один раз, и в будильнике, и в
/// PsyGames». Здесь — что экран «Паузы» показывает панель пакета (действие крупно,
/// отсчёт шага), а массаж лица и режимы глаз, пришедшие с общим каталогом, рисуются
/// виджетами пакета, а не пустым местом.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final engine = Practices(jsonDecode(File('../packages/practice_kit/assets/practices.json').readAsStringSync()) as Json);
  final copy = jsonDecode(File('assets/pause/copy.json').readAsStringSync()) as Json;
  final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  final calls = <MethodCall>[];
  var now = 0;

  setUp(() {
    calls.clear();
    messenger.setMockMethodCallHandler(PausePracticeHaptics.channel, (c) async {
      calls.add(c);
      return null;
    });
  });
  tearDown(() => messenger.setMockMethodCallHandler(PausePracticeHaptics.channel, null));

  Future<void> open(WidgetTester tester, String setId, {String? context}) async {
    SharedPreferences.setMockInitialValues({});
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
    if (context != null) {
      await tester.tap(find.byKey(Key('pause-context-$context')));
      await tester.pump();
    }
    await tester.ensureVisible(find.byKey(Key('pause-set-$setId')));
    await tester.tap(find.byKey(Key('pause-set-$setId')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('pause-start')));
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    for (var i = 0; i < 12 && find.byKey(const Key('pause-playing')).evaluate().isEmpty; i++) {
      now += 1000;
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(find.byKey(const Key('pause-playing')), findsOneWidget);
  }

  Future<void> runTo(WidgetTester tester, int ms) async {
    final until = now + ms;
    while (now < until) {
      now += 100;
      await tester.pump(const Duration(milliseconds: 16));
    }
  }

  testWidgets('«Живот»: крупно действие и отсчёт шага, удержание гудит', (tester) async {
    await open(tester, 'abdomen');
    await runTo(tester, 1500);
    final title = tester.widget<Text>(find.byKey(const Key('step-now-title')));
    expect('${title.data}'.trim(), isNotEmpty);
    expect(title.style!.fontSize, greaterThanOrEqualTo(20), reason: 'действие — крупно, а не строкой текста');
    expect(tester.widget<Text>(find.byKey(const Key('step-now-left'))).data, matches(RegExp(r'^\d+ ')));
    expect(tester.widget<Text>(find.byKey(const Key('step-now-cue'))).data!.trim(), isNotEmpty);
    await runTo(tester, 20000);
    expect(calls.where((c) => c.method == 'play' && c.arguments['continuous'] == true), isNotEmpty,
        reason: '«Живот» держат — и вибрация держит, как у Кегеля');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('массаж лица есть в «Паузе» и рисуется схемой пакета', (tester) async {
    // Гуаша — только дома: в контексте «за столом» её в списке нет, как и поз.
    await open(tester, 'face-massage', context: 'home');
    await runTo(tester, 1500);
    expect(find.byType(FaceMassageGuide), findsOneWidget);
    expect(find.byKey(const Key('step-now-title')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  for (final mode in ['catch-overlap', 'two-dots', 'geometry-paths']) {
    testWidgets('режим глаз $mode: своя сцена пакета, попадание — в вибрацию', (tester) async {
      final plan = engine.plan({
        'mode': 'solo',
        'durationMs': 60000,
        'locale': 'ru',
        'selections': [
          {'setId': 'eye-gym', 'programId': mode},
        ],
        'guideMode': 'visual',
        'context': 'home',
        'advisory': true,
      });
      var hits = 0;
      final cues = objects(engine.frame(plan, 2000)['cues']);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: PracticeStage(engine: engine, cues: cues, elapsed: 2000, locale: 'ru', onEyeHit: () => hits++),
        ),
      ));
      if (mode == 'geometry-paths') {
        expect(find.byWidgetPredicate((w) => w is CustomPaint && w.painter is EyeGeometryGuide), findsOneWidget);
      } else {
        final modes = tester.widget<EyeModes>(find.byType(EyeModes));
        expect(modes.mode, mode);
        modes.onHit!();
        expect(hits, 1);
      }
      await tester.pumpWidget(const SizedBox());
    });
  }

  test('попадание в режиме глаз вибрирует коротко, когда ведут глаза', () {
    final plan = engine.plan({
      'mode': 'solo',
      'durationMs': 60000,
      'locale': 'ru',
      'selections': [
        {'setId': 'eye-gym', 'programId': 'catch-overlap'},
      ],
      'guideMode': 'visual',
      'context': 'home',
      'advisory': true,
    });
    final h = PausePracticeHaptics(() => true);
    h.hit(plan, 2000);
    h.dispose();
    final play = calls.firstWhere((c) => c.method == 'play');
    expect(play.arguments['continuous'], isFalse);
    calls.clear();
    final off = PausePracticeHaptics(() => false);
    off.hit(plan, 2000);
    off.dispose();
    expect(calls.where((c) => c.method == 'play'), isEmpty, reason: 'тумблер «Вибрация» выключен');
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
