import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/audio_host.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(GamePreset.clear);

  test('a quiet full warmup round silences native audio without changing tempo', () async {
    SharedPreferences.setMockInitialValues({'psygames_sound_enabled': 'true'});
    final state = await SharedState.open();
    expect(appSoundOn(state), isTrue);
    GamePreset.set({'wu': '1', 'progress': '1', 'quiet': '1'});
    expect(GamePreset.progressive, isTrue);
    expect(GamePreset.isCalm, isFalse);
    expect(appSoundOn(state), isFalse);
    expect(state.get('psygames_sound_enabled'), 'true');
    GamePreset.clear();
    expect(appSoundOn(state), isTrue);
  });
}
