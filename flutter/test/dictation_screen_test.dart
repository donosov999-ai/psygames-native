import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/dictation/model.dart';
import 'package:psygames_flutter/games/dictation/screen.dart';
import 'package:psygames_flutter/games/vocab_srs/typing.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/noise.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/voice.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ДИКТАНТ НАБОРОМ НА ПОДСТАВНОМ ГОЛОСЕ. Набирается ровно то, что прозвучало
/// (записано устройством), а не то, что знает модель экрана.
///
/// ⚠️ Экран поднимается БЕЗ `runAsync`: пауза перед вводом и задержка речи должны
/// идти `pump`-ом.
class FakeVoice implements VoiceBackend {
  final said = <String>[];
  @override
  Future<bool> playUrl(String url, double rate) async => false;
  @override
  Future<bool> speakSystem(String text, String bcp47, double rate) async {
    said.add(text);
    return true;
  }

  @override
  Future<bool> hasSystemVoice(String bcp47) async => true;
  @override
  Future<void> cancel() async {}
}

class FakeNoise implements NoiseBackend {
  final log = <String>[];
  @override
  Future<void> start(double gain) async => log.add('start');
  @override
  Future<void> stop() async => log.add('stop');
}

void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_active_profile': 'nzt48'});
    state = await SharedState.open();
    await L.load('ru');
  });
  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
  });

  Future<FakeVoice> boot(WidgetTester tester, {bool keyboard = true}) async {
    final v = FakeVoice();
    await tester.pumpWidget(MaterialApp(
      home: DictationScreen(
        state: state,
        random: Random(3).nextDouble,
        keyboard: keyboard,
        voice: VoiceLayer(backend: v, soundOn: () => true),
        noise: NoiseLayer(backend: FakeNoise(), soundOn: () => true),
      ),
    ));
    for (var i = 0; i < 25; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    return v;
  }

  /// Набрать фразу по одному знаку, как клавиатура: поле-приёмник держит служебный знак.
  /// ⚠️ Знаки препинания не набираются: диктант идёт с послаблением, и движок
  /// проскакивает их сам — лишняя точка ушла бы уже в следующую фразу.
  Future<void> type(WidgetTester tester, String text) async {
    for (final ch in text.split('').where((c) => !isPunct(c))) {
      await tester.enterText(find.byKey(const Key('dict-input')), '​$ch');
      await tester.pump();
    }
  }

  testWidgets('🔴 партия целиком: набрано прозвучавшее — уровень вырос, отчёт один', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    final voice = await boot(tester);
    await tester.tap(find.byKey(const Key('dict-start')));
    await tester.pump(const Duration(milliseconds: 500));
    final count = dictationLevelParams(1).count;
    for (var i = 0; i < count; i += 1) {
      final phrase = voice.said.last;
      // Ненабранное скрыто: на экране точки, а не текст фразы.
      final shown = tester.widget<Text>(find.descendant(of: find.byKey(const Key('dict-char-0')), matching: find.byType(Text)));
      expect(shown.data == phrase[0] && phrase[0] != ' ', isFalse, reason: 'первая буква не подсказана');
      // Одна намеренная опечатка в первой фразе: счёт опечаток обязан её донести
      // (без неё мутация «опечатки не копятся» выживала).
      if (i == 0) await type(tester, phrase[0].toLowerCase() == 'q' ? 'z' : 'q');
      await type(tester, phrase);
      await tester.pump(const Duration(milliseconds: 500));
    }
    expect(find.byKey(const Key('dict-score')), findsOneWidget);
    expect(sent, hasLength(1));
    final d = sent.single['details'] as Map;
    expect(sent.single['game_type'], 'dictation');
    expect(d['typos'], 1);
    expect(sent.single['errors'], 1);
    expect(d['weak_keys'], isEmpty, reason: 'как в вебе: слабые знаки не считаются');
    expect(state.get(SharedState.levelKey('dictation', 'nzt48')), '2');
  });

  testWidgets('🔴 три ошибки подряд на знаке — открывается слог', (tester) async {
    final voice = await boot(tester);
    await tester.tap(find.byKey(const Key('dict-start')));
    await tester.pump(const Duration(milliseconds: 500));
    final phrase = voice.said.last;
    final wrong = phrase[0].toLowerCase() == 'q' ? 'z' : 'q';
    for (var k = 0; k < dictationErrorsBeforeHint; k += 1) {
      await type(tester, wrong);
    }
    final first = tester.widget<Text>(find.descendant(of: find.byKey(const Key('dict-char-0')), matching: find.byType(Text)));
    expect(first.data, phrase[0], reason: 'после трёх ошибок знак открыт');
  });

  testWidgets('с восьмого уровня ввод открывается после паузы', (tester) async {
    await state.set(SharedState.levelKey('dictation', 'nzt48'), '8');
    await boot(tester);
    await tester.tap(find.byKey(const Key('dict-start')));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byKey(const Key('dict-wait')), findsOneWidget, reason: 'сразу после фразы — пауза');
    await tester.pump(Duration(milliseconds: dictationLevelParams(8).delayMs + 50));
    expect(find.byKey(const Key('dict-input')), findsOneWidget);
  });

  testWidgets('без настоящей клавиатуры — сказано словом', (tester) async {
    await boot(tester, keyboard: false);
    expect(find.byKey(const Key('dict-keyboard-warning')), findsOneWidget);
  });
}
