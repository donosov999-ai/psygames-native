import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/services.dart';
import 'package:just_audio/just_audio.dart';
import 'package:practice_kit/practice_kit.dart';

import '../../shell/noise.dart' show BytesAudioSource, wavFromPcm16;
import 'practice_haptics.dart';

/// 🔴 СИГНАЛЫ СМЕНЫ ФАЗЫ ДЫХАНИЯ — РАЗНЫЕ НА ВДОХ, ЗАДЕРЖКУ И ВЫДОХ (задача b9964dff).
///
/// Веб (`frontend/src/services/feedback.ts`, v1.181, вызов в `app/games/breathing.tsx`):
/// дыхательные практики делают с закрытыми глазами, и тон сам говорит, что началось —
/// вверх вдох, вниз выдох, ровно и тихо задержка. Вибрация различается так же: короткий
/// импульс, двойной, длинный — для тех, кто выключил звук. До переезда во Flutter-«Дыхании»
/// этого не было вовсе: во Flutter не было слоя звуковых сигналов.
///
/// Звук — по тумблеру «Звук» (`appSoundOn`: `psygames_sound_enabled` и тихий шаг зарядки),
/// вибрация — по тумблеру «Вибрация» (`appHapticOn`, #100) через тот же нативный канал,
/// что вибросопровождение практик (`PausePracticeHaptics.channel`).
///
/// [tap] — щелчок веба `sndTap` (660 Гц, 45 мс → не короче 50 мс у `beep`, громкость 0,05):
/// на отсчёте 3 → 2 → 1 перед первым вдохом (`breathing.tsx:232`) и на каждом вдохе
/// Вима Хофа (`breathing.tsx:319`). Без него отсчёт шёл в тишине, и с закрытыми глазами
/// первый вдох приходил внезапно. Своей вибрации у щелчка нет — как у веба.
enum BreathCue { inhale, hold, exhale, tap }

/// Фаза по имени шага из каталога пакета practice_kit (`assets/practices.json`): `inhale`, `inhale-one`, `left-in` —
/// вдох; `exhale`, `right-out` — выдох; `hold`, `hold-in`, `hold-out` — задержка.
BreathCue? breathCueOf(String stepId) {
  if (stepId.startsWith('hold')) return BreathCue.hold;
  if (stepId.contains('inhale') || stepId.endsWith('-in')) return BreathCue.inhale;
  if (stepId.contains('exhale') || stepId.endsWith('-out')) return BreathCue.exhale;
  return null;
}

/// Тон веба: (частота от, до, длительность мс, громкость). Громкость веба — усиление
/// WebAudio 0,07 / 0,045; здесь те же пропорции на уровне, слышном из динамика телефона.
const breathToneSpec = <BreathCue, (double, double, int, double)>{
  BreathCue.inhale: (330, 550, 320, .30),
  BreathCue.hold: (440, 440, 130, .19),
  BreathCue.exhale: (520, 300, 420, .30),
  BreathCue.tap: (660, 660, 50, .21),
};

const breathToneRate = 22050;

/// Синус с экспоненциальным скольжением частоты и огибающей как у веба: 20 мс вверх,
/// дальше экспоненциальный спад к тишине к концу тона.
Uint8List renderBreathTone(BreathCue cue, {int sampleRate = breathToneRate}) {
  final (f0, f1, ms, vol) = breathToneSpec[cue]!;
  final n = (sampleRate * ms / 1000).round();
  final pcm = ByteData(n * 2);
  final attack = (sampleRate * 0.02).round();
  var phase = 0.0;
  for (var i = 0; i < n; i += 1) {
    final t = i / n;
    final f = f0 * math.pow(f1 / f0, t);
    phase += 2 * math.pi * f / sampleRate;
    final env = i < attack ? i / attack : math.pow(0.0001, (i - attack) / math.max(1, n - attack)).toDouble();
    final v = math.sin(phase) * vol * env;
    pcm.setInt16(i * 2, (v.clamp(-1.0, 1.0) * 32767).round(), Endian.little);
  }
  return wavFromPcm16(pcm.buffer.asUint8List(), sampleRate);
}

/// Чем звучать — подменяется в пробах.
abstract class BreathSound {
  Future<void> play(BreathCue cue);
  Future<void> dispose();
}

/// Настоящий плеер: один на экран, три тона в памяти.
class JustAudioBreathSound implements BreathSound {
  AudioPlayer? _player;
  final _wav = <BreathCue, Uint8List>{};

  @override
  Future<void> play(BreathCue cue) async {
    try {
      final p = _player ??= AudioPlayer();
      await p.setAudioSource(BytesAudioSource(_wav[cue] ??= renderBreathTone(cue)));
      unawaited(p.play().catchError((Object _) {}));
    } catch (_) {
      // Звука нет (платформа без плеера) — фаза видна на экране и в вибрации.
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

/// Узнаёт смену фазы по шкале занятия и подаёт сигнал — один раз на шаг.
class BreathCues {
  BreathCues({required this.soundOn, required this.hapticOn, BreathSound? sound})
      : sound = sound ?? JustAudioBreathSound();

  final bool Function() soundOn;
  final bool Function() hapticOn;
  final BreathSound sound;
  String? _key;

  void update(Json plan, int elapsedMs) {
    final step = objects(plan['timeline'])
        .where((s) => s['setId'] == 'breathing' && elapsedMs >= s['startMs'] && elapsedMs < s['endMs'])
        .firstOrNull;
    if (step == null) return;
    final key = '${step['stepId']}@${step['startMs']}';
    if (key == _key) return;
    _key = key;
    final cue = breathCueOf('${step['stepId']}');
    if (cue != null) play(cue);
  }

  void play(BreathCue cue) {
    if (soundOn()) unawaited(sound.play(cue));
    if (hapticOn() && cue != BreathCue.tap) unawaited(_vibrate(cue));
  }

  int? _leadLeft;
  (int, int)? _wimBreath;

  /// Отсчёт перед первым вдохом: [secondsLeft] — сколько целых секунд осталось (3, 2, 1).
  /// Веб: щелчок на 3 → 2 и 2 → 1, а на старте звучит уже тон вдоха.
  void lead(int secondsLeft) {
    final prev = _leadLeft;
    _leadLeft = secondsLeft;
    if (prev != null && secondsLeft < prev && secondsLeft >= 1) play(BreathCue.tap);
  }

  /// Вдох Вима Хофа номер [breath] в раунде [round] (с единицы): один щелчок на вдох.
  /// `true` — вдох новый: экран добавит толчок `hapticMedium`, как веб.
  bool wimBreath(int round, int breath) {
    if (breath < 1 || _wimBreath == (round, breath)) return false;
    _wimBreath = (round, breath);
    play(BreathCue.tap);
    return true;
  }

  /// Вибрация веба: вдох 18 мс, задержка [14, 90, 14], выдох 60 мс.
  /// Сила — общая с «Паузой» (`PausePracticeHaptics.strength`): 0,35 в руке не слышно
  /// (Денис 01.10: «вибрации нет нихуя»).
  Future<void> _vibrate(BreathCue cue) async {
    final args = switch (cue) {
      BreathCue.inhale => {'continuous': false, 'count': 1, 'durationMs': 18, 'strength': PausePracticeHaptics.strength},
      BreathCue.hold => {'continuous': false, 'count': 2, 'durationMs': 14, 'strength': PausePracticeHaptics.strength},
      BreathCue.exhale => {'continuous': true, 'count': 1, 'durationMs': 60, 'strength': PausePracticeHaptics.strength},
      BreathCue.tap => null,
    };
    if (args == null) return;
    try {
      await PausePracticeHaptics.channel.invokeMethod<void>('play', args);
    } on MissingPluginException {
      // Веб и платформы без моторчика.
    } on PlatformException {
      // Вибрация не имеет права прервать упражнение.
    }
  }

  /// Новый заход — фаза снова «первая».
  void reset() {
    _key = null;
    _leadLeft = null;
    _wimBreath = null;
  }

  Future<void> dispose() => sound.dispose();
}
