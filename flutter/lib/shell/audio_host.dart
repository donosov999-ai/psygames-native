import 'game_preset.dart';
import 'noise.dart';
import 'shared_state.dart';
import 'voice.dart';
import 'voice_index.dart';
import 'voice_system.dart';

/// ЗВУК ПРИЛОЖЕНИЯ ДЛЯ ЭКРАНОВ — одно место, где собираются голос и шум.
///
/// Экран не строит устройства сам: так пробы подставляют свои, а приложение
/// держит по одному плееру на голос и на шум.
///
/// Включён ли звук — как в вебе (`feedback.ts`, `soundOn`): тумблер человека
/// (`psygames_sound_enabled`, по умолчанию включён) и тихий шаг зарядки (`calm`).
bool appSoundOn(SharedState s) {
  final v = s.get('psygames_sound_enabled');
  return (v == null || v == 'true') && !GamePreset.isCalm;
}

class AudioHost {
  static VoiceBackend? _voice;
  static NoiseBackend? _noise;

  /// Голосовой слой: записи Викисловаря → системный голос → честный отказ.
  static Future<VoiceLayer> voice(SharedState s, {VoiceBackend? backend}) async {
    final idx = await VoiceIndex.load();
    return VoiceLayer(
      backend: backend ?? (_voice ??= SystemVoiceBackend()),
      soundOn: () => appSoundOn(s),
      live: idx.live,
      samples: idx.samples,
      letters: idx.letters,
    );
  }

  /// Шум под речью по SNR.
  static NoiseLayer noise(SharedState s, {NoiseBackend? backend}) =>
      NoiseLayer(backend: backend ?? (_noise ??= JustAudioNoiseBackend()), soundOn: () => appSoundOn(s));
}
