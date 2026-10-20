import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photo_diary_kit/photo_diary_kit.dart';

void main() {
  testWidgets(
    'partial snoozed entry is honest; rating and delete are optional',
    (t) async {
      final entry = DiaryEntry(
        id: 'occurrence',
        kind: 'wake',
        title: 'Шульте',
        startedAtMs: 0,
        outcome: 'snoozed',
      );
      int? rating;
      var deletes = 0;
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: DiaryEntryCard(
                entry: entry,
                readPhoto: (_) async => null,
                onRate: (n) => rating = n,
                onDelete: () => deletes++,
              ),
            ),
          ),
        ),
      );
      expect(find.text('Отложено'), findsOneWidget);
      expect(find.text('Нет снимка'), findsNWidgets(2));
      expect(find.text('Задание завершено'), findsNothing);
      expect(rating, isNull);
      await t.tap(find.text('4'));
      expect(rating, 4);
      await t.ensureVisible(find.text('Удалить запись'));
      await t.tap(find.text('Удалить запись'));
      await t.pumpAndSettle();
      expect(deletes, 0);
      await t.tap(find.text('Удалить'));
      await t.pumpAndSettle();
      expect(deletes, 1);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets('missing saved photo and long title fit 320px', (t) async {
    t.view.physicalSize = const Size(320, 640);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    final entry = DiaryEntry(
      id: 'practice',
      kind: 'practice',
      title: 'Breathing, meditation and voluntary morning practice',
      startedAtMs: 0,
      outcome: 'completed',
      before: DiaryShotState.saved,
      beforeFile: 'missing.jpg',
      beforeAtMs: 123,
    );
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: DiaryEntryCard(
              entry: entry,
              english: true,
              readPhoto: (_) async => throw StateError('deleted'),
              onRate: (_) {},
              onDelete: () {},
            ),
          ),
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(find.text('No photo'), findsNWidgets(2));
    expect(find.text('Task completed'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
