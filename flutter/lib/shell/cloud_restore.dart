import 'dart:convert';
import 'dart:io';

import 'cloud_snapshot.dart';
import 'shared_state.dart';

/// Restart-only restore journal. No gameplay, wallet, session or startup hooks.
///
/// The caller must stop gameplay before prepare and call applyPending at startup
/// BEFORE constructing WebView/gameplay consumers. Preferences are replaced one
/// key at a time, not transactionally; a crash leaves pending for idempotent retry.
/// File contents are flushed before same-directory atomic rename. This does not
/// provide directory fsync or stronger durability than SharedState's write API.
class CloudRestore {
  static const pendingFileName = 'cloud_restore.pending.json';
  static const safetyFileName = 'cloud_restore.safety.json';
  static const _lockFileName = '.cloud_restore.lock';
  static const _maxJournalBytes = 2 * CloudSnapshot.maxDecodedBytes + 128;
  static final _activeDirectories = <String>{};

  /// Saves one complete before/after journal without changing preferences.
  /// Existing pending (including a corrupt journal) is never replaced.
  static Future<void> prepare(
    Directory dir,
    SharedState state,
    CloudSnapshot target,
  ) async {
    await dir.create(recursive: true);
    await _locked<void>(dir, () async {
      final pending = _file(dir, pendingFileName);
      if (await pending.exists()) {
        throw StateError('A cloud restore is already pending');
      }
      final after = CloudSnapshot.decode(target.encode());
      _requireNonEmpty(after);
      final before = CloudSnapshot.capture(state.snapshot());
      final journal = jsonEncode({
        'schema': 1,
        'before': jsonDecode(before.encode()),
        'after': jsonDecode(after.encode()),
      });
      await _atomicWrite(dir, pending, journal);
    });
  }

  /// Returns false only when no pending journal exists, true after completion.
  /// Validation/I/O/state exceptions propagate; pending remains available to retry.
  /// The original portable before-image is retained as [safetyFileName].
  static Future<bool> applyPending(Directory dir, SharedState state) async {
    if (!await dir.exists()) return false;
    return _locked<bool>(dir, () async {
      final pending = _file(dir, pendingFileName);
      if (!await pending.exists()) return false;
      if (await pending.length() > _maxJournalBytes) {
        throw const FormatException('Restore journal exceeds size limit');
      }
      final encoded = await pending.readAsString();
      if (utf8.encode(encoded).length > _maxJournalBytes) {
        throw const FormatException('Restore journal exceeds size limit');
      }
      final journal = jsonDecode(encoded);
      if (journal is! Map<String, dynamic> ||
          journal.length != 3 ||
          journal['schema'] is! int ||
          journal['schema'] != 1 ||
          !journal.containsKey('before') ||
          !journal.containsKey('after')) {
        throw const FormatException('Invalid restore journal');
      }
      // Validate BOTH complete images before any backup or preference writes.
      final before = CloudSnapshot.decode(jsonEncode(journal['before']));
      final after = CloudSnapshot.decode(jsonEncode(journal['after']));
      _requireNonEmpty(after);

      // Always use the journal's original before-image, never a partially
      // restored current state. Repeating this write after interruption is safe.
      await _atomicWrite(dir, _file(dir, safetyFileName), before.encode());
      for (final key in state.snapshot().keys) {
        if (CloudSnapshot.portableKey(key) && !after.data.containsKey(key)) {
          await state.remove(key);
        }
      }
      for (final entry in after.data.entries) {
        await state.set(entry.key, entry.value);
      }
      // Do not retire pending if a storage implementation silently ignored a
      // write. This checks observable state, not physical preference disk sync.
      final actual = state.snapshot();
      final portableKeys = actual.keys.where(CloudSnapshot.portableKey);
      if (portableKeys.length != after.data.length ||
          after.data.entries.any((entry) => actual[entry.key] != entry.value)) {
        throw StateError('Restore replacement verification failed');
      }
      await pending.delete();
      return true;
    });
  }

  static void _requireNonEmpty(CloudSnapshot target) {
    if (target.data.isEmpty) {
      throw StateError('Refusing an empty restore target');
    }
  }

  static File _file(Directory dir, String name) =>
      File('${dir.path}${Platform.pathSeparator}$name');

  static Future<void> _atomicWrite(
    Directory dir,
    File destination,
    String contents,
  ) async {
    final staging = await dir.createTemp('.cloud_restore-');
    try {
      final temp = _file(staging, 'journal.tmp');
      await temp.writeAsString(contents, flush: true);
      await temp.rename(destination.path);
    } finally {
      await staging.delete(recursive: true);
    }
  }

  static Future<T> _locked<T>(
    Directory dir,
    Future<T> Function() operation,
  ) async {
    final identity = await dir.resolveSymbolicLinks();
    // OS locks alone may be process-scoped; guard same-process calls as well.
    if (!_activeDirectories.add(identity)) {
      throw StateError('A cloud restore operation is already running');
    }
    RandomAccessFile? handle;
    var locked = false;
    try {
      handle = await _file(dir, _lockFileName).open(mode: FileMode.append);
      await handle.lock(FileLock.exclusive);
      locked = true;
      return await operation();
    } finally {
      try {
        if (locked) await handle!.unlock();
      } finally {
        try {
          await handle?.close();
        } finally {
          _activeDirectories.remove(identity);
        }
      }
      // Keep the lock inode: unlinking it would allow two different locks for
      // the same directory while another process still holds the old inode.
    }
  }
}
