import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'cloud_backup.dart';
import 'cloud_snapshot.dart';
import 'shared_state.dart';

/// Host boundary for the isolated pilot. No production/default implementation:
/// settings may receive a configured adapter only after the live environment gate.
/// An adapter MUST fence late requests after suspend, including enable/save.
abstract interface class CloudPilotGateway {
  String get issuer;
  String? get accountId;
  String? get email;
  Future<void> requestLink(String email);
  Future<void> completeLink(Uri uri);
  Future<List<CloudVersion>> versions();
  Future<void> enableBackup();
  Future<void> save({required bool keepLocalAfterConflict});
  Future<CloudSnapshot> download(CloudVersion version);
  Future<void> prepareRestore(CloudSnapshot snapshot);
  Future<void> deleteCopies();
  Future<void> signOut();
  void suspend();
}

enum CloudPilotStage {
  local,
  explanation,
  login,
  linkSent,
  history,
  ready,
  restoring,
  restorePrepared,
}

/// UI lifecycle only, never a second wallet/session writer. Merely opening this
/// controller/screen performs no auth recovery, cloud reads or consent writes.
class CloudPilot extends ChangeNotifier {
  CloudPilot(this.state, this.gateway);

  static const receiptKey = '${SharedState.prefix}cloud_consent_receipt_v1';
  static const policyVersion = 1;
  final SharedState state;
  final CloudPilotGateway gateway;
  CloudPilotStage stage = CloudPilotStage.local;
  List<CloudVersion> versions = const [];
  CloudSnapshot? preview;
  String? errorKey;
  bool busy = false;
  bool conflict = false;
  int _generation = 0;
  bool _disposed = false;
  String? _owner;
  String? _issuer;
  Future<void> _storage = Future.value();

  bool get enabled => stage == CloudPilotStage.ready;
  String? get email => gateway.email;
  bool _current(int generation) => !_disposed && generation == _generation;
  bool get _bound =>
      _owner != null &&
      gateway.accountId == _owner &&
      gateway.issuer == _issuer;
  void _notify() {
    if (!_disposed) notifyListeners();
  }

  void begin() {
    if (stage != CloudPilotStage.local || busy) return;
    errorKey = null;
    stage = CloudPilotStage.explanation;
    _notify();
  }

  /// Temporary permission for the requested login, NOT permission to upload.
  void acceptExplanation() {
    if (stage != CloudPilotStage.explanation) return;
    stage = CloudPilotStage.login;
    _notify();
  }

  Future<bool> _run(Future<void> Function(int generation) operation) async {
    if (_disposed || busy) return false;
    final generation = _generation;
    busy = true;
    errorKey = null;
    _notify();
    try {
      await operation(generation);
      return _current(generation);
    } catch (e) {
      if (_current(generation)) {
        conflict = e is CloudConflict;
        errorKey = conflict ? 'cloudPilotConflict' : 'cloudPilotError';
      }
      return false;
    } finally {
      if (_current(generation)) {
        busy = false;
        _notify();
      }
    }
  }

  Future<void> sendLink(String email) async {
    if (stage != CloudPilotStage.login) return;
    final value = email.trim();
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(value)) {
      errorKey = 'cloudPilotEmailInvalid';
      _notify();
      return;
    }
    await _run((generation) async {
      await gateway.requestLink(value);
      if (_current(generation)) stage = CloudPilotStage.linkSent;
    });
  }

  /// Called by the future native deep-link host, not a paste-token UI.
  Future<void> completeLink(Uri uri) async {
    if (stage != CloudPilotStage.linkSent) return;
    await _run((generation) async {
      await gateway.completeLink(uri);
      if (!_current(generation)) return;
      final owner = gateway.accountId;
      if (owner == null) throw StateError('Missing account');
      _owner = owner;
      _issuer = gateway.issuer;
      final rows = await gateway.versions();
      if (!_current(generation)) return;
      if (!_bound) throw StateError('Account changed');
      versions = List.unmodifiable(rows);
      stage = CloudPilotStage.history;
    });
  }

  /// Serializes app receipt writes so OFF follows any already-started ON write.
  Future<void> _write(Future<void> Function() action) {
    final next = _storage.then((_) => action());
    _storage = next.catchError((Object _) {});
    return next;
  }

  /// Explicit history-link choice. Existing remote data is never overwritten
  /// here; first save must still apply the existing CloudBackup conflict gate.
  Future<void> confirmHistory() async {
    if (stage != CloudPilotStage.history || !_bound || busy) return;
    final generationBefore = _generation;
    final accepted = await _run((generation) async {
      final receipt = jsonEncode({
        'version': policyVersion,
        'app_id': 'psygames',
        'issuer': _issuer,
        'account_id': _owner,
        'accepted_at': DateTime.now().toUtc().toIso8601String(),
      });
      await _write(() async {
        if (!_current(generation) || !_bound) return;
        // Permission to send is LAST, after the exact scope is persisted.
        await state.set(receiptKey, receipt);
        if (!_current(generation) || !_bound) return;
        await state.set(CloudBackup.accountKey, _owner!);
        if (!_current(generation) || !_bound) return;
        await state.set(CloudBackup.consentKey, '1');
      });
      if (!_current(generation)) return;
      if (!_bound) throw StateError('Account changed');
      await gateway.enableBackup();
      if (!_current(generation)) return;
      if (!_bound) throw StateError('Account changed');
      stage = CloudPilotStage.ready;
    });
    if (!accepted && _current(generationBefore)) {
      await disable();
      errorKey = 'cloudPilotError';
      _notify();
    }
  }

  Future<void> save({bool keepLocalAfterConflict = false}) async {
    if (!enabled || !_bound) return;
    await _run((generation) async {
      await gateway.save(keepLocalAfterConflict: keepLocalAfterConflict);
      if (!_current(generation) || !_bound) return;
      final rows = await gateway.versions();
      if (!_current(generation) || !_bound) return;
      versions = List.unmodifiable(rows);
      conflict = false;
    });
  }

  Future<void> previewVersion(CloudVersion version) async {
    if ((stage != CloudPilotStage.history && !enabled) ||
        !_bound ||
        !versions.contains(version)) {
      return;
    }
    await _run((generation) async {
      final copy = await gateway.download(version);
      if (_current(generation) && _bound) {
        if (copy.data.isEmpty) throw StateError('Empty restore');
        preview = copy;
      }
    });
  }

  void cancelPreview() {
    preview = null;
    _notify();
  }

  Future<void> confirmRestore() async {
    final copy = preview;
    if (copy == null || !_bound || busy) return;
    final generationBefore = _generation;
    // Once an explicitly confirmed disk journal may be in flight, do not offer
    // a pretend cancellation that could leave a hidden pending restore behind.
    stage = CloudPilotStage.restoring;
    final prepared = await _run((generation) async {
      // Pause outgoing saves BEFORE preparing the before/after journal.
      gateway.suspend();
      await _write(() => state.set(CloudBackup.consentKey, '0'));
      if (!_current(generation)) return;
      await gateway.prepareRestore(copy);
      if (_current(generation)) {
        preview = null;
        stage = CloudPilotStage.restorePrepared;
      }
    });
    if (!prepared && _current(generationBefore)) {
      stage = CloudPilotStage.history;
      await disable();
      errorKey = 'cloudPilotError';
      _notify();
    }
  }

  /// OFF remains available even during pending auth/read/save. Local gameplay
  /// keys, wallet and remote copies are not erased; late completions are ignored.
  Future<void> disable() async {
    if (_disposed || stage == CloudPilotStage.restoring) return;
    _generation++;
    gateway.suspend();
    stage = CloudPilotStage.local;
    busy = false;
    conflict = false;
    errorKey = null;
    _owner = null;
    _issuer = null;
    preview = null;
    versions = const [];
    _notify();
    try {
      await _write(() async {
        await state.set(CloudBackup.consentKey, '0');
        await state.remove(receiptKey);
      });
    } catch (_) {
      errorKey = 'cloudPilotError';
      _notify();
    }
  }

  Future<void> signOut() async {
    await disable();
    await _run((_) => gateway.signOut());
  }

  /// UI must separately explain/confirm remote deletion before invoking this.
  Future<void> deleteCopies() async {
    if (!enabled || !_bound) return;
    var removed = false;
    await _run((generation) async {
      await gateway.deleteCopies();
      removed = _current(generation);
    });
    if (removed) await disable();
  }

  @override
  void dispose() {
    _disposed = true;
    _generation++;
    gateway.suspend();
    super.dispose();
  }
}
