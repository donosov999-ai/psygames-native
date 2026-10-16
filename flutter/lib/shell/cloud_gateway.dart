import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:ecosystem_cloud/ecosystem_cloud.dart';

import 'cloud_backup.dart' show CloudConflict, CloudVersion;
import 'cloud_pilot.dart';
import 'cloud_restore.dart';
import 'cloud_snapshot.dart';
import 'shared_state.dart';

/// Real shared-library adapter. Inert until an explicitly requested login.
/// Not constructed by the released host; no second wallet/gameplay writer.
class PsyGamesCloudGateway
    implements CloudPilotGateway, CloudColdCallbackGateway {
  PsyGamesCloudGateway({
    required this.state,
    required this.account,
    required this.restoreDirectory,
    DateTime Function()? now,
  }) : now = now ?? DateTime.now {
    if (account.appId != 'psygames') throw ArgumentError('Invalid app scope');
    _ownedIntent = _currentIntentId();
  }

  static const intentKey = '${SharedState.prefix}cloud_login_intent_v1';
  final SharedState state;
  final EcosystemAccount account;
  final Future<Directory> Function() restoreDirectory;
  final DateTime Function() now;
  AppCloudClient? _cloud;
  bool _off = true;
  int _generation = 0;
  int _base = 0;
  int _remoteHead = 0;
  bool _listed = false;
  bool _saved = false;
  static final _intentLanes = <String, Future<void>>{};
  static final _accountOwners = Expando<PsyGamesCloudGateway>();
  String? _ownedIntent;
  ({Map<String, dynamic> payload, int base, String id})? _pending;

  @override
  String get issuer => account.issuer;
  @override
  String? get accountId => _off ? null : account.accountId;
  @override
  String? get email => _off ? null : account.email;

  void _guard(int generation) {
    if (_off ||
        generation != _generation ||
        !identical(_accountOwners[account], this)) {
      throw const CloudPortError(CloudPortCode.off);
    }
  }

  void _claimAccount() {
    final previous = _accountOwners[account];
    if (!identical(previous, this)) previous?.suspend();
    _accountOwners[account] = this;
  }

  Future<void> _writeIntent(Future<void> Function() action) {
    final next = (_intentLanes[issuer] ?? Future.value()).then((_) => action());
    _intentLanes[issuer] = next.catchError((Object _) {});
    return next;
  }

  String? _currentIntentId() {
    try {
      final value = jsonDecode(state.get(intentKey) ?? 'null');
      if (value is Map &&
          value['version'] == 1 &&
          value['issuer'] == issuer &&
          value['callback'] == account.callback.toString() &&
          value['id'] is String) {
        return value['id'] as String;
      }
    } catch (_) {
      /* Invalid local intent never authorizes a callback. */
    }
    return null;
  }

  Future<void> _clearIntent(String? owned) => _writeIntent(() async {
    if (owned != null && _currentIntentId() == owned) {
      await state.remove(intentKey);
    }
  });

  @override
  Future<bool> hasPendingLogin(Uri uri) async {
    if (!account.acceptsCallback(uri)) return false;
    await (_intentLanes[issuer] ?? Future.value());
    try {
      final value = jsonDecode(state.get(intentKey) ?? 'null');
      if (value is! Map ||
          value['version'] != 1 ||
          value['issuer'] != issuer ||
          value['callback'] != account.callback.toString()) {
        return false;
      }
      final at = DateTime.tryParse(value['created_at'] as String);
      if (at == null) return false;
      final age = now().toUtc().difference(at.toUtc());
      final valid =
          !age.isNegative &&
          age <= const Duration(minutes: 30) &&
          _currentIntentId() != null;
      if (valid) _ownedIntent = _currentIntentId();
      return valid;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<void> requestLink(String email) async {
    suspend();
    _claimAccount();
    _off = false;
    final generation = _generation;
    final intent = _ownedIntent = _requestId();
    try {
      await _writeIntent(() async {
        _guard(generation);
        await state.set(
          intentKey,
          jsonEncode({
            'version': 1,
            'id': intent,
            'issuer': issuer,
            'callback': account.callback.toString(),
            'created_at': now().toUtc().toIso8601String(),
          }),
        );
        _guard(generation);
      });
      _guard(generation);
      await account.requestLink(email, consent: true);
      _guard(generation);
    } catch (_) {
      if (generation != _generation || _off) {
        throw const CloudPortError(CloudPortCode.off);
      }
      if (generation == _generation) suspend();
      rethrow;
    }
  }

  @override
  Future<void> completeLink(Uri uri) async {
    final generation = _generation;
    if (!await hasPendingLogin(uri) || generation != _generation) {
      throw const CloudPortError(CloudPortCode.off);
    }
    // This explicit persisted login intent is NOT cloud/history consent.
    _claimAccount();
    _off = false;
    account.prepareCallback(consent: true);
    try {
      await account.completeLink(uri);
      _guard(generation);
      final owner = account.accountId;
      if (owner == null) {
        throw const CloudPortError(CloudPortCode.accountChanged);
      }
      _cloud = AppCloudClient(
        account: account,
        expectedAccountId: owner,
        validatePayload: (envelope) =>
            CloudSnapshot.decode(jsonEncode(envelope['data'])),
      )..allowHistoryRead();
      await _clearIntent(_ownedIntent);
      _guard(generation);
      _ownedIntent = null;
      _base = 0;
      _remoteHead = 0;
      _listed = false;
      _saved = false;
      _pending = null;
    } catch (_) {
      if (generation != _generation || _off) {
        throw const CloudPortError(CloudPortCode.off);
      }
      if (generation == _generation) suspend();
      rethrow;
    }
  }

  AppCloudClient get _client {
    _guard(_generation);
    final client = _cloud;
    if (client == null) throw const CloudPortError(CloudPortCode.off);
    return client;
  }

  @override
  Future<List<CloudVersion>> versions() async {
    final generation = _generation;
    final rows = await _client.versions();
    _guard(generation);
    // Listing metadata is NOT accepting a peer's progress as our CAS base.
    _remoteHead = rows.isEmpty ? 0 : rows.first.revision;
    _listed = true;
    return List.unmodifiable(
      rows.map((row) => CloudVersion(row.id, row.revision, row.createdAt)),
    );
  }

  @override
  Future<void> enableBackup() async {
    final generation = _generation;
    final receipt = jsonDecode(state.get(CloudPilot.receiptKey) ?? 'null');
    if (receipt is! Map ||
        receipt['version'] != 1 ||
        receipt['app_id'] != 'psygames' ||
        receipt['issuer'] != issuer ||
        receipt['account_id'] != accountId ||
        state.get(CloudPilot.consentKey) != '1') {
      throw const CloudPortError(CloudPortCode.consentRequired);
    }
    await _client.acceptConsent();
    _guard(generation);
  }

  @override
  Future<void> save({required bool keepLocalAfterConflict}) async {
    final generation = _generation;
    final client = _client;
    if (!_listed) throw const CloudPortError(CloudPortCode.unavailable);
    if (_pending == null &&
        !_saved &&
        _remoteHead > 0 &&
        !keepLocalAfterConflict) {
      throw CloudConflict();
    }
    if (keepLocalAfterConflict) {
      await versions();
      _guard(generation);
      _base = _remoteHead; // Explicit keep-local confirmation only.
      _pending =
          null; // A separately confirmed NEW write, not an implicit retry.
    }
    final write = _pending ??= (
      payload: {
        'schema': 1,
        'data': jsonDecode(
          CloudSnapshot.capture(state.snapshot(), now: now()).encode(),
        ),
      },
      base: _base,
      id: _requestId(),
    );
    try {
      final copy = await client.save(
        write.payload,
        baseRevision: write.base,
        requestId: write.id,
      );
      _guard(generation);
      _base = copy.revision;
      _saved = true;
      _pending = null;
    } on CloudPortError catch (e) {
      if (e.code == CloudPortCode.conflict) {
        _pending = null;
        throw CloudConflict();
      }
      rethrow; // Retain exact payload/base/requestId for an explicit retry.
    }
  }

  @override
  Future<CloudSnapshot> download(CloudVersion version) async {
    final generation = _generation;
    final envelope = await _client.download(version.id);
    _guard(generation);
    return CloudSnapshot.decode(jsonEncode(envelope['data']));
  }

  @override
  Future<void> prepareRestore(CloudSnapshot snapshot) async {
    // Called only after explicit UI confirmation, after network suspension.
    await CloudRestore.prepare(await restoreDirectory(), state, snapshot);
  }

  @override
  Future<void> deleteCopies() async {
    final generation = _generation;
    await _client.deleteCopies();
    _guard(generation);
    _base = 0;
    _remoteHead = 0;
    _pending = null;
  }

  @override
  Future<void> signOut() async {
    // CloudPilot calls suspend first; SDK signOut still removes saved credentials.
    await account.signOut();
  }

  @override
  void suspend() {
    final wasActive = !_off;
    final ownsAccount = identical(_accountOwners[account], this);
    if (ownsAccount) _accountOwners[account] = null;
    _generation++;
    _off = true;
    final client = _cloud;
    _cloud = null;
    if (client != null && ownsAccount) {
      client.suspend();
    } else if (wasActive && ownsAccount) {
      account.suspend();
    }
    _pending = null;
    final intent = _ownedIntent;
    _ownedIntent = null;
    if (intent != null) unawaited(_clearIntent(intent));
  }

  static String _requestId() {
    final random = Random.secure();
    final bytes = List.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    final hex = bytes.map((n) => n.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }
}
