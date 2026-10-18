import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter/foundation.dart';

import '../games/sudoku/roads.dart';
import 'cloud_snapshot.dart';
import 'shared_state.dart';
import 'sudoku_support_correction.dart';

/// Account-screen-only adapter. No listeners, timers, login, or backup consent
/// mutations. The host must call [suspend] synchronously on OFF/identity handoff
/// (including an OFF -> ON transition), and before leaving the account screen.
/// Await outstanding calls before allowing gameplay/local account replacement:
/// SharedState cannot cancel a platform write already dispatched to storage.
class SudokuSupportService extends ChangeNotifier {
  SudokuSupportService({
    required SharedState state,
    required EcosystemAccount account,
    required bool Function() backupEnabled,
    DateTime Function()? now,
  }) : _state = state, // ignore: prefer_initializing_formals
       _account = account, // ignore: prefer_initializing_formals
       _backupEnabled = backupEnabled, // ignore: prefer_initializing_formals
       _now = now ?? DateTime.now;

  final SharedState _state;
  final EcosystemAccount _account;
  final bool Function() _backupEnabled;
  final DateTime Function() _now;
  int _generation = 0;
  bool _disposed = false;
  String? _owner;
  bool _busy = false;
  String? _error;
  bool _needsResumeChoice = false;
  List<Map<String, dynamic>> _grants = const [];
  List<Map<String, dynamic>> _corrections = const [];
  final Set<Future<void>> _inflight = {};

  bool get ready {
    _sync();
    return _owner != null;
  }

  String? get ownerId {
    _sync();
    return _owner;
  }

  bool get busy {
    _sync();
    return _busy;
  }

  /// Null or a stable code; never provider bodies, identifiers, or local bytes.
  String? get error {
    _sync();
    return _error;
  }

  bool get needsResumeChoice {
    _sync();
    return _needsResumeChoice;
  }

  /// Read-only local safety gate, independent of backup consent and suspend().
  /// Only a prepared intent can still write gameplay keys. Completed receipts
  /// may defer ACK without blocking a new board. Malformed journals fail closed.
  /// With a live owner, inspect ONLY that owner's journal; with no identity,
  /// conservatively inspect retained journals rather than treating logout/OFF
  /// as proof of completion. The host must also gate gameplay on cold startup.
  bool get hasPendingLocalWrite {
    try {
      final owner = _account.accountId;
      final keys = owner != null
          ? [_journalKey((0, owner))]
          : _state.snapshot().keys.where(
              (k) => k.startsWith('psygames_cloud_support_journal_'),
            );
      var pending = false;
      for (final key in keys) {
        final raw = _state.get(key);
        if (raw == null) continue;
        try {
          final env = jsonDecode(raw) as Map;
          final journalOwner = env['owner_id'];
          final entries = env['entries'];
          if (env['version'] is! int ||
              env['version'] != 1 ||
              journalOwner is! String ||
              journalOwner.isEmpty ||
              (owner != null && journalOwner != owner) ||
              env['issuer'] != _account.issuer ||
              key != _journalKey((0, journalOwner)) ||
              entries is! List ||
              entries.length > 100) {
            return true;
          }
          final ids = <String>{};
          for (final entry in entries) {
            if (entry is! Map ||
                !['prepared', 'completed', 'acked'].contains(entry['phase']) ||
                entry['restart'] is! bool ||
                (entry['resume'] != null && entry['resume'] is! String)) {
              return true;
            }
            final record = entry['record'];
            if (record is! Map ||
                _identityFields.any(
                  (k) => k == 'grant_revision' || k == 'target_level'
                      ? record[k] is! int
                      : record[k] is! String,
                )) {
              return true;
            }
            final road = sudokuRoadOf(record['road'] as String);
            if (record['owner_id'] != journalOwner ||
                record['app_id'] != 'psygames' ||
                (record['id'] as String).isEmpty ||
                !ids.add(record['id'] as String) ||
                (record['grant_id'] as String).isEmpty ||
                (record['grant_revision'] as int) < 1 ||
                (record['grant_revision'] as int) > 9007199254740991 ||
                (record['target_level'] as int) < 1 ||
                (record['target_level'] as int) > 180 ||
                !RegExp(r'^[a-z][a-z0-9-]{0,63}$')
                    .hasMatch(record['profile'] as String) ||
                road == null ||
                record['game_id'] != 'sudoku' ||
                record['operation'] != 'unlock_at_least' ||
                record['key_scope'] !=
                    sudokuLevelKey(record['profile'] as String, road)) {
              return true;
            }
            pending |= entry['phase'] == 'prepared';
          }
        } catch (_) {
          return true;
        }
      }
      return pending;
    } catch (_) {
      return true; // Includes unreadable storage/namespace enumeration.
    }
  }

  List<Map<String, dynamic>> get grants {
    _sync();
    return _grants;
  }

  List<Map<String, dynamic>> get corrections {
    _sync();
    return _corrections;
  }

  void _sync() {
    final owner = !_disposed && _account.appId == 'psygames' && _backupEnabled()
        ? _account.accountId
        : null;
    if (_owner == owner) return;
    _owner = owner;
    _reset();
  }

  void _reset() {
    _generation++;
    _busy = false;
    _error = null;
    _needsResumeChoice = false;
    _grants = const [];
    _corrections = const [];
  }

  /// Cancels only this adapter. The shared EcosystemAccount belongs to CloudPilot.
  void suspend() {
    _reset();
    if (!_disposed) notifyListeners();
  }

  /// Call after suspend(), before gameplay or local owner-state replacement.
  /// This includes storage calls that were already dispatched before OFF.
  Future<void> drain() async {
    while (_inflight.isNotEmpty) {
      await Future.wait(_inflight.toList());
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _reset();
    super.dispose();
  }

  void _guard((int, String) token) {
    _sync();
    if (_disposed || token.$1 != _generation || token.$2 != _owner) {
      throw const _SupportFault('cancelled');
    }
  }

  Future<void> _run(Future<void> Function((int, String)) action) {
    final done = Completer<void>();
    _inflight.add(done.future);
    unawaited(_track(action, done));
    return done.future;
  }

  Future<void> _track(
    Future<void> Function((int, String)) action,
    Completer<void> done,
  ) async {
    try {
      await _execute(action);
      done.complete();
    } catch (e, stack) {
      done.completeError(e, stack);
    } finally {
      _inflight.remove(done.future);
    }
  }

  Future<void> _execute(Future<void> Function((int, String)) action) async {
    _sync();
    if (_owner == null || _busy || _disposed) return;
    final token = (++_generation, _owner!);
    _busy = true;
    _error = null;
    _needsResumeChoice = false;
    notifyListeners();
    try {
      _guard(token);
      await action(token);
      _guard(token);
    } catch (e) {
      _sync();
      if (_generation == token.$1 && _owner == token.$2) {
        _error = e is _SupportFault
            ? e.code
            : e is SudokuSupportCorrectionException
            ? e.code.name
            : 'operation_failed';
      }
    } finally {
      _sync();
      if (!_disposed && _generation == token.$1 && _owner == token.$2) {
        _busy = false;
        notifyListeners();
      }
    }
  }

  static const _grantTable = 'psygames_support_grants';
  static const _correctionTable = 'psygames_support_corrections';
  static const _identityFields = [
    'id',
    'owner_id',
    'app_id',
    'grant_id',
    'grant_revision',
    'profile',
    'road',
    'game_id',
    'operation',
    'target_level',
    'key_scope',
  ];

  Future<List<Map<String, dynamic>>> _rows(
    String table,
    (int, String) token,
  ) async {
    final out = <Map<String, dynamic>>[];
    for (var start = 0; start < 10000; start += 100) {
      _guard(token);
      final page = await _account
          .from(table)
          .select()
          .eq('owner_id', token.$2)
          .eq('app_id', 'psygames')
          .order('id')
          .range(start, start + 99);
      _guard(token);
      for (final row in page) {
        if (row['owner_id'] != token.$2 || row['app_id'] != 'psygames') {
          throw const _SupportFault('scope_mismatch');
        }
        out.add(Map<String, dynamic>.unmodifiable(row));
      }
      if (page.length < 100) return List.unmodifiable(out);
    }
    throw const _SupportFault('too_many_rows');
  }

  Future<Map<String, dynamic>> _one(
    String table,
    String id,
    (int, String) token,
  ) async {
    _guard(token);
    final rows = await _account
        .from(table)
        .select()
        .eq('id', id)
        .eq('owner_id', token.$2)
        .eq('app_id', 'psygames');
    _guard(token);
    if (rows.length != 1 ||
        rows.single['id'] != id ||
        rows.single['owner_id'] != token.$2 ||
        rows.single['app_id'] != 'psygames') {
      throw const _SupportFault('scope_mismatch');
    }
    return rows.single;
  }

  SudokuSupportLiveGrant _grant(Map<String, dynamic> row, String owner) {
    final expiry = row['expires_at'];
    final parsed = expiry is String ? DateTime.tryParse(expiry) : null;
    if (row['owner_id'] != owner ||
        row['app_id'] != 'psygames' ||
        row['id'] is! String ||
        row['profile'] is! String ||
        !RegExp(r'^[a-z][a-z0-9-]{0,63}$').hasMatch(row['profile'] as String) ||
        row['road'] is! String ||
        sudokuRoadOf(row['road'] as String) == null ||
        row['revision'] is! int ||
        (row['revision'] as int) < 1 ||
        row['enabled'] is! bool ||
        parsed == null ||
        !parsed.isUtc) {
      throw const _SupportFault('invalid_grant');
    }
    return SudokuSupportLiveGrant(
      id: row['id'] as String,
      scope: SudokuSupportScope(
        ownerId: owner,
        issuer: _account.issuer,
        appId: 'psygames',
        profile: row['profile'] as String,
        road: row['road'] as String,
      ),
      revision: row['revision'] as int,
      enabled: row['enabled'] as bool,
      expiresAt: parsed,
    );
  }

  Future<void> refresh() => _run((token) async {
    _grants = await _rows(_grantTable, token);
    _guard(token);
    _corrections = await _rows(_correctionTable, token);
    _guard(token);
    // Explicit account-screen refresh also resumes interrupted local operations.
    final journal = _readJournal(token);
    for (final entry in journal) {
      if (entry['phase'] != 'acked') {
        await _apply(
          Map<String, dynamic>.from(entry['record'] as Map),
          token,
          restartSavedGame: entry['restart'] == true,
          recovering: true,
        );
        _guard(token);
      }
    }
    for (final row in _grants) {
      final grant = _grant(row, token.$2);
      if (!grant.enabled || !grant.expiresAt.isAfter(_now().toUtc())) continue;
      final road = sudokuRoadOf(grant.scope.road)!;
      final suffix = road == SudokuRoad.normal ? '' : '_${road.name}';
      final level = effectiveRoadLevel(
        _state,
        grant.scope.profile,
        road,
      ).clamp(1, 180);
      final best = math
          .max(
            level,
            int.tryParse(
                  _state.get(
                        'psygames_sudoku_best_${grant.scope.profile}$suffix',
                      ) ??
                      '',
                ) ??
                1,
          )
          .clamp(1, 180);
      _guard(token);
      final values = {
        'grant_revision': grant.revision,
        'level': level,
        'best': best,
        'resume_present':
            _state.get('psygames_resume_sudoku_${grant.scope.profile}') != null,
      };
      final existing = await _account
          .from('psygames_support_reports')
          .select('grant_id,owner_id')
          .eq('grant_id', grant.id)
          .eq('owner_id', token.$2);
      _guard(token);
      if (existing.isEmpty) {
        await _account.from('psygames_support_reports').insert({
          'grant_id': grant.id,
          'owner_id': token.$2,
          ...values,
        });
      } else {
        if (existing.length != 1 ||
            existing.single['grant_id'] != grant.id ||
            existing.single['owner_id'] != token.$2) {
          throw const _SupportFault('scope_mismatch');
        }
        // PostgREST upsert SETs every inserted column, including immutable PKs.
        // Explicit update needs privileges only on these four mutable fields.
        final updated = await _account
            .from('psygames_support_reports')
            .update(values)
            .eq('grant_id', grant.id)
            .eq('owner_id', token.$2)
            .select('grant_id,owner_id');
        _guard(token);
        if (updated.length != 1 ||
            updated.single['grant_id'] != grant.id ||
            updated.single['owner_id'] != token.$2) {
          throw const _SupportFault('report_not_updated');
        }
      }
      _guard(token);
    }
  });

  Future<void> enable({required String profile, required String road}) => _run((
    token,
  ) async {
    if (!RegExp(r'^[a-z][a-z0-9-]{0,63}$').hasMatch(profile) ||
        sudokuRoadOf(road) == null) {
      throw const _SupportFault('invalid_scope');
    }
    final rows = await _rows(_grantTable, token);
    final matching = rows
        .where((r) => r['profile'] == profile && r['road'] == road)
        .toList();
    if (matching.length > 1) throw const _SupportFault('ambiguous_grant');
    final values = <String, dynamic>{
      'enabled': true,
      'expires_at': _now()
          .toUtc()
          .add(const Duration(hours: 24))
          .toIso8601String(),
    };
    _guard(token);
    if (matching.isEmpty) {
      await _account.from(_grantTable).insert({
        'owner_id': token.$2,
        'profile': profile,
        'road': road,
        ...values,
      }).select();
    } else {
      final grant = _grant(matching.single, token.$2);
      final updated = await _account
          .from(_grantTable)
          .update(values)
          .eq('id', grant.id)
          .eq('owner_id', token.$2)
          .select();
      _guard(token);
      if (updated.length != 1) throw const _SupportFault('grant_not_updated');
    }
    _guard(token);
    _grants = await _rows(_grantTable, token);
  });

  Future<void> revoke(String grantId) => _run((token) async {
    await _one(_grantTable, grantId, token);
    _guard(token);
    final rows = await _account
        .from(_grantTable)
        .update({'enabled': false})
        .eq('id', grantId)
        .eq('owner_id', token.$2)
        .select();
    _guard(token);
    if (rows.length != 1) throw const _SupportFault('grant_not_updated');
    _grants = await _rows(_grantTable, token);
  });

  Future<void> apply(String correctionId, {bool restartSavedGame = false}) =>
      _run((token) async {
        final preview = _corrections
            .where((r) => r['id'] == correctionId)
            .toList();
        if (preview.length != 1) throw const _SupportFault('refresh_required');
        await _apply(preview.single, token, restartSavedGame: restartSavedGame);
      });

  // Owner/issuer namespacing prevents an old outcome from clearing B's journal.
  String _journalKey((int, String) t) =>
      'psygames_cloud_support_journal_${base64Url.encode(utf8.encode('${_account.issuer}|${t.$2}'))}';

  List<Map<String, dynamic>> _readJournal((int, String) t) {
    _guard(t);
    final raw = _state.get(_journalKey(t));
    if (raw == null) return [];
    try {
      final env = jsonDecode(raw) as Map;
      final entries = (env['entries'] as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      if (env['version'] != 1 ||
          env['owner_id'] != t.$2 ||
          env['issuer'] != _account.issuer ||
          entries.length > 100 ||
          entries.any(
            (e) =>
                !['prepared', 'completed', 'acked'].contains(e['phase']) ||
                e['record'] is! Map ||
                e['restart'] is! bool ||
                (e['resume'] != null && e['resume'] is! String),
          )) {
        throw const FormatException();
      }
      return entries;
    } catch (_) {
      throw const _SupportFault('invalid_journal');
    }
  }

  Future<void> _persist(
    List<Map<String, dynamic>> entries,
    (int, String) t,
  ) async {
    _guard(t);
    final value = jsonEncode({
      'version': 1,
      'owner_id': t.$2,
      'issuer': _account.issuer,
      'entries': entries,
    });
    await _state.set(_journalKey(t), value);
    _guard(t);
    if (_state.get(_journalKey(t)) != value) {
      throw const _SupportFault('storage_unverified');
    }
  }

  Future<void> _apply(
    Map<String, dynamic> preview,
    (int, String) t, {
    required bool restartSavedGame,
    bool recovering = false,
  }) async {
    final id = preview['id'];
    final grantId = preview['grant_id'];
    if (id is! String || grantId is! String) {
      throw const _SupportFault('invalid_correction');
    }
    final rows = _readJournal(t);
    var index = rows.indexWhere((e) => (e['record'] as Map)['id'] == id);
    var entry = index < 0 ? null : rows[index];
    final fresh = await _one(_correctionTable, id, t);
    if (_identityFields.any(
      (key) =>
          fresh[key] != preview[key] ||
          (entry != null && (entry['record'] as Map)[key] != fresh[key]),
    )) {
      throw const _SupportFault('correction_changed');
    }
    final completed = entry != null && entry['phase'] != 'prepared';
    final live = _grant(await _one(_grantTable, grantId, t), t.$2);
    _guard(t);
    if (!live.enabled || !live.expiresAt.isAfter(_now().toUtc())) {
      throw _SupportFault(completed ? 'ack_uncertain' : 'inactive_grant');
    }
    if (fresh['grant_revision'] is! int ||
        fresh['target_level'] is! int ||
        fresh['profile'] is! String ||
        fresh['road'] is! String ||
        fresh['game_id'] is! String ||
        fresh['operation'] is! String ||
        fresh['key_scope'] is! String) {
      throw const _SupportFault('invalid_correction');
    }
    if (fresh['status'] != 'pending' &&
        !(completed && fresh['status'] == 'applied')) {
      throw const _SupportFault('not_pending');
    }
    SudokuSupportCandidate build() => buildSudokuSupportCandidate(
      localPortable: CloudSnapshot.capture(_state.snapshot()).data,
      expected: SudokuSupportExpected(
        scope: live.scope,
        correctionId: id,
        grantId: grantId,
        grantRevision: live.revision,
      ),
      queued: SudokuSupportQueuedRecord(
        id: id,
        scope: SudokuSupportScope(
          ownerId: fresh['owner_id'] as String,
          issuer: _account.issuer,
          appId: fresh['app_id'] as String,
          profile: fresh['profile'] as String,
          road: fresh['road'] as String,
        ),
        grantId: grantId,
        grantRevision: fresh['grant_revision'] as int,
        gameId: fresh['game_id'] as String,
        operation: fresh['operation'] as String,
        targetLevel: fresh['target_level'] as int,
        status: 'pending',
        keyScope: fresh['key_scope'] as String,
      ),
      liveGrant: live,
      now: _now().toUtc(),
    );
    final candidate = build();
    final resumeKey = 'psygames_resume_sudoku_${live.scope.profile}';
    if (!completed) {
      if (candidate.choiceNeeded && !restartSavedGame) {
        _needsResumeChoice = true;
        return;
      }
      final resume = _state.get(resumeKey);
      if (entry != null &&
          resume != entry['resume'] &&
          !(entry['restart'] == true && resume == null)) {
        throw const _SupportFault('resume_changed');
      }
      if (entry == null) {
        // Never evict an unresolved receipt just to make room.
        if (rows.length == 100) {
          final old = rows.indexWhere((e) => e['phase'] == 'acked');
          if (old < 0) throw const _SupportFault('journal_full');
          rows.removeAt(old);
        }
        entry = {
          'record': {for (final k in _identityFields) k: fresh[k]},
          'phase': 'prepared',
          'restart': candidate.choiceNeeded && restartSavedGame,
          'resume': resume,
        };
        rows.add(entry);
        index = rows.length - 1;
      } else if (!recovering && candidate.choiceNeeded && restartSavedGame) {
        entry['restart'] = true;
      }
      // Preserve the ORIGINAL resume bytes before explicit removal/any patches.
      await _persist(rows, t);
      _guard(t);
      if (_state.get(resumeKey) != resume) {
        throw const _SupportFault('resume_changed');
      }
      if (entry['restart'] == true && resume != null) {
        _guard(
          t,
        ); // CAS is immediate: no await between comparison and dispatch.
        await _state.remove(resumeKey);
        _guard(t);
        if (_state.get(resumeKey) != null) {
          throw const _SupportFault('resume_changed');
        }
      }
      final expectedResume = entry['restart'] == true ? null : resume;
      for (final patch in candidate.patches.entries) {
        _guard(t);
        if (_state.get(resumeKey) != expectedResume) {
          throw const _SupportFault('resume_changed');
        }
        final current = int.tryParse(_state.get(patch.key) ?? '1');
        if (current == null || current < 1) {
          throw const _SupportFault('invalid_level');
        }
        final target = math.max(current, int.parse(patch.value));
        await _state.set(patch.key, '$target');
        _guard(t);
        if ((int.tryParse(_state.get(patch.key) ?? '') ?? 0) < target) {
          throw const _SupportFault('storage_unverified');
        }
      }
      _guard(t);
      if (_state.get(resumeKey) != expectedResume) {
        throw const _SupportFault('resume_changed');
      }
      if (build().patches.isNotEmpty) {
        throw const _SupportFault('storage_unverified');
      }
      // Receipt is durable BEFORE ACK; subsequent retries never clear a new board.
      entry['phase'] = 'completed';
      await _persist(rows, t);
    }
    _guard(t);
    // A previous platform failure may have updated only the in-memory
    // completed receipt. Re-confirm it before acknowledging remotely.
    await _persist(rows, t);
    _guard(t);
    if (fresh['status'] != 'applied') {
      try {
        _guard(t);
        final ack = await _account
            .from(_correctionTable)
            .update({
              'status': 'applied',
              'resolved_at': _now().toUtc().toIso8601String(),
            })
            .eq('id', id)
            .eq('owner_id', t.$2)
            .eq('status', 'pending')
            .select();
        _guard(t);
        if (ack.length != 1 ||
            ack.single['id'] != id ||
            ack.single['owner_id'] != t.$2 ||
            ack.single['status'] != 'applied') {
          throw const _SupportFault('ack_uncertain');
        }
      } catch (e) {
        _guard(t);
        throw const _SupportFault('ack_uncertain');
      }
    }
    rows[index]['phase'] = 'acked';
    await _persist(rows, t);
    _guard(t);
    _corrections = List.unmodifiable(
      _corrections.map(
        (r) => r['id'] == id
            ? Map<String, dynamic>.unmodifiable({...r, 'status': 'applied'})
            : r,
      ),
    );
  }
}

class _SupportFault implements Exception {
  const _SupportFault(this.code);
  final String code;
}
