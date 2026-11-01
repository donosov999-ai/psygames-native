import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_effect_audio.dart';
import 'package:psygames_flutter/shell/pilot_liquid_surface.dart';
import 'package:psygames_flutter/shell/pilot_press_response.dart';
import 'package:psygames_flutter/shell/reward_effects.dart';

void main() {
  test('approved release config enables UI but not experimental audio/haptics', () {
    final json = jsonDecode(File('config/approved-ui.json').readAsStringSync()) as Map;
    expect(json, {
      'PSYGAMES_UI_MOTION': true,
      'PSYGAMES_GOODS_MOTION': true,
      'PSYGAMES_REWARD_EFFECTS': true,
      'PSYGAMES_LIQUID_GLASS': true,
      'PSYGAMES_SFX_ENGINE': 'off',
      'PSYGAMES_EVENT_HAPTICS': false,
    });
    // Validate compiled constants too when invoked with the actual release file.
    if (const bool.fromEnvironment('VERIFY_APPROVED_UI_CONFIG')) {
      expect(uiMotionPilot, isTrue);
      expect(liquidGlassPilot, isTrue);
      expect(rewardEffectsPilot, isTrue);
      expect(gameSfxEngine, 'off');
    }
  });

  test('both stores compile the same approved UI file with the real entrypoint', () {
    for (final platform in ['play', 'testflight']) {
      final workflow = File('../.github/workflows/flutter-$platform.yml').readAsStringSync();
      final builds = workflow.split('\n').where((line) => RegExp(r'flutter build (ipa|appbundle|apk) ').hasMatch(line));
      expect(builds.length, platform == 'play' ? 2 : 1);
      for (final line in builds) {
        expect(line, contains('--dart-define-from-file=config/approved-ui.json'));
        expect(line, isNot(contains('design_integration_preview')));
        expect(line, contains(r'--dart-define-from-file="$RUNNER_TEMP/psygames-cloud.json"'));
      }
    }
  });
}
