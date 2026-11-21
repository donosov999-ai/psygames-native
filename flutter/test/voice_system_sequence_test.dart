import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:just_audio/just_audio.dart';
import 'package:psygames_flutter/shell/noise.dart';
import 'package:psygames_flutter/shell/voice_system.dart';

/// Плеер с поведением just_audio 0.10.6 в том, что важно последовательностям:
/// · `play()` ждёт конца записи — но СРАЗУ возвращается, если плеер уже «играет»;
/// · `playing` остаётся true и после конца записи, пока не позвали pause или stop.
/// (~/.pub-cache/hosted/pub.dev/just_audio-0.10.6/lib/just_audio.dart, play и его описание.)
class _JustAudioLike implements AudioPlayer {
  bool _playing = false;
  Completer<void>? _playDone;

  /// Что загружали и перематывали — по порядку: адрес записи (из её байтов) или «seek».
  final steps = <String>[];

  @override
  bool get playing => _playing;

  /// Запись доиграла до конца.
  void finishTrack() {
    final d = _playDone;
    _playDone = null;
    if (d != null && !d.isCompleted) d.complete();
  }

  @override
  Future<Duration?> setAudioSource(AudioSource source,
      {bool preload = true, int? initialIndex, Duration? initialPosition}) async {
    steps.add(String.fromCharCodes((source as BytesAudioSource).bytes));
    return const Duration(milliseconds: 600);
  }

  @override
  Future<void> seek(Duration? position, {int? index}) async => steps.add('seek');

  @override
  Future<void> setSpeed(double speed) async {}

  @override
  Future<void> play() async {
    if (_playing) return;
    _playing = true;
    final d = _playDone = Completer<void>();
    await d.future;
  }

  @override
  Future<void> pause() async {
    _playing = false;
    finishTrack();
  }

  @override
  Future<void> stop() async {
    _playing = false;
    finishTrack();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _NoTts implements FlutterTts {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// 🔴 СЛОВА ЗАПИСЯМИ ПОДРЯД: каждое дожидается конца своего звучания.
///
/// «Объём на слух» ставит паузу ПОСЛЕ каждого слова и меряет как раз межсловный
/// интервал. С just_audio второе и все следующие `playUrl` возвращались сразу после
/// загрузки (плеер оставался «играющим» после первой записи): пауза отсчитывалась от
/// начала слова, а следующее слово обрывало звучащее (сверка веб → натив 02.10.2026).
/// Записи с 02.10 качаются один раз и повторяются перемоткой — проба идёт обоими путями:
/// новая запись (загрузка) и та же запись ещё раз (перемотка).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Future<void> settle() async {
    for (var i = 0; i < 5; i++) {
      await Future<void>.delayed(Duration.zero);
    }
  }

  test('🔴 второе слово и повтор того же слова ждут конца записи так же, как первое', () async {
    final player = _JustAudioLike();
    final backend = SystemVoiceBackend(
      player: player,
      tts: _NoTts(),
      clips: RecordingClips(
        player: JustAudioClipPlayer(player),
        fetch: (url) async => Uint8List.fromList(url.toString().codeUnits),
      ),
    );
    final waited = <String>[];
    for (final w in ['a', 'b', 'b', 'c']) {
      var done = false;
      final f = backend.playUrl('https://x/$w.opus', 1).then((_) => done = true);
      await settle();
      waited.add('$w ${done ? 'не ждало' : 'ждёт'}');
      player.finishTrack();
      await f;
    }
    expect(waited, ['a ждёт', 'b ждёт', 'b ждёт', 'c ждёт']);
    expect(player.steps, ['https://x/a.opus', 'https://x/b.opus', 'seek', 'https://x/c.opus'],
        reason: 'новая запись — загрузка, та же ещё раз — перемотка без новой загрузки');
  });

  test('iOS: отмена слова освобождает очередь, следующая пара доигрывает', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    const channel = MethodChannel('flutter_tts');
    final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    addTearDown(() {
      messenger.setMockMethodCallHandler(channel, null);
      debugDefaultTargetPlatformOverride = null;
    });
    final spoken = <String>[];
    final selected = <String>[];
    messenger.setMockMethodCallHandler(channel, (call) async {
      switch (call.method) {
        case 'getVoices':
          return [
            {'locale': 'en-US', 'quality': 'default', 'identifier': 'standard-en'},
            {'locale': 'en-GB', 'quality': 'premium', 'identifier': 'different-accent'},
            {'locale': 'en-US', 'quality': 'enhanced', 'identifier': 'enhanced-en'},
            {'locale': 'en-US', 'quality': 'premium', 'identifier': 'premium-en'},
            {'locale': 'es-MX', 'quality': 'enhanced', 'identifier': 'enhanced-es'},
          ];
        case 'setLanguage':
          if (call.arguments == 'es-ES') return 0;
        case 'setVoice':
          selected.add((call.arguments as Map)['identifier'] as String);
        case 'speak':
          spoken.add(call.arguments as String);
        case 'awaitSpeakCompletion':
          expect(call.arguments, isFalse);
      }
      return 1;
    });
    final tts = FlutterTts();
    final backend = SystemVoiceBackend(tts: tts, player: _JustAudioLike());
    Future<void> event(String name) async {
      await tts.platformCallHandler(MethodCall('speak.on$name'));
    }
    final interrupted = backend.speakSystem('house', 'en-US', 0.9);
    await settle();
    await event('Start');
    await backend.cancel();
    expect(await interrupted, isFalse);

    for (final pair in [('water', 'en-US'), ('agua', 'es-ES'), ('book', 'en-US')]) {
      var done = false;
      final playback = backend.speakSystem(pair.$1, pair.$2, 0.9).then((value) {
        done = true;
        return value;
      });
      await settle();
      await event('Cancel'); // delayed callback for the old word, before start
      await event('Start');
      expect(done, isFalse);
      await event('Complete');
      expect(await playback, isTrue);
    }
    expect(spoken, ['house', 'water', 'agua', 'book']);
    expect(selected, ['premium-en', 'premium-en', 'enhanced-es', 'premium-en']);
  });
}
