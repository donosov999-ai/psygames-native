import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/chinese_tones/model.dart';
import 'package:psygames_flutter/games/chinese_tones/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/noise.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/voice.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ «ТОНОВ» НА ПОДСТАВНОМ ГОЛОСЕ. Верный ответ берётся из БАНКА по
/// прозвучавшему иероглифу, а не из модели экрана.
class FakeVoice implements VoiceBackend {
  FakeVoice({this.has = true});
  final bool has;
  final said = <(String, String)>[];
  @override
  Future<bool> playUrl(String url, double rate) async => false;
  @override
  Future<bool> speakSystem(String text, String bcp47, double rate) async {
    said.add((text, bcp47));
    return true;
  }

  @override
  Future<bool> hasSystemVoice(String bcp47) async => has;
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
  final bank = zhBankFromJson(jsonDecode(File('assets/vocab/zh-tone-bank.json').readAsStringSync()) as Map);
  final pinyinOf = {for (final l in bank.values) for (final s in l) s.zh: s.pinyin};

  setUp(() async {
    SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_active_profile': 'nzt48'});
    state = await SharedState.open();
    await L.load('ru');
  });
  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
  });

  Future<(FakeVoice, FakeNoise)> boot(WidgetTester tester, {bool has = true, Map<String, Map<String, String>> samples = const {}}) async {
    final v = FakeVoice(has: has);
    final n = FakeNoise();
    await tester.pumpWidget(MaterialApp(
      home: ChineseTonesScreen(
        state: state,
        random: Random(6).nextDouble,
        voice: VoiceLayer(backend: v, soundOn: () => true, samples: samples),
        noise: NoiseLayer(backend: n, soundOn: () => true),
      ),
    ));
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    return (v, n);
  }

  testWidgets('🔴 тон: назван тон прозвучавшего слога — после ответа виден иероглиф, уровень вырос', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    final (voice, _) = await boot(tester);
    await tester.tap(find.byKey(const Key('ct-start')));
    await tester.pump(const Duration(milliseconds: 450));
    final p = ctLevelParams(1);
    for (var i = 0; i < p.trials; i += 1) {
      final (zh, bcp47) = voice.said.last;
      expect(bcp47, 'zh-CN');
      final tone = toneOf(pinyinOf[zh]!);
      await tester.tap(find.byKey(Key('ct-option-${tone - 1}')));
      await tester.pump();
      if (i == 0) expect(find.byKey(const Key('ct-reveal')), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 1200));
      await tester.pump(const Duration(milliseconds: 450));
    }
    expect(find.byKey(const Key('ct-score')), findsOneWidget);
    expect(sent, hasLength(1));
    expect(sent.single['mode'], 'tone');
    expect(sent.single['score'], p.trials * 100);
    expect(state.get(SharedState.levelKey('chinese_tones', 'nzt48')), '2');
  });

  testWidgets('🔴 кнопки тона — нарисованная линия, а не знак ˊ ˋ (их нет в Roboto — пустые квадраты)', (tester) async {
    await boot(tester);
    await tester.tap(find.byKey(const Key('ct-start')));
    await tester.pump(const Duration(milliseconds: 450));
    for (var i = 0; i < 4; i += 1) {
      final option = find.byKey(Key('ct-option-$i'));
      expect(find.descendant(of: option, matching: find.byKey(Key('ct-option-line-${i + 1}'))), findsOneWidget,
          reason: 'кнопка ${i + 1} рисует линию своего тона');
      final texts = tester.widgetList<Text>(find.descendant(of: option, matching: find.byType(Text))).map((t) => t.data ?? '');
      final glyphs = texts.join().runes.where((r) => r >= 0x02B0 && r <= 0x02FF).map(String.fromCharCode).toList();
      expect(glyphs, isEmpty, reason: 'знаки-модификаторы на кнопке ${i + 1}: $glyphs');
    }
  });

  testWidgets('🔴 слог целиком с 11-го: верно — написание из банка, под словом шум', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    await state.set(SharedState.levelKey('chinese_tones', 'nzt48'), '11');
    final (voice, noise) = await boot(tester);
    await tester.tap(find.byKey(const Key('ct-start')));
    await tester.pump(const Duration(milliseconds: 450));
    expect(noise.log.first, 'start ${noiseGainFor(ctLevelParams(11).snrDb!)}');
    final right = pinyinOf[voice.said.last.$1]!;
    var pick = -1;
    for (var i = 0; i < 4; i += 1) {
      final label = tester.widgetList<Text>(find.descendant(of: find.byKey(Key('ct-option-$i')), matching: find.byType(Text))).first.data;
      if (label == right) pick = i;
    }
    expect(pick, isNot(-1), reason: 'верное написание есть среди вариантов');
    await tester.tap(find.byKey(Key('ct-option-$pick')));
    await tester.pump();
    expect(find.byKey(const Key('ct-reveal')), findsNothing, reason: 'на старших уровнях иероглиф не открывается');
  });

  testWidgets('без китайского голоса — сказано словом', (tester) async {
    await boot(tester, has: false);
    expect(find.byKey(const Key('ct-voice-warning')), findsOneWidget);
    expect(find.textContaining('中文'), findsOneWidget);
  });

  // 🔴 Отчёт «Полиглота» (Android): «нажимаешь — и ни фига». Записи есть у 99 слогов из 422;
  // без системного китайского голоса остальные молчали, а плашки не было (язык «озвучен»).
  testWidgets('🔴 нет системного китайского голоса — партия только из слогов с записью, и без плашки', (tester) async {
    final recorded = <String>{for (final l in bank.values) ...l.take(3).map((s) => s.zh)};
    final (voice, _) = await boot(tester, has: false, samples: {'zh': {for (final z in recorded) z: 'x.opus'}});
    expect(find.byKey(const Key('ct-voice-warning')), findsNothing, reason: 'записанных слогов хватает — играть можно');
    await tester.tap(find.byKey(const Key('ct-start')));
    await tester.pump(const Duration(milliseconds: 450));
    final p = ctLevelParams(1);
    final heard = <String>[];
    for (var i = 0; i < p.trials; i += 1) {
      heard.add(voice.said.isNotEmpty ? voice.said.last.$1 : '');
      await tester.tap(find.byKey(const Key('ct-option-0')));
      await tester.pump(const Duration(milliseconds: 1200));
      await tester.pump(const Duration(milliseconds: 450));
    }
    expect(heard.where((z) => !recorded.contains(z)), isEmpty, reason: 'каждое задание — слог с записью');
  });

  testWidgets('системный китайский голос есть — банк целиком, как в вебе', (tester) async {
    final recorded = <String>{for (final l in bank.values) ...l.take(1).map((s) => s.zh)};
    final (voice, _) = await boot(tester, has: true, samples: {'zh': {for (final z in recorded) z: 'x.opus'}});
    await tester.tap(find.byKey(const Key('ct-start')));
    await tester.pump(const Duration(milliseconds: 450));
    final heard = <String>[];
    for (var i = 0; i < ctLevelParams(1).trials; i += 1) {
      heard.add(voice.said.last.$1);
      await tester.tap(find.byKey(const Key('ct-option-0')));
      await tester.pump(const Duration(milliseconds: 1200));
      await tester.pump(const Duration(milliseconds: 450));
    }
    expect(heard.where((z) => !recorded.contains(z)), isNotEmpty, reason: 'с голосом банк не сужается');
  });

  testWidgets('нет голоса, а у одного тона ни одной записи — честная плашка «нет голоса»', (tester) async {
    final recorded = <String>{for (final t in const [1, 2, 3]) ...bank[t]!.take(3).map((s) => s.zh)};
    await boot(tester, has: false, samples: {'zh': {for (final z in recorded) z: 'x.opus'}});
    expect(find.byKey(const Key('ct-voice-warning')), findsOneWidget,
        reason: 'четвёртый тон прозвучать не может — молчать о нём нельзя');
  });
}
