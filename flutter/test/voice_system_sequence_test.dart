import 'dart:async';
import 'dart:typed_data';

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
}
