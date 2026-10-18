import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/sudoku_support_recovery.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'sudoku_support_recovery_test.dart'
    show journal, journalKey, levelKey, resumeKey;

/// Models a platform returning false AFTER the legacy plugin changed its cache.
class _RefusingPrefs implements SharedPreferences {
  final values = <String, String>{};
  @override
  Set<String> getKeys() => values.keys.toSet();
  @override
  String? getString(String key) => values[key];
  @override
  Future<bool> setString(String key, String value) async {
    values[key] = value;
    return false;
  }

  @override
  Future<bool> remove(String key) async {
    values.remove(key);
    return false;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _TwoLayerPrefs implements SharedPreferences {
  _TwoLayerPrefs(Map<String, String> initial)
    : cache = Map.of(initial),
      disk = Map.of(initial);
  final Map<String, String> cache, disk;
  bool failCompleted = true;
  @override
  Set<String> getKeys() => cache.keys.toSet();
  @override
  String? getString(String key) => cache[key];
  @override
  Future<bool> setString(String key, String value) async {
    cache[key] = value;
    if (failCompleted &&
        key == journalKey &&
        value.contains('"phase":"completed"')) {
      return false;
    }
    disk[key] = value;
    return true;
  }

  @override
  Future<bool> remove(String key) async {
    cache.remove(key);
    disk.remove(key);
    return true;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  test(
    'cached completed receipt cannot bypass failed disk barrier on retry exit',
    () async {
      final prefs = _TwoLayerPrefs({
        journalKey: jsonEncode(journal()),
        levelKey: '78',
        resumeKey: 'original board',
      });
      final s = SharedState(prefs);
      addTearDown(s.dispose);
      await expectLater(recoverSudokuSupportWrites(s), throwsStateError);
      expect(prefs.cache[journalKey], contains('"phase":"completed"'));
      expect(prefs.disk[journalKey], contains('"phase":"prepared"'));
      await expectLater(recoverSudokuSupportWrites(s), throwsStateError);
      expect(prefs.disk[journalKey], contains('"phase":"prepared"'));
      prefs.failCompleted = false;
      await recoverSudokuSupportWrites(s);
      expect(prefs.disk[journalKey], contains('"phase":"completed"'));
      await s.set(resumeKey, 'new board');
      final rebootPrefs = _TwoLayerPrefs(prefs.disk)..failCompleted = false;
      final reboot = SharedState(rebootPrefs);
      addTearDown(reboot.dispose);
      await recoverSudokuSupportWrites(reboot);
      expect(reboot.get(resumeKey), 'new board');
      expect(reboot.get(levelKey), '80');
    },
  );
  test(
    'recovery cannot clear a board after an unconfirmed journal write',
    () async {
      final prefs = _RefusingPrefs()
        ..values.addAll({
          journalKey: jsonEncode(journal()),
          levelKey: '78',
          resumeKey: 'original board',
        });
      final s = SharedState(prefs);
      addTearDown(s.dispose);
      await expectLater(recoverSudokuSupportWrites(s), throwsStateError);
      expect(s.get(resumeKey), 'original board');
      expect(s.get(levelKey), '78');
    },
  );
  test('false platform write is not acknowledged by cache readback', () async {
    final prefs = _RefusingPrefs();
    final s = SharedState(prefs);
    addTearDown(s.dispose);
    await expectLater(
      s.set('psygames_cloud_support_journal_fixture', 'prepared'),
      throwsStateError,
    );
    expect(s.writes.value, 0);
  });
  test('false platform removal is not acknowledged by empty cache', () async {
    final prefs = _RefusingPrefs()
      ..values['psygames_resume_sudoku_women'] = 'original';
    final s = SharedState(prefs);
    addTearDown(s.dispose);
    await expectLater(
      s.remove('psygames_resume_sudoku_women'),
      throwsStateError,
    );
    expect(s.writes.value, 0);
  });
}
