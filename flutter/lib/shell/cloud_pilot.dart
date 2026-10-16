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

/// Optional persisted login-intent capability. Opening settings never calls it.
abstract interface class CloudColdCallbackGateway {
  Future<bool> hasPendingLogin(Uri uri);
}

abstract interface class CloudResumeGateway {
  Future<bool> resumeBackup();
}

abstract interface class CloudAcknowledgedGateway {
  String? get acknowledgedContent;
  bool get hasPendingSave;
}

abstract interface class CloudAccountDeletionGateway {
  Future<void> deleteAccount();
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
  CloudPilot(this.state, this.gateway) {
    state.writes.addListener(_changed);
  }

  static const receiptKey = '${SharedState.prefix}cloud_consent_receipt_v1';
  // Separate from legacy CloudBackup/frontend cloudConsent: enabling this
  // shared backup must NOT start the old Web outbox/API as a second sender.
  static const consentKey = '${SharedState.prefix}ecosystem_cloud_consent_v1';
  static const policyVersion = 1;
  final SharedState state;
  final CloudPilotGateway gateway;
  CloudPilotStage stage = CloudPilotStage.local;
  List<CloudVersion> versions = const [];
  CloudSnapshot? preview;
  String? errorKey;
  bool busy = false;
  bool conflict = false;
  bool historyLoaded = false;
  int _generation = 0;
  bool _disposed = false;
  String? _owner;
  String? _issuer;
  Future<void> _storage = Future.value();
  Timer? _backupTimer;
  String? _savedContent;
  bool _dirty = false;

  String _content() => jsonEncode(CloudSnapshot.capture(state.snapshot()).data);
  bool get _hasPendingSave =>
      gateway is CloudAcknowledgedGateway &&
      (gateway as CloudAcknowledgedGateway).hasPendingSave;

  void _changed() {
    if (_disposed || !enabled || !_bound || conflict) return;
    try {
      if (!_hasPendingSave && _content() == _savedContent) return;
    } catch (_) {
      // A backup limit or serialization error must not break a gameplay write.
      errorKey = 'cloudPilotError';
      return;
    }
    _dirty = true;
    _backupTimer?.cancel();
    _backupTimer = Timer(const Duration(minutes: 2), () {
      unawaited(flushChanges());
    });
  }

  /// Best-effort dispatch of changed portable data; never blocks local gameplay.
  Future<void> flushChanges() async {
    _backupTimer?.cancel();
    if (_disposed || !enabled || !_bound || conflict || busy || !_dirty) return;
    await save();
  }

  /// Only a prior exact app/account consent may recover protected credentials.
  /// A pending cold login has precedence in the real gateway.
  Future<void> resumeExisting() async {
    if (stage != CloudPilotStage.local ||
        busy ||
        state.get(consentKey) != '1' ||
        gateway is! CloudResumeGateway) {
      return;
    }
    await _run((generation) async {
      if (!await (gateway as CloudResumeGateway).resumeBackup()) return;
      if (!_current(generation)) return;
      _owner = gateway.accountId;
      _issuer = gateway.issuer;
      if (_owner == null || !_bound) throw StateError('Account changed');
      versions = List.unmodifiable(await gateway.versions());
      if (!_current(generation) || !_bound) return;
      historyLoaded = true;
      stage = CloudPilotStage.ready;
      _savedContent = gateway is CloudAcknowledgedGateway
          ? (gateway as CloudAcknowledgedGateway).acknowledgedContent
          : _content();
      _dirty = _hasPendingSave || _content() != _savedContent;
    });
    if (enabled && _dirty) _changed();
  }

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
    final cold =
        stage == CloudPilotStage.local && gateway is CloudColdCallbackGateway;
    if (stage != CloudPilotStage.linkSent && !cold) return;
    await _run((generation) async {
      if (cold &&
          !await (gateway as CloudColdCallbackGateway).hasPendingLogin(uri)) {
        return;
      }
      if (!_current(generation)) return;
      await gateway.completeLink(uri);
      if (!_current(generation)) return;
      final owner = gateway.accountId;
      if (owner == null) throw StateError('Missing account');
      _owner = owner;
      _issuer = gateway.issuer;
      // The code is consumed and the account is bound already. A failed GET
      // must offer metadata-only retry, never exchange this code a second time.
      stage = CloudPilotStage.history;
      historyLoaded = false;
      final rows = await gateway.versions();
      if (!_current(generation)) return;
      if (!_bound) throw StateError('Account changed');
      versions = List.unmodifiable(rows);
      historyLoaded = true;
    });
  }

  Future<void> refreshHistory() async {
    if ((stage != CloudPilotStage.history && !enabled) || !_bound) return;
    await _run((generation) async {
      final rows = await gateway.versions();
      if (!_current(generation) || !_bound) return;
      versions = List.unmodifiable(rows);
      historyLoaded = true;
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
    if (stage != CloudPilotStage.history || !historyLoaded || !_bound || busy) {
      return;
    }
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
        await state.set(CloudPilot.consentKey, '1');
      });
      if (!_current(generation)) return;
      if (!_bound) throw StateError('Account changed');
      await gateway.enableBackup();
      if (!_current(generation)) return;
      if (!_bound) throw StateError('Account changed');
      stage = CloudPilotStage.ready;
      _savedContent = gateway is CloudAcknowledgedGateway
          ? (gateway as CloudAcknowledgedGateway).acknowledgedContent
          : _content();
      _dirty = _hasPendingSave || _content() != _savedContent;
    });
    if (!accepted && _current(generationBefore)) {
      await disable();
      errorKey = 'cloudPilotError';
      _notify();
    }
    if (accepted && enabled && _dirty) _changed();
  }

  Future<void> save({bool keepLocalAfterConflict = false}) async {
    if (!enabled || !_bound) return;
    await _run((generation) async {
      final content = _content();
      await gateway.save(keepLocalAfterConflict: keepLocalAfterConflict);
      if (!_current(generation) || !_bound) return;
      _savedContent = gateway is CloudAcknowledgedGateway
          ? (gateway as CloudAcknowledgedGateway).acknowledgedContent
          : content;
      _dirty = _content() != _savedContent;
      final rows = await gateway.versions();
      if (!_current(generation) || !_bound) return;
      versions = List.unmodifiable(rows);
      conflict = false;
    });
    if (_dirty && errorKey == null) _changed();
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
      await _write(() => state.set(CloudPilot.consentKey, '0'));
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
    _backupTimer?.cancel();
    _dirty = false;
    _savedContent = null;
    gateway.suspend();
    stage = CloudPilotStage.local;
    busy = false;
    conflict = false;
    errorKey = null;
    _owner = null;
    _issuer = null;
    preview = null;
    versions = const [];
    historyLoaded = false;
    _notify();
    try {
      await _write(() async {
        await state.set(CloudPilot.consentKey, '0');
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

  bool get canDeleteAccount =>
      enabled && _bound && gateway is CloudAccountDeletionGateway;

  /// Explicit UI confirmation covers the shared account, not just this app.
  /// Failure can follow successful session revocation, so reconnect explicitly.
  Future<void> deleteAccount() async {
    if (!canDeleteAccount || busy) return;
    final generation = _generation;
    var confirmed = false;
    await _run((_) async {
      await (gateway as CloudAccountDeletionGateway).deleteAccount();
      confirmed = _current(generation);
    });
    if (!_current(generation)) return;
    await disable();
    if (!confirmed) {
      errorKey = 'cloudPilotAccountDeleteError';
      _notify();
    }
  }

  @override
  void dispose() {
    state.writes.removeListener(_changed);
    _backupTimer?.cancel();
    _disposed = true;
    _generation++;
    gateway.suspend();
    super.dispose();
  }
}
