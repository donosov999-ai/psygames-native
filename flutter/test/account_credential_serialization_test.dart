import 'dart:async';
import 'dart:convert';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'chessgo_slow_vault_test.dart' show SlowFinalWriteVault;
import 'ecosystem_account_test.dart' show Vault;
import 'support/account_fixtures.dart';

void main() {
  EcosystemAccount make(Vault vault, {http.Client? transport}) => EcosystemAccount(
    appId: 'abstract-hub', url: 'https://example.supabase.co', publishableKey: 'synthetic-public',
    callback: Uri.parse('com.abstracthub.app://auth/callback'), vault: vault,
    transport: transport ?? MockClient((r) async => http.Response('', 204, request: r)));
  String key(EcosystemAccount a) => '${a.storageNamespace}.session';
  void cache(EcosystemAccount a, Vault v, String id) =>
    v.values[key(a)] = fixtureEnvelope(a, fixtureSession(id: id));
  String? saved(EcosystemAccount a, Vault v) =>
    v.values[key(a)] == null ? null : (jsonDecode(v.values[key(a)]!) as Map)['account_id'] as String?;
  void release(Completer<void> gate) { if (!gate.isCompleted) gate.complete(); }

  test('A -> B -> C: no stale compensation can overwrite acknowledged C', () async {
    final vault = SlowFinalWriteVault();
    final a = make(vault);
    addTearDown(a.dispose); addTearDown(() => release(vault.release));
    cache(a, vault, 'A');
    final oldA = expectLater(a.resume(consent: true, expectedAccountId: 'A'), throwsStateError);
    await vault.delayed.future;
    cache(a, vault, 'B');
    final resultB = a.resume(consent: true, expectedAccountId: 'B')
      .then<Object>((v) => v, onError: (Object e) => e);
    await Future<void>.delayed(Duration.zero);
    cache(a, vault, 'C');
    var ackC = false;
    final c = a.resume(consent: true, expectedAccountId: 'C').then((v) { ackC = v; return v; });
    await Future<void>.delayed(Duration.zero);
    expect(ackC, false);
    release(vault.release);
    await oldA;
    final b = await resultB;
    expect(b == false || b is StateError, true);
    expect(await c, true);
    expect(a.accountId, 'C');
    expect(saved(a, vault), 'C');
  });

  test('replacement instance shares the lane and retires previous owner', () async {
    final vault = SlowFinalWriteVault();
    final a = make(vault), b = make(vault);
    addTearDown(a.dispose); addTearDown(b.dispose); addTearDown(() => release(vault.release));
    cache(a, vault, 'A');
    final old = expectLater(a.resume(consent: true, expectedAccountId: 'A'), throwsStateError);
    await vault.delayed.future;
    cache(b, vault, 'B');
    var ackB = false;
    final newer = b.resume(consent: true, expectedAccountId: 'B').then((v) { ackB = v; return v; });
    await Future<void>.delayed(Duration.zero);
    expect(ackB, false);
    expect(a.accountId, isNull);
    release(vault.release);
    await old;
    expect(await newer, true);
    expect(saved(b, vault), 'B');
    await a.dispose();
    expect(b.accountId, 'B', reason: 'retired instance disposal cannot suspend its replacement');
  });

  test('failed delayed A write cannot poison B commit or leave false ACK', () async {
    final vault = _FailingDelayedWrite();
    final a = make(vault);
    addTearDown(a.dispose); addTearDown(() => release(vault.release));
    cache(a, vault, 'A');
    final old = expectLater(a.resume(consent: true, expectedAccountId: 'A'), throwsStateError);
    await vault.delayed.future;
    cache(a, vault, 'B');
    final newer = a.resume(consent: true, expectedAccountId: 'B');
    release(vault.release);
    await old;
    expect(await newer, true);
    expect(saved(a, vault), 'B');
  });

  test('slow old session removal drains before B ACK; cannot delete B later', () async {
    final vault = _SlowRemoval();
    final a = make(vault);
    addTearDown(a.dispose); addTearDown(() => release(vault.release));
    cache(a, vault, 'A');
    expect(await a.resume(consent: true, expectedAccountId: 'A'), true);
    vault.delay = true;
    final oldLogout = expectLater(a.signOut(), throwsStateError);
    await vault.started.future;
    cache(a, vault, 'B');
    var ackB = false;
    final newer = a.resume(consent: true, expectedAccountId: 'B').then((v) { ackB = v; return v; });
    await Future<void>.delayed(Duration.zero);
    expect(ackB, false);
    release(vault.release);
    await oldLogout;
    expect(await newer, true);
    expect(a.accountId, 'B');
    expect(saved(a, vault), 'B');
  });

  test('signout waits for slow final write and cannot resurrect it on restart', () async {
    final vault = SlowFinalWriteVault();
    final a = make(vault);
    addTearDown(a.dispose); addTearDown(() => release(vault.release));
    cache(a, vault, 'A');
    final recovering = expectLater(a.resume(consent: true, expectedAccountId: 'A'), throwsStateError);
    await vault.delayed.future;
    var signedOut = false;
    final logout = a.signOut().then((_) { signedOut = true; });
    await Future<void>.delayed(Duration.zero);
    expect(signedOut, false, reason: 'removal must not ACK ahead of the old OS write');
    release(vault.release);
    await recovering; await logout;
    expect(a.accountId, isNull);
    expect(saved(a, vault), isNull);
    final restarted = make(vault);
    addTearDown(restarted.dispose);
    expect(await restarted.resume(consent: true, expectedAccountId: 'A'), false);
    expect(restarted.accountId, isNull);
  });

  test('late logout HTTP response cannot clear newer acknowledged B', () async {
    final vault = Vault();
    final started = Completer<void>(), reply = Completer<http.Response>();
    late http.Request logoutRequest;
    var requests = 0;
    final a = make(vault, transport: MockClient((r) async {
      requests++; expect(r.url.path, '/auth/v1/logout');
      expect(r.url.queryParameters['scope'], 'local');
      logoutRequest = r; started.complete(); return reply.future;
    }));
    addTearDown(a.dispose);
    addTearDown(() { if (!reply.isCompleted) reply.complete(http.Response('', 204, request: logoutRequest)); });
    cache(a, vault, 'A');
    expect(await a.resume(consent: true, expectedAccountId: 'A'), true);
    final old = expectLater(a.signOut(), throwsStateError);
    await started.future;
    cache(a, vault, 'B');
    expect(await a.resume(consent: true, expectedAccountId: 'B'), true);
    expect(saved(a, vault), 'B');
    reply.complete(http.Response('', 204, request: logoutRequest));
    await old;
    expect(a.accountId, 'B');
    expect(saved(a, vault), 'B');
    expect(requests, 1); // The already-started A logout only.
  });

  test('failed credential removal never ACKs success; offline retry clears it', () async {
    final vault = _FailRemoval();
    var requests = 0;
    final a = make(vault, transport: MockClient((r) async {
      requests++; return http.Response('', 204, request: r);
    }));
    addTearDown(a.dispose);
    cache(a, vault, 'A');
    expect(await a.resume(consent: true, expectedAccountId: 'A'), true);
    vault.fail = true;
    await expectLater(a.signOut(), throwsStateError);
    expect(a.accountId, isNull);
    expect(saved(a, vault), 'A');
    vault.fail = false;
    await a.signOut();
    expect(saved(a, vault), isNull);
    expect(requests, 1);
  });

  test('PKCE writes share lifecycle lane; retired login cannot overwrite newer verifier', () async {
    final vault = _SlowPkceWrite();
    var requests = 0;
    final a = make(vault, transport: MockClient((r) async {
      requests++; expect(r.url.path, '/auth/v1/otp');
      return http.Response('{}', 200, request: r, headers: {'content-type': 'application/json'});
    }));
    addTearDown(a.dispose); addTearDown(() => release(vault.release));
    final old = expectLater(a.requestLink('A@example.invalid', consent: true), throwsStateError);
    await vault.started.future;
    var ack = false;
    final newer = a.requestLink('B@example.invalid', consent: true).then((_) { ack = true; });
    await Future<void>.delayed(Duration.zero);
    expect(ack, false); expect(requests, 0);
    release(vault.release);
    await old; await newer;
    expect(requests, 1);
    final pkce = vault.values.entries.where((e) => e.key.contains('.pkce.')).single;
    expect(pkce.value != vault.oldValue, true, reason: 'new verifier persists; do not print either value');
    await a.signOut();
    expect(vault.values.keys.any((k) => k.contains('.pkce.')), false);
  });

  test('late OTP HTTP response cannot ACK an obsolete login or change newer PKCE', () async {
    final vault = Vault();
    final started = Completer<void>(), reply = Completer<http.Response>();
    late http.Request oldRequest;
    var requests = 0;
    final a = make(vault, transport: MockClient((r) async {
      requests++;
      if (requests == 1) { oldRequest = r; started.complete(); return reply.future; }
      return http.Response('{}', 200, request: r);
    }));
    addTearDown(a.dispose);
    addTearDown(() { if (!reply.isCompleted) reply.complete(http.Response('{}', 200, request: oldRequest)); });
    final old = expectLater(a.requestLink('A@example.invalid', consent: true), throwsStateError);
    await started.future;
    await a.requestLink('B@example.invalid', consent: true);
    final newer = vault.values.entries.where((e) => e.key.contains('.pkce.')).single.value;
    reply.complete(http.Response('{}', 200, request: oldRequest));
    await old;
    final current = vault.values.entries.where((e) => e.key.contains('.pkce.')).single.value;
    expect(current == newer, true, reason: 'compare only; never print verifier values');
    expect(requests, 2); // A was already sent before retirement; it is not unsent.
  });
}

class _FailingDelayedWrite extends SlowFinalWriteVault {
  @override Future<void> write(String key, String value) async {
    final a = (jsonDecode(value) as Map)['account_id'] == 'A';
    await super.write(key, value);
    if (a && writesA == 2) throw StateError('Simulated delayed write failure');
  }
}

class _SlowRemoval extends Vault {
  bool delay = false;
  final started = Completer<void>(), release = Completer<void>();
  @override Future<void> remove(String key) async {
    if (delay && key.endsWith('.session')) { delay = false; started.complete(); await release.future; }
    await super.remove(key);
  }
}

class _FailRemoval extends Vault {
  bool fail = false;
  @override Future<void> remove(String key) async {
    if (fail && key.endsWith('.session')) throw StateError('Simulated removal failure');
    await super.remove(key);
  }
}

class _SlowPkceWrite extends Vault {
  bool delayed = false;
  String? oldValue;
  final started = Completer<void>(), release = Completer<void>();
  @override Future<void> write(String key, String value) async {
    if (!delayed && key.contains('.pkce.')) {
      delayed = true; oldValue = value; started.complete(); await release.future;
    }
    await super.write(key, value);
  }
}
