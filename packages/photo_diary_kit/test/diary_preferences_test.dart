import 'package:flutter_test/flutter_test.dart';
import 'package:photo_diary_kit/photo_diary_kit.dart';

void main() {
  test('fresh install and malformed flags remain off', () {
    for (final p in [
      const DiaryPreferences(),
      DiaryPreferences.fromJson({
        'cameraConsent': 'true',
        'storageConsent': true,
        'practices': true,
      }),
    ]) {
      expect(p.practiceCapture, false);
      expect(p.wakeCapture, false);
      expect(p.savePhotos, false);
    }
  });
  test(
    'separate storage opt-in and separate wake opt-in survive serialization',
    () {
      final p = const DiaryPreferences().change(
        cameraConsent: true,
        practices: true,
      );
      expect(p.practiceCapture, true);
      expect(p.wakeCapture, false);
      expect(p.savePhotos, false);
      final saved = DiaryPreferences.fromJson(
        p.change(storageConsent: true).toJson(),
      );
      expect(saved.savePhotos, true);
      expect(saved.wakeCapture, false);
    },
  );
  test(
    'revocation clears all capture flags and does not re-enable them later',
    () {
      final p = const DiaryPreferences().change(
        cameraConsent: true,
        storageConsent: true,
        practices: true,
        wakeTasks: true,
      );
      final revoked = p.change(cameraConsent: false);
      expect(revoked.toJson().values, everyElement(false));
      final again = revoked.change(cameraConsent: true);
      expect(again.savePhotos, false);
      expect(again.practiceCapture, false);
      expect(again.wakeCapture, false);
    },
  );
}
