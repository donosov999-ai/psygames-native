import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/audio_host.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/voice_index.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ХОСТ ЗВУКА: включён ли звук — ровно как в вебе, и указатель голосов читается.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(GamePreset.clear);

  test('🔴 тумблер звука — как в вебе: нет значения — включён, всё кроме «true» — выключен', () async {
    for (final (stored, on) in [(null, true), ('true', true), ('false', false), ('0', false)]) {
      SharedPreferences.setMockInitialValues({'psygames_sound_enabled': ?stored});
      final s = await SharedState.open();
      expect(appSoundOn(s), on, reason: 'psygames_sound_enabled = $stored');
    }
  });

  test('тихий шаг зарядки глушит звук даже при включённом тумблере', () async {
    SharedPreferences.setMockInitialValues({'psygames_sound_enabled': 'true'});
    final s = await SharedState.open();
    GamePreset.set({'wu': '1', 'calm': '1'});
    expect(appSoundOn(s), isFalse);
  });

  /// ⚠️ БЕЗ `runAsync` намеренно: в настоящем времени `compute()` отрабатывает, и
  /// возврат к `loadString` проба бы не заметила. В поддельном времени он не
  /// завершается никогда — ровно так вешались пробы на десять минут.
  testWidgets('🔴 указатель голосов (81 КБ) читается в поддельном времени и не пустой', (tester) async {
    VoiceIndex? idx;
    VoiceIndex.load().then((v) => idx = v);
    for (var i = 0; i < 50 && idx == null; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    expect(idx, isNotNull, reason: 'не прочитан: `loadString` большого ассета ушёл в compute()');
    expect(idx!.samples.isNotEmpty || idx!.live.isNotEmpty, isTrue, reason: 'указатель прочитан, а не подменён пустым');
  });
}
