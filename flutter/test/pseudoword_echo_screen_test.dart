import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/pseudoword_echo/model.dart';
import 'package:psygames_flutter/games/pseudoword_echo/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/noise.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/voice.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ «ЭХА» НА ПОДСТАВНОМ ГОЛОСЕ И ШУМЕ. Верный ответ — ровно то, что
/// прозвучало (записано подставным устройством), а не то, что знает модель.
class FakeVoice implements VoiceBackend {
  FakeVoice({this.hasVoice = true});
  final bool hasVoice;
  final said = <(String, String, double)>[];
  @override
  Future<bool> playUrl(String url, double rate) async => false;
  @override
  Future<bool> speakSystem(String text, String bcp47, double rate) async {
    said.add((text, bcp47, rate));
    return true;
  }

  @override
  Future<bool> hasSystemVoice(String bcp47) async => hasVoice;
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

  Future<(FakeVoice, FakeNoise)> boot(WidgetTester tester, {bool sound = true, bool hasVoice = true}) async {
    final v = FakeVoice(hasVoice: hasVoice);
    final n = FakeNoise();
    final voice = VoiceLayer(backend: v, soundOn: () => sound);
    final noise = NoiseLayer(backend: n, soundOn: () => sound);
    await tester.pumpWidget(MaterialApp(
      home: PseudowordEchoScreen(state: state, random: Random(4).nextDouble, voice: voice, noise: noise),
    ));
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    return (v, n);
  }

  testWidgets('🔴 партия целиком: выбрано то, что прозвучало, — уровень вырос, отчёт один', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    final (voice, noise) = await boot(tester);
    await tester.tap(find.byKey(const Key('echo-start')));
    await tester.pump();
    final p = echoLevelParams(1);
    for (var i = 0; i < p.trials; i += 1) {
      await tester.pump();
      final (word, bcp47, rate) = voice.said.last;
      expect(bcp47, 'en-US', reason: 'русскому интерфейсу — английский');
      expect(rate, p.rate);
      await tester.tap(find.byKey(Key('echo-option-$word')));
      await tester.pump(const Duration(milliseconds: 700));
    }
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const Key('echo-score')), findsOneWidget);
    expect(voice.said.length, p.trials, reason: 'каждое слово прозвучало один раз');
    expect(noise.log.where((l) => l.startsWith('start')), isEmpty, reason: 'на первом уровне тишина');
    expect(sent, hasLength(1));
    final s = sent.single;
    expect(s['game_type'], 'pseudoword_echo');
    expect(s['score'], p.trials * 120);
    expect(s['difficulty'], 'en · L1');
    expect((s['details'] as Map)['word_len'], '4-5');
    expect(state.get(SharedState.levelKey('pseudoword_echo', 'nzt48')), '2');
  });

  testWidgets('🔴 с десятого уровня слово звучит поверх шума нужной громкости, и шум гаснет', (tester) async {
    await state.set(SharedState.levelKey('pseudoword_echo', 'nzt48'), '12');
    final (_, noise) = await boot(tester);
    await tester.tap(find.byKey(const Key('echo-start')));
    await tester.pump();
    await tester.pump();
    final gain = noiseGainFor(echoLevelParams(12).snrDb!);
    expect(noise.log, ['start $gain', 'stop']);
  });

  testWidgets('повтор звука не штрафуется и говорит то же слово', (tester) async {
    final (voice, _) = await boot(tester);
    await tester.tap(find.byKey(const Key('echo-start')));
    await tester.pump();
    final first = voice.said.last.$1;
    final before = voice.said.length;
    await tester.tap(find.byKey(const Key('echo-replay')));
    await tester.pump();
    // Счёт произнесений, а не последнее слово: без повтора последнее то же самое
    // (так проба сперва и зеленела при молчащей кнопке).
    expect(voice.said.length, before + 1, reason: 'повтор прозвучал');
    expect(voice.said.last.$1, first);
    expect(find.text('0'), findsWidgets, reason: 'ошибок не прибавилось');
  });

  testWidgets('🔴 звук выключен — упражнение говорит об этом, а не молчит', (tester) async {
    await boot(tester, sound: false);
    expect(find.byKey(const Key('echo-voice-warning')), findsOneWidget);
    expect(find.text(L.t('voiceSoundOff')), findsOneWidget);
  });

  testWidgets('выбор языка ложится в ключ веба', (tester) async {
    await boot(tester);
    // Язык выбирается выпадающей строкой (общий LangDropdown): открыть, выбрать пункт.
    await tester.tap(find.byKey(const Key('echo-lang')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.byKey(const Key('echo-lang-de')).last);
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
    expect(state.get('psygames_pseudoword_echo_targetlang'), 'de');
  });

  testWidgets('🔴 русскоязычный выбирает «Русский» — псевдослова звучат по-русски (d0ad03d9)', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    final (voice, _) = await boot(tester);
    await tester.tap(find.byKey(const Key('echo-lang')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const Key('echo-lang-ru')), findsWidgets, reason: 'родной язык — тоже язык задания');
    await tester.tap(find.byKey(const Key('echo-lang-ru')).last);
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
    await tester.tap(find.byKey(const Key('echo-start')));
    await tester.pump();
    final p = echoLevelParams(1);
    for (var i = 0; i < p.trials; i += 1) {
      await tester.pump();
      final (word, bcp47, _) = voice.said.last;
      expect(bcp47, 'ru-RU', reason: 'проба ${i + 1}: выбран русский — без подмены на en/es');
      await tester.tap(find.byKey(Key('echo-option-$word')));
      await tester.pump(const Duration(milliseconds: 700));
    }
    await tester.pump(const Duration(milliseconds: 100));
    expect(sent.single['difficulty'], 'ru · L1');
  });

  // Демо-карточку сменил разбор по шагам (`lesson.dart`, раздел «Память и слух»); его шаги меряет
  // `pseudoword_echo_lesson_test.dart`, здесь — что до партии он открывается с четырьмя написаниями.
  testWidgets('разбор до партии — четыре написания', (tester) async {
    await boot(tester);
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const ValueKey('echo-lesson-option-3')), findsOneWidget);
    await tester.tap(find.byKey(const Key('lesson-close')));
    await tester.pumpAndSettle();
  });
}
