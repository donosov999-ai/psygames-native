import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:just_audio/just_audio.dart';

import '../../shell/noise.dart' show BytesAudioSource, wavFromPcm16;

/// ЗВУКИ ФАЗ «ДЫХАНИЯ» — перенос сигналов веб-игры (`frontend/src/services/feedback.ts`,
/// `sndBreathIn / sndBreathHold / sndBreathOut / sndTap`, зовёт `app/games/breathing.tsx`).
///
/// 📍 ЗАЧЕМ. «Дыхание» слито во Flutter в экран «Паузы» (доска FLUTTER_MIGRATION ◐): там
/// фазы только произносит голос, и то лишь в режиме «звук» — по умолчанию стоит «только
/// экран», и вдох с выдохом шли в полной тишине. Веб-игра давала на каждую смену фазы свой
/// тон, чтобы дышать С ЗАКРЫТЫМИ ГЛАЗАМИ: «раньше на все три шёл один и тот же щелчок, и с
/// закрытыми глазами понять, что началось, было нельзя». Вибрация фаз уже есть —
/// `practice_haptics.dart` (PR #100), здесь только звук.
///
/// ТОНЫ — ЧИСЛО В ЧИСЛО КАК В ВЕБЕ (синус, атака по экспоненте, спад по экспоненте до 0,0001):
///   вдох     — тон ВВЕРХ 330 → 550 Гц, 320 мс, громкость 0,07 (`glide`, атака 20 мс);
///   задержка — ровно 440 Гц, 130 мс, 0,045 (`beep`, атака 12 мс);
///   выдох    — тон ВНИЗ 520 → 300 Гц, 420 мс, 0,07 (`glide`);
///   отсчёт   — щелчок 660 Гц, 45 мс, 0,05 (`beep`, не короче 50 мс — как у веба).
/// Молчит при выключенном звуке и на тихом шаге зарядки (`appSoundOn`), как `soundOn()` веба.
enum BreathCue { inhale, hold, exhale, tap }

/// Вид фазы по шагу практики — то же правило, что у ядра «Паузы» (`practices.dart`, `frame().tone`):
/// задержка — `hold-in`/`hold-out`/`hold`; вдох — `inhale` или окончание `-in`; выдох — `exhale`/`-out`.
BreathCue? breathCueForStep(String stepId) {
  if (const ['hold-in', 'hold-out', 'hold'].contains(stepId)) return BreathCue.hold;
  if (stepId.contains('inhale') || stepId.endsWith('-in')) return BreathCue.inhale;
  if (stepId.contains('exhale') || stepId.endsWith('-out')) return BreathCue.exhale;
  return null;
}

class BreathTone {
  const BreathTone(this.fromHz, this.toHz, this.ms, this.gain, this.attackMs);
  final double fromHz, toHz, ms, gain, attackMs;
}

const breathTones = <BreathCue, BreathTone>{
  BreathCue.inhale: BreathTone(330, 550, 320, 0.07, 20),
  BreathCue.hold: BreathTone(440, 440, 130, 0.045, 12),
  BreathCue.exhale: BreathTone(520, 300, 420, 0.07, 20),
  BreathCue.tap: BreathTone(660, 660, 50, 0.05, 12),
};

const int breathSampleRate = 22050;

/// Один сигнал в моно PCM 16 бит. Частота скользит по экспоненте (`exponentialRampToValueAtTime`
/// у веба), фаза копится по шагам — без щелчка на стыке частот.
Uint8List renderBreathCueWav(BreathCue cue, {int sampleRate = breathSampleRate}) {
  final t = breathTones[cue]!;
  final len = (t.ms / 1000 * sampleRate).round();
  final attack = math.max(1.0, t.attackMs / 1000 * sampleRate);
  final tail = (0.03 * sampleRate).round();
  final pcm = ByteData((len + tail) * 2);
  var phase = 0.0;
  for (var i = 0; i < len; i += 1) {
    final f = t.fromHz * math.pow(t.toHz / t.fromHz, i / len);
    phase += 2 * math.pi * f / sampleRate;
    final env = i < attack
        ? 0.0001 * math.pow(t.gain / 0.0001, i / attack)
        : t.gain * math.pow(0.0001 / t.gain, (i - attack) / math.max(1, len - attack));
    pcm.setInt16(i * 2, (env * math.sin(phase) * 32767).round().clamp(-32768, 32767), Endian.little);
  }
  return wavFromPcm16(pcm.buffer.asUint8List(), sampleRate);
}

/// Устройство, которое играет готовый WAV. Подменяется в пробах.
abstract class BreathCueBackend {
  Future<void> play(Uint8List wav);
  Future<void> dispose();
}

class JustAudioBreathCueBackend implements BreathCueBackend {
  AudioPlayer? _player;

  @override
  Future<void> play(Uint8List wav) async {
    try {
      final p = _player ??= AudioPlayer();
      await p.stop();
      await p.setAudioSource(BytesAudioSource(wav));
      unawaited(p.play().catchError((Object _) {}));
    } catch (_) {
      // Звук не завёлся — дыхание продолжается по экрану и вибрации.
    }
  }

  @override
  Future<void> dispose() async {
    try {
      await _player?.dispose();
    } catch (_) {}
    _player = null;
  }
}

/// Решает, КОГДА звучать: один сигнал на смену фазы и по щелчку на секунду отсчёта.
class BreathCues {
  BreathCues({required this.backend, required this.soundOn});

  final BreathCueBackend backend;

  /// Читается при КАЖДОМ сигнале: звук могут выключить посреди подхода.
  final bool Function() soundOn;

  final _wav = <BreathCue, Uint8List>{};
  String? _lastStep;
  int? _lastLead;

  /// Новый подход — всё с начала: первый вдох обязан прозвучать.
  void reset() {
    _lastStep = null;
    _lastLead = null;
  }

  /// Шаг практики дыхания на этом кадре. [key] — уникальный ключ шага (номер цикла + шаг).
  void step(String key, String stepId) {
    if (key == _lastStep) return;
    _lastStep = key;
    final cue = breathCueForStep(stepId);
    if (cue != null) play(cue);
  }

  /// Отсчёт перед первым вдохом: [secondsLeft] — сколько целых секунд осталось (3, 2, 1).
  /// Как у веба: щелчок на 3→2 и 2→1, на старте — уже тон вдоха.
  void lead(int secondsLeft) {
    final prev = _lastLead;
    _lastLead = secondsLeft;
    if (prev != null && secondsLeft < prev && secondsLeft >= 1) play(BreathCue.tap);
  }

  void play(BreathCue cue) {
    if (!soundOn()) return;
    unawaited(backend.play(_wav.putIfAbsent(cue, () => renderBreathCueWav(cue))));
  }

  Future<void> dispose() => backend.dispose();
}
