import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:photo_diary_kit/photo_diary_kit.dart';

class MemoryDiary extends DiaryRepository {
  String state = '[]';
  final files = <String, Uint8List>{};
  int counter = 0;
  int writes = 0;
  int? failWrite;
  @override
  Future<List<DiaryEntry>> read() async => (jsonDecode(state) as List)
      .map((e) => DiaryEntry.fromJson(e as Map<String, dynamic>))
      .toList();
  @override
  Future<void> write(List<DiaryEntry> entries) async {
    if (++writes == failWrite) throw StateError('storage unavailable');
    state = jsonEncode(entries.map((e) => e.toJson()).toList());
  }

  @override
  Future<String> saveFrame(DiaryFrame frame) async {
    final name = '${++counter}.jpg';
    files[name] = frame.bytes;
    return name;
  }

  @override
  Future<void> deleteFrame(String basename) async {
    files.remove(basename);
  }
}

class TestCamera extends DiaryCamera {
  int calls = 0, cancellations = 0;
  bool fail = false;
  Completer<DiaryFrame>? pending;
  @override
  Future<DiaryFrame> capture() async {
    calls++;
    if (fail) throw StateError('denied');
    if (pending != null) return pending!.future;
    return DiaryFrame(Uint8List.fromList([1, 2, 3]), 100 + calls);
  }

  @override
  Future<void> cancel() async {
    cancellations++;
  }
}

void main() {
  late MemoryDiary repo;
  late TestCamera camera;
  late PhotoDiary diary;
  setUp(() {
    repo = MemoryDiary();
    camera = TestCamera();
    diary = PhotoDiary(
      repo,
      camera,
      timeout: const Duration(milliseconds: 20),
      now: () => 10,
    );
  });
  Future<void> start({bool enabled = true, bool save = true}) => diary.begin(
    id: 'alarm:occurrence',
    kind: 'wake',
    title: 'Шульте',
    enabled: enabled,
    savePhotos: save,
  );

  test(
    'OFF means no camera or entry; measurement-only means no photo',
    () async {
      await start(enabled: false);
      expect(camera.calls, 0);
      expect(diary.entries, isEmpty);
      await start(save: false);
      await diary.finish(
        'alarm:occurrence',
        outcome: 'completed',
        savePhotos: false,
      );
      await diary.rate('alarm:occurrence', 4);
      expect(camera.calls, 0);
      expect(repo.files, isEmpty);
      expect(diary.entries.single.brightness, 4);
    },
  );
  test(
    'before/after once per occurrence, including reload and duplicate finish',
    () async {
      await start();
      await start();
      final restored = PhotoDiary(repo, camera);
      await restored.load();
      await restored.begin(
        id: 'alarm:occurrence',
        kind: 'wake',
        title: 'Шульте',
        enabled: true,
        savePhotos: true,
      );
      await restored.finish(
        'alarm:occurrence',
        outcome: 'completed',
        savePhotos: true,
      );
      await restored.finish(
        'alarm:occurrence',
        outcome: 'completed',
        savePhotos: true,
      );
      expect(camera.calls, 2);
      expect(repo.files.length, 2);
      expect(restored.entries.single.beforeAtMs, 101);
      expect(restored.entries.single.afterAtMs, 102);
    },
  );
  test('snooze/skip is not completion and never takes after', () async {
    await start();
    await diary.finish(
      'alarm:occurrence',
      outcome: 'snoozed',
      savePhotos: true,
    );
    expect(camera.calls, 1);
    expect(diary.entries.single.outcome, 'snoozed');
    expect(diary.entries.single.after, DiaryShotState.absent);
  });
  test('denied camera leaves outcome and session usable', () async {
    camera.fail = true;
    await start();
    await diary.finish(
      'alarm:occurrence',
      outcome: 'completed',
      savePhotos: true,
    );
    expect(diary.entries.single.outcome, 'completed');
    expect(diary.entries.single.before, DiaryShotState.unavailable);
    expect(diary.entries.single.after, DiaryShotState.unavailable);
    expect(repo.files, isEmpty);
  });
  test('late response after timeout cannot save photo', () async {
    camera.pending = Completer();
    await start();
    camera.pending!.complete(DiaryFrame(Uint8List.fromList([9]), 123));
    await Future<void>.delayed(Duration.zero);
    expect(repo.files, isEmpty);
    expect(diary.entries.single.before, DiaryShotState.unavailable);
  });
  test(
    'failed capture reservation releases camera for the next session',
    () async {
      repo.failWrite = 2;
      await start();
      expect(camera.calls, 0);
      expect(diary.entries.single.before, DiaryShotState.unavailable);
      await diary.begin(
        id: 'next-occurrence',
        kind: 'wake',
        title: 'Шульте',
        enabled: true,
        savePhotos: true,
      );
      expect(camera.calls, 1);
      expect(diary.entries.first.before, DiaryShotState.saved);
    },
  );
  test('late before frame after task completion is discarded', () async {
    camera.pending = Completer();
    final capturing = start();
    while (camera.calls == 0) {
      await Future<void>.delayed(Duration.zero);
    }
    await diary.finish(
      'alarm:occurrence',
      outcome: 'completed',
      savePhotos: false,
    );
    camera.pending!.complete(DiaryFrame(Uint8List.fromList([9]), 123));
    await capturing;
    expect(repo.files, isEmpty);
    expect(diary.entries.single.before, DiaryShotState.unavailable);
    expect(diary.entries.single.outcome, 'completed');
  });
  test('delete while camera pending cannot resurrect data', () async {
    camera.pending = Completer();
    final capturing = start();
    while (camera.calls == 0) {
      await Future<void>.delayed(Duration.zero);
    }
    await diary.deleteAll();
    camera.pending!.complete(DiaryFrame(Uint8List.fromList([9]), 123));
    await capturing;
    expect(diary.entries, isEmpty);
    expect(repo.files, isEmpty);
    expect(await repo.read(), isEmpty);
  });
  test(
    'background interruption discards late frame; resume does not reshoot',
    () async {
      camera.pending = Completer();
      final capturing = start();
      while (camera.calls == 0) {
        await Future<void>.delayed(Duration.zero);
      }
      await diary.interrupt();
      diary.resume();
      camera.pending!.complete(DiaryFrame(Uint8List.fromList([9]), 123));
      await capturing;
      await start();
      expect(camera.calls, 1);
      expect(repo.files, isEmpty);
    },
  );
  test('deletion removes photographs, not external exercise history', () async {
    await start();
    await diary.finish(
      'alarm:occurrence',
      outcome: 'completed',
      savePhotos: true,
    );
    final history = [
      {'kind': 'wake', 'occurrenceId': 'alarm:occurrence'},
    ];
    await diary.delete('alarm:occurrence');
    expect(repo.files, isEmpty);
    expect(await repo.read(), isEmpty);
    expect(history.length, 1);
  });
}
