import 'dart:convert';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:supabase/supabase.dart' show PostgrestException;

enum CloudPortCode {
  off,
  accountChanged,
  consentRequired,
  conflict,
  notFound,
  network,
  invalidPayload,
  unavailable,
}

class CloudPortError implements Exception {
  const CloudPortError(this.code);
  final CloudPortCode code;
  @override
  String toString() => 'CloudPortError(${code.name})';
}

class AppCloudCopy {
  const AppCloudCopy(this.id, this.requestId, this.revision, this.createdAt);
  final String id;
  final String requestId;
  final int revision;
  final DateTime createdAt;
  static AppCloudCopy read(Map<String, dynamic> row) {
    final date = row['created_at'] is String
        ? DateTime.tryParse(row['created_at'])
        : null;
    final revision = row['revision'];
    if (!_uuid(row['id']) ||
        !_uuid(row['request_id']) ||
        revision is! int ||
        revision <= 0 ||
        date == null) {
      throw const CloudPortError(CloudPortCode.invalidPayload);
    }
    return AppCloudCopy(row['id'], row['request_id'], revision, date.toUtc());
  }
}

bool _uuid(Object? value) =>
    value is String &&
    RegExp(
      r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    ).hasMatch(value);

Object? _frozenJson(Object? value) {
  if (value is Map<String, dynamic>) {
    return Map<String, dynamic>.unmodifiable(
      value.map((key, item) => MapEntry(key, _frozenJson(item))),
    );
  }
  if (value is List) return List<Object?>.unmodifiable(value.map(_frozenJson));
  return value;
}

/// SQL-backed shared transport, not a new auth system. Construct ONLY after the
/// host has signed in/restored the exact expected identity through draft.4.
/// A host-specific allowlist/decoder is mandatory; this package never chooses
/// diary/photo/text fields or creates sessions/rewards/merged balances.
class AppCloudClient {
  AppCloudClient({
    required this.account,
    required this.expectedAccountId,
    required this.validatePayload,
  }) : appId = account.appId,
       issuer = account.issuer {
    if (!apps.contains(appId) || !_uuid(expectedAccountId)) {
      throw ArgumentError('Invalid cloud scope');
    }
  }

  static const apps = {
    'psygames',
    'smart-alarm',
    'abstract-hub',
    'typerighting',
  };
  static const snapshotsTable = 'ecosystem_app_snapshots';
  static const consentsTable = 'ecosystem_app_consents';
  static const policyVersion = 1;
  static const maxBytes = 5 * 1024 * 1024;
  static const _columns = 'id,request_id,revision,created_at';
  final EcosystemAccount account;
  final String expectedAccountId;
  final String appId;
  final String issuer;
  final void Function(Map<String, dynamic>) validatePayload;
  bool _history = false;
  bool _upload = false;
  bool _retired = false;
  int _generation = 0;
  int _permissionEpoch = 0;
  static final _mutationLanes = <String>{};
  String get _lane => '$issuer|$appId|$expectedAccountId';

  Future<T> _mutation<T>(Future<T> Function() action) async {
    _guard();
    // Shared across replacement connector instances in this isolate. Never
    // release a lane on a UI-only timeout while an older HTTP write still runs.
    if (!_mutationLanes.add(_lane))
      throw const CloudPortError(CloudPortCode.unavailable);
    try {
      return await action();
    } finally {
      _mutationLanes.remove(_lane);
    }
  }

  bool get uploadsEnabled => _upload && !_retired;
  void allowHistoryRead() {
    if (_retired) throw const CloudPortError(CloudPortCode.off);
    _identity();
    _history = true;
  }

  void _identity() {
    if (account.accountId != expectedAccountId ||
        account.issuer != issuer ||
        account.appId != appId) {
      // Retire this connector, not a newer session sharing the account object.
      _generation++;
      _retired = true;
      _history = false;
      _upload = false;
      throw const CloudPortError(CloudPortCode.accountChanged);
    }
  }

  void _guard({bool upload = false}) {
    if (_retired || !_history) throw const CloudPortError(CloudPortCode.off);
    _identity();
    if (upload && !_upload)
      throw const CloudPortError(CloudPortCode.consentRequired);
  }

  Future<T> _run<T>(
    Future<T> Function() operation, {
    bool upload = false,
  }) async {
    _guard(upload: upload);
    final generation = _generation;
    try {
      // Do not time out only this Future: that would leave the real request
      // alive while a newer revoke/delete incorrectly claimed to be final.
      // Host UI may return to LOCAL immediately via suspend; the lane drains
      // only when the transport really settles. No alarm/gameplay safety wait.
      final result = await operation();
      if (_retired || generation != _generation)
        throw const CloudPortError(CloudPortCode.off);
      _guard(upload: upload);
      return result;
    } on CloudPortError {
      rethrow;
    } on PostgrestException catch (e) {
      if (_retired || generation != _generation)
        throw const CloudPortError(CloudPortCode.off);
      _identity();
      if (e.code == '40001') throw const CloudPortError(CloudPortCode.conflict);
      if (e.code == '42501')
        throw const CloudPortError(CloudPortCode.consentRequired);
      if (e.code == '23505' || e.code == '23514')
        throw const CloudPortError(CloudPortCode.invalidPayload);
      throw const CloudPortError(CloudPortCode.network);
    } catch (_) {
      if (_retired || generation != _generation)
        throw const CloudPortError(CloudPortCode.off);
      _identity();
      throw const CloudPortError(CloudPortCode.network);
    }
  }

  Future<Map<String, dynamic>?> consent() => _run(() async {
    final rows = await account
        .from(consentsTable)
        .select()
        .eq('owner_id', expectedAccountId)
        .eq('app_id', appId)
        .limit(1);
    if (rows.isEmpty) return null;
    final row = rows.single;
    _checkReceipt(row, requireEnabled: false);
    return Map.unmodifiable(row);
  });

  void _checkReceipt(Map<String, dynamic> row, {required bool requireEnabled}) {
    if (row['owner_id'] != expectedAccountId ||
        row['app_id'] != appId ||
        row['issuer'] != issuer ||
        row['policy_version'] != policyVersion ||
        row['enabled'] is! bool ||
        (requireEnabled && row['enabled'] != true)) {
      throw const CloudPortError(CloudPortCode.invalidPayload);
    }
  }

  /// Only after explicit host history-link confirmation, never on login alone.
  Future<Map<String, dynamic>> acceptConsent() => _mutation(() async {
    final epoch = _permissionEpoch;
    _upload = false;
    final receipt = await _run(() async {
      final row = await account
          .from(consentsTable)
          .upsert({
            'owner_id': expectedAccountId,
            'app_id': appId,
            'issuer': issuer,
            'policy_version': policyVersion,
            'enabled': true,
          }, onConflict: 'owner_id,app_id')
          .select()
          .single();
      _checkReceipt(row, requireEnabled: true);
      return Map<String, dynamic>.unmodifiable(row);
    });
    _guard();
    if (epoch != _permissionEpoch)
      throw const CloudPortError(CloudPortCode.consentRequired);
    _upload = true;
    return receipt;
  });

  /// Re-enables local dispatch only from an exact host receipt and a matching
  /// server receipt. Automatic SDK recovery still belongs to the host.
  Future<void> recoverConsent(Map<String, dynamic> hostReceipt) =>
      _mutation(() async {
        final epoch = _permissionEpoch;
        _upload = false;
        _checkReceipt(hostReceipt, requireEnabled: true);
        final remote = await consent();
        if (remote == null || remote['enabled'] != true)
          throw const CloudPortError(CloudPortCode.consentRequired);
        _guard();
        if (epoch != _permissionEpoch)
          throw const CloudPortError(CloudPortCode.consentRequired);
        _upload = true;
      });

  Future<List<AppCloudCopy>> versions() => _run(() async {
    final rows = await account
        .from(snapshotsTable)
        .select(_columns)
        .eq('owner_id', expectedAccountId)
        .eq('app_id', appId)
        .order('revision', ascending: false)
        .limit(10);
    if (rows.length > 10)
      throw const CloudPortError(CloudPortCode.invalidPayload);
    return List.unmodifiable(rows.map(AppCloudCopy.read));
  });

  Map<String, dynamic> _payload(Object? value) {
    try {
      final encoded = jsonEncode(value);
      if (utf8.encode(encoded).length > maxBytes) throw const FormatException();
      final frozen = _frozenJson(jsonDecode(encoded));
      if (frozen is! Map<String, dynamic> ||
          frozen.length != 2 ||
          frozen['schema'] != 1 ||
          frozen['data'] is! Map<String, dynamic> ||
          (frozen.containsKey('app_id') && frozen['app_id'] != appId))
        throw const FormatException();
      validatePayload(frozen);
      return frozen;
    } catch (_) {
      throw const CloudPortError(CloudPortCode.invalidPayload);
    }
  }

  Future<Map<String, dynamic>> download(String id) async {
    if (!_uuid(id)) throw const CloudPortError(CloudPortCode.invalidPayload);
    return _run(() async {
      final rows = await account
          .from(snapshotsTable)
          .select('payload')
          .eq('owner_id', expectedAccountId)
          .eq('app_id', appId)
          .eq('id', id)
          .limit(1);
      if (rows.isEmpty) throw const CloudPortError(CloudPortCode.notFound);
      return _payload(rows.single['payload']);
    });
  }

  /// requestId is stable across a bounded retry of THIS exact payload/base.
  /// The server serializes CAS; never silently choose a newer base after conflict.
  Future<AppCloudCopy> save(
    Map<String, dynamic> payload, {
    required int baseRevision,
    required String requestId,
  }) => _mutation(() async {
    _guard(upload: true);
    if (baseRevision < 0 || !_uuid(requestId))
      throw const CloudPortError(CloudPortCode.invalidPayload);
    final frozen = _payload(payload);
    return _run(() async {
      final rows = await account
          .from(snapshotsTable)
          .insert({
            'owner_id': expectedAccountId,
            'app_id': appId,
            'request_id': requestId,
            'base_revision': baseRevision,
            'payload': frozen,
          })
          .select(_columns);
      if (rows.length == 1) {
        final copy = AppCloudCopy.read(rows.single);
        if (copy.requestId != requestId || copy.revision <= baseRevision) {
          throw const CloudPortError(CloudPortCode.invalidPayload);
        }
        return copy;
      }
      if (rows.isNotEmpty)
        throw const CloudPortError(CloudPortCode.invalidPayload);
      // BEFORE INSERT returns no row for an exact retained idempotent retry.
      _guard(upload: true);
      final existing = await account
          .from(snapshotsTable)
          .select(_columns)
          .eq('owner_id', expectedAccountId)
          .eq('app_id', appId)
          .eq('request_id', requestId)
          .limit(1);
      if (existing.isEmpty) throw const CloudPortError(CloudPortCode.notFound);
      final copy = AppCloudCopy.read(existing.single);
      if (copy.requestId != requestId || copy.revision <= baseRevision) {
        throw const CloudPortError(CloudPortCode.invalidPayload);
      }
      return copy;
    }, upload: true);
  });

  /// Immediate local upload stop; this separate request updates SERVER consent.
  /// A network error is not proof of server revocation.
  Future<void> revokeConsent() async {
    _upload = false;
    _permissionEpoch++;
    await _mutation(_revoke);
  }

  Future<void> _revoke() async {
    await _run(() async {
      final rows = await account
          .from(consentsTable)
          .update({'enabled': false})
          .eq('owner_id', expectedAccountId)
          .eq('app_id', appId)
          .select();
      if (rows.isNotEmpty) _checkReceipt(rows.single, requireEnabled: false);
      if (rows.isNotEmpty && rows.single['enabled'] != false)
        throw const CloudPortError(CloudPortCode.invalidPayload);
    });
  }

  Future<void> deleteCopies() async {
    _upload = false;
    _permissionEpoch++;
    await _mutation(() async {
      await _revoke();
      await _run(() async {
        await account
            .from(snapshotsTable)
            .delete()
            .eq('owner_id', expectedAccountId)
            .eq('app_id', appId);
      });
    });
  }

  /// No privileged server endpoint is fabricated; hosts keep this action disabled.
  Future<void> deleteAccount() async =>
      throw const CloudPortError(CloudPortCode.unavailable);

  void suspend() {
    // Late disposal of an old UI must not retire the replacement's session.
    if (_retired) return;
    _generation++;
    _history = false;
    _upload = false;
    _retired = true;
    account.suspend();
  }
}
