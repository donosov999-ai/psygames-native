import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/cloud_restore.dart';
import 'package:psygames_flutter/shell/cloud_snapshot.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _InterruptingState extends SharedState {
  _InterruptingState(super.prefs);

  int? writesLeft;
  bool ignoreWrites = false;

  void _checkWrite() {
    if (writesLeft == 0) throw StateError('Simulated storage interruption');
    if (writesLeft != null) writesLeft = writesLeft! - 1;
  }

  @override
  Future<void> set(String key, String value) async {
    _checkWrite();
    if (!ignoreWrites) await super.set(key, value);
  }

  @override
  Future<void> remove(String key) async {
    _checkWrite();
    if (!ignoreWrites) await super.remove(key);
  }
}

void main() {
  late Directory dir;
  late _InterruptingState state;
  const portable = <String, String>{
    'psygames_pet_name': 'Синапс 🐾',
    'psygames_pet_skin': 'robot',
    'psygames_pet_acc': '{"hat":"crown"}',
    'psygames_pet_inventory_v1': '["crown","scarf"]',
    'psygames_tokens_v1': '{ "nzt48": 4321 }',
    'psygames_earn_v1': '{"nzt48":[{"points":25}]}',
    'psygames_earned_total_v1': '{"nzt48":9876}',
    'psygames_abilities_v1': '{"nzt48":{"hint":3}}',
    'psygames_sessions': '[{"id":"original","score":42}]',
    'psygames_sudoku_revealed_boards': '{"old-board":true}',
    'psygames_obsolete_progress': '7',
    'psygames.best.sudoku': '123',
    'language': 'ru',
  };
  const local = <String, String>{
    'psygames_device_id': 'installation-1',
    'psygames_auth_token': 'local-test-only',
    'psygames_cloud_account': 'account-1',
    'psygames_cloud_consent': 'accepted-here',
    'psygames_sessions_outbox': '[{"id":"queued"}]',
    'psygames_supabase_base': 'https://example.invalid',
    'psygames_supabase_migrated_v2': '1',
    'psygames_legacy_import_v5': '1',
    'foreign.setting': 'untouched',
  };
  final target = CloudSnapshot.capture({
    'psygames_pet_name': 'Cloud mascot',
    'psygames_pet_skin': 'cat',
    'psygames_tokens_v1': '{"nzt48":75}',
    'psygames_earned_total_v1': '{"nzt48":100}',
    'psygames_abilities_v1': '{"nzt48":{"hint":1}}',
    'psygames_sessions': '[{"id":"cloud-only","score":1}]',
    'psygames_sudoku_revealed_boards': '{"cloud-board":true}',
    'language': 'en',
  }, now: DateTime.utc(2026, 10, 16));

  File pending() => File('${dir.path}/${CloudRestore.pendingFileName}');
  File safety() => File('${dir.path}/${CloudRestore.safetyFileName}');

  Future<Map<String, dynamic>> readJournal() async =>
      jsonDecode(await pending().readAsString()) as Map<String, dynamic>;

  Future<void> writeJournal(Object? journal) async {
    await pending().writeAsString(jsonEncode(journal), flush: true);
  }

  void expectTarget() {
    expect(CloudSnapshot.capture(state.snapshot()).data, target.data);
    for (final entry in local.entries) {
      expect(state.get(entry.key), entry.value, reason: entry.key);
    }
  }

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('psygames-cloud-restore-test-');
    SharedPreferences.setMockInitialValues({...portable, ...local});
    state = _InterruptingState(await SharedPreferences.getInstance());
  });

  tearDown(() async {
    state.dispose();
    await dir.delete(recursive: true);
  });

  test(
    'prepare atomically saves both images and does not apply live',
    () async {
      final initial = state.snapshot();
      await CloudRestore.prepare(dir, state, target);
      expect(state.snapshot(), initial);
      expect(state.writes.value, 0);
      final journal = await readJournal();
      expect(journal['schema'], 1);
      expect(
        CloudSnapshot.decode(jsonEncode(journal['before'])).data,
        portable,
      );
      expect(
        CloudSnapshot.decode(jsonEncode(journal['after'])).data,
        target.data,
      );
      expect(await safety().exists(), isFalse);
      expect(
        await dir.list().where((entry) => entry is Directory).toList(),
        isEmpty,
        reason: 'temporary staging directory is cleaned after atomic rename',
      );
    },
  );

  test('prepare never overwrites an existing pending journal', () async {
    await pending().writeAsString('existing even if malformed', flush: true);
    await expectLater(
      CloudRestore.prepare(dir, state, target),
      throwsStateError,
    );
    expect(await pending().readAsString(), 'existing even if malformed');
    expect(state.writes.value, 0);
  });

  test(
    'concurrent prepare has one winner and cannot overwrite pending',
    () async {
      final other = CloudSnapshot.capture({
        'psygames_pet_name': 'Other target',
      });
      Future<bool> attempt(CloudSnapshot snapshot) async {
        try {
          await CloudRestore.prepare(dir, state, snapshot);
          return true;
        } on StateError {
          return false;
        }
      }

      final results = await Future.wait([attempt(target), attempt(other)]);
      expect(results.where((ok) => ok).length, 1);
      final after = CloudSnapshot.decode(
        jsonEncode((await readJournal())['after']),
      );
      expect(after.data, results.first ? target.data : other.data);
      expect(state.writes.value, 0);
    },
  );

  test(
    'startup replaces instead of adding, removes absent keys, keeps local',
    () async {
      await CloudRestore.prepare(dir, state, target);
      expect(await CloudRestore.applyPending(dir, state), isTrue);
      expectTarget();
      expect(state.get('psygames_tokens_v1'), '{"nzt48":75}');
      expect(state.get('psygames_obsolete_progress'), isNull);
      expect(state.get('psygames.best.sudoku'), isNull);
      expect(await pending().exists(), isFalse);
      expect(
        CloudSnapshot.decode(await safety().readAsString()).data,
        portable,
      );
    },
  );

  test(
    'repeated apply does not duplicate sessions or credit earned points',
    () async {
      await CloudRestore.prepare(dir, state, target);
      expect(await CloudRestore.applyPending(dir, state), isTrue);
      final writes = state.writes.value;
      final backup = await safety().readAsString();
      expect(await CloudRestore.applyPending(dir, state), isFalse);
      expect(state.writes.value, writes);
      expectTarget();
      expect(await safety().readAsString(), backup);
    },
  );

  test('missing directory or journal is a no-op', () async {
    expect(
      await CloudRestore.applyPending(Directory('${dir.path}/missing'), state),
      isFalse,
    );
    expect(await CloudRestore.applyPending(dir, state), isFalse);
    expect(state.writes.value, 0);
    expect(await safety().exists(), isFalse);
  });

  test('empty target is refused both at prepare and startup', () async {
    final empty = CloudSnapshot.capture({});
    await expectLater(
      CloudRestore.prepare(dir, state, empty),
      throwsStateError,
    );
    expect(await pending().exists(), isFalse);
    await CloudRestore.prepare(dir, state, target);
    final journal = await readJournal();
    journal['after'] = jsonDecode(empty.encode());
    await writeJournal(journal);
    await expectLater(CloudRestore.applyPending(dir, state), throwsStateError);
    expect(state.writes.value, 0);
    expect(await pending().exists(), isTrue);
    expect(await safety().exists(), isFalse);
  });

  test(
    'invalid envelope or either snapshot causes no preference/backup writes',
    () async {
      await CloudRestore.prepare(dir, state, target);
      final valid = await readJournal();
      for (final corrupt in <Object?>[
        null,
        [],
        {},
        {...valid, 'schema': 2},
        {...valid, 'schema': 1.0},
        {...valid, 'extra': 'unexpected'},
        {'schema': 1, 'after': valid['after']},
        {...valid, 'before': null},
        {...valid, 'after': []},
        {
          ...valid,
          'before': {...valid['before'] as Map, 'schema': 99},
        },
        {
          ...valid,
          'before': {
            ...valid['before'] as Map,
            'data': {'psygames_device_id': 'forbidden'},
          },
        },
        {
          ...valid,
          'after': {
            ...valid['after'] as Map,
            'data': {'psygames_pet_name': 12},
          },
        },
        {
          ...valid,
          'after': {
            ...valid['after'] as Map,
            'data': {'psygames_cloud_token': 'forbidden'},
          },
        },
      ]) {
        await writeJournal(corrupt);
        final bytes = await pending().readAsString();
        await expectLater(
          CloudRestore.applyPending(dir, state),
          throwsFormatException,
        );
        expect(state.writes.value, 0);
        expect(
          state.snapshot(),
          {...portable, ...local}..remove('foreign.setting'),
        );
        expect(await safety().exists(), isFalse);
        expect(await pending().readAsString(), bytes);
      }
      await pending().writeAsString('{truncated');
      await expectLater(
        CloudRestore.applyPending(dir, state),
        throwsFormatException,
      );
      expect(state.writes.value, 0);
    },
  );

  test(
    'oversized snapshot inside journal is rejected before any writes',
    () async {
      await CloudRestore.prepare(dir, state, target);
      final journal = await readJournal();
      (journal['after'] as Map)['data'] = {
        'psygames_pet_name': 'a' * CloudSnapshot.maxDecodedBytes,
      };
      await writeJournal(journal);
      await expectLater(
        CloudRestore.applyPending(dir, state),
        throwsFormatException,
      );
      expect(state.writes.value, 0);
      expect(await pending().exists(), isTrue);
      expect(await safety().exists(), isFalse);
    },
  );

  test(
    'exception retains pending and original safety; retry completes',
    () async {
      await CloudRestore.prepare(dir, state, target);
      final original = await pending().readAsString();
      state.writesLeft = 1;
      await expectLater(
        CloudRestore.applyPending(dir, state),
        throwsStateError,
      );
      expect(
        state.writes.value,
        1,
        reason: 'interrupted after one completed preference operation',
      );
      expect(await pending().readAsString(), original);
      expect(
        CloudSnapshot.decode(await safety().readAsString()).data,
        portable,
      );
      state.writesLeft = null;
      expect(await CloudRestore.applyPending(dir, state), isTrue);
      expectTarget();
      expect(
        CloudSnapshot.decode(await safety().readAsString()).data,
        portable,
      );
      expect(await pending().exists(), isFalse);
    },
  );

  test(
    'restart from simulated partial and fully applied states is idempotent',
    () async {
      await CloudRestore.prepare(dir, state, target);
      final original = await pending().readAsString();
      await state.remove('psygames_obsolete_progress');
      await state.set('psygames_tokens_v1', target.data['psygames_tokens_v1']!);
      state.dispose();
      state = _InterruptingState(await SharedPreferences.getInstance());
      expect(await CloudRestore.applyPending(dir, state), isTrue);
      expectTarget();
      // Simulate process death after all state writes but before journal deletion.
      await pending().writeAsString(original, flush: true);
      final writes = state.writes.value;
      expect(await CloudRestore.applyPending(dir, state), isTrue);
      expect(state.writes.value, writes);
      expectTarget();
      expect(
        CloudSnapshot.decode(await safety().readAsString()).data,
        portable,
      );
    },
  );

  test('backup I/O failure leaves pending and makes no state writes', () async {
    await CloudRestore.prepare(dir, state, target);
    await Directory(safety().path).create();
    await expectLater(
      CloudRestore.applyPending(dir, state),
      throwsA(isA<FileSystemException>()),
    );
    expect(state.writes.value, 0);
    expect(await pending().exists(), isTrue);
    await Directory(safety().path).delete();
    expect(await CloudRestore.applyPending(dir, state), isTrue);
    expectTarget();
  });

  test('ignored storage writes do not silently retire the journal', () async {
    await CloudRestore.prepare(dir, state, target);
    state.ignoreWrites = true;
    await expectLater(CloudRestore.applyPending(dir, state), throwsStateError);
    expect(await pending().exists(), isTrue);
    state.ignoreWrites = false;
    expect(await CloudRestore.applyPending(dir, state), isTrue);
    expectTarget();
  });
}
