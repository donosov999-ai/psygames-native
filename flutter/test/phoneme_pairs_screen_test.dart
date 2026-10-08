import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/phoneme_pairs/model.dart';
import 'package:psygames_flutter/games/phoneme_pairs/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/noise.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/voice.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ «ФОНЕМ» НА ПОДСТАВНОМ ГОЛОСЕ. Верный ответ — ровно прозвучавшее слово.
class FakeVoice implements VoiceBackend {
  final said = <(String, String)>[];
  @override
  Future<bool> playUrl(String url, double rate) async => false;
  @override
  Future<bool> speakSystem(String text, String bcp47, double rate) async {
    said.add((text, bcp47));
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
  Future<void> start(double gain) async => log.add('start $gain');
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

  Future<(FakeVoice, FakeNoise)> boot(WidgetTester tester, {bool sound = true}) async {
    final v = FakeVoice();
    final n = FakeNoise();
    await tester.pumpWidget(MaterialApp(
      home: PhonemePairsScreen(
        state: state,
        random: Random(2).nextDouble,
        voice: VoiceLayer(backend: v, soundOn: () => sound),
        noise: NoiseLayer(backend: n, soundOn: () => sound),
      ),
    ));
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    return (v, n);
  }

  String label(WidgetTester tester, int i) =>
      tester.widgetList<Text>(find.descendant(of: find.byKey(Key('ph-word-$i')), matching: find.byType(Text))).first.data!;

  testWidgets('🔴 партия целиком: выбрано прозвучавшее, повтор посчитан, отчёт один', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    final (voice, _) = await boot(tester);
    await tester.tap(find.byKey(const Key('ph-start')));
    await tester.pump(const Duration(milliseconds: 450));
    final p = phLevelParams(1);
    for (var i = 0; i < p.trials; i += 1) {
      final spoken = voice.said.last.$1;
      if (i == 0) {
        await tester.tap(find.byKey(const Key('ph-replay')));
        await tester.pump();
        expect(voice.said.last.$1, spoken, reason: 'повтор — то же слово');
      }
      final pick = label(tester, 0) == spoken ? 0 : 1;
      await tester.tap(find.byKey(Key('ph-word-$pick')));
      await tester.pump();
      if (i == 0) expect(find.byKey(const Key('ph-played')), findsOneWidget, reason: 'на первых уровнях слово показывается');
      await tester.pump(const Duration(milliseconds: 1200));
      await tester.pump(const Duration(milliseconds: 450));
    }
    expect(find.byKey(const Key('ph-score')), findsOneWidget);
    expect(sent, hasLength(1));
    final s = sent.single;
    expect(s['game_type'], 'phoneme_pairs');
    expect(s['score'], p.trials * 100);
    expect(s['difficulty'], 'L1');
    expect((s['details'] as Map)['replays'], 1);
    expect(state.get(SharedState.levelKey('phoneme_pairs', 'nzt48')), '2');
  });

  testWidgets('🔴 слепой режим с 11-го: после ответа кнопки не подсвечивают верное', (tester) async {
    await state.set(SharedState.levelKey('phoneme_pairs', 'nzt48'), '11');
    final (voice, noise) = await boot(tester);
    await tester.tap(find.byKey(const Key('ph-start')));
    await tester.pump(const Duration(milliseconds: 450));
    final spoken = voice.said.last.$1;
    final wrong = label(tester, 0) == spoken ? 1 : 0;
    await tester.tap(find.byKey(Key('ph-word-$wrong')));
    await tester.pump();
    final style = tester.widget<FilledButton>(find.byKey(Key('ph-word-${1 - wrong}'))).style!;
    expect(style.backgroundColor!.resolve({WidgetState.disabled}), isNot(const Color(0xFF22C55E)),
        reason: 'в слепом режиме верное не подсвечивается');
    expect(noise.log.first, startsWith('start'), reason: 'с шестого уровня под словом шум');
  });

  testWidgets('китайский: у кнопок пиньинь из словаря HSK', (tester) async {
    await boot(tester);
    // Язык выбирается выпадающей строкой (общий LangDropdown): открыть, выбрать пункт.
    await tester.tap(find.byKey(const Key('ph-lang')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.byKey(const Key('ph-lang-zh')).last);
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
    expect(state.get('psygames_phoneme_pairs_targetlang'), 'zh');
    await tester.tap(find.byKey(const Key('ph-start')));
    await tester.pump(const Duration(milliseconds: 450));
    final texts = tester.widgetList<Text>(find.descendant(of: find.byKey(const Key('ph-word-0')), matching: find.byType(Text)));
    expect(texts.length, 2, reason: 'иероглиф и пиньинь');
  });

  testWidgets('звук выключен — сказано словом', (tester) async {
    await boot(tester, sound: false);
    expect(find.byKey(const Key('ph-voice-warning')), findsOneWidget);
  });
}
