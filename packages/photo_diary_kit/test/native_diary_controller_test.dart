import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:photo_diary_kit/photo_diary_kit.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'fresh install disabled, no native channel needed until explicit opt-in',
    () async {
      SharedPreferences.setMockInitialValues({'unrelated': 'preserve'});
      final prefs = await SharedPreferences.getInstance();
      final controller = nativeDiaryController(prefs);
      await controller.begin(
        id: 'x',
        kind: 'wake',
        title: 'x',
        sessionOptIn: true,
      );
      expect(controller.preferences.cameraConsent, false);
      expect(controller.entries, isEmpty);
      expect(controller.unavailable, false);
      expect(prefs.getString('unrelated'), 'preserve');
      controller.dispose();
    },
  );
  test(
    'corrupt consent fails off; explicit consent persists without diary data',
    () async {
      SharedPreferences.setMockInitialValues({
        'photo_diary_consent_v1': 'bad json',
      });
      final prefs = await SharedPreferences.getInstance();
      final controller = nativeDiaryController(prefs);
      expect(controller.preferences.cameraConsent, false);
      await controller.changePreferences(
        const DiaryPreferences(cameraConsent: true, practices: true),
      );
      final restored = nativeDiaryController(prefs);
      expect(restored.preferences.practiceCapture, true);
      expect(restored.preferences.savePhotos, false);
      expect(restored.preferences.wakeCapture, false);
      expect(prefs.getKeys(), {'photo_diary_consent_v1'});
      controller.dispose();
      restored.dispose();
    },
  );
  test(
    'unregistered private directory disables diary, not wake task',
    () async {
      SharedPreferences.setMockInitialValues({});
      final controller = nativeDiaryController(
        await SharedPreferences.getInstance(),
      );
      await controller.changePreferences(
        const DiaryPreferences(cameraConsent: true, wakeTasks: true),
      );
      await controller.begin(
        id: 'x',
        kind: 'wake',
        title: 'x',
        sessionOptIn: true,
      );
      await controller.finish('x', 'completed');
      expect(controller.unavailable, true);
      expect(controller.entries, isEmpty);
      controller.dispose();
    },
  );
}
