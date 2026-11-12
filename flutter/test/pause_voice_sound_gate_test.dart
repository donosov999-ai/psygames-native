// Голос «Паузы» слушает общий тумблер «Звук» (задача 25b1d933): экран строит
// `VoiceLayer(soundOn: appSoundOn(state) && !GamePreset.isCalm)`, а не только тихий пресет.
// Здесь — условие, на котором это держится (экран своё устройство голоса подставить не даёт).
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/audio_host.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  tearDown(GamePreset.clear);

  test('тумблер «Звук» выключен — голосу нельзя говорить', () async {
    SharedPreferences.setMockInitialValues({'flutter.psygames_sound_enabled': 'false'});
    expect(appSoundOn(await SharedState.open()), isFalse);
  });

  test('звук включён по умолчанию, тихий шаг зарядки его гасит', () async {
    SharedPreferences.setMockInitialValues({});
    final s = await SharedState.open();
    expect(appSoundOn(s), isTrue);
    GamePreset.set({'calm': '1'});
    expect(appSoundOn(s), isFalse);
  });
}
