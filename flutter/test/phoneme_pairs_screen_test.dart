import 'dart:convert';
import 'dart:io';
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
  bool plays = true;
  @override
  Future<bool> playUrl(String url, double rate) async => false;
  @override
  Future<bool> speakSystem(String text, String bcp47, double rate) async {
    said.add((text, bcp47));
    return plays;
  }

  @override
  Future<bool> hasSystemVoice(String bcp47) async => true;
  @override
  Future<void> cancel() async {}
}

class BundledVoice extends FakeVoice implements AssetVoiceBackend {
  final assets = <String>[];
  @override
  Future<bool> playAsset(String path, double rate) async {
    assets.add(path);
    return File(path).existsSync();
  }
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

  Future<(FakeVoice, FakeNoise)> boot(
    WidgetTester tester, {
    bool sound = true,
    FakeVoice? backend,
    Map<String, Map<String, String>> samples = const {},
  }) async {
    final v = backend ?? FakeVoice();
    final n = FakeNoise();
    await tester.pumpWidget(MaterialApp(
      home: PhonemePairsScreen(
        state: state,
        random: Random(2).nextDouble,
        voice: VoiceLayer(backend: v, soundOn: () => sound, samples: samples),
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

  Map<String, Map<String, String>> bundledSamples() {
    final index = jsonDecode(File('assets/voice/voice-index.json').readAsStringSync()) as Map;
    return (index['samples'] as Map<String, dynamic>).map(
      (lang, words) => MapEntry(lang, (words as Map).cast<String, String>()),
    );
  }

  test('all six languages have local audio for every phoneme', () {
    final data = PhData.fromJson(jsonDecode(File('assets/vocab/phoneme-pairs.json').readAsStringSync()) as Map);
    final voice = VoiceLayer(backend: FakeVoice(), soundOn: () => true, samples: bundledSamples());
    final paths = <String>{};
    for (final MapEntry(key: lang, value: pairs) in data.pairs.entries) {
      for (final pair in pairs) {
        for (final word in [pair.$1, pair.$2]) {
          final path = phonemeClipPath(voice, word, lang);
          expect(path, isNotNull, reason: '$lang: $word');
          expect(File(path!).lengthSync(), greaterThan(1024), reason: path);
          paths.add(path);
        }
      }
    }
    expect(paths, hasLength(150));
  });

  testWidgets('no silent answer; replay before auto and later rounds play local audio', (tester) async {
    final backend = BundledVoice()..plays = false;
    final samples = bundledSamples();
    await boot(tester, backend: backend, samples: samples);
    await tester.tap(find.byKey(const Key('ph-start')));
    await tester.pump();
    FilledButton firstAnswer() => tester.widget<FilledButton>(find.byKey(const Key('ph-word-0')));
    expect(firstAnswer().onPressed, isNull);
    await tester.tap(find.byKey(const Key('ph-replay')));
    await tester.pump(const Duration(milliseconds: 450));
    expect(backend.assets, hasLength(1), reason: 'manual replay cancels the queued auto playback');
    expect(firstAnswer().onPressed, isNotNull);
    final voice = VoiceLayer(backend: backend, soundOn: () => true, samples: samples);
    final pick = phonemeClipPath(voice, label(tester, 0), 'en') == backend.assets.first ? 0 : 1;
    await tester.tap(find.byKey(Key('ph-word-$pick')));
    await tester.pump(const Duration(milliseconds: 1200));
    await tester.pump(const Duration(milliseconds: 450));
    expect(backend.assets, hasLength(2));
    await tester.tap(find.byKey(const Key('ph-replay')));
    await tester.pump();
    expect(backend.assets, hasLength(3));
    expect(backend.assets.last, backend.assets[1], reason: 'the speaker repeats the second round');
    expect(backend.said, isEmpty, reason: 'no system voice needed in offline mode');
  });

  testWidgets('failed audio unlocks replay but not guessing', (tester) async {
    final (voice, _) = await boot(tester, backend: FakeVoice()..plays = false);
    await tester.tap(find.byKey(const Key('ph-start')));
    await tester.pump(const Duration(milliseconds: 450));
    expect(find.byKey(const Key('ph-playback-error')), findsOneWidget);
    FilledButton firstAnswer() => tester.widget<FilledButton>(find.byKey(const Key('ph-word-0')));
    expect(firstAnswer().onPressed, isNull);
    final word = voice.said.single;
    voice.plays = true;
    await tester.tap(find.byKey(const Key('ph-replay')));
    await tester.pump();
    expect(voice.said.last, word);
    expect(find.byKey(const Key('ph-playback-error')), findsNothing);
    expect(firstAnswer().onPressed, isNotNull);
  });

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
    expect(find.byKey(const Key('level-result')), findsOneWidget, reason: 'итог — общий каркаса');
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
