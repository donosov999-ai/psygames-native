import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:psygames_flutter/shell/game_effect_audio.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  for (final engine in ['flame', 'soloud']) {
    testWidgets('native $engine commands, stop and dispose (muted, not listening acceptance)', (t) async {
      await t.pumpWidget(const MaterialApp(home: Scaffold(body: Center(child: Text('PsyGames isolated audio verification')))));
      final effects = GameEffectAudio(
        backend: engine == 'flame' ? FlameSoundBackend() : SoloudSoundBackend(),
        enabled: () => true,
      )..volume = 0;
      for (final event in GameSound.values) { effects.emit(event, 'native'); }
      await effects.settled;
      expect(effects.lastError, isNull, reason: 'native plugin must accept every command');
      await effects.suspend(true);
      await effects.dispose();
      expect(effects.lastError, isNull);
    });
  }
}
