import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photo_diary_kit/photo_diary_kit.dart';

import 'photo_diary_test.dart' show MemoryDiary, TestCamera;

void main() {
  Future<void> begin(PhotoDiary diary) => diary.begin(
    id: 'session',
    kind: 'wake',
    title: 'Rainbow',
    enabled: true,
    savePhotos: false,
  );

  test('during is unique, serialized and not a completion', () async {
    final repo = MemoryDiary();
    final camera = TestCamera();
    final diary = PhotoDiary(repo, camera);
    await begin(diary);
    await diary.captureDuring('session', savePhotos: true);
    await diary.captureDuring('session', savePhotos: true);
    final entry = diary.entries.single;
    expect(camera.calls, 1);
    expect(entry.outcome, 'running');
    expect(entry.before, DiaryShotState.absent);
    expect(entry.after, DiaryShotState.absent);
    expect(entry.during, DiaryShotState.saved);
    expect(DiaryEntry.fromJson(entry.toJson()).duringFile, entry.duringFile);
    await diary.delete('session');
    expect(repo.files, isEmpty);
  });

  test('old entry has no invented during photo', () {
    final old =
        DiaryEntry(
            id: 'old',
            kind: 'wake',
            title: 'old',
            startedAtMs: 1,
          ).toJson()
          ..remove('during')
          ..remove('duringFile')
          ..remove('duringAtMs');
    expect(DiaryEntry.fromJson(old).during, DiaryShotState.absent);
  });

  test(
    'old before-after consent does not authorize a third bright-screen shot',
    () async {
      final old = DiaryPreferences.fromJson({
        'cameraConsent': true,
        'storageConsent': true,
        'wakeTasks': true,
      });
      expect(old.rainbowCapture, false);
      final camera = TestCamera();
      final diary = PhotoDiary(MemoryDiary(), camera);
      final controller = DiaryController(
        old,
        loadDiary: () async => diary,
        persistPreferences: (_) async {},
        readPhoto: (_) async => null,
      );
      await controller.begin(
        id: 'session',
        kind: 'wake',
        title: 'Rainbow',
        sessionOptIn: true,
      );
      await controller.captureDuring('session');
      expect(camera.calls, 1);
      await controller.changePreferences(old.change(rainbowCapture: true));
      await controller.captureDuring('session');
      expect(camera.calls, 2);
      expect(controller.entries.single.outcome, 'running');
      expect(old.change(cameraConsent: false).rainbowCapture, false);
      controller.dispose();
    },
  );

  test(
    'late during frame cannot become an after shot or credit success',
    () async {
      final camera = TestCamera()..pending = Completer<DiaryFrame>();
      final diary = PhotoDiary(MemoryDiary(), camera);
      await begin(diary);
      final capture = diary.captureDuring('session', savePhotos: true);
      await Future<void>.delayed(Duration.zero);
      await diary.finish('session', outcome: 'skipped', savePhotos: false);
      camera.pending!.complete(DiaryFrame(Uint8List.fromList([1]), 2));
      await capture;
      expect(diary.entries.single.outcome, 'skipped');
      expect(diary.entries.single.during, DiaryShotState.unavailable);
      expect(diary.entries.single.duringError, 'interrupted');
      expect(diary.entries.single.after, DiaryShotState.absent);
    },
  );

  test('bounded cold start longer than old 2s allowance succeeds', () async {
    final camera = TestCamera()..pending = Completer<DiaryFrame>();
    final diary = PhotoDiary(MemoryDiary(), camera);
    await begin(diary);
    Timer(
      const Duration(milliseconds: 2100),
      () => camera.pending!.complete(DiaryFrame(Uint8List.fromList([1]), 3)),
    );
    await diary.captureDuring('session', savePhotos: true);
    expect(diary.entries.single.during, DiaryShotState.saved);
  });

  test('timeout has a safe diagnostic code and one attempt only', () async {
    final camera = TestCamera()..pending = Completer<DiaryFrame>();
    final diary = PhotoDiary(
      MemoryDiary(),
      camera,
      timeout: const Duration(milliseconds: 5),
    );
    await begin(diary);
    await diary.captureDuring('session', savePhotos: true);
    await diary.captureDuring('session', savePhotos: true);
    expect(camera.calls, 1);
    expect(diary.entries.single.duringError, 'timeout');
  });

  test(
    'failed loader can recover on the next session without resetting preferences',
    () async {
      var loads = 0;
      final diary = PhotoDiary(MemoryDiary(), TestCamera());
      final controller = DiaryController(
        const DiaryPreferences(
          cameraConsent: true,
          storageConsent: true,
          wakeTasks: true,
        ),
        loadDiary: () async {
          if (++loads == 1) throw StateError('temporarily unavailable');
          return diary;
        },
        persistPreferences: (_) async {},
        readPhoto: (_) async => null,
      );
      await controller.begin(
        id: 'first',
        kind: 'wake',
        title: 'first',
        sessionOptIn: true,
      );
      expect(controller.unavailable, true);
      await controller.begin(
        id: 'second',
        kind: 'wake',
        title: 'second',
        sessionOptIn: true,
      );
      expect(loads, 2);
      expect(controller.unavailable, false);
      expect(controller.entries.single.before, DiaryShotState.saved);
      controller.dispose();
    },
  );

  testWidgets(
    'during label and capture failure are visible separately from completion',
    (tester) async {
      final entry = DiaryEntry(
        id: 's',
        kind: 'wake',
        title: 'Rainbow',
        startedAtMs: 1,
        during: DiaryShotState.unavailable,
        duringError: 'timeout',
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: DiaryEntryCard(
                entry: entry,
                readPhoto: (_) async => null,
                onRate: (_) {},
                onDelete: () {},
              ),
            ),
          ),
        ),
      );
      expect(find.text('Во время задания'), findsOneWidget);
      expect(find.text('Камера не успела сделать снимок'), findsOneWidget);
      expect(find.text('Задание завершено'), findsNothing);
    },
  );
}
