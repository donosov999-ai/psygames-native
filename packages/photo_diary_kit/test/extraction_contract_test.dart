import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photo_diary_kit/photo_diary_kit.dart';

void main() {
  test('native plugin keeps original private directory and consent key', () {
    final swift = File(
      'ios/photo_diary_kit/Sources/photo_diary_kit/PhotoDiaryKitPlugin.swift',
    ).readAsStringSync();
    final kotlin = File(
      'android/src/main/kotlin/com/odv999/photo_diary_kit/PhotoDiaryKitPlugin.kt',
    ).readAsStringSync();
    for (final source in [swift, kotlin]) {
      expect(source, contains('com.odv999.photo_diary_kit/storage'));
      expect(source, contains('"photo_diary"'));
    }
    expect(swift, contains('.applicationSupportDirectory'));
    expect(swift, contains('isExcludedFromBackup = true'));
    expect(swift, contains('FileProtectionType.complete'));
    expect(kotlin, contains('noBackupFilesDir.canonicalFile'));
    expect(kotlin, contains('directory.parentFile == parent'));
    expect(
      File('lib/src/platform/native_diary_controller.dart').readAsStringSync(),
      contains("'photo_diary_consent_v1'"),
    );
    expect(DiaryStorage.channel.name, 'com.odv999.photo_diary_kit/storage');
  });

  testWidgets('camera setup mounts required host privacy guard', (
    tester,
  ) async {
    var depth = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: DiaryCameraSetup(
          privacyWrapper: (child) =>
              _Guard(enter: () => depth++, exit: () => depth--, child: child),
        ),
      ),
    );
    expect(depth, 1);
    expect(find.text('Открыть фронтальную камеру'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    expect(depth, 0);
  });
}

class _Guard extends StatefulWidget {
  const _Guard({required this.enter, required this.exit, required this.child});
  final VoidCallback enter, exit;
  final Widget child;
  @override
  State<_Guard> createState() => _GuardState();
}

class _GuardState extends State<_Guard> {
  @override
  void initState() {
    super.initState();
    widget.enter();
  }

  @override
  void dispose() {
    widget.exit();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
