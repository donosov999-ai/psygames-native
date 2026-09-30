/// ШУМ ПОД РЕЧЬЮ — перенос `frontend/src/services/noise.ts`.
///
/// Слуховые упражнения раздела «Языки» с высоких уровней подают слово поверх
/// шума: это ось «отвлечение» (SNR в децибелах), и без неё верхние уровни на
/// Flutter были бы ЛЕГЧЕ веб-версии при тех же номерах. Шум розовый, петлёй в
/// три секунды, громкость — от отношения сигнал/шум, как в вебе.
///
/// ⚠️ Устройство спрятано за [NoiseBackend]: проба, которая включает настоящий
/// звук, меряет погоду на машине. Правила проверяются подставным устройством.
library;

// `StreamAudioSource` у just_audio помечен экспериментальным, но это штатный путь
// проиграть байты из памяти без временного файла; шум строится в памяти.
// ignore_for_file: experimental_member_use

import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:just_audio/just_audio.dart';

/// Громкость шума для SNR: 10^(−SNR/20), не громче 0,9. Тишина — ноль.
double noiseGainFor(double snrDb) {
  if (!snrDb.isFinite) return 0;
  final g = pow(10, -snrDb / 20).toDouble();
  return min(0.9, max(0.0, (g * 1000).round() / 1000));
}

/// Устройство, которое умеет крутить шум. Подменяется в пробах.
abstract class NoiseBackend {
  /// Включить (или перестроить громкость, если уже играет).
  Future<void> start(double gain);
  Future<void> stop();
}

/// Шум приложения: решает, играть ли и насколько громко; звук — у [backend].
class NoiseLayer {
  NoiseLayer({required this.backend, required this.soundOn});

  final NoiseBackend backend;

  /// Тумблер звука человека и тихий шаг зарядки — читается КАЖДЫЙ раз.
  final bool Function() soundOn;

  /// `null` — тишина (уровень без помехи): шум выключается.
  Future<void> start(double? snrDb) async {
    if (snrDb == null || !soundOn()) return stop();
    final g = noiseGainFor(snrDb);
    if (g <= 0) return stop();
    await backend.start(g);
  }

  Future<void> stop() => backend.stop();
}

/// Розовый шум (метод Келлета, как в вебе) — моно, 16 бит, в WAV.
Uint8List pinkNoiseWav({int sampleRate = 22050, double seconds = 3, Random? random}) {
  final rnd = random ?? Random();
  final n = max(1, (sampleRate * seconds).floor());
  final pcm = ByteData(n * 2);
  var b0 = 0.0, b1 = 0.0, b2 = 0.0, b3 = 0.0, b4 = 0.0, b5 = 0.0, b6 = 0.0;
  for (var i = 0; i < n; i += 1) {
    final white = rnd.nextDouble() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    final v = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
    pcm.setInt16(i * 2, (v.clamp(-1.0, 1.0) * 32767).round(), Endian.little);
  }
  return wavFromPcm16(pcm.buffer.asUint8List(), sampleRate);
}

/// Заголовок RIFF/WAVE для моно PCM 16 бит.
Uint8List wavFromPcm16(Uint8List pcm, int sampleRate) {
  final h = ByteData(44);
  void ascii(int at, String s) {
    for (var i = 0; i < s.length; i += 1) {
      h.setUint8(at + i, s.codeUnitAt(i));
    }
  }

  ascii(0, 'RIFF');
  h.setUint32(4, 36 + pcm.length, Endian.little);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  h.setUint32(16, 16, Endian.little);
  h.setUint16(20, 1, Endian.little); // PCM
  h.setUint16(22, 1, Endian.little); // моно
  h.setUint32(24, sampleRate, Endian.little);
  h.setUint32(28, sampleRate * 2, Endian.little);
  h.setUint16(32, 2, Endian.little);
  h.setUint16(34, 16, Endian.little);
  ascii(36, 'data');
  h.setUint32(40, pcm.length, Endian.little);
  return Uint8List.fromList([...h.buffer.asUint8List(), ...pcm]);
}

/// Готовые байты как источник для just_audio.
class BytesAudioSource extends StreamAudioSource {
  BytesAudioSource(this.bytes, {this.contentType = 'audio/wav'});
  final Uint8List bytes;
  final String contentType;

  @override
  Future<StreamAudioResponse> request([int? start, int? end]) async {
    final s = start ?? 0;
    final e = end ?? bytes.length;
    return StreamAudioResponse(
      sourceLength: bytes.length,
      contentLength: e - s,
      offset: s,
      stream: Stream.value(bytes.sublist(s, e)),
      contentType: contentType,
    );
  }
}

/// Настоящий шум: одна петля на приложение, громкость меняется на ходу.
class JustAudioNoiseBackend implements NoiseBackend {
  AudioPlayer? _player;
  bool _loaded = false;

  @override
  Future<void> start(double gain) async {
    try {
      final p = _player ??= AudioPlayer();
      if (!_loaded) {
        await p.setAudioSource(BytesAudioSource(pinkNoiseWav()));
        await p.setLoopMode(LoopMode.one);
        _loaded = true;
      }
      await p.setVolume(gain);
      if (!p.playing) unawaited(p.play());
    } catch (_) {
      // Звук не критичен: упражнение остаётся играбельным без помехи, как в вебе.
    }
  }

  @override
  Future<void> stop() async {
    try {
      await _player?.pause();
    } catch (_) {/* уже остановлен */}
  }
}

