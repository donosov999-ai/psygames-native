// Голос «Паузы» слушает общий тумблер «Звук» — на НАСТОЯЩЕМ шлюзе экрана (задача 25b1d933).
//
// Проба `pause_voice_sound_gate_test.dart` держит условие `appSoundOn`, но экран строит голос сам:
// `VoiceLayer(backend: SystemVoiceBackend(), soundOn: appSoundOn(state) && !isCalm)`. Если подставить
// `voice:` в `PauseScreen`, шлюз обходится, поэтому здесь `voice` не передаётся, а у настоящего
// `SystemVoiceBackend` подменён канал `flutter_tts`: считаем, сколько раз дошло до `speak`.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';
import 'package:psygames_flutter/games/pause/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final engine = Practices(jsonDecode(File('../packages/practice_kit/assets/practices.json').readAsStringSync()) as Json);
  final copy = jsonDecode(File('assets/pause/copy.json').readAsStringSync()) as Json;
  const channel = MethodChannel('flutter_tts');
  late List<String> spoken;
  var now = 0;

  setUp(() {
    spoken = [];
    now = 0;
    GamePreset.clear();
    SessionReport.sink = (_) async {};
    // Любой вызов канала отвечает «ок»: язык установлен, речь принята (1 = успех у flutter_tts).
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
      if (call.method == 'speak') spoken.add('${call.arguments}');
      if (call.method == 'isLanguageInstalled') return true;
      if (call.method == 'getLanguages') return <String>['ru-RU', 'en-US'];
      return 1;
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, null);
    GamePreset.clear();
    SessionReport.sink = null;
  });

  /// Дыхание с голосом («Экран + звук»): первый шаг называется сразу после отсчёта.
  Future<void> run(WidgetTester tester, Map<String, Object> prefs) async {
    SharedPreferences.setMockInitialValues(prefs);
    final state = await SharedState.open();
    GamePreset.set({'guide': 'both'});
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      home: PauseScreen(
        state: state,
        flavor: PauseFlavor.breathing,
        engine: engine,
        copy: copy,
        clock: () => now,
        today: () => DateTime(2026, 11, 12),
      ),
    ));
    await tester.pump();
    await tester.pump();
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    for (final ms in [3000, 6000, 9000]) {
      now = ms;
      await tester.pump(const Duration(milliseconds: 16));
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  testWidgets('тумблер «Звук» выключен — до устройства речи не доходит ни одного вызова', (tester) async {
    await run(tester, {'flutter.psygames_sound_enabled': 'false'});
    expect(find.byKey(const Key('pause-playing')), findsOneWidget, reason: 'практика идёт, а не стоит на отсчёте');
    expect(spoken, isEmpty);
  });

  testWidgets('тот же прогон со звуком (по умолчанию включён) — голос говорит', (tester) async {
    await run(tester, {});
    expect(find.byKey(const Key('pause-playing')), findsOneWidget);
    expect(spoken, isNotEmpty, reason: 'без этого проба выше ничего не доказывала бы: канал мока слышит речь');
  });
}
