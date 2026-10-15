library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:supabase/supabase.dart';

export 'package:supabase/supabase.dart' show PostgrestQueryBuilder, AuthException;

/// Identity is shared by issuer+subject; sessions, app consent and data are not.
/// Do not send these credentials through app links, logs, backups or SharedState.
abstract interface class AccountVault {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> remove(String key);
}

class SecureAccountVault implements AccountVault {
  const SecureAccountVault();
  static const _storage = FlutterSecureStorage(
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
  );
  @override
  Future<String?> read(String key) => _storage.read(key: key);
  @override
  Future<void> write(String key, String value) => _storage.write(key: key, value: value);
  @override
  Future<void> remove(String key) => _storage.delete(key: key);
}

class _PkceVault extends GotrueAsyncStorage {
  const _PkceVault(this.read, this.write, this.remove);
  final Future<String?> Function(String) read;
  final Future<void> Function(String, String) write;
  final Future<void> Function(String) remove;
  @override
  Future<String?> getItem({required String key}) => read(key);
  @override
  Future<void> setItem({required String key, required String value}) => write(key, value);
  @override
  Future<void> removeItem({required String key}) => remove(key);
}

class _CredentialLane {
  Future<void> tail = Future.value();
}

/// Fence at the transport boundary, not just at the client getter. A query
/// retained before opt-out cannot send after the client was retired.
class _ConsentTransport extends http.BaseClient {
  _ConsentTransport(this.inner, this.allowed, {required this.ownsInner});
  final http.Client inner;
  final bool Function(http.BaseRequest) allowed;
  final bool ownsInner;
  bool _revoked = false;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    if (_revoked || !allowed(request)) {
      throw StateError('Account network consent is OFF');
    }
    return inner.send(request);
  }
  @override
  void close() {
    _revoked = true;
    if (ownsInner) inner.close();
  }
}

class EcosystemAccount {
  EcosystemAccount({
    required this.appId,
    required this.url,
    required this.publishableKey,
    required this.callback,
    AccountVault? vault,
    this.transport,
  }) : vault = vault ?? const SecureAccountVault() {
    if (!const {'psygames', 'smart-alarm', 'abstract-hub', 'typerighting'}.contains(appId)) {
      throw ArgumentError('Unknown ecosystem app');
    }
    final endpoint = Uri.parse(url);
    if (endpoint.scheme != 'https' || endpoint.host.isEmpty || endpoint.userInfo.isNotEmpty ||
        endpoint.query.isNotEmpty || endpoint.fragment.isNotEmpty ||
        (endpoint.path.isNotEmpty && endpoint.path != '/') ||
        callback.query.isNotEmpty || callback.fragment.isNotEmpty) {
      throw ArgumentError('Invalid account endpoint or callback');
    }
  }

  static const contract = 'ecosystem.account/1-draft.3';
  // One lane/active owner per namespace within the host isolate. A replacement
  // instance cannot ACK new credentials ahead of the old instance's slow write.
  static final _lanes = <String, _CredentialLane>{};
  static final _owners = <String, EcosystemAccount>{};
  final String appId, url, publishableKey;
  final Uri callback;
  final AccountVault vault;
  /// Optional injected transport for deterministic tests; no real email needed.
  final http.Client? transport;
  /// Canonical authority is part of identity, credentials AND PKCE storage.
  String get issuer => '${Uri.parse(url).origin}/auth/v1';
  String get storageNamespace => 'ecosystem.account.v2.$appId.${base64Url.encode(utf8.encode(issuer)).replaceAll('=', '')}';
  String get _sessionKey => '$storageNamespace.session';
  SupabaseClient? _client;
  StreamSubscription<AuthState>? _subscription;
  _ConsentTransport? _transport;
  Future<void> _retireQueue = Future.value();
  _CredentialLane get _lane => _lanes.putIfAbsent(storageNamespace, _CredentialLane.new);
  Future<void> get _persistQueue => _lane.tail;
  bool _allowed = false;
  bool _loggingOut = false;
  bool _credentialsReady = false;
  String? _boundSubject;
  int _generation = 0;

  bool _currentAttempt(int generation) =>
    _allowed && !_loggingOut && generation == _generation;

  void _activate() {
    final previous = _owners[storageNamespace];
    if (previous != null && !identical(previous, this)) previous.suspend();
    _owners[storageNamespace] = this;
    _allowed = true;
  }

  /// All credential writes/removals, including the final flush and PKCE,
  /// participate in this SAME lane. Pre-check alone cannot cancel an OS write
  /// already underway; the newer ACK waits until it settles and newer data wins.
  Future<void> _mutateCredentials(int generation, Future<void> Function() mutation,
      {bool allowInactive = false, bool allowLoggingOut = false}) {
    bool current() => generation == _generation && (allowInactive || _allowed) &&
      (allowLoggingOut || !_loggingOut);
    final lane = _lane;
    final operation = lane.tail.catchError((Object _) {}).then((_) async {
      if (!current()) throw StateError('Credential operation cancelled');
      await mutation();
      if (!current()) throw StateError('Credential operation cancelled');
    });
    lane.tail = operation;
    // Background auth events may not have a caller; retain errors for callers
    // of their operation, without creating unhandled asynchronous exceptions.
    unawaited(operation.catchError((Object _) {}));
    return operation;
  }

  bool get active => _allowed;
  String? get accountId => _allowed && !_loggingOut && _credentialsReady ? _boundSubject : null;
  String? get email => accountId != null ? _client?.auth.currentUser?.email : null;

  // Do not expose the raw SDK: its auth/realtime APIs would let consumers
  // bypass the account lifecycle. REST builders still use our transport fence.
  PostgrestQueryBuilder from(String table) {
    if (accountId == null) throw StateError('A restored and consent-bound account is required');
    return _sdk.from(table);
  }

  /// Local authority/subject check, NOT JWT signature authentication. The server
  /// still validates signatures, expiry, session revocation and owner RLS.
  String? _sessionSubject(Map<String, dynamic> session) {
    try {
      final token = session['access_token'];
      final user = session['user'];
      if (token is! String || user is! Map || user['id'] is! String) return null;
      final parts = token.split('.');
      if (parts.length != 3) return null;
      final claims = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))));
      if (claims is! Map || claims['iss'] != issuer || claims['sub'] != user['id'] ||
          (user['id'] as String).isEmpty) return null;
      return user['id'] as String;
    } catch (_) { return null; }
  }

  Map<String, dynamic>? _readEnvelope(String encoded) {
    try {
      final envelope = jsonDecode(encoded);
      if (envelope is! Map<String, dynamic> || envelope.length != 5 ||
          envelope['schema'] != 1 || envelope['schema'] is! int ||
          envelope['app_id'] != appId || envelope['issuer'] != issuer ||
          envelope['session'] is! Map<String, dynamic>) return null;
      final session = envelope['session'] as Map<String, dynamic>;
      final subject = _sessionSubject(session);
      return subject != null && envelope['account_id'] == subject ? session : null;
    } catch (_) { return null; }
  }

  String _encodeSession(Session session) {
    final value = session.toJson();
    final subject = _sessionSubject(value);
    if (subject == null || subject != _boundSubject) throw StateError('Session identity mismatch');
    return jsonEncode({'schema': 1, 'app_id': appId, 'issuer': issuer,
      'account_id': subject, 'session': value});
  }

  bool _networkAllowed(http.BaseRequest request) {
    if (!_allowed || request.url.origin != Uri.parse(url).origin) return false;
    if (_loggingOut) return request.url.path == '/auth/v1/logout';
    final session = _client?.auth.currentSession;
    if (session != null && _sessionSubject(session.toJson()) != _boundSubject) return false;
    if (request.url.path.startsWith('/rest/v1')) return accountId != null;
    return true;
  }

  SupabaseClient get _sdk {
    if (!_allowed || _loggingOut) throw StateError('Account network consent is OFF');
    return _client ??= _makeClient();
  }

  SupabaseClient _makeClient() {
    final generation = _generation;
    final gate = _ConsentTransport(transport ?? http.Client(), _networkAllowed,
      ownsInner: transport == null);
    _transport = gate;
    final c = SupabaseClient(url, publishableKey, httpClient: gate, authOptions: AuthClientOptions(
      // The SDK exists only after opt-in; suspend retires it and its transport.
      // Keep refresh enabled so an expired encrypted session can be recovered.
      autoRefreshToken: true,
      authFlowType: AuthFlowType.pkce,
      pkceAsyncStorage: _PkceVault(
        (key) async {
          if (!_currentAttempt(generation)) throw StateError('PKCE operation cancelled');
          await _persistQueue.catchError((Object _) {});
          if (!_currentAttempt(generation)) throw StateError('PKCE operation cancelled');
          final value = await vault.read('$storageNamespace.pkce.$key');
          if (!_currentAttempt(generation)) throw StateError('PKCE operation cancelled');
          return value;
        },
        (key, value) => _mutateCredentials(generation,
          () => vault.write('$storageNamespace.pkce.$key', value)),
        (key) => _mutateCredentials(generation,
          () => vault.remove('$storageNamespace.pkce.$key'), allowLoggingOut: true),
      ),
    ));
    _subscription = c.auth.onAuthStateChange.listen((event) {
      if (!_allowed || !identical(_client, c)) return;
      final generation = _generation;
      final session = event.session;
      if (session != null) {
        final subject = _sessionSubject(session.toJson());
        if (subject == null || (_boundSubject != null && _boundSubject != subject)) {
          suspend();
          return;
        }
        _boundSubject ??= subject;
      }
      final mutation = _mutateCredentials(generation, () async {
        if (!identical(_client, c)) throw StateError('Credential client retired');
        if (session == null) {
          await vault.remove(_sessionKey);
        } else {
          await vault.write(_sessionKey, _encodeSession(session));
        }
      }, allowLoggingOut: session == null);
      // Consumers await flushCredentials before reporting login success. Do not
      // leak session values through an unhandled async error or an SDK log.
      unawaited(mutation.catchError((Object _) {}));
    });
    return c;
  }

  /// OFF performs no SDK initialization, token recovery or refresh request.
  Future<bool> resume({required bool consent, String? expectedAccountId}) async {
    // Every explicit recovery is a new generation, even for the same subject.
    // Retire A before reading a possible B from the vault; old builders cannot
    // borrow B's credentials. Hosts pass their consent receipt's expected ID.
    suspend();
    if (!consent) return false;
    _activate();
    final generation = _generation;
    final saved = await vault.read(_sessionKey);
    if (!_currentAttempt(generation)) return false;
    if (saved == null) return false;
    final session = _readEnvelope(saved);
    if (session == null || (expectedAccountId != null &&
        _sessionSubject(session) != expectedAccountId)) {
      suspend();
      return false;
    }
    _boundSubject = _sessionSubject(session);
    try {
      await _sdk.auth.recoverSession(jsonEncode(session));
      if (!_currentAttempt(generation)) return false;
      await flushCredentials();
      _credentialsReady = true;
      _sdk.auth.startAutoRefresh();
      return accountId != null;
    } catch (_) {
      if (_currentAttempt(generation)) suspend();
      rethrow;
    }
  }

  Future<void> requestLink(String email, {required bool consent}) async {
    if (!consent) throw StateError('Account network consent is OFF');
    suspend();
    _activate();
    final generation = _generation;
    await _sdk.auth.signInWithOtp(email: email.trim(), emailRedirectTo: callback.toString());
    if (!_currentAttempt(generation)) throw StateError('Login request superseded');
  }

  bool acceptsCallback(Uri uri) => uri.scheme == callback.scheme && uri.host == callback.host &&
      uri.path == callback.path && uri.userInfo.isEmpty && !uri.hasPort && uri.fragment.isEmpty &&
      uri.queryParameters['code']?.isNotEmpty == true;

  Future<void> completeLink(Uri uri) async {
    if (!_allowed || !acceptsCallback(uri)) throw StateError('Invalid account callback');
    final generation = _generation;
    try {
      await _sdk.auth.exchangeCodeForSession(uri.queryParameters['code']!);
      if (!_currentAttempt(generation)) throw StateError('Account operation cancelled');
      await flushCredentials();
      _credentialsReady = true;
      _sdk.auth.startAutoRefresh();
    } catch (_) {
      if (_currentAttempt(generation)) suspend();
      rethrow;
    }
  }

  Future<void> flushCredentials() async {
    // A past write failure must not poison every later retry. The current
    // session still has to be durably written before login can report success.
    final generation = _generation;
    final c = _client;
    await _mutateCredentials(generation, () async {
      if (!identical(_client, c)) throw StateError('Credential client retired');
      final session = c?.auth.currentSession;
      if (session == null) throw StateError('No session to persist');
      await vault.write(_sessionKey, _encodeSession(session));
    });
  }

  /// Keep the encrypted session for a later explicit opt-in, but stop refresh.
  void suspend() {
    if (identical(_owners[storageNamespace], this)) _owners.remove(storageNamespace);
    _allowed = false;
    _loggingOut = false;
    _credentialsReady = false;
    _boundSubject = null;
    _generation++;
    final c = _client;
    final sub = _subscription;
    final gate = _transport;
    c?.auth.stopAutoRefresh();
    gate?.close();
    _client = null;
    _subscription = null;
    _transport = null;
    _retireQueue = _retireQueue.catchError((Object _) {}).then((_) async {
      await sub?.cancel();
      await c?.dispose();
    });
    unawaited(_retireQueue.catchError((Object _) {}));
  }

  /// Exit THIS app/session; do not sign the user out of all four products.
  Future<void> signOut() async {
    final c = _client;
    final generation = _generation;
    var completed = false;
    _loggingOut = true;
    _credentialsReady = false;
    c?.auth.stopAutoRefresh();
    try { await c?.auth.signOut(scope: SignOutScope.local); }
    finally {
      // A late logout must not suspend B or remove B's acknowledged credentials.
      if (generation == _generation) {
        suspend();
        final removalGeneration = _generation;
        await _mutateCredentials(removalGeneration,
          () => vault.remove(_sessionKey), allowInactive: true);
        await _retireQueue;
        completed = removalGeneration == _generation;
      }
    }
    if (!completed) throw StateError('Sign-out superseded by another account operation');
  }

  Future<void> dispose() async {
    suspend();
    await _persistQueue.catchError((Object _) {});
    await _retireQueue;
  }
}
