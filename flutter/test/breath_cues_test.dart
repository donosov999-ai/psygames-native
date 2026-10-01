import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/pause/breath_cues.dart';
import 'package:psygames_flutter/games/pause/practices.dart';
import 'package:psygames_flutter/games/pause/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ДЫХАНИЕ» ЗВУЧИТ: ТОН НА КАЖДУЮ ФАЗУ И ЩЕЛЧОК ОТСЧЁТА — КАК У ВЕБ-ИГРЫ (задача b9964dff).
///
/// 📍 Доска FLUTTER_MIGRATION: breathing ◐ — «нет звуков фаз». Во Flutter «Дыхание» слито в
/// «Паузу», фазы там только произносит голос, и то не в режиме по умолчанию («только экран»):
/// вдох и выдох шли в тишине. Веб давал свой тон на вдох (вверх), задержку (ровно), выдох
/// (вниз) — чтобы дышать с закрытыми глазами.
class _Recorder implements BreathCueBackend {
  final played = <BreathCue>[];
  @override
  Future<void> play(Uint8List wav) async {
    for (final c in BreathCue.values) {
      if (_same(wav, renderBreathCueWav(c))) {
        played.add(c);
        return;
      }
    }
    fail('сыграно что-то, что не является сигналом дыхания');
  }

  static bool _same(Uint8List a, Uint8List b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }

  @override
  Future<void> dispose() async {}
}

/// Частота по переходам через ноль на отрезке образца (без заголовка WAV в 44 байта).
double _hz(Uint8List wav, double fromShare, double toShare) {
  final pcm = ByteData.sublistView(wav, 44);
  final n = pcm.lengthInBytes ~/ 2;
  final tail = (0.03 * breathSampleRate).round();
  final body = n - tail;
  final a = (body * fromShare).round(), b = (body * toShare).round();
  var crossings = 0;
  var prev = pcm.getInt16(a * 2, Endian.little);
  for (var i = a + 1; i < b; i++) {
    final v = pcm.getInt16(i * 2, Endian.little);
    if ((prev < 0 && v >= 0) || (prev >= 0 && v < 0)) crossings++;
    prev = v;
  }
  return crossings / 2 / ((b - a) / breathSampleRate);
}

int _peak(Uint8List wav) {
  final pcm = ByteData.sublistView(wav, 44);
  var m = 0;
  for (var i = 0; i < pcm.lengthInBytes ~/ 2; i++) {
    final v = pcm.getInt16(i * 2, Endian.little).abs();
    if (v > m) m = v;
  }
  return m;
}

void main() {
  test('вид фазы по шагу — то же правило, что у ядра «Паузы»', () {
    expect(breathCueForStep('inhale'), BreathCue.inhale);
    expect(breathCueForStep('breathe-in'), BreathCue.inhale);
    expect(breathCueForStep('hold-in'), BreathCue.hold);
    expect(breathCueForStep('hold-out'), BreathCue.hold);
    expect(breathCueForStep('exhale'), BreathCue.exhale);
    expect(breathCueForStep('breathe-out'), BreathCue.exhale);
    expect(breathCueForStep('rest'), isNull);
  });

  test('🔴 вдох идёт ВВЕРХ, выдох ВНИЗ, задержка ровно — частоты и громкость как в вебе', () {
    final inhale = renderBreathCueWav(BreathCue.inhale);
    final exhale = renderBreathCueWav(BreathCue.exhale);
    final hold = renderBreathCueWav(BreathCue.hold);
    expect(_hz(inhale, 0.05, 0.25), lessThan(_hz(inhale, 0.75, 0.95)), reason: 'вдох обязан идти вверх');
    expect(_hz(exhale, 0.05, 0.25), greaterThan(_hz(exhale, 0.75, 0.95)), reason: 'выдох обязан идти вниз');
    expect(_hz(hold, 0.1, 0.9), closeTo(440, 25), reason: 'задержка — ровные 440 Гц');
    expect(_hz(inhale, 0.0, 0.08), closeTo(330, 40), reason: 'вдох начинается около 330 Гц');
    expect(_hz(exhale, 0.0, 0.08), closeTo(520, 50), reason: 'выдох начинается около 520 Гц');
    // Громкость веба: 0,07 полной шкалы у вдоха/выдоха, 0,045 у задержки.
    expect(_peak(inhale) / 32767, closeTo(0.07, 0.01));
    expect(_peak(hold) / 32767, closeTo(0.045, 0.008));
    // Длительность: 320 / 130 / 420 мс + 30 мс хвоста тишины.
    double ms(Uint8List w) => (w.length - 44) / 2 / breathSampleRate * 1000;
    expect(ms(inhale), closeTo(350, 3));
    expect(ms(hold), closeTo(160, 3));
    expect(ms(exhale), closeTo(450, 3));
  });

  group('экран «Дыхания»', () {
    final engine = Practices(jsonDecode(File('assets/pause/practices.json').readAsStringSync()) as Json);
    final copy = jsonDecode(File('assets/pause/copy.json').readAsStringSync()) as Json;
    late SharedState state;
    late _Recorder rec;
    var now = 0;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      state = await SharedState.open();
      rec = _Recorder();
      now = 0;
      GamePreset.clear();
      SessionReport.sink = (json) async {};
    });
    tearDown(() {
      GamePreset.clear();
      SessionReport.sink = null;
    });

    Future<void> open(WidgetTester tester) async {
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
          today: () => DateTime(2026, 10, 1),
          breathCues: rec,
        ),
      ));
      await tester.pump();
      await tester.pump();
    }

    Future<void> at(WidgetTester tester, int ms) async {
      now = ms;
      await tester.pump(const Duration(milliseconds: 16));
      await tester.pump();
    }

    testWidgets('🔴 «квадрат»: два щелчка отсчёта, затем вдох → задержка → выдох → задержка', (tester) async {
      await open(tester);
      await tester.tap(find.byKey(const Key('pause-start')));
      await tester.pump();
      for (final t in [400, 1100, 2100, 2900]) {
        await at(tester, t);
      }
      expect(rec.played, [BreathCue.tap, BreathCue.tap], reason: 'отсчёт 3 → 2 → 1: два щелчка, как у веба');
      // Квадрат 4-4-4-4 после трёх секунд отсчёта.
      for (final t in [3100, 5000, 7100, 9000, 11100, 13000, 15100, 17000]) {
        await at(tester, t);
      }
      expect(rec.played.skip(2).toList(), [BreathCue.inhale, BreathCue.hold, BreathCue.exhale, BreathCue.hold],
          reason: 'на каждую смену фазы — один свой тон, без повторов внутри фазы');
      await at(tester, 19100);
      expect(rec.played.last, BreathCue.inhale, reason: 'второй цикл начинается вдохом');
    });

    testWidgets('звук выключен в настройках — тишина', (tester) async {
      await state.set('psygames_sound_enabled', 'false');
      await open(tester);
      await tester.tap(find.byKey(const Key('pause-start')));
      await tester.pump();
      for (final t in [1100, 2100, 3100, 7100, 11100]) {
        await at(tester, t);
      }
      expect(rec.played, isEmpty);
    });
  });
}
