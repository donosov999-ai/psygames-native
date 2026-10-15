import 'dart:async';
import 'dart:convert';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class Vault implements AccountVault {
  final values = <String, String>{};
  int reads = 0;
  bool failWrites = false;
  @override
  Future<String?> read(String key) async { reads++; return values[key]; }
  @override
  Future<void> write(String key, String value) async {
    if (failWrites) throw StateError('Test secure vault unavailable');
    values[key] = value;
  }
  @override
  Future<void> remove(String key) async { values.remove(key); }
}

void main() {
  EcosystemAccount account(Vault vault, {http.Client? transport}) => EcosystemAccount(
    appId: 'psygames', url: 'https://example.supabase.co', publishableKey: 'test-public',
    callback: Uri.parse('com.psygames.app://auth/callback'), vault: vault, transport: transport,
  );
  Map<String, dynamic> session({bool expired = false}) {
    final expires = DateTime.now().millisecondsSinceEpoch ~/ 1000 + (expired ? -60 : 3600);
    String part(Object value) => base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
    return {
      'access_token': '${part({'alg': 'HS256'})}.${part({'exp': expires, 'sub': 'test-user'})}.test-signature',
      'refresh_token': 'test-only-refresh', 'token_type': 'bearer', 'expires_in': 3600,
      'user': {'id': 'test-user', 'email': 'person@example.invalid', 'aud': 'authenticated'},
    };
  }
  test('OFF neither reads credentials nor initializes an account/network client', () async {
    final vault = Vault();
    final a = account(vault);
    expect(await a.resume(consent: false), false);
    expect(vault.reads, 0);
    expect(a.accountId, isNull);
    expect(() => a.from('psygames_cloud_snapshots'), throwsStateError);
    await expectLater(a.requestLink('person@example.com', consent: false), throwsStateError);
    await a.dispose();
  });
  test('callback is bound to this app and accepts PKCE code only', () async {
    final a = account(Vault());
    expect(a.acceptsCallback(Uri.parse('com.psygames.app://auth/callback?code=test')), true);
    for (final link in [
      'other.app://auth/callback?code=test',
      'com.psygames.app://other/callback?code=test',
      'com.psygames.app://auth/other?code=test',
      'com.psygames.app://auth/callback',
      'com.psygames.app://auth/callback#access_token=test',
      'com.psygames.app://other@auth/callback?code=test',
      'com.psygames.app://auth:123/callback?code=test',
    ]) { expect(a.acceptsCallback(Uri.parse(link)), false); }
    await expectLater(a.completeLink(Uri.parse('com.psygames.app://auth/callback?code=test')), throwsStateError);
    await a.dispose();
  });

  test('retained builder and prepared query cannot send after OFF or later opt-in', () async {
    final vault = Vault()..values['ecosystem.account.v1.psygames.session'] = jsonEncode(session());
    var requests = 0;
    final a = account(vault, transport: MockClient((request) async {
      requests++; return http.Response('[]', 200, request: request, headers: {'content-type': 'application/json'});
    }));
    expect(await a.resume(consent: true), true);
    final retained = a.from('psygames_cloud_snapshots');
    final pending = retained.select();
    a.suspend();
    await expectLater(pending, throwsStateError);
    await expectLater(retained.select(), throwsStateError);
    expect(requests, 0);
    expect(await a.resume(consent: true), true);
    await expectLater(retained.select(), throwsStateError);
    await a.from('psygames_cloud_snapshots').select();
    expect(requests, 1);
    await a.dispose();
  });

  test('vault error has no success ACK and next resume recovers, not poisoned queue', () async {
    final vault = Vault()..values['ecosystem.account.v1.psygames.session'] = jsonEncode(session());
    vault.failWrites = true;
    var requests = 0;
    final a = account(vault, transport: MockClient((_) async { requests++; return http.Response('{}', 500); }));
    await expectLater(a.resume(consent: true), throwsStateError);
    expect(a.accountId, isNull);
    expect(a.active, false);
    vault.failWrites = false;
    expect(await a.resume(consent: true), true);
    expect(a.accountId, 'test-user');
    expect(requests, 0);
    await a.dispose();
  });

  test('expired encrypted session refreshes only with consent', () async {
    final vault = Vault()..values['ecosystem.account.v1.psygames.session'] = jsonEncode(session(expired: true));
    var requests = 0;
    final a = account(vault, transport: MockClient((request) async {
      expect(request.url.path, '/auth/v1/token');
      requests++; return http.Response(jsonEncode(session()), 200, headers: {'content-type': 'application/json'});
    }));
    expect(await a.resume(consent: false), false);
    expect(requests, 0);
    expect(await a.resume(consent: true), true);
    expect(requests, 1);
    await a.dispose();
  });

  test('late callback after OFF cannot persist a session or acknowledge login', () async {
    final vault = Vault();
    final started = Completer<void>();
    final reply = Completer<http.Response>();
    var requests = 0;
    final a = account(vault, transport: MockClient((request) async {
      requests++;
      if (request.url.path == '/auth/v1/otp') return http.Response('{}', 200);
      if (request.url.path == '/auth/v1/token') { started.complete(); return reply.future; }
      throw StateError('Unexpected test request');
    }));
    await a.requestLink('person@example.invalid', consent: true);
    final login = a.completeLink(Uri.parse('com.psygames.app://auth/callback?code=test-code'));
    final rejected = expectLater(login, throwsA(anything));
    await started.future;
    a.suspend();
    reply.complete(http.Response(jsonEncode(session()), 200, headers: {'content-type': 'application/json'}));
    await rejected;
    expect(a.accountId, isNull);
    expect(vault.values.containsKey('ecosystem.account.v1.psygames.session'), false);
    expect(requests, 2);
    await a.dispose();
  });
}
