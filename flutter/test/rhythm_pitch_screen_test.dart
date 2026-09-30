import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/rhythm_pitch/core.dart';
import 'package:psygames_flutter/games/rhythm_pitch/screen.dart';
import 'package:psygames_flutter/games/rhythm_pitch/tones.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ «РИТМА И ВЫСОТЫ» НА ПОДСТАВНОМ ПЛЕЕРЕ И ПОДСТАВНЫХ ЧАСАХ. Правила счёта
/// сверены с живым TS в `rhythm_pitch_test.dart`; здесь — что экран водит партию так
/// же: калибровка → «Готовы» → звук → ответ → итог в лестницу и статистику.
class FakeTones implements RpToneBackend {
  final loads = <(Uint8List, double)>[];
  int stops = 0;
  Completer<void>? _playing;

  bool get playing => _playing != null;

  void finish() {
    final p = _playing;
    _playing = null;
    if (p != null && !p.isCompleted) p.complete();
  }

  @override
  Future<void> load(Uint8List wav, double volume) async => loads.add((wav, volume));
  @override
  Future<void> start() => (_playing = Completer<void>()).future;
  @override
  Future<void> stop() async {
    stops += 1;
    finish();
  }

  @override
  Future<void> dispose() async => finish();
}

/// Моменты, когда образец выходит из тишины, в мс от начала файла.
List<double> onsetsMs(Uint8List wav, {int rate = rpSampleRate}) {
  final pcm = ByteData.sublistView(wav, 44);
  final out = <double>[];
  var silentSince = 0;
  for (var i = 0; i < pcm.lengthInBytes ~/ 2; i += 1) {
    final loud = pcm.getInt16(i * 2, Endian.little).abs() > 16;
    if (loud && i - silentSince > rate * 0.05) out.add(i * 1000 / rate);
    if (loud) silentSince = i;
  }
  return out;
}

/// Частота по переходам через ноль в окне [fromMs, fromMs + 80).
double hzAt(Uint8List wav, double fromMs, {int rate = rpSampleRate}) {
  final pcm = ByteData.sublistView(wav, 44);
  final a = (fromMs * rate / 1000).round(), b = ((fromMs + 80) * rate / 1000).round();
  var crossings = 0;
  for (var i = a + 1; i < b; i += 1) {
    final p = pcm.getInt16((i - 1) * 2, Endian.little), q = pcm.getInt16(i * 2, Endian.little);
    if ((p < 0) != (q < 0)) crossings += 1;
  }
  return crossings / 2 / 0.08;
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

  group('звук', () {
    test('метроном калибровки: четыре сигнала 660 Гц через 450 мс после 60 мс тишины', () {
      final wav = renderRpTonesWav(rpCalibrationTones());
      final on = onsetsMs(wav);
      expect(on, hasLength(4));
      for (var i = 0; i < 4; i += 1) {
        expect(on[i], closeTo(rpLeadMs + i * 450, 4), reason: 'сигнал $i');
      }
      expect(hzAt(wav, on[0] + 15), closeTo(660, 20));
    });

    test('ритм: акцент выше и громче обычного удара — как в вебе', () {
      final r = generateRhythmPitchRound('rhythm-pitch-9', 9, 'rhythm-echo') as RhythmEchoRound;
      expect(r.beats.any((b) => b.accent) && r.beats.any((b) => !b.accent), isTrue, reason: 'на 9-м есть оба вида');
      final tones = rpRoundTones(r);
      final wav = renderRpTonesWav(tones);
      final on = onsetsMs(wav);
      expect(on, hasLength(r.beats.length), reason: 'каждый удар слышен отдельно');
      for (var i = 0; i < r.beats.length; i += 1) {
        expect(on[i], closeTo(rpLeadMs + r.beats[i].onsetMs, 4), reason: 'удар $i');
        expect(hzAt(wav, on[i] + 15), closeTo(r.beats[i].accent ? 880 : 660, 25), reason: 'высота удара $i');
        expect(tones[i].gain, r.beats[i].accent ? 1 : 0.72);
      }
      expect(tones.first.durationMs, closeTo((r.unitMs * 0.24).clamp(80, 140), 1e-9));
    });

    test('путь высот: тоны ровно тех частот, что выбрал генератор, через 440 мс', () {
      final r = generateRhythmPitchRound('rhythm-pitch-14', 14, 'pitch-path') as PitchPathRound;
      final wav = renderRpTonesWav(rpRoundTones(r));
      final on = onsetsMs(wav);
      expect(on, hasLength(r.sequence.length));
      for (var i = 0; i < r.sequence.length; i += 1) {
        expect(on[i], closeTo(rpLeadMs + i * 440, 4));
        expect(hzAt(wav, on[i] + 30), closeTo(r.frequenciesHz[r.sequence[i]], 25), reason: 'тон $i');
      }
    });

    test('🔴 звук выключен — ни одного тона, отказ словами экрана; включён — часы движка', () async {
      var on = false;
      var now = 500.0;
      final fake = FakeTones();
      final e = RpToneEngine(backend: fake, soundOn: () => on, clock: () => now, mutedMessage: () => 'тишина');
      await expectLater(e.playCalibration(0.5), throwsA(isA<RpAudioUnavailable>().having((x) => x.message, 'текст', 'тишина')));
      expect(fake.loads, isEmpty);
      on = true;
      final plan = await e.playCalibration(0.02);
      expect(plan.expectedTimesMs, [560, 1010, 1460, 1910]);
      expect(fake.loads.single.$2, 0.1, reason: 'громкость зажата снизу, как в вебе');
      var done = false;
      unawaited(plan.completed.then((_) => done = true));
      await e.stop();
      await Future<void>.delayed(Duration.zero);
      expect(done, isTrue, reason: 'остановка завершает ожидание конца');
      now = 0;
    });
  });

  Future<FakeTones> boot(WidgetTester tester, double Function() clock) async {
    final tones = FakeTones();
    await tester.pumpWidget(MaterialApp(home: RhythmPitchScreen(state: state, clock: clock, backend: tones)));
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    return tones;
  }

  Future<void> tapAt(WidgetTester tester, String key) async {
    await tester.tap(find.byKey(Key(key)));
    await tester.pump();
  }

  testWidgets('🔴 ритм: калибровка → эхо в такт → уровень вырос, партия ушла с поправкой', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    var now = 0.0;
    final tones = await boot(tester, () => now);
    expect(find.byKey(const Key('rp-level')), findsOneWidget);

    now = 100;
    await tapAt(tester, 'rp-start');
    now = 1000;
    await tapAt(tester, 'rp-play-calibration');
    expect(tones.playing, isTrue);
    // Сигналы по часам движка: 1060, 1510, 1960, 2410. Стучим на 40 мс позже каждого.
    for (final t in const <double>[1100, 1550, 2000, 2450]) {
      now = t;
      await tapAt(tester, 'rp-calibration-tap');
    }
    tones.finish();
    await tester.pump();
    expect(find.textContaining('4'), findsWidgets);
    expect(find.byKey(const Key('rp-calibration-ready')), findsOneWidget);
    await tapAt(tester, 'rp-continue');

    await tapAt(tester, 'rp-play');
    expect(find.byKey(const Key('rp-listening')), findsOneWidget);
    now = 5000;
    tones.finish();
    await tester.pump();

    final r = generateRhythmPitchRound('rhythm-pitch-1', 1, 'rhythm-echo') as RhythmEchoRound;
    for (final b in r.beats) {
      now = 5000 + b.onsetMs + 40; // та же задержка, что намерила калибровка
      await tapAt(tester, 'rp-tap');
    }
    expect(find.text('Тапов: ${r.beats.length}; в образце: ${r.beatCount}'), findsOneWidget);
    now = 9000;
    await tapAt(tester, 'rp-submit');
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text(L.t('levelDone').replaceAll('{n}', '1')), findsOneWidget);
    expect(find.byKey(const Key('rp-stars')), findsOneWidget);
    expect(sent, hasLength(1));
    expect(sent.single['game_type'], 'rhythm_pitch');
    expect(sent.single['mode'], 'rhythm-echo');
    expect(sent.single['difficulty'], 'easy');
    final details = sent.single['details'] as Map<String, dynamic>;
    expect(details['calibration_offset_ms'], 40);
    expect(details['calibration_samples'], 4);
    expect(details['accuracy'], 1);
    expect(state.get(SharedState.levelKey('rhythm_pitch', 'nzt48')), '2');

    // Следующий уровень: подстройка та же — метроном не просим, сразу «Готовы».
    await tapAt(tester, 'rp-again');
    expect(find.byKey(const Key('rp-play')), findsOneWidget);
    expect(find.byKey(const Key('rp-play-calibration')), findsNothing);
  });

  testWidgets('высота: без попаданий в метроном — «пропустить», «выше/ниже» засчитан', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    await state.set(SharedState.levelKey('rhythm_pitch', 'nzt48'), '2');
    var now = 0.0;
    final tones = await boot(tester, () => now);
    await tapAt(tester, 'rp-start');
    await tapAt(tester, 'rp-play-calibration');
    tones.finish();
    await tester.pump();
    expect(find.byKey(const Key('rp-need-taps')), findsOneWidget);
    await tapAt(tester, 'rp-skip-calibration');
    await tapAt(tester, 'rp-play');
    now = 3000;
    tones.finish();
    await tester.pump();
    final r = generateRhythmPitchRound('rhythm-pitch-2', 2, 'pitch-path') as PitchPathRound;
    expect(r.task, 'direction');
    now = 4000;
    await tapAt(tester, r.directionAnswer == 'higher' ? 'rp-higher' : 'rp-lower');
    await tester.pump();
    expect(find.text(L.t('levelDone').replaceAll('{n}', '2')), findsOneWidget);
    expect(sent.single['mode'], 'pitch-path');
    expect((sent.single['details'] as Map)['pitch_task'], 'direction');
  });

  testWidgets('🔴 звук выключен: вместо «Начать» — честная плашка и кнопка включить', (tester) async {
    await state.set('psygames_sound_enabled', 'false');
    await boot(tester, () => 0);
    expect(find.byKey(const Key('rp-sound-off')), findsOneWidget);
    expect(find.byKey(const Key('rp-start')), findsNothing);
    await tapAt(tester, 'rp-enable-sound');
    expect(find.byKey(const Key('rp-start')), findsOneWidget);
  });

  testWidgets('🔴 тихий шаг зарядки: игра говорит, что она дневная, и не стартует сама', (tester) async {
    GamePreset.set({'wu': '1', 'calm': '1'});
    final tones = await boot(tester, () => 0);
    expect(find.byKey(const Key('rp-calm')), findsOneWidget);
    expect(find.byKey(const Key('rp-start')), findsNothing);
    expect(tones.loads, isEmpty);
  });

  testWidgets('шаг зарядки просит режим — идёт он, а не чередование по уровню', (tester) async {
    GamePreset.set({'wu': '1', 'level': '1', 'mode': 'pitch-path'});
    var now = 0.0;
    final tones = await boot(tester, () => now);
    expect(find.byKey(const Key('rp-play-calibration')), findsOneWidget, reason: 'автостарт шага');
    await tapAt(tester, 'rp-play-calibration');
    tones.finish();
    await tester.pump();
    await tapAt(tester, 'rp-skip-calibration');
    await tapAt(tester, 'rp-play');
    tones.finish();
    await tester.pump();
    expect(find.byKey(const Key('rp-higher')), findsOneWidget);
  });

  testWidgets('🔴 шторка поверх партии: звук встал, партия на паузе, продолжение — с «Готовы»', (tester) async {
    var now = 0.0;
    final tones = await boot(tester, () => now);
    await tapAt(tester, 'rp-start');
    await tapAt(tester, 'rp-play-calibration');
    tones.finish();
    await tester.pump();
    await tapAt(tester, 'rp-skip-calibration');
    await tapAt(tester, 'rp-play');
    expect(tones.playing, isTrue);
    final stopsBefore = tones.stops;

    final nav = tester.state<NavigatorState>(find.byType(Navigator));
    unawaited(nav.push(MaterialPageRoute<void>(builder: (_) => const Scaffold(body: Text('шторка')))));
    await tester.pumpAndSettle();
    expect(tones.stops, greaterThan(stopsBefore), reason: 'звук под шторкой не доигрывает');
    nav.pop();
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('rp-resume')), findsOneWidget);
    await tapAt(tester, 'rp-resume');
    expect(find.byKey(const Key('rp-play')), findsOneWidget, reason: 'прерванный звук играется заново');
  });
}
