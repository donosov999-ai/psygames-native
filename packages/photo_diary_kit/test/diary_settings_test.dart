import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photo_diary_kit/photo_diary_kit.dart';

void main() {
  testWidgets('consent is separate; preview disabled on fresh install', (
    t,
  ) async {
    var value = const DiaryPreferences();
    var previews = 0;
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (c, set) => SingleChildScrollView(
              child: DiarySettings(
                value: value,
                onChanged: (v) => set(() => value = v),
                onPreview: () => previews++,
                onDeleteAll: () {},
              ),
            ),
          ),
        ),
      ),
    );
    expect(
      t
          .widget<OutlinedButton>(find.byKey(const Key('diary-preview')))
          .onPressed,
      isNull,
    );
    expect(find.byKey(const Key('diary-preview-hint')), findsOneWidget);
    await t.tap(find.byKey(const Key('diary-camera-consent')));
    await t.pump();
    expect(value.cameraConsent, true);
    expect(value.storageConsent, false);
    expect(value.wakeTasks, false);
    expect(previews, 0);
    expect(find.byKey(const Key('diary-preview-hint')), findsNothing);
    await t.ensureVisible(find.byKey(const Key('diary-preview')));
    await t.tap(find.byKey(const Key('diary-preview')));
    expect(previews, 1);
  });
  for (final english in [false, true]) {
    testWidgets(
      'settings fit 320px and delete needs confirmation english=$english',
      (t) async {
        t.view.physicalSize = const Size(320, 640);
        t.view.devicePixelRatio = 1;
        addTearDown(t.view.resetPhysicalSize);
        addTearDown(t.view.resetDevicePixelRatio);
        var deletions = 0;
        await t.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: DiarySettings(
                  value: const DiaryPreferences(),
                  english: english,
                  onChanged: (_) {},
                  onPreview: () {},
                  onDeleteAll: () => deletions++,
                ),
              ),
            ),
          ),
        );
        final label = english
            ? 'Delete entire photo diary'
            : 'Удалить весь фото-дневник';
        await t.ensureVisible(find.text(label));
        await t.tap(find.text(label));
        await t.pumpAndSettle();
        expect(deletions, 0);
        await t.tap(find.text(english ? 'Cancel' : 'Отмена'));
        await t.pumpAndSettle();
        expect(deletions, 0);
        expect(t.takeException(), isNull);
      },
    );
  }
  testWidgets('setup does not open camera or ask permission on entry', (
    t,
  ) async {
    await t.pumpWidget(
      MaterialApp(home: DiaryCameraSetup(privacyWrapper: (child) => child)),
    );
    await t.pumpAndSettle();
    expect(find.text('Открыть фронтальную камеру'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byKey(const Key('diary-camera-error')), findsNothing);
    expect(t.takeException(), isNull);
  });
}
