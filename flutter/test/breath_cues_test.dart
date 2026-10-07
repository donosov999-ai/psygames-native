import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/pause/breath_cues.dart';
import 'package:psygames_flutter/games/pause/breathing.dart';
import 'package:psygames_flutter/games/pause/practice_haptics.dart';
import 'package:practice_kit/practice_kit.dart';
import 'package:psygames_flutter/games/pause/screen.dart';
import 'package:psygames_flutter/shell/app_haptics.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ДЫХАНИЕ»: ТОН И ВИБРАЦИЯ НА СМЕНУ ФАЗЫ — КАК В ВЕБЕ (задача b9964dff).
///
/// Веб `feedback.ts` (v1.181): вдох — тон вверх 330→550 Гц и вибро 18 мс, задержка —
/// ровный тихий 440 Гц и двойное вибро, выдох — тон вниз 520→300 Гц и вибро 60 мс.
/// «Дыхательные практики делают с закрытыми глазами» — фаза должна читаться на слух.
/// До переезда Flutter-«Дыхание» этого не умело: слоя звуковых сигналов не было.
class _FakeSound implements BreathSound {
  final played = <BreathCue>[];
  @override
  Future<void> play(BreathCue cue) async => played.add(cue);
  @override
  Future<void> dispose() async {}
}

/// Частота по числу переходов через ноль на куске.
double _hz(Uint8List wav, int from, int to, int rate) {
  final pcm = ByteData.sublistView(wav, 44);
  var crossings = 0;
  var prev = pcm.getInt16(from * 2, Endian.little);
  for (var i = from + 1; i < to; i += 1) {
    final v = pcm.getInt16(i * 2, Endian.little);
    if ((prev < 0) != (v < 0)) crossings += 1;
    prev = v;
  }
  return crossings / 2 / ((to - from) / rate);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final engine = Practices(jsonDecode(File('../packages/practice_kit/assets/practices.json').readAsStringSync()) as Json);
  final copy = jsonDecode(File('assets/pause/copy.json').readAsStringSync()) as Json;
  final vibro = <Map<String, dynamic>>[];
  final m = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  setUp(() {
    vibro.clear();
    m.setMockMethodCallHandler(PausePracticeHaptics.channel, (c) async {
      if (c.method == 'play') vibro.add(Map<String, dynamic>.from(c.arguments as Map));
      return null;
    });
  });
  tearDown(() => m.setMockMethodCallHandler(PausePracticeHaptics.channel, null));

  group('фазы и тоны', () {
    test('🔴 каждый шаг каждой техники дыхания — вдох, задержка или выдох', () {
      for (final program in objects(engine.set('breathing')['programs'])) {
        final id = program['id'] as String;
        if (id == 'wim-hof' || id == 'breath-awareness') continue; // свои раунды / медитация
        for (final step in objects(program['steps'])) {
          expect(breathCueOf(step['id'] as String), isNotNull, reason: '$id: шаг ${step['id']} без сигнала');
        }
      }
      expect(breathCueOf('inhale-two'), BreathCue.inhale);
      expect(breathCueOf('left-in'), BreathCue.inhale);
      expect(breathCueOf('right-out'), BreathCue.exhale);
      expect(breathCueOf('hold-out'), BreathCue.hold);
    });

    test('🔴 вдох звучит вверх, выдох — вниз, задержка ровно; длина и громкость как у веба', () {
      const rate = breathToneRate;
      for (final cue in BreathCue.values) {
        final wav = renderBreathTone(cue);
        final (f0, f1, ms, vol) = breathToneSpec[cue]!;
        final n = (rate * ms / 1000).round();
        expect(wav.length, 44 + n * 2, reason: '$cue: длина');
        final head = _hz(wav, 0, n ~/ 4, rate), tail = _hz(wav, 3 * n ~/ 4, n, rate);
        switch (cue) {
          case BreathCue.inhale:
            expect(tail, greaterThan(head * 1.2), reason: 'вдох не поднимается: $head → $tail');
          case BreathCue.exhale:
            expect(tail, lessThan(head / 1.2), reason: 'выдох не опускается: $head → $tail');
          case BreathCue.tap:
          case BreathCue.hold:
            expect((tail - head).abs(), lessThan(40), reason: 'задержка не ровная: $head → $tail');
        }
        expect(head, closeTo(f0, f0 * .35));
        expect(tail, closeTo(f1, f1 * .35));
        final pcm = ByteData.sublistView(wav, 44);
        var peak = 0;
        for (var i = 0; i < n; i += 1) {
          peak = peak > pcm.getInt16(i * 2, Endian.little).abs() ? peak : pcm.getInt16(i * 2, Endian.little).abs();
        }
        expect(peak / 32767, lessThanOrEqualTo(vol + .01), reason: '$cue: громче заданного');
        expect(pcm.getInt16(0, Endian.little), 0, reason: '$cue: щелчок в начале');
        expect(pcm.getInt16((n - 1) * 2, Endian.little).abs(), lessThan(200), reason: '$cue: обрыв в конце');
      }
    });
  });

  group('сигнал на шаг', () {
    Json box() => engine.plan({
          'mode': 'solo',
          'durationMs': 32000,
          'locale': 'ru',
          'selections': [
            {'setId': 'breathing', 'programId': 'box'},
          ],
          'guideMode': 'visual',
          'context': 'home',
          'advisory': true,
        });

    test('🔴 один сигнал на шаг, а не на кадр: квадрат — вдох, задержка, выдох, задержка', () {
      final s = _FakeSound();
      final c = BreathCues(soundOn: () => true, hapticOn: () => true, sound: s);
      final plan = box();
      for (var t = 0; t < 16000; t += 16) {
        c.update(plan, t);
      }
      expect(s.played, [BreathCue.inhale, BreathCue.hold, BreathCue.exhale, BreathCue.hold]);
      expect(vibro.map((v) => v['count']), [1, 2, 1, 2], reason: 'вибро веба: одно, двойное, длинное, двойное');
      expect(vibro[2]['continuous'], isTrue, reason: 'выдох — длинный импульс');
      expect(vibro[2]['durationMs'], 60);
      // Денис 01.10: «вибрации нет нихуя» — 0,35 в руке не слышно; сила общая с «Паузой».
      expect(vibro.map((v) => v['strength']), everyElement(PausePracticeHaptics.strength));
      expect(PausePracticeHaptics.strength, greaterThanOrEqualTo(.8));
    });

    test('звук выключен — тона нет, вибрация есть; вибрация выключена — наоборот', () {
      final s = _FakeSound();
      final plan = box();
      final silent = BreathCues(soundOn: () => false, hapticOn: () => true, sound: s);
      silent.update(plan, 0);
      expect(s.played, isEmpty);
      expect(vibro, hasLength(1));
      vibro.clear();
      final still = BreathCues(soundOn: () => true, hapticOn: () => false, sound: s);
      still.update(plan, 0);
      expect(s.played, [BreathCue.inhale]);
      expect(vibro, isEmpty);
    });
  });

  test('🔴 щелчок веба: отсчёт 3 → 2 → 1 — два, Вим Хоф — один на вдох; своей вибрации нет', () {
    final s = _FakeSound();
    final c = BreathCues(soundOn: () => true, hapticOn: () => true, sound: s);
    for (var t = 0; t < 3000; t += 16) {
      c.lead(((3000 - t) / 1000).ceil());
    }
    expect(s.played, [BreathCue.tap, BreathCue.tap], reason: 'веб breathing.tsx:232 — sndTap на 3→2 и 2→1');
    s.played.clear();
    var fresh = 0;
    for (var t = 0; t <= WimHofRun.breaths * WimHofRun.breathMs; t += 16) {
      if (c.wimBreath(1, (t ~/ WimHofRun.breathMs).clamp(0, WimHofRun.breaths))) fresh += 1;
    }
    expect(fresh, WimHofRun.breaths, reason: 'веб breathing.tsx:319 — sndTap на каждый вдох');
    expect(s.played, List.filled(WimHofRun.breaths, BreathCue.tap));
    expect(c.wimBreath(2, 1), isTrue, reason: 'второй раунд считает вдохи заново');
    expect(vibro, isEmpty, reason: 'у щелчка своей вибрации нет — толчок Вима Хофа даёт экран');
    final quiet = BreathCues(soundOn: () => false, hapticOn: () => true, sound: s..played.clear());
    quiet.lead(3);
    quiet.lead(2);
    expect(s.played, isEmpty, reason: 'звук выключен — щелчка нет');
  });

  group('🔴 экран «Дыхания»', () {
    late SharedState state;
    var now = 0;

    Future<_FakeSound> open(WidgetTester tester, {Map<String, Object> prefs = const {}, Map<String, String>? preset}) async {
      SharedPreferences.setMockInitialValues(prefs);
      state = (await tester.runAsync(SharedState.open))!;
      GamePreset.clear();
      if (preset != null) GamePreset.set(preset);
      SessionReport.sink = (_) async {};
      now = 0;
      final sound = _FakeSound();
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      addTearDown(() => SessionReport.sink = null);
      await tester.pumpWidget(MaterialApp(
        home: PauseScreen(
          state: state,
          flavor: PauseFlavor.breathing,
          engine: engine,
          copy: copy,
          clock: () => now,
          breathSound: sound,
          today: () => DateTime(2026, 10, 1),
        ),
      ));
      await tester.pump();
      await tester.pump();
      await tester.tap(find.byKey(const Key('pause-start')));
      await tester.pump();
      return sound;
    }

    Future<void> at(WidgetTester tester, int ms) async {
      now = ms;
      await tester.pump(const Duration(milliseconds: 16));
      await tester.pump();
    }

    testWidgets('отсчёт — два щелчка; первый вдох — тон и вибро; дальше по фазам квадрата', (tester) async {
      final sound = await open(tester);
      for (final t in [400, 1100, 2100]) {
        await at(tester, t);
      }
      expect(sound.played, [BreathCue.tap, BreathCue.tap], reason: 'отсчёт 3 → 2 → 1: щелчки веба, фаз ещё нет');
      expect(vibro, isEmpty, reason: 'у щелчка отсчёта вибрации нет');
      await at(tester, 3000);
      await at(tester, 3100);
      List<BreathCue> phases() => sound.played.where((c) => c != BreathCue.tap).toList();
      expect(phases(), [BreathCue.inhale]);
      await at(tester, 7200);
      await at(tester, 11200);
      expect(phases(), [BreathCue.inhale, BreathCue.hold, BreathCue.exhale]);
      // Двойной вибрации нет: общее вибросопровождение практик в «Дыхании» молчит.
      expect(vibro, hasLength(3), reason: 'на фазу вибрировало больше одного раза: $vibro');
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('🔴 Вим Хоф: щелчок на каждый вдох, без тонов фаз', (tester) async {
      final sound = await open(tester, preset: {'tech': 'wimhof'});
      await tester.tap(find.byKey(const Key('pause-wim-agree')));
      await tester.pump();
      for (var k = 1; k <= 5; k += 1) {
        await at(tester, k * WimHofRun.breathMs + 100);
        await at(tester, k * WimHofRun.breathMs + 600);
      }
      expect(sound.played, List.filled(5, BreathCue.tap), reason: 'пять вдохов — пять щелчков, по одному');
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('тумблер «Звук» выключен — тона нет; «Вибрация» выключена — вибро нет', (tester) async {
      final sound = await open(tester, prefs: {'psygames_sound_enabled': 'false', hapticKey: 'false'});
      await at(tester, 3000);
      await at(tester, 3100);
      await at(tester, 7200);
      expect(sound.played, isEmpty);
      expect(vibro, isEmpty);
      await tester.pumpWidget(const SizedBox());
    });
  });
}
