import 'dart:async';
import 'dart:convert';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter/foundation.dart';

import 'cloud_snapshot.dart';
import 'shared_state.dart';

class CloudConflict implements Exception {}

class CloudVersion {
  const CloudVersion(this.id, this.revision, this.createdAt);
  final String id;
  final int revision;
  final DateTime createdAt;
  factory CloudVersion.read(Map<String, dynamic> row) => CloudVersion(
    row['id'] as String, (row['revision'] as num).toInt(), DateTime.parse(row['created_at'] as String),
  );
}

/// Backups only: this service never awards money, creates sessions or advances
/// levels. The current gameplay writer remains the single accounting authority.
class CloudBackup extends ChangeNotifier {
  CloudBackup(this.state, this.account);
  static const consentKey = '${SharedState.prefix}cloud_consent_v1';
  static const revisionKey = '${SharedState.prefix}cloud_revision_v1';
  static const accountKey = '${SharedState.prefix}cloud_owner_v1';
  static const table = 'psygames_cloud_snapshots';
  final SharedState state;
  final EcosystemAccount account;
  Timer? _timer;
  int _generation = 0;
  bool _busy = false;
  bool _dirtyDuringSave = false;
  bool _disposed = false;
  bool conflict = false;
  String? error;
  String? _savedContent;
  bool get enabled => state.get(consentKey) == '1';
  bool get busy => _busy;

  Future<void> start() async {
    state.writes.addListener(_changed);
    if (!enabled) return;
    final expected = state.get(accountKey);
    if (expected == null || expected.isEmpty) { error = 'account'; _notify(); return; }
    try {
      if (await account.resume(consent: true, expectedAccountId: expected)) { _changed(); }
      else { error = 'account'; _notify(); }
    } catch (_) { error = 'account'; _notify(); }
  }

  /// Called only after the user explicitly accepted cloud storage and completed
  /// account sign-in. A different account never inherits another owner's cursor.
  Future<void> enable() async {
    final id = account.accountId;
    if (id == null) throw StateError('Sign in before enabling backups');
    if (state.get(accountKey) != id) {
      _generation++;
      _savedContent = null;
      conflict = false;
      error = null;
      await state.remove(revisionKey);
      await state.set(accountKey, id);
    }
    await state.set(consentKey, '1');
    _changed();
    _notify();
  }

  Future<void> disable() async {
    // Stop local sends immediately, before any awaited disk/bridge operation.
    _generation++;
    _timer?.cancel();
    account.suspend();
    await state.set(consentKey, '0');
    _notify();
  }

  void _changed() {
    if (_disposed || !enabled || account.accountId == null || conflict) return;
    if (_busy) { _dirtyDuringSave = true; return; }
    _timer?.cancel();
    // Coalesce interactive changes. Keep multiple meaningful versions rather
    // than consuming all ten copies for individual keystrokes in one round.
    _timer = Timer(const Duration(minutes: 2), () {
      unawaited(save().catchError((Object _) {}));
    });
  }

  bool _current(int generation, String owner) => !_disposed && enabled &&
      generation == _generation && account.accountId == owner;

  Future<List<CloudVersion>> versions() async {
    final owner = account.accountId;
    if (owner == null) throw StateError('Account required');
    final generation = _generation;
    final rows = await account.from(table)
      .select('id,revision,created_at').eq('owner_id', owner)
      .order('revision', ascending: false).limit(10).timeout(const Duration(seconds: 15));
    if (_disposed || generation != _generation || owner != account.accountId) {
      throw StateError('Cloud operation cancelled');
    }
    return [for (final row in rows) CloudVersion.read(row)];
  }

  Future<void> save({bool keepLocalAfterConflict = false}) async {
    final owner = account.accountId;
    if (!enabled || owner == null || _busy) return;
    final generation = _generation;
    final snapshot = CloudSnapshot.capture(state.snapshot());
    if (snapshot.data.isEmpty) return;
    final content = jsonEncode(snapshot.data);
    if (content == _savedContent && !keepLocalAfterConflict) return;
    _busy = true; _dirtyDuringSave = false; error = null; _notify();
    try {
      final existing = await versions();
      if (!_current(generation, owner)) return;
      final latest = existing.isEmpty ? 0 : existing.first.revision;
      final known = int.tryParse(state.get(revisionKey) ?? '') ?? 0;
      if (latest != known && !keepLocalAfterConflict) {
        conflict = true;
        throw CloudConflict();
      }
      final row = await account.from(table).insert({
        'owner_id': owner, 'payload': jsonDecode(snapshot.encode()),
      }).select('id,revision,created_at').single().timeout(const Duration(seconds: 15));
      if (!_current(generation, owner)) return;
      await state.set(revisionKey, '${CloudVersion.read(row).revision}');
      _savedContent = content;
      conflict = false;
    } catch (e) {
      if (_current(generation, owner)) error = e is CloudConflict ? 'conflict' : 'network';
      rethrow;
    } finally {
      _busy = false;
      if (_current(generation, owner) && (_dirtyDuringSave || error == 'network')) _changed();
      _notify();
    }
  }

  Future<CloudSnapshot> download(CloudVersion version) async {
    final owner = account.accountId;
    if (owner == null) throw StateError('Account required');
    final generation = _generation;
    final row = await account.from(table).select('payload')
      .eq('owner_id', owner).eq('id', version.id).single().timeout(const Duration(seconds: 15));
    if (_disposed || generation != _generation || owner != account.accountId) {
      throw StateError('Cloud operation cancelled');
    }
    // Never apply unvalidated cloud data, even if the server returned HTTP 200.
    return CloudSnapshot.decode(jsonEncode(row['payload']));
  }

  /// Explicit deletion, separate from opt-out. Local gameplay state is untouched.
  /// Caller reauthenticates if required and confirms this irreversible action.
  Future<void> deleteCopies() async {
    final owner = account.accountId;
    if (owner == null) throw StateError('Account required');
    final generation = ++_generation;
    _timer?.cancel();
    await account.from(table).delete().eq('owner_id', owner)
      .timeout(const Duration(seconds: 15));
    if (_disposed || generation != _generation || owner != account.accountId) {
      throw StateError('Cloud operation cancelled');
    }
    await state.remove(revisionKey);
    _savedContent = null;
    conflict = false;
    await disable();
  }

  void _notify() { if (!_disposed) notifyListeners(); }
  @override
  void dispose() {
    _disposed = true;
    _generation++;
    _timer?.cancel();
    state.writes.removeListener(_changed);
    super.dispose();
  }
}
