import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photo_diary_kit/photo_diary_kit.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  tearDown(
    () => messenger.setMockMethodCallHandler(DiaryStorage.channel, null),
  );
  test('only native no-backup directory is accepted', () async {
    messenger.setMockMethodCallHandler(DiaryStorage.channel, (call) async {
      expect(call.method, 'directory');
      return '/private/app/no_backup/photo_diary';
    });
    final repository = await DiaryStorage.open();
    expect(repository.root.path, '/private/app/no_backup/photo_diary');
  });
  test(
    'missing channel never falls back to backup or public storage',
    () async {
      await expectLater(
        DiaryStorage.open(),
        throwsA(isA<MissingPluginException>()),
      );
    },
  );
  test('invalid path rejected without creating directories', () async {
    for (final path in [
      null,
      'photo_diary',
      '/Documents',
      '/private/../photo_diary',
    ]) {
      messenger.setMockMethodCallHandler(
        DiaryStorage.channel,
        (_) async => path,
      );
      await expectLater(DiaryStorage.open(), throwsStateError);
    }
  });
}
