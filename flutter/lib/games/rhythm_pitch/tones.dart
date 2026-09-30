/// ЗВУК «РИТМА И ВЫСОТЫ» — перенос `frontend/src/games/rhythm-pitch/audio/ToneAudioEngine.ts`
/// и обёртки `appAudio.ts`.
///
/// 🔴 ЗВУК ЗДЕСЬ — СОДЕРЖАНИЕ, А НЕ УКРАШЕНИЕ. Поэтому два правила веба перенесены
/// дословно:
///   1. тумблер звука приложения главнее игры — пока он выключен (или идёт тихий шаг
///      зарядки), не рождается ни один тон: движок бросает [RpAudioUnavailable] с
///      текстом экрана, и партия уходит на «звук недоступен», а не в тишину;
///   2. ожидаемое время сигнала и время нажатия — на ОДНИХ часах ([RpToneEngine.clock]):
///      поправка задержки зажата −250…+500 мс, и рассинхрон часов молча упёрся бы в
///      границу, испортив счёт.
///
/// КАК ЗВУЧИТ. Веб расписывает осцилляторы Web Audio по часам контекста. Здесь весь
/// образец рендерится ОДНИМ WAV в памяти (как розовый шум в `shell/noise.dart`) и
/// играется одним плеером: промежутки между ударами тогда точны до сэмпла, а общий
/// сдвиг старта — ровно то, что меряет калибровка. Огибающая та же: экспонента от
/// 0,0001 до громкости тона за 12 мс, затем экспонента вниз к концу тона.
///
/// ⚠️ Плеер спрятан за [RpToneBackend]: проба с настоящим звуком меряет погоду на
/// машине. Правила движка проверяются подставным устройством.
library;

// `StreamAudioSource` у just_audio помечен экспериментальным — см. `shell/noise.dart`.
// ignore_for_file: experimental_member_use

import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:just_audio/just_audio.dart';

import '../../shell/noise.dart';
import 'core.dart';

/// Один тон образца: когда, сколько, какой высоты и насколько громко.
class RpTone {
  const RpTone(this.delayMs, this.durationMs, this.frequencyHz, this.gain);
  final double delayMs;
  final double durationMs;
  final double frequencyHz;
  final double gain;
}

/// Метроном калибровки: четыре сигнала 660 Гц через 450 мс — как в вебе.
List<RpTone> rpCalibrationTones() => [
  for (final d in const [0, 450, 900, 1350]) RpTone(d.toDouble(), 130, 660, 1),
];

/// Тоны раунда — те же числа, что у `playRound` веба.
List<RpTone> rpRoundTones(RpRound round) {
  if (round is RhythmEchoRound) {
    final dur = math.min(140.0, math.max(80.0, round.unitMs * 0.24));
    return [for (final b in round.beats) RpTone(b.onsetMs, dur, b.accent ? 880 : 660, b.accent ? 1 : 0.72)];
  }
  final r = round as PitchPathRound;
  final direction = r.task == 'direction';
  final spacing = direction ? 560.0 : 440.0;
  return [
    for (var i = 0; i < r.sequence.length; i += 1)
      RpTone(i * spacing, direction ? 340 : 280, r.frequenciesHz[r.sequence[i]], 0.82),
  ];
}

/// Тишина перед первым тоном — те же 60 мс запаса, что берёт веб перед расписанием.
const double rpLeadMs = 60;

/// Частота дискретизации: самый высокий тон 880 Гц, запас по Найквисту двенадцатикратный.
const int rpSampleRate = 22050;

/// Образец целиком в моно PCM 16 бит: [rpLeadMs] тишины, затем тоны по расписанию.
Uint8List renderRpTonesWav(List<RpTone> tones, {int sampleRate = rpSampleRate}) {
  var endMs = 0.0;
  for (final t in tones) {
    endMs = math.max(endMs, t.delayMs + t.durationMs + 15);
  }
  final n = ((rpLeadMs + endMs) * sampleRate / 1000).ceil() + 1;
  final mix = Float64List(n);
  for (final t in tones) {
    final s0 = ((rpLeadMs + t.delayMs) * sampleRate / 1000).round();
    final attack = 0.012 * sampleRate;
    final len = t.durationMs / 1000 * sampleRate;
    final peak = math.max(0.0001, t.gain);
    final w = 2 * math.pi * t.frequencyHz / sampleRate;
    for (var i = 0; i < len && s0 + i < n; i += 1) {
      // Две экспоненты, как `exponentialRampToValueAtTime` в вебе.
      final env = i < attack
          ? 0.0001 * math.pow(peak / 0.0001, i / attack)
          : peak * math.pow(0.0001 / peak, (i - attack) / math.max(1, len - attack));
      mix[s0 + i] += env * math.sin(w * i);
    }
  }
  final pcm = ByteData(n * 2);
  for (var i = 0; i < n; i += 1) {
    pcm.setInt16(i * 2, (mix[i].clamp(-1.0, 1.0) * 0.9 * 32767).round(), Endian.little);
  }
  return wavFromPcm16(pcm.buffer.asUint8List(), sampleRate);
}

/// Звука нет: выключен тумблер, тихий шаг или плеер не завёлся. Текст — для человека.
class RpAudioUnavailable implements Exception {
  const RpAudioUnavailable(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Что сыграно: когда (по часам движка) прозвучит каждый тон и когда всё доиграет.
class RpPlaybackPlan {
  const RpPlaybackPlan(this.expectedTimesMs, this.completed);
  final List<double> expectedTimesMs;
  final Future<void> completed;
}

/// Устройство, которое играет готовый WAV. Подменяется в пробах.
abstract class RpToneBackend {
  /// Загрузить образец и громкость — всё медленное делается ДО отметки старта.
  Future<void> load(Uint8List wav, double volume);

  /// Пустить загруженное; будущее завершается, когда звук доиграл или остановлен.
  Future<void> start();
  Future<void> stop();
  Future<void> dispose();
}

/// Движок игры: решает, можно ли звучать, строит образец и ставит отметку старта.
class RpToneEngine {
  RpToneEngine({required this.backend, required this.soundOn, required this.clock, required this.mutedMessage});

  final RpToneBackend backend;

  /// Тумблер человека и тихий шаг — читается при КАЖДОМ звуке, а не на входе:
  /// звук могут выключить посреди партии.
  final bool Function() soundOn;

  /// Часы партии в миллисекундах — те же, что ставят время нажатия.
  final double Function() clock;
  final String Function() mutedMessage;

  bool get available => soundOn();

  Future<RpPlaybackPlan> playCalibration(double volume) => _schedule(rpCalibrationTones(), volume);
  Future<RpPlaybackPlan> playRound(RpRound round, double volume) => _schedule(rpRoundTones(round), volume);

  Future<RpPlaybackPlan> _schedule(List<RpTone> tones, double volume) async {
    if (!soundOn()) throw RpAudioUnavailable(mutedMessage());
    if (tones.isEmpty) throw const RpAudioUnavailable('No audio events to play');
    await backend.stop();
    await backend.load(renderRpTonesWav(tones), math.min(1.0, math.max(0.1, volume)));
    // Отметка старта — вплотную к пуску: загрузка и громкость уже позади.
    final t0 = clock() + rpLeadMs;
    final done = backend.start();
    var endMs = 0.0;
    for (final t in tones) {
      endMs = math.max(endMs, t.delayMs + t.durationMs);
    }
    // Страховка: если плеер не сообщит о конце, партия не зависнет на «Слушайте».
    // Таймер снимается, как только звук доиграл или остановлен.
    final completed = Completer<void>();
    final guard = Timer(Duration(milliseconds: (rpLeadMs + endMs + 800).round()), () {
      if (!completed.isCompleted) completed.complete();
    });
    unawaited(done.whenComplete(() {
      guard.cancel();
      if (!completed.isCompleted) completed.complete();
    }));
    return RpPlaybackPlan([for (final t in tones) t0 + t.delayMs], completed.future);
  }

  Future<void> stop() => backend.stop();
  Future<void> dispose() => backend.dispose();
}

/// Настоящий плеер: один на экран, образец из памяти.
class JustAudioToneBackend implements RpToneBackend {
  AudioPlayer? _player;
  Completer<void>? _done;
  StreamSubscription<ProcessingState>? _sub;

  void _finish() {
    final d = _done;
    _done = null;
    if (d != null && !d.isCompleted) d.complete();
  }

  @override
  Future<void> load(Uint8List wav, double volume) async {
    try {
      final p = _player ??= AudioPlayer();
      await p.setAudioSource(BytesAudioSource(wav));
      await p.setVolume(volume);
    } catch (e) {
      throw RpAudioUnavailable('$e');
    }
  }

  @override
  Future<void> start() {
    final p = _player;
    if (p == null) return Future.value();
    final done = Completer<void>();
    _done = done;
    _sub?.cancel();
    _sub = p.processingStateStream.listen((s) {
      if (s == ProcessingState.completed) _finish();
    });
    unawaited(p.play().catchError((Object _) => _finish()));
    return done.future;
  }

  @override
  Future<void> stop() async {
    _finish();
    try {
      await _player?.stop();
    } catch (_) {
      /* уже остановлен */
    }
  }

  @override
  Future<void> dispose() async {
    await stop();
    await _sub?.cancel();
    await _player?.dispose();
    _player = null;
  }
}
