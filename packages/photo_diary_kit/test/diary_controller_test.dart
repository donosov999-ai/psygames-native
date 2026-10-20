import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:photo_diary_kit/photo_diary_kit.dart';

import 'photo_diary_test.dart' show MemoryDiary, TestCamera;

void main() {
  const enabled = DiaryPreferences(
    cameraConsent: true,
    storageConsent: true,
    practices: true,
    wakeTasks: true,
  );
  late MemoryDiary repository;
  late TestCamera camera;
  late PhotoDiary diary;
  late DiaryController controller;
  var loads = 0;
  setUp(() {
    repository = MemoryDiary();
    camera = TestCamera();
    diary = PhotoDiary(
      repository,
      camera,
      timeout: const Duration(milliseconds: 20),
    );
    loads = 0;
    controller = DiaryController(
      enabled,
      loadDiary: () async {
        loads++;
        await diary.load();
        return diary;
      },
      persistPreferences: (_) async {},
      readPhoto: (_) async => null,
      deadline: const Duration(milliseconds: 100),
    );
  });
  tearDown(() => controller.dispose());
  Future<void> begin() => controller.begin(
    id: 'alarm:occurrence',
    kind: 'wake',
    title: 'Шульте',
    sessionOptIn: true,
  );

  test('session opt-out never initializes or opens camera', () async {
    await controller.begin(
      id: 'x',
      kind: 'practice',
      title: 'x',
      sessionOptIn: false,
    );
    expect(loads, 0);
    expect(camera.calls, 0);
  });
  test(
    'rapid setting changes persist in order, not stale opt-in last',
    () async {
      controller.dispose();
      final first = Completer<void>();
      final writes = <bool>[];
      controller = DiaryController(
        enabled,
        loadDiary: () async => diary,
        persistPreferences: (value) async {
          writes.add(value.cameraConsent);
          if (writes.length == 1) await first.future;
        },
        readPhoto: (_) async => null,
      );
      final on = controller.changePreferences(enabled);
      final off = controller.changePreferences(
        enabled.change(cameraConsent: false),
      );
      await Future<void>.delayed(Duration.zero);
      expect(writes, [true]);
      first.complete();
      await Future.wait([on, off]);
      expect(writes, [true, false]);
      expect(controller.preferences.cameraConsent, false);
    },
  );
  test('before/after pair and duplicate completion use one diary', () async {
    await begin();
    await controller.finish('alarm:occurrence', 'completed');
    await controller.finish('alarm:occurrence', 'completed');
    await begin();
    expect(loads, 1);
    expect(camera.calls, 2);
    expect(controller.entries.single.outcome, 'completed');
  });
  test('metadata-only saves facts but never requests a frame', () async {
    await controller.changePreferences(enabled.change(storageConsent: false));
    await begin();
    await controller.finish('alarm:occurrence', 'completed');
    expect(camera.calls, 0);
    expect(controller.entries.single.outcome, 'completed');
  });
  test(
    'same occurrence after snooze keeps before and can complete later',
    () async {
      await begin();
      await controller.finish('alarm:occurrence', 'snoozed');
      await begin();
      expect(camera.calls, 1);
      await controller.finish('alarm:occurrence', 'completed');
      await controller.finish('alarm:occurrence', 'completed');
      expect(camera.calls, 2);
      expect(controller.entries.single.outcome, 'completed');
    },
  );
  test(
    'storage failure is contained, not propagated to alarm handler',
    () async {
      controller.dispose();
      controller = DiaryController(
        enabled,
        loadDiary: () async => throw StateError('corrupt storage'),
        persistPreferences: (_) async => throw StateError('disk full'),
        readPhoto: (_) async => null,
      );
      await begin();
      await controller.finish('alarm:occurrence', 'completed');
      await controller.changePreferences(enabled.change(practices: false));
      expect(controller.unavailable, true);
      expect(camera.calls, 0);
    },
  );
  test('completion while loading never takes late before', () async {
    controller.dispose();
    final loading = Completer<PhotoDiary>();
    controller = DiaryController(
      enabled,
      loadDiary: () => loading.future,
      persistPreferences: (_) async {},
      readPhoto: (_) async => null,
    );
    final starting = begin();
    await controller.finish('alarm:occurrence', 'completed');
    loading.complete(diary);
    await starting;
    expect(controller.entries.single.before, DiaryShotState.absent);
    expect(controller.entries.single.after, DiaryShotState.saved);
    expect(camera.calls, 1);
    expect(controller.entries.single.outcome, 'completed');
  });
  test(
    'revoking consent while initializing prevents pending capture',
    () async {
      controller.dispose();
      final loading = Completer<PhotoDiary>();
      controller = DiaryController(
        enabled,
        loadDiary: () => loading.future,
        persistPreferences: (_) async {},
        readPhoto: (_) async => null,
      );
      final starting = begin();
      await controller.changePreferences(enabled.change(cameraConsent: false));
      loading.complete(diary);
      await starting;
      expect(camera.calls, 0);
      expect(controller.entries, isEmpty);
    },
  );
  test('background or snooze cannot produce a success-after frame', () async {
    await begin();
    controller.foreground(false);
    await controller.finish('alarm:occurrence', 'snoozed');
    controller.foreground(true);
    await begin();
    expect(camera.calls, 1);
    expect(controller.entries.single.outcome, 'snoozed');
    expect(controller.entries.single.after, DiaryShotState.absent);
  });
}
