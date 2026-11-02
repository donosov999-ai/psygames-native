import 'package:flutter/foundation.dart';

import '../../shell/game_effect_audio.dart';
import '../../shell/reward_effects.dart';
import 'motion.dart';

enum GoodsAudioEngine { off, flame, soloud }

/// Session-only comparison controls. No preferences, awards or game state.
/// Production keeps the existing opt-in defines unless a review supplies this.
class GoodsFeedbackOptions extends ChangeNotifier {
  GoodsFeedbackOptions({
    this.motion = goodsMotionPilot,
    this.rewards = rewardEffectsPilot,
    this.haptics = const bool.fromEnvironment('PSYGAMES_EVENT_HAPTICS'),
    GoodsAudioEngine? engine,
    this.backendFactory,
  }) : engine =
           engine ??
           switch (gameSfxEngine) {
             'flame' => GoodsAudioEngine.flame,
             'soloud' => GoodsAudioEngine.soloud,
             _ => GoodsAudioEngine.off,
           };

  bool motion, rewards, haptics;
  GoodsAudioEngine engine;
  final GameSoundBackend? Function(GoodsAudioEngine)? backendFactory;
  final audioError = ValueNotifier<String?>(null);
  void reportAudioError(String value) {
    audioError.value = value;
  }

  GameSoundBackend? createBackend() => backendFactory != null
      ? backendFactory!(engine)
      : switch (engine) {
          GoodsAudioEngine.off => null,
          GoodsAudioEngine.flame => FlameSoundBackend(),
          GoodsAudioEngine.soloud => SoloudSoundBackend(),
        };

  void update({
    bool? motion,
    bool? rewards,
    bool? haptics,
    GoodsAudioEngine? engine,
  }) {
    this.motion = motion ?? this.motion;
    this.rewards = rewards ?? this.rewards;
    this.haptics = haptics ?? this.haptics;
    this.engine = engine ?? this.engine;
    notifyListeners();
  }

  @override
  void dispose() {
    audioError.dispose();
    super.dispose();
  }
}
