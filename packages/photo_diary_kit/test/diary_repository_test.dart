import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:photo_diary_kit/photo_diary_kit.dart';

void main() {
  late Directory temporary;
  late FileDiaryRepository repo;
  setUp(() async {
    temporary = await Directory.systemTemp.createTemp('alarm-diary-test-');
    repo = FileDiaryRepository(Directory('${temporary.path}/private'));
  });
  tearDown(() async {
    // Test-owned temporary directory only.
    await temporary.delete(recursive: true);
  });
  test(
    'private frame and index survive repository recreation and delete',
    () async {
      final name = await repo.saveFrame(
        DiaryFrame(Uint8List.fromList([1, 2]), 123),
      );
      final e = DiaryEntry(
        id: 'session1',
        kind: 'practice',
        title: 'Breathing',
        startedAtMs: 100,
        before: DiaryShotState.saved,
        beforeFile: name,
        beforeAtMs: 123,
      );
      await repo.write([e]);
      final restored = FileDiaryRepository(repo.root);
      expect((await restored.read()).single.beforeAtMs, 123);
      expect(await File('${repo.root.path}/$name').readAsBytes(), [1, 2]);
      await restored.deleteFrame(name);
      expect(await File('${repo.root.path}/$name').exists(), isFalse);
      await restored.write([]);
      expect(await restored.read(), isEmpty);
    },
  );
  test('arbitrary paths cannot delete other files', () async {
    final outside = File('${temporary.path}/outside.txt');
    await outside.writeAsString('preserve');
    await expectLater(repo.deleteFrame('../outside.txt'), throwsArgumentError);
    await expectLater(repo.deleteFrame(outside.path), throwsArgumentError);
    expect(await outside.readAsString(), 'preserve');
  });
  test(
    'startup removes only unindexed diary frames and preserves referenced ones',
    () async {
      final kept = await repo.saveFrame(DiaryFrame(Uint8List.fromList([1]), 0));
      final orphan = await repo.saveFrame(
        DiaryFrame(Uint8List.fromList([2]), 0),
      );
      await repo.write([
        DiaryEntry(
          id: 'x',
          kind: 'practice',
          title: 'x',
          startedAtMs: 0,
          beforeFile: kept,
          before: DiaryShotState.saved,
        ),
      ]);
      final unrelated = File('${repo.root.path}/preserve.txt');
      await unrelated.writeAsString('preserve');
      expect((await repo.recover()).single.beforeFile, kept);
      expect(await repo.readFrame(kept), [1]);
      expect(await repo.readFrame(orphan), isNull);
      expect(await unrelated.readAsString(), 'preserve');
    },
  );
  test('corrupt index cannot trigger orphan cleanup', () async {
    final name = await repo.saveFrame(DiaryFrame(Uint8List.fromList([1]), 0));
    await File('${repo.root.path}/index.json').writeAsString('corrupted');
    await expectLater(repo.recover(), throwsFormatException);
    expect(await repo.readFrame(name), [1]);
  });
  test('empty photograph rejected and corrupt index fails closed', () async {
    await expectLater(
      repo.saveFrame(DiaryFrame(Uint8List(0), 0)),
      throwsArgumentError,
    );
    await repo.root.create();
    await File('${repo.root.path}/index.json').writeAsString('corrupted');
    await expectLater(repo.read(), throwsFormatException);
    expect(
      await File('${repo.root.path}/index.json').readAsString(),
      'corrupted',
    );
  });
}
